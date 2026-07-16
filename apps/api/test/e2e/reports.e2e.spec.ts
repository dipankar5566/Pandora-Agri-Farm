/* Notifications + Reports e2e: daily digest counts and bell lifecycle,
 * scheduled endpoint token guard, monthly report aggregation, CSV
 * exports with per-entity RBAC and audit. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { ctxStore } from '../../src/common/request-context';
import { toCsv } from '../../src/modules/notifications/reports.service';
import { PrismaService } from '../../src/prisma.service';

const OWNER_PHONE = process.env.SEED_OWNER_PHONE ?? '9999999999';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? '';
const month = () => new Date().toISOString().slice(0, 7);

describe('notifications & reports module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  const notifIds: string[] = [];

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
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { id: { in: notifIds } } });
    await app.close();
  });

  it('escapes CSV cells correctly (unit-ish)', () => {
    const csv = toCsv([{ a: 'plain', b: 'has "quotes", commas', c: null }]);
    expect(csv.split('\r\n')[1]).toBe('"plain","has ""quotes"", commas",""');
  });

  it('generates a daily digest visible at the bell, then marks it read', async () => {
    const gen = await post('/api/v1/notifications/digest', {});
    expect(gen.status).toBe(201);
    expect(gen.body.data.emailStatus).toBe('not_configured'); // no SMTP in test env
    expect(gen.body.data.counts).toHaveProperty('duesOverdue');

    const list = await get('/api/v1/notifications?unread=true');
    expect(list.body.meta.unreadCount).toBeGreaterThan(0);
    const digest = list.body.data.find((n: any) => n.type === 'daily_digest');
    expect(digest.body).toContain('daily digest');
    notifIds.push(...list.body.data.map((n: any) => n.id));

    await post(`/api/v1/notifications/${digest.id}/read`, {});
    const after = await get('/api/v1/notifications?unread=true');
    expect(after.body.data.find((n: any) => n.id === digest.id)).toBeUndefined();

    await post('/api/v1/notifications/read-all', {});
    const cleared = await get('/api/v1/notifications?unread=true');
    expect(cleared.body.meta.unreadCount).toBe(0);
  });

  it('rejects the scheduled digest without the ops token', async () => {
    const res = await request(server).post('/api/v1/notifications/digest/scheduled');
    expect(res.status).toBe(401);
    const ok = await request(server).post('/api/v1/notifications/digest/scheduled')
      .set('X-Ops-Token', process.env.OPS_TOKEN ?? '');
    expect(ok.status).toBe(201);
    const latest = await prisma.notification.findFirst({ orderBy: { id: 'desc' } });
    if (latest) notifIds.push(latest.id);
  });

  it('serves the monthly report with every domain aggregated', async () => {
    const res = await get(`/api/v1/reports/monthly?month=${month()}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.herd).toHaveProperty('activeNow');
    expect(d.herd).toHaveProperty('kiddings');
    expect(d.health).toHaveProperty('administrations');
    expect(d.money).toHaveProperty('payrollNet');
    expect(d.money).toHaveProperty('invoicedTotal');
    expect(Array.isArray(d.money.byCategory)).toBe(true);
  });

  it('exports animals CSV with headers and audits the export', async () => {
    const breeds = await get('/api/v1/breeds');
    const animal = await post('/api/v1/animals', {
      breedId: breeds.body.data[0].id, sex: 'female', birthDate: '2024-02-01',
      source: 'gift', name: 'CsvTestGoat',
    });
    expect(animal.status).toBe(201);

    const res = await get('/api/v1/exports/animals.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('"tag"');
    expect(res.text).toContain('CsvTestGoat');

    const audit = await get('/api/v1/audit-log?entityType=Export');
    expect(audit.body.data[0].action).toBe('export');
    expect(audit.body.data[0].entityId).toBe('animals');

    await prisma.animalEvent.deleteMany({ where: { animalId: animal.body.data.id } });
    await prisma.animal.delete({ where: { id: animal.body.data.id } });
  });

  it('unknown export 404s; ledger export needs finance permission', async () => {
    const unknown = await get('/api/v1/exports/nonsense.csv');
    expect(unknown.status).toBe(404);
    const ledger = await get(`/api/v1/exports/ledger.csv?month=${month()}`);
    expect(ledger.status).toBe(200); // owner has finance:approve
  });
});
