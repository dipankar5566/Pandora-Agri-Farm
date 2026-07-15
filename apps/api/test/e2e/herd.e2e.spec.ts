/* Herd e2e: register → weigh (anomaly guard) → move → timeline → exit,
 * plus tag auto-generation, TAG_TAKEN, parent-sex rule, bulk intake. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { ctxStore } from '../../src/common/request-context';
import { PrismaService } from '../../src/prisma.service';

const OWNER_PHONE = process.env.SEED_OWNER_PHONE ?? '9999999999';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? '';

describe('herd module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let breedId: string;
  let penA: string;
  let penB: string;
  const createdAnimalIds: string[] = [];

  const post = (url: string, body: object) =>
    request(server).post(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.use((req: any, _res: any, next: () => void) =>
      ctxStore.run({ requestId: randomUUID() }, next),
    );
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();

    const login = await request(server).post('/api/v1/auth/login')
      .send({ phone: OWNER_PHONE, password: OWNER_PASSWORD });
    cookie = login.headers['set-cookie'][0].split(';')[0];
    const breeds = await request(server).get('/api/v1/breeds').set('Cookie', cookie);
    breedId = breeds.body.data.find((b: any) => b.name === 'Black Bengal').id;
    const pens = await request(server).get('/api/v1/pens').set('Cookie', cookie);
    penA = pens.body.data.find((p: any) => p.name === 'A').id;
    penB = pens.body.data.find((p: any) => p.name === 'B').id;
  });

  afterAll(async () => {
    {
      const saleLines = await prisma.saleInvoiceLine.findMany({ where: { animalId: { in: createdAnimalIds } } });
      const saleInvIds = [...new Set(saleLines.map((l) => l.invoiceId))];
      const salePays = await prisma.salePayment.findMany({ where: { invoiceId: { in: saleInvIds } } });
      await prisma.ledgerEntry.deleteMany({ where: { refType: "sale_payment", refId: { in: salePays.map((p) => p.id) } } });
      await prisma.salePayment.deleteMany({ where: { invoiceId: { in: saleInvIds } } });
      await prisma.saleInvoiceLine.deleteMany({ where: { invoiceId: { in: saleInvIds } } });
      await prisma.saleInvoice.deleteMany({ where: { id: { in: saleInvIds } } });
    }

    // remove test animals bottom-up
    const ids = createdAnimalIds;
    await prisma.animalEvent.deleteMany({ where: { animalId: { in: ids } } });
    await prisma.weightRecord.deleteMany({ where: { animalId: { in: ids } } });
    await prisma.penMovement.deleteMany({ where: { animalId: { in: ids } } });
    await prisma.animalExit.deleteMany({ where: { animalId: { in: ids } } });
    await prisma.attachment.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.animal.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  let doeId: string;
  let doeTag: string;

  it('registers a doe with auto tag, initial weight, and timeline events', async () => {
    const res = await post('/api/v1/animals', {
      breedId, sex: 'female', birthDate: '2024-03-10', source: 'purchased',
      purchasePrice: 8000, currentPenId: penA, weightKg: 21.5, bcs: 3.5,
    });
    expect(res.status).toBe(201);
    doeId = res.body.data.id;
    doeTag = res.body.data.tagNumber;
    createdAnimalIds.push(doeId);
    expect(doeTag).toMatch(/^PGF-\d{4}$/);
    expect(res.body.data.ageMonths).toBeGreaterThan(20);

    const tl = await request(server).get(`/api/v1/animals/${doeId}/timeline`).set('Cookie', cookie);
    const types = tl.body.data.map((e: any) => e.eventType);
    expect(types).toContain('registered');
    expect(types).toContain('weighed');
  });

  it('rejects a duplicate tag with TAG_TAKEN', async () => {
    const res = await post('/api/v1/animals', {
      tagNumber: doeTag, breedId, sex: 'male', birthDate: '2024-01-01', source: 'gift',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TAG_TAKEN');
  });

  it('rejects a female as sire (parent-sex rule)', async () => {
    const res = await post('/api/v1/animals', {
      breedId, sex: 'female', birthDate: '2026-01-01', source: 'born_on_farm', sireId: doeId,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SIRE_NOT_MALE');
  });

  it('guards suspicious weight jumps, then accepts with confirmation', async () => {
    const blocked = await post('/api/v1/weights', {
      date: '2026-07-16',
      entries: [{ animalId: doeId, weightKg: 30.0 }], // 21.5 → 30 = +40%
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('WEIGHT_ANOMALIES');
    expect(blocked.body.error.params.anomalies[0].tag).toBe(doeTag);

    const ok = await post('/api/v1/weights', {
      date: '2026-07-16', confirmAnomalies: true,
      entries: [{ animalId: doeId, weightKg: 30.0 }],
    });
    expect(ok.status).toBe(201);
    const animal = await request(server).get(`/api/v1/animals/${doeId}`).set('Cookie', cookie);
    expect(Number(animal.body.data.currentWeightKg)).toBe(30);
  });

  it('moves the doe to another pen and updates her current pen', async () => {
    const res = await post(`/api/v1/animals/${doeId}/move`, { toPenId: penB, reason: 'routine' });
    expect(res.status).toBe(201);
    const animal = await request(server).get(`/api/v1/animals/${doeId}`).set('Cookie', cookie);
    expect(animal.body.data.pen.id).toBe(penB);
  });

  it('bulk-intakes 3 animals with estimated ages', async () => {
    const res = await post('/api/v1/animals/bulk-intake', {
      defaults: { breedId, source: 'purchased', currentPenId: penA },
      rows: [
        { sex: 'female', ageMonths: 14, weightKg: 18 },
        { sex: 'female', ageMonths: 20, weightKg: 22 },
        { sex: 'male', ageMonths: 24, weightKg: 26 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.created).toHaveLength(3);
    createdAnimalIds.push(...res.body.data.created.map((c: any) => c.id));
    const one = await request(server)
      .get(`/api/v1/animals/${res.body.data.created[0].id}`).set('Cookie', cookie);
    expect(one.body.data.birthDateEstimated).toBe(true);
  });

  it('exits the doe as a sale and blocks a second exit', async () => {
    const res = await post(`/api/v1/animals/${doeId}/exit`, {
      exitType: 'sale', exitDate: '2026-07-17', buyerName: 'Test Buyer',
      liveWeightKg: 30, price: 12000,
    });
    expect(res.status).toBe(201);
    const animal = await request(server).get(`/api/v1/animals/${doeId}`).set('Cookie', cookie);
    expect(animal.body.data.status).toBe('sold');

    const again = await post(`/api/v1/animals/${doeId}/exit`, {
      exitType: 'death', exitDate: '2026-07-18', causeCategory: 'unknown',
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ANIMAL_ALREADY_EXITED');
  });

  it('serves herd stats', async () => {
    const res = await request(server).get('/api/v1/herd/stats').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBeGreaterThanOrEqual(3);
  });
});
