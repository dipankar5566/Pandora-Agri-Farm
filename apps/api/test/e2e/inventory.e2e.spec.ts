/* Inventory e2e: item CRUD, expiry-required rule, FEFO batches, stock
 * ledger with trigger-maintained qty_remaining, negative-stock rejection,
 * consume() FEFO + expiry behavior, expiring alert query, suppliers. */
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
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

describe('inventory module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inv: InventoryService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let itemId: string;
  let feedId: string;
  let earlyBatchId: string;
  const itemIds: string[] = [];
  const name = `Ivermectin-test-${Date.now()}`;

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
  });

  afterAll(async () => {
    // stock_movements is append-only by trigger; bypass triggers for test cleanup only
    await prisma.$executeRaw`SET session_replication_role = replica`;
    await prisma.$executeRaw`DELETE FROM stock_movements WHERE item_id = ANY(${itemIds})`;
    await prisma.$executeRaw`SET session_replication_role = DEFAULT`;
    await prisma.itemBatch.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    await app.close();
  });

  it('creates a dewormer item and rejects duplicates', async () => {
    const res = await post('/api/v1/items', {
      itemType: 'dewormer', name, unit: 'ml', anthelminticClass: 'macrocyclic_lactone',
      defaultDosePerKg: 0.2, doseUnit: 'ml', withdrawalDays: 14, minStockLevel: 50,
    });
    expect(res.status).toBe(201);
    itemId = res.body.data.id;
    itemIds.push(itemId);

    const dup = await post('/api/v1/items', { itemType: 'dewormer', name, unit: 'ml' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ITEM_EXISTS');
  });

  it('requires expiry for medicine-class stock-in', async () => {
    const res = await post(`/api/v1/items/${itemId}/batches`, {
      receivedOn: future(0), qtyReceived: 100,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EXPIRY_REQUIRED');
  });

  it('stocks in two batches; trigger fills qty_remaining; FEFO orders them', async () => {
    const late = await post(`/api/v1/items/${itemId}/batches`, {
      batchNo: 'LATE', expiryDate: future(365), receivedOn: future(0), qtyReceived: 100, unitCost: 12,
    });
    expect(late.status).toBe(201);
    expect(Number(late.body.data.qtyRemaining)).toBe(100);

    const early = await post(`/api/v1/items/${itemId}/batches`, {
      batchNo: 'EARLY', expiryDate: future(20), receivedOn: future(0), qtyReceived: 30, unitCost: 11,
    });
    earlyBatchId = early.body.data.id;

    const batches = await get(`/api/v1/items/${itemId}/batches`);
    expect(batches.body.data.map((b: any) => b.batchNo)).toEqual(['EARLY', 'LATE']);

    const items = await get(`/api/v1/items?q=${name}`);
    expect(items.body.data[0].onHand).toBe(130);
    expect(items.body.data[0].belowMin).toBe(false);
    expect(items.body.data[0].hasExpiringBatch).toBe(true); // EARLY expires in 20d
  });

  it('rejects taking more than a batch holds (DB-level check)', async () => {
    const res = await post(`/api/v1/items/${itemId}/adjust`, {
      batchId: earlyBatchId, movementType: 'adjustment', qty: -31, reason: 'test overdraw',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STOCK_INSUFFICIENT');
  });

  it('records wastage with mandatory reason and updates the ledger', async () => {
    const res = await post(`/api/v1/items/${itemId}/adjust`, {
      batchId: earlyBatchId, movementType: 'wastage', qty: -5, reason: 'broken vial',
    });
    expect(res.status).toBe(201);
    const batches = await get(`/api/v1/items/${itemId}/batches`);
    expect(Number(batches.body.data.find((b: any) => b.batchNo === 'EARLY').qtyRemaining)).toBe(25);
  });

  it('consume() picks the earliest-expiry batch (FEFO) and records the ref', async () => {
    await prisma.$transaction(async (tx) => {
      const picked = await inv.consume(tx, itemId, 10, { type: 'treatment', id: 'TEST-REF' });
      expect(picked.batchNo).toBe('EARLY');
    });
    const mv = await get(`/api/v1/items/${itemId}/movements`);
    const consumption = mv.body.data.find((m: any) => m.refId === 'TEST-REF');
    expect(consumption.movementType).toBe('consumption');
    expect(Number(consumption.qty)).toBe(-10);
  });

  it('lists expiring batches with day counts', async () => {
    const res = await get('/api/v1/stock/expiring?days=30');
    const mine = res.body.data.find((b: any) => b.batchNo === 'EARLY');
    expect(mine).toBeTruthy();
    expect(mine.daysToExpiry).toBeLessThanOrEqual(20);
  });

  it('flags belowMin after heavy consumption', async () => {
    await post(`/api/v1/items/${itemId}/adjust`, {
      batchId: (await get(`/api/v1/items/${itemId}/batches`)).body.data.find((b: any) => b.batchNo === 'LATE').id,
      movementType: 'adjustment', qty: -70, reason: 'test drain',
    });
    const items = await get(`/api/v1/items?belowMin=true&q=${name}`);
    expect(items.body.data.some((i: any) => i.id === itemId)).toBe(true); // 130-5-10-70=45 < 50 min
  });

  it('creates a feed item without expiry requirement + a supplier', async () => {
    const feed = await post('/api/v1/items', {
      itemType: 'feed', name: `Concentrate-test-${Date.now()}`, unit: 'kg', minStockLevel: 100,
    });
    feedId = feed.body.data.id;
    itemIds.push(feedId);
    const batch = await post(`/api/v1/items/${feedId}/batches`, {
      receivedOn: future(0), qtyReceived: 500, unitCost: 28, isOpening: true,
    });
    expect(batch.status).toBe(201);

    const sup = await post('/api/v1/suppliers', { name: `Suri Agrovet ${Date.now()}`, supplierType: 'medicine', phone: '9433001122' });
    expect(sup.status).toBe(201);
    await prisma.supplier.delete({ where: { id: sup.body.data.id } });
  });
});
