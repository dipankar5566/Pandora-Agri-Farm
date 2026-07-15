/* Purchases e2e: bill = goods receipt (batches + stock in one tx),
 * medicine expiry enforcement, payments → expense ledger with category
 * from dominant item type, outstanding math, cancel rules (unpaid +
 * stock untouched only). */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { ctxStore } from '../../src/common/request-context';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { PrismaService } from '../../src/prisma.service';

const OWNER_PHONE = process.env.SEED_OWNER_PHONE ?? '9999999999';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? '';
const today = () => new Date().toISOString().slice(0, 10);
const future = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

describe('purchases module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inv: InventoryService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let supplierId: string;
  let feedItemId: string;
  let medItemId: string;
  let billId: string;
  const itemIds: string[] = [];

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
    inv = app.get(InventoryService);
    server = app.getHttpServer();
    const login = await request(server).post('/api/v1/auth/login').send({ phone: OWNER_PHONE, password: OWNER_PASSWORD });
    cookie = login.headers['set-cookie'][0].split(';')[0];

    const sup = await post('/api/v1/suppliers', { name: `Agrovet-pur-${Date.now()}`, supplierType: 'general' });
    supplierId = sup.body.data.id;
    const feed = await post('/api/v1/items', { itemType: 'feed', name: `Pellet-pur-${Date.now()}`, unit: 'kg' });
    feedItemId = feed.body.data.id;
    itemIds.push(feedItemId);
    const med = await post('/api/v1/items', { itemType: 'medicine', name: `Amox-pur-${Date.now()}`, unit: 'ml' });
    medItemId = med.body.data.id;
    itemIds.push(medItemId);
  });

  afterAll(async () => {
    const bills = await prisma.purchaseBill.findMany({ where: { supplierId }, select: { id: true } });
    const billIds = bills.map((b) => b.id);
    const pays = await prisma.purchasePayment.findMany({ where: { supplierId } });
    await prisma.ledgerEntry.deleteMany({ where: { refType: 'purchase_payment', refId: { in: pays.map((p) => p.id) } } });
    await prisma.purchasePayment.deleteMany({ where: { supplierId } });
    await prisma.purchaseBillLine.deleteMany({ where: { billId: { in: billIds } } });
    await prisma.purchaseBill.deleteMany({ where: { id: { in: billIds } } });
    await prisma.$executeRaw`SET session_replication_role = replica`;
    await prisma.$executeRaw`DELETE FROM stock_movements WHERE item_id = ANY(${itemIds})`;
    await prisma.itemBatch.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await prisma.$executeRaw`SET session_replication_role = DEFAULT`;
    await app.close();
  });

  it('rejects a medicine line without expiry before touching the database', async () => {
    const res = await post('/api/v1/purchase-bills', {
      supplierId, billDate: today(),
      lines: [{ itemId: medItemId, qty: 50, unitCost: 12 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EXPIRY_REQUIRED');
  });

  it('creates a bill that receives stock, with partial payment booking Feed expense', async () => {
    const res = await post('/api/v1/purchase-bills', {
      supplierId, billNo: 'SUP/2026/88', billDate: today(),
      lines: [
        { itemId: feedItemId, qty: 500, unitCost: 28 },              // 14000 — dominant
        { itemId: medItemId, qty: 50, unitCost: 12, expiryDate: future(365), batchNo: 'AMX1' }, // 600
      ],
      otherCharges: 400, paidNow: 5000,
    });
    expect(res.status).toBe(201);
    billId = res.body.data.id;
    expect(res.body.data.purchaseNo).toMatch(/^PUR-\d{4}$/);
    expect(Number(res.body.data.total)).toBe(15000); // 14000 + 600 + 400
    expect(res.body.data.paid).toBe(5000);
    expect(res.body.data.outstanding).toBe(10000);

    // Stock landed as batches.
    const feedBatches = await get(`/api/v1/items/${feedItemId}/batches`);
    expect(Number(feedBatches.body.data[0].qtyRemaining)).toBe(500);
    const medBatches = await get(`/api/v1/items/${medItemId}/batches`);
    expect(medBatches.body.data[0].batchNo).toBe('AMX1');

    // Cash-basis expense from the payment, categorized by dominant line value.
    const ledger = await get(`/api/v1/ledger-entries?month=${today().slice(0, 7)}&kind=expense`);
    const entry = ledger.body.data.find((e: any) => e.refType === 'purchase_payment' && Number(e.amount) === 5000);
    expect(entry).toBeTruthy();
    expect(entry.category.name).toBe('Feed');
  });

  it('guards overpayment, settles the balance, shows supplier outstanding', async () => {
    const over = await post('/api/v1/purchase-payments', { billId, amount: 10001, paidOn: today() });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('OVERPAYMENT');

    const mid = await get('/api/v1/purchases/outstanding');
    expect(mid.body.data.find((r: any) => r.supplier.id === supplierId).outstanding).toBe(10000);

    const ok = await post('/api/v1/purchase-payments', { billId, amount: 10000, method: 'bank', paidOn: today() });
    expect(ok.status).toBe(201);
    const bill = await get(`/api/v1/purchase-bills/${billId}`);
    expect(bill.body.data.outstanding).toBe(0);
  });

  it('refuses to cancel a paid bill; cancels an unpaid one by reversing its stock', async () => {
    const paid = await post(`/api/v1/purchase-bills/${billId}/cancel`, { reason: 'should fail' });
    expect(paid.status).toBe(409);
    expect(paid.body.error.code).toBe('BILL_HAS_PAYMENTS');

    const fresh = await post('/api/v1/purchase-bills', {
      supplierId, billDate: today(),
      lines: [{ itemId: feedItemId, qty: 100, unitCost: 27 }],
    });
    expect(fresh.status).toBe(201);
    const cancel = await post(`/api/v1/purchase-bills/${fresh.body.data.id}/cancel`, { reason: 'wrong entry' });
    expect(cancel.status).toBe(201);

    // 500 from the first bill remain; the cancelled 100 were returned.
    const items = await get(`/api/v1/items?q=Pellet-pur`);
    expect(items.body.data[0].onHand).toBe(500);
  });

  it('blocks cancellation once any of the bill\'s stock has been consumed', async () => {
    const bill = await post('/api/v1/purchase-bills', {
      supplierId, billDate: today(),
      lines: [{ itemId: feedItemId, qty: 50, unitCost: 29 }],
    });
    const batchId = bill.body.data.lines[0].batchId;
    await prisma.$transaction(async (tx) => {
      await inv.consume(tx, feedItemId, 10, { type: 'test', id: 'PUR-TEST' }, { batchId });
    });
    const res = await post(`/api/v1/purchase-bills/${bill.body.data.id}/cancel`, { reason: 'too late' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BILL_STOCK_USED');
  });
});
