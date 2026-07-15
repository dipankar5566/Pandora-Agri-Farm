/* Ops e2e: feed register (stock delta consumption), finance ledger +
 * auto entry on exit sale + monthly summary, tasks (recurrence, skip
 * reason), aggregated dashboard, backup run. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { ctxStore } from '../../src/common/request-context';
import { PrismaService } from '../../src/prisma.service';

const OWNER_PHONE = process.env.SEED_OWNER_PHONE ?? '9999999999';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? '';
const today = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);

describe('ops module (feed, finance, tasks, dashboard, backup)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let feedItemId: string;
  let penA: string;
  let penB: string;
  let animalId: string;
  const cleanup = { items: [] as string[], animals: [] as string[], tasks: [] as string[], entries: [] as string[] };

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

    const pens = await get('/api/v1/pens');
    penA = pens.body.data.find((p: any) => p.name === 'A').id;
    penB = pens.body.data.find((p: any) => p.name === 'B').id;

    const feed = await post('/api/v1/items', {
      itemType: 'feed', name: `Concentrate-ops-${Date.now()}`, unit: 'kg',
    });
    feedItemId = feed.body.data.id;
    cleanup.items.push(feedItemId);
    await post(`/api/v1/items/${feedItemId}/batches`, { receivedOn: today(), qtyReceived: 200, unitCost: 30, isOpening: true });

    const breeds = await get('/api/v1/breeds');
    const a = await post('/api/v1/animals', {
      breedId: breeds.body.data[0].id, sex: 'male', birthDate: '2024-05-01',
      source: 'purchased', purchasePrice: 6000, weightKg: 24,
    });
    animalId = a.body.data.id;
    cleanup.animals.push(animalId);
  });

  afterAll(async () => {
    {
      const saleLines = await prisma.saleInvoiceLine.findMany({ where: { animalId: { in: cleanup.animals } } });
      const saleInvIds = [...new Set(saleLines.map((l) => l.invoiceId))];
      const salePays = await prisma.salePayment.findMany({ where: { invoiceId: { in: saleInvIds } } });
      await prisma.ledgerEntry.deleteMany({ where: { refType: "sale_payment", refId: { in: salePays.map((p) => p.id) } } });
      await prisma.salePayment.deleteMany({ where: { invoiceId: { in: saleInvIds } } });
      await prisma.saleInvoiceLine.deleteMany({ where: { invoiceId: { in: saleInvIds } } });
      await prisma.saleInvoice.deleteMany({ where: { id: { in: saleInvIds } } });
    }

    await prisma.$executeRaw`SET session_replication_role = replica`;
    await prisma.feedLog.deleteMany({ where: { itemId: { in: cleanup.items } } });
    await prisma.$executeRaw`DELETE FROM stock_movements WHERE item_id = ANY(${cleanup.items})`;
    await prisma.itemBatch.deleteMany({ where: { itemId: { in: cleanup.items } } });
    await prisma.item.deleteMany({ where: { id: { in: cleanup.items } } });
    await prisma.ledgerEntry.deleteMany({ where: { OR: [{ animalId: { in: cleanup.animals } }, { id: { in: cleanup.entries } }] } });
    await prisma.task.deleteMany({ where: { OR: [{ id: { in: cleanup.tasks } }, { animalId: { in: cleanup.animals } }, { title: { contains: 'ops-test' } }] } });
    await prisma.animalEvent.deleteMany({ where: { animalId: { in: cleanup.animals } } });
    await prisma.weightRecord.deleteMany({ where: { animalId: { in: cleanup.animals } } });
    await prisma.animalExit.deleteMany({ where: { animalId: { in: cleanup.animals } } });
    await prisma.animal.deleteMany({ where: { id: { in: cleanup.animals } } });
    await prisma.$executeRaw`SET session_replication_role = DEFAULT`;
    await app.close();
  });

  it('saves the feed day register and consumes stock by delta on re-save', async () => {
    const save = await post('/api/v1/feed-logs', {
      date: today(),
      rows: [
        { penId: penA, itemId: feedItemId, qty: 4.5 },
        { penId: penB, itemId: feedItemId, qty: 3.0, wastageQty: 0.2 },
      ],
    });
    expect(save.status).toBe(201);
    let items = await get(`/api/v1/items?q=Concentrate-ops`);
    expect(items.body.data[0].onHand).toBe(192.5); // 200 − 7.5

    // Correcting pen A to 5.0 consumes only the +0.5 delta.
    const resave = await post('/api/v1/feed-logs', {
      date: today(), rows: [{ penId: penA, itemId: feedItemId, qty: 5.0 }],
    });
    expect(resave.status).toBe(201);
    items = await get(`/api/v1/items?q=Concentrate-ops`);
    expect(items.body.data[0].onHand).toBe(192);
  });

  it('creates a ledger entry, rejects kind/category mismatch, summarizes the month', async () => {
    const cats = await get('/api/v1/finance-categories');
    const feedCat = cats.body.data.find((c: any) => c.name === 'Feed');
    const saleCat = cats.body.data.find((c: any) => c.name === 'Goat Sale');

    const mismatch = await post('/api/v1/ledger-entries', {
      entryDate: today(), kind: 'expense', categoryId: saleCat.id, amount: 100,
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('CATEGORY_KIND_MISMATCH');

    const entry = await post('/api/v1/ledger-entries', {
      entryDate: today(), kind: 'expense', categoryId: feedCat.id, amount: 6000,
      description: 'ops-test feed purchase',
    });
    expect(entry.status).toBe(201);
    cleanup.entries.push(entry.body.data.id);

    const summary = await get(`/api/v1/finance/summary?month=${month()}`);
    expect(summary.body.data.expense).toBeGreaterThanOrEqual(6000);
    expect(summary.body.data.byCategory.some((c: any) => c.category === 'Feed')).toBe(true);
  });

  it('books sale income automatically when an animal exits as sale', async () => {
    const exit = await post(`/api/v1/animals/${animalId}/exit`, {
      exitType: 'sale', exitDate: today(), price: 11000, buyerName: 'ops-test buyer',
    });
    expect(exit.status).toBe(201);
    // R2: a priced exit generates invoice + full payment; income comes from the payment.
    const line = await prisma.saleInvoiceLine.findFirst({ where: { animalId } });
    expect(line).toBeTruthy();
    const ledger = await get(`/api/v1/ledger-entries?month=${month()}&kind=income`);
    const auto = ledger.body.data.find(
      (e: any) => e.refType === 'sale_payment' && Number(e.amount) === 11000 && e.counterpartyName === 'ops-test buyer',
    );
    expect(auto).toBeTruthy();

    // Auto entries are read-only in the ledger.
    const patch = await request(server).patch(`/api/v1/ledger-entries/${auto.id}`)
      .set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send({ amount: 1 });
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe('AUTO_ENTRY_READONLY');
  });

  it('handles tasks: recurrence on complete, reason required on skip', async () => {
    const created = await post('/api/v1/tasks', {
      title: 'ops-test morning feeding', taskType: 'feeding', dueOn: today(), recurrence: 'daily',
    });
    expect(created.status).toBe(201);
    cleanup.tasks.push(created.body.data.id);

    const done = await post(`/api/v1/tasks/${created.body.data.id}/complete`, { notes: 'done at 07:30' });
    expect(done.status).toBe(201);
    const list = await get(`/api/v1/tasks?date=${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}`);
    const next = list.body.data.find((t: any) => t.title === 'ops-test morning feeding' && t.status === 'pending');
    expect(next).toBeTruthy(); // tomorrow's recurrence exists
    cleanup.tasks.push(next.id);

    const badSkip = await post(`/api/v1/tasks/${next.id}/skip`, {});
    expect(badSkip.status).toBe(400);
  });

  it('serves the aggregated dashboard in one call', async () => {
    const res = await get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.herd).toHaveProperty('active');
    expect(d.attention).toHaveProperty('duesOverdue');
    expect(d.money).toHaveProperty('net');
    expect(Array.isArray(d.upcomingKiddings)).toBe(true);
  });

  it('runs a real pg_dump backup and records success', async () => {
    const res = await post('/api/v1/ops/backup', {});
    expect(res.status).toBe(201);
    expect(res.body.data.sizeBytes).toBeGreaterThan(10000);
    expect(existsSync(res.body.data.file)).toBe(true);

    const health = await get('/api/v1/ops/health');
    expect(health.body.data.lastBackupAt).toBeTruthy();

    const noToken = await request(server).post('/api/v1/ops/backup/scheduled');
    expect(noToken.status).toBe(401);
  });
});
