/* Fodder e2e: plots, crop cycle, multi-cut harvests landing as feed
 * stock via 'production' movements, yield math, close/fail rules. */
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
const past = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

describe('fodder module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let plotId: string;
  let cropId: string;
  let greenItemId: string;
  const itemIds: string[] = [];

  const post = (url: string, body: object) =>
    request(server).post(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
  const patch = (url: string, body: object) =>
    request(server).patch(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
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

    const item = await post('/api/v1/items', {
      itemType: 'feed', name: `Napier-green-${Date.now()}`, unit: 'kg',
    });
    greenItemId = item.body.data.id;
    itemIds.push(greenItemId);
  });

  afterAll(async () => {
    await prisma.fodderHarvest.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.fodderCrop.deleteMany({ where: { plotId } });
    await prisma.fodderPlot.deleteMany({ where: { id: plotId } });
    await prisma.$executeRaw`SET session_replication_role = replica`;
    await prisma.$executeRaw`DELETE FROM stock_movements WHERE item_id = ANY(${itemIds})`;
    await prisma.itemBatch.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    await prisma.$executeRaw`SET session_replication_role = DEFAULT`;
    await app.close();
  });

  it('creates a plot on Block A and sows a crop', async () => {
    const plot = await post('/api/v1/fodder-plots', {
      name: `Block A North ${Date.now()}`, block: 'A', areaDecimal: 40,
    });
    expect(plot.status).toBe(201);
    plotId = plot.body.data.id;

    const crop = await post('/api/v1/fodder-crops', {
      plotId, cropName: 'Napier', variety: 'CO-4', sownOn: past(90), costTotal: 3500,
    });
    expect(crop.status).toBe(201);
    cropId = crop.body.data.id;

    const growing = await get('/api/v1/fodder-crops?status=growing');
    const mine = growing.body.data.find((c: any) => c.id === cropId);
    expect(mine.ageDays).toBeGreaterThanOrEqual(89);
    expect(mine.totalYieldKg).toBe(0);
  });

  it('rejects a harvest into a non-feed item and before sowing', async () => {
    const med = await post('/api/v1/items', {
      itemType: 'medicine', name: `NotFeed-${Date.now()}`, unit: 'ml',
    });
    itemIds.push(med.body.data.id);
    const wrongItem = await post(`/api/v1/fodder-crops/${cropId}/harvests`, {
      harvestedOn: past(10), form: 'green', qtyKg: 100, itemId: med.body.data.id,
    });
    expect(wrongItem.status).toBe(409);
    expect(wrongItem.body.error.code).toBe('NOT_A_FEED_ITEM');

    const tooEarly = await post(`/api/v1/fodder-crops/${cropId}/harvests`, {
      harvestedOn: past(120), form: 'green', qtyKg: 100, itemId: greenItemId,
    });
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('HARVEST_BEFORE_SOWING');
  });

  it('records multi-cut harvests that land as consumable feed stock', async () => {
    const cut1 = await post(`/api/v1/fodder-crops/${cropId}/harvests`, {
      harvestedOn: past(30), form: 'green', qtyKg: 800, itemId: greenItemId,
    });
    expect(cut1.status).toBe(201);
    expect(cut1.body.data.batchNo).toContain('Napier');

    const cut2 = await post(`/api/v1/fodder-crops/${cropId}/harvests`, {
      harvestedOn: past(2), form: 'green', qtyKg: 650, dryMatterPct: 22, itemId: greenItemId,
    });
    expect(cut2.status).toBe(201);

    // Stock is on hand at zero cost, via 'production' movements.
    const items = await get(`/api/v1/items?q=Napier-green`);
    expect(items.body.data[0].onHand).toBe(1450);
    const movements = await get(`/api/v1/items/${greenItemId}/movements`);
    expect(movements.body.data.every((m: any) => m.movementType === 'production')).toBe(true);

    // Yield analytics on the crop.
    const crop = await get(`/api/v1/fodder-crops/${cropId}`);
    expect(crop.body.data.totalYieldKg).toBe(1450);
    expect(crop.body.data.yieldPerDecimal).toBe(36.3); // 1450 / 40 decimals
  });

  it('closes the crop; further harvests and double-close are refused', async () => {
    const close = await patch(`/api/v1/fodder-crops/${cropId}`, {
      status: 'harvested', closedOn: past(0),
    });
    expect(close.status).toBe(200);

    const late = await post(`/api/v1/fodder-crops/${cropId}/harvests`, {
      harvestedOn: past(0), form: 'green', qtyKg: 10, itemId: greenItemId,
    });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('CROP_NOT_GROWING');

    const again = await patch(`/api/v1/fodder-crops/${cropId}`, {
      status: 'failed', closedOn: past(0), failReason: 'nope',
    });
    expect(again.status).toBe(409);
  });

  it('requires a reason when a crop fails', async () => {
    const crop = await post('/api/v1/fodder-crops', {
      plotId, cropName: 'Maize', sownOn: past(20),
    });
    const noReason = await patch(`/api/v1/fodder-crops/${crop.body.data.id}`, {
      status: 'failed', closedOn: past(0),
    });
    expect(noReason.status).toBe(400);
    const ok = await patch(`/api/v1/fodder-crops/${crop.body.data.id}`, {
      status: 'failed', closedOn: past(0), failReason: 'flooding after heavy rain',
    });
    expect(ok.status).toBe(200);
  });
});
