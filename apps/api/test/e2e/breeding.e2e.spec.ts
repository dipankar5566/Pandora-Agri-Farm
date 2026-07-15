/* Breeding e2e: heat → service (inbreeding + underage overrides) →
 * diagnosis → pregnancy (single-ongoing rule) → kidding (kids created
 * with lineage) → abortion path → performance views. */
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

describe('breeding module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let breedId: string;
  const animalIds: string[] = [];
  let doeId: string;
  let doe2Id: string;
  let buckId: string;
  let serviceId: string;
  let pregnancyId: string;

  const post = (url: string, body: object) =>
    request(server).post(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
  const get = (url: string) => request(server).get(url).set('Cookie', cookie);

  const mkAnimal = async (over: Record<string, unknown>) => {
    const res = await post('/api/v1/animals', {
      breedId, birthDate: '2023-06-01', source: 'purchased', purchasePrice: 8000, ...over,
    });
    expect(res.status).toBe(201);
    animalIds.push(res.body.data.id);
    return res.body.data;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.use((req: any, _res: any, next: () => void) => ctxStore.run({ requestId: randomUUID() }, next));
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    const login = await request(server).post('/api/v1/auth/login').send({ phone: OWNER_PHONE, password: OWNER_PASSWORD });
    cookie = login.headers['set-cookie'][0].split(';')[0];
    const breeds = await get('/api/v1/breeds');
    breedId = breeds.body.data.find((b: any) => b.name === 'Black Bengal').id;

    doeId = (await mkAnimal({ sex: 'female', weightKg: 22 })).id;
    doe2Id = (await mkAnimal({ sex: 'female', weightKg: 20 })).id;
    buckId = (await mkAnimal({ sex: 'male', weightKg: 28 })).id;
  });

  afterAll(async () => {
    const ids = animalIds;
    await prisma.kidRecord.deleteMany({ where: { animalId: { in: ids } } });
    await prisma.kidding.deleteMany({ where: { pregnancy: { doeId: { in: ids } } } });
    await prisma.pregnancyDiagnosis.deleteMany({ where: { service: { doeId: { in: ids } } } });
    await prisma.pregnancy.deleteMany({ where: { doeId: { in: ids } } });
    await prisma.service.deleteMany({ where: { doeId: { in: ids } } });
    await prisma.heatRecord.deleteMany({ where: { doeId: { in: ids } } });
    await prisma.animalEvent.deleteMany({ where: { animalId: { in: ids } } });
    await prisma.weightRecord.deleteMany({ where: { animalId: { in: ids } } });
    await prisma.animal.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('records a heat and lists it with a day-19 recheck date', async () => {
    const res = await post('/api/v1/heats', { doeId, detectedOn: '2026-02-10', signs: 'tail wagging' });
    expect(res.status).toBe(201);
    const list = await get('/api/v1/heats?days=200');
    const mine = list.body.data.find((h: any) => h.doeId === doeId);
    expect(mine.recheckDue).toBe('2026-02-29'.replace('02-29', '03-01')); // +19d from 10 Feb
    expect(mine.served).toBe(false);
  });

  it('rejects a service on a male and requires a buck for natural service', async () => {
    const notDoe = await post('/api/v1/services', {
      doeId: buckId, serviceType: 'natural', buckId, serviceDate: '2026-02-11',
    });
    expect(notDoe.status).toBe(409);
    expect(notDoe.body.error.code).toBe('NOT_A_DOE');

    const noBuck = await post('/api/v1/services', { doeId, serviceType: 'natural', serviceDate: '2026-02-11' });
    expect(noBuck.status).toBe(400);
  });

  it('records a natural service and predicts kidding at +148d (Black Bengal)', async () => {
    const res = await post('/api/v1/services', {
      doeId, serviceType: 'natural', buckId, serviceDate: '2026-02-11',
    });
    expect(res.status).toBe(201);
    serviceId = res.body.data.id;
    expect(res.body.data.expectedKiddingIfPregnant).toBe('2026-07-09');
  });

  it('blocks inbreeding without an override reason, allows with one', async () => {
    // kid of doe+buck, then try to breed her back to her sire
    const kid = await mkAnimal({ sex: 'female', birthDate: '2025-01-01', damId: doeId, sireId: buckId, weightKg: 18 });
    const blocked = await post('/api/v1/services', {
      doeId: kid.id, serviceType: 'natural', buckId, serviceDate: '2026-02-12',
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('RULE_OVERRIDE_REQUIRED');
    expect(blocked.body.error.params.warnings).toContain('INBREEDING_RISK');

    const allowed = await post('/api/v1/services', {
      doeId: kid.id, serviceType: 'natural', buckId, serviceDate: '2026-02-12',
      confirmOverride: true, overrideReason: 'test override: linebreeding trial',
    });
    expect(allowed.status).toBe(201);
    expect(allowed.body.data.inbreedingFlag).toBe(true);
  });

  it('rejects diagnosis before day 18, then confirms pregnancy', async () => {
    const early = await post(`/api/v1/services/${serviceId}/diagnoses`, {
      diagnosedOn: '2026-02-20', method: 'ultrasound', result: 'pregnant',
    });
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('DIAGNOSIS_TOO_EARLY');

    const ok = await post(`/api/v1/services/${serviceId}/diagnoses`, {
      diagnosedOn: '2026-03-15', method: 'ultrasound', result: 'pregnant',
    });
    expect(ok.status).toBe(201);
    pregnancyId = ok.body.data.pregnancy.id;
    expect(ok.body.data.pregnancy.expectedKiddingDate.slice(0, 10)).toBe('2026-07-09');
  });

  it('enforces one ongoing pregnancy per doe', async () => {
    const res = await post('/api/v1/services', {
      doeId, serviceType: 'natural', buckId, serviceDate: '2026-03-20',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PREGNANCY_ALREADY_ONGOING');
  });

  it('records a kidding that creates kids with full lineage', async () => {
    const res = await post(`/api/v1/pregnancies/${pregnancyId}/kidding`, {
      kiddingDate: '2026-07-08', totalBorn: 3, bornAlive: 2, colostrumWithin1h: true,
      kids: [
        { sex: 'female', birthWeightKg: 1.2 },
        { sex: 'male', birthWeightKg: 1.4 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.kidsCreated).toHaveLength(2);
    expect(res.body.data.stillborn).toBe(1);
    animalIds.push(...res.body.data.kidsCreated.map((k: any) => k.id));

    const kid = await get(`/api/v1/animals/${res.body.data.kidsCreated[0].id}`);
    expect(kid.body.data.dam.id).toBe(doeId);
    expect(kid.body.data.sire.id).toBe(buckId);
    expect(kid.body.data.source).toBe('born_on_farm');

    const tl = await get(`/api/v1/animals/${doeId}/timeline`);
    expect(tl.body.data.map((e: any) => e.eventType)).toContain('kidded');

    const again = await post(`/api/v1/pregnancies/${pregnancyId}/kidding`, {
      kiddingDate: '2026-07-09', totalBorn: 1, bornAlive: 1, kids: [{ sex: 'male' }],
    });
    expect(again.status).toBe(409);
  });

  it('records an abortion with mandatory reason', async () => {
    const svc = await post('/api/v1/services', {
      doeId: doe2Id, serviceType: 'ai', semenBatch: 'SB-100', serviceDate: '2026-02-01',
    });
    const diag = await post(`/api/v1/services/${svc.body.data.id}/diagnoses`, {
      diagnosedOn: '2026-03-01', method: 'palpation', result: 'pregnant',
    });
    const res = await post(`/api/v1/pregnancies/${diag.body.data.pregnancy.id}/abortion`, {
      abortionDate: '2026-04-10', reason: 'suspected PPR stress',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('aborted');
  });

  it('computes buck performance from raw records', async () => {
    const res = await get('/api/v1/breeding/performance?by=buck');
    expect(res.status).toBe(200);
    const mine = res.body.data.find((r: any) => r.animal.id === buckId);
    expect(mine.services).toBeGreaterThanOrEqual(2);
    expect(mine.kiddings).toBe(1);
    expect(mine.kidsBorn).toBe(2);
  });
});
