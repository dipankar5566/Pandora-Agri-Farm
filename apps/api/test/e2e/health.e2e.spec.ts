/* Health e2e: protocol dues generation, batch administration (stock,
 * dues, next dues, rotation nudge), treatments (FEFO consume, withdrawal
 * stamp, sale guard), case lifecycle (vitals bounds, isolation, close-died
 * forcing exit). */
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
const future = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const past = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

describe('health module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let breedId: string;
  let dewormProtocolId: string;
  let dewormerId: string;
  let antibioticId: string;
  const animalIds: string[] = [];
  const itemIds: string[] = [];
  let goatA: string;
  let goatB: string;
  let caseId: string;

  const post = (url: string, body: object) =>
    request(server).post(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
  const get = (url: string) => request(server).get(url).set('Cookie', cookie);

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
    breedId = (await get('/api/v1/breeds')).body.data.find((b: any) => b.name === 'Black Bengal').id;
    dewormProtocolId = (await get('/api/v1/protocols')).body.data.find((p: any) => p.type === 'deworming').id;

    // two adult goats, weights set (dose = 0.2 ml/kg)
    for (const w of [20, 25]) {
      const r = await post('/api/v1/animals', {
        breedId, sex: 'female', birthDate: '2024-01-01', source: 'purchased', purchasePrice: 7000, weightKg: w,
      });
      animalIds.push(r.body.data.id);
    }
    [goatA, goatB] = animalIds;

    // dewormer stock (benzimidazole) + antibiotic with withdrawal
    const deworm = await post('/api/v1/items', {
      itemType: 'dewormer', name: `Fenbendazole-${Date.now()}`, unit: 'ml',
      anthelminticClass: 'benzimidazole', defaultDosePerKg: 0.2, doseUnit: 'ml', withdrawalDays: 8,
    });
    dewormerId = deworm.body.data.id;
    itemIds.push(dewormerId);
    await post(`/api/v1/items/${dewormerId}/batches`, {
      batchNo: 'DW1', expiryDate: future(365), receivedOn: past(1), qtyReceived: 100, unitCost: 9,
    });
    const anti = await post('/api/v1/items', {
      itemType: 'medicine', name: `Oxytet-${Date.now()}`, unit: 'ml', withdrawalDays: 21,
    });
    antibioticId = anti.body.data.id;
    itemIds.push(antibioticId);
    await post(`/api/v1/items/${antibioticId}/batches`, {
      batchNo: 'AB1', expiryDate: future(365), receivedOn: past(1), qtyReceived: 50, unitCost: 15,
    });
  });

  afterAll(async () => {
    {
      const saleLines = await prisma.saleInvoiceLine.findMany({ where: { animalId: { in: animalIds } } });
      const saleInvIds = [...new Set(saleLines.map((l) => l.invoiceId))];
      const salePays = await prisma.salePayment.findMany({ where: { invoiceId: { in: saleInvIds } } });
      await prisma.ledgerEntry.deleteMany({ where: { refType: "sale_payment", refId: { in: salePays.map((p) => p.id) } } });
      await prisma.salePayment.deleteMany({ where: { invoiceId: { in: saleInvIds } } });
      await prisma.saleInvoiceLine.deleteMany({ where: { invoiceId: { in: saleInvIds } } });
      await prisma.saleInvoice.deleteMany({ where: { id: { in: saleInvIds } } });
    }

    await prisma.$executeRaw`SET session_replication_role = replica`;
    await prisma.$executeRaw`DELETE FROM stock_movements WHERE item_id = ANY(${itemIds})`;
    await prisma.protocolDue.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.protocolAdministration.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.caseVital.deleteMany({ where: { case: { animalId: { in: animalIds } } } });
    await prisma.treatment.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.healthCase.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.itemBatch.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    await prisma.animalEvent.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.penMovement.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.weightRecord.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.animalExit.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.animal.deleteMany({ where: { id: { in: animalIds } } });
    await prisma.$executeRaw`SET session_replication_role = DEFAULT`;
    await app.close();
  });

  it('generates overdue dues for adult animals on refresh', async () => {
    const res = await get('/api/v1/protocol-dues?refresh=true');
    expect(res.status).toBe(200);
    const mine = res.body.data.filter((d: any) => animalIds.includes(d.animalId));
    // 2 animals × (PPR, ET, HS, FMD, Goat Pox, Deworming) = 12 pending dues
    expect(mine.length).toBe(12);
    const dw = mine.find((d: any) => d.animalId === goatA && d.protocol.type === 'deworming');
    expect(dw.overdueDays).toBeGreaterThan(0); // born 2024 → long overdue
    expect(dw.suggestedDose).toBe(4); // 0.2 ml/kg × 20 kg
  });

  it('administers deworming to both goats: stock, dues, next dues, timeline', async () => {
    const res = await post('/api/v1/protocol-administrations', {
      protocolId: dewormProtocolId, givenOn: past(0), itemId: dewormerId,
      entries: [{ animalId: goatA }, { animalId: goatB }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.administered).toBe(2);

    // stock: 100 − (4 + 5) = 91
    const batches = await get(`/api/v1/items/${dewormerId}/batches`);
    expect(Number(batches.body.data[0].qtyRemaining)).toBe(91);

    // dues done + next scheduled at +90d
    const dues = await get('/api/v1/protocol-dues');
    const next = dues.body.data.find((d: any) => d.animalId === goatA && d.protocol.type === 'deworming');
    expect(next.dueDate.slice(0, 10)).toBe(future(90));

    const tl = await get(`/api/v1/animals/${goatA}/timeline`);
    expect(tl.body.data[0].eventType).toBe('dewormed');
  });

  it('nudges on same anthelmintic class, proceeds with override', async () => {
    const again = await post('/api/v1/protocol-administrations', {
      protocolId: dewormProtocolId, givenOn: future(1), itemId: dewormerId,
      entries: [{ animalId: goatA }],
    });
    expect(again.status).toBe(422);
    expect(again.body.error.params.warnings).toContain('DEWORMER_SAME_CLASS');

    const forced = await post('/api/v1/protocol-administrations', {
      protocolId: dewormProtocolId, givenOn: future(1), itemId: dewormerId,
      entries: [{ animalId: goatA }], confirmOverride: true,
    });
    expect(forced.status).toBe(201);
  });

  it('runs a case: open → vitals (bounds enforced) → isolate → treat → close recovered', async () => {
    const open = await post('/api/v1/health-cases', {
      animalId: goatB, symptoms: 'coughing, reduced feed intake', severity: 'moderate',
    });
    expect(open.status).toBe(201);
    caseId = open.body.data.id;

    const badVital = await post(`/api/v1/health-cases/${caseId}/vitals`, { temperatureC: 50 });
    expect(badVital.status).toBe(400);
    const vital = await post(`/api/v1/health-cases/${caseId}/vitals`, { temperatureC: 40.5, respirationRpm: 40 });
    expect(vital.status).toBe(201);

    const pens = await get('/api/v1/pens');
    const isoPen = pens.body.data.find((p: any) => p.purpose === 'isolation');
    const generalPen = pens.body.data.find((p: any) => p.purpose === 'general');
    const badIso = await post(`/api/v1/health-cases/${caseId}/isolate`, { penId: generalPen.id });
    expect(badIso.status).toBe(409);
    expect(badIso.body.error.code).toBe('NOT_AN_ISOLATION_PEN');
    const iso = await post(`/api/v1/health-cases/${caseId}/isolate`, { penId: isoPen.id });
    expect(iso.status).toBe(201);
    const animal = await get(`/api/v1/animals/${goatB}`);
    expect(animal.body.data.pen.id).toBe(isoPen.id);

    const treat = await post('/api/v1/treatments', {
      animalId: goatB, caseId, itemId: antibioticId,
      doseAmount: 5, doseUnit: 'ml', route: 'im',
    });
    expect(treat.status).toBe(201);
    expect(treat.body.data.withdrawalUntil.slice(0, 10)).toBe(future(21));
    expect(treat.body.data.batchNo).toBe('AB1');

    const close = await post(`/api/v1/health-cases/${caseId}/close`, {
      status: 'recovered', outcomeNotes: 'responded to antibiotics',
    });
    expect(close.status).toBe(201);
    const closed = await get(`/api/v1/health-cases/${caseId}`);
    expect(closed.body.data.status).toBe('recovered');
  });

  it('blocks selling an animal under withdrawal, allows with reason', async () => {
    const profile = await get(`/api/v1/animals/${goatB}`);
    expect(profile.body.data.withdrawalUntil).toBeTruthy();

    const blocked = await post(`/api/v1/animals/${goatB}/exit`, {
      exitType: 'sale', exitDate: future(0), price: 9000,
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.params.warnings).toContain('WITHDRAWAL_ACTIVE');

    const forced = await post(`/api/v1/animals/${goatB}/exit`, {
      exitType: 'sale', exitDate: future(0), price: 9000,
      confirmOverride: true, overrideReason: 'buyer informed, non-food purpose',
    });
    expect(forced.status).toBe(201);
  });

  it('closing a case as died requires and performs the exit', async () => {
    const open = await post('/api/v1/health-cases', {
      animalId: goatA, symptoms: 'sudden bloat', severity: 'critical',
    });
    const cid = open.body.data.id;
    const noExit = await post(`/api/v1/health-cases/${cid}/close`, { status: 'died' });
    expect(noExit.status).toBe(400);

    const close = await post(`/api/v1/health-cases/${cid}/close`, {
      status: 'died',
      exit: { exitDate: future(0), causeCategory: 'disease', causeDetail: 'enterotoxaemia suspected' },
    });
    expect(close.status).toBe(201);
    const animal = await get(`/api/v1/animals/${goatA}`);
    expect(animal.body.data.status).toBe('died');
  });
});
