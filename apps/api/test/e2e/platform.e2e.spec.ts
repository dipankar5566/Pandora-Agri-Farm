/* Platform e2e: real Nest app + real Postgres (migrated & seeded dev DB).
 * Covers: login (bad/good/lockout), RBAC deny, users CRUD, idempotency,
 * farm patch + audit trail, health endpoint. */
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
const uniquePhone = () => `7${String(Date.now()).slice(-9)}`;

describe('platform (auth, RBAC, audit, idempotency)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ownerCookie: string;
  const workerPhone = uniquePhone();
  const workerPassword = 'worker-pass-1234';
  let workerCookie: string;
  let workerId: string;

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
  });

  afterAll(async () => {
    if (workerId) {
      await prisma.userRole.deleteMany({ where: { userId: workerId } });
      await prisma.session.deleteMany({ where: { userId: workerId } });
      await prisma.user.delete({ where: { id: workerId } });
    }
    await app.close();
  });

  it('rejects a wrong password without user enumeration', async () => {
    const res = await request(server).post('/api/v1/auth/login')
      .send({ phone: OWNER_PHONE, password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    // reset the failure counter so this test never locks the real owner
    await prisma.user.updateMany({ where: { phone: OWNER_PHONE }, data: { failedLoginCount: 0 } });
  });

  it('logs in the seeded owner and reports approve-everything', async () => {
    const res = await request(server).post('/api/v1/auth/login')
      .send({ phone: OWNER_PHONE, password: OWNER_PASSWORD });
    expect(res.status).toBe(200);
    ownerCookie = res.headers['set-cookie'][0].split(';')[0];
    const me = await request(server).get('/api/v1/auth/me').set('Cookie', ownerCookie);
    expect(me.status).toBe(200);
    expect(me.body.data.permissions.settings).toBe('approve');
    expect(me.body.data.roles).toContain('owner');
  });

  it('requires an Idempotency-Key on mutations and replays duplicates', async () => {
    const workerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'worker' } });
    const body = {
      fullName: 'Test Worker', phone: workerPhone, password: workerPassword,
      locale: 'bn', roleIds: [workerRole.id],
    };
    const noKey = await request(server).post('/api/v1/users').set('Cookie', ownerCookie).send(body);
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const key = randomUUID();
    const first = await request(server).post('/api/v1/users')
      .set('Cookie', ownerCookie).set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);
    workerId = first.body.data.id;

    const replay = await request(server).post('/api/v1/users')
      .set('Cookie', ownerCookie).set('Idempotency-Key', key).send(body);
    expect(replay.body.data.id).toBe(workerId); // no duplicate created

    const mismatch = await request(server).post('/api/v1/users')
      .set('Cookie', ownerCookie).set('Idempotency-Key', key)
      .send({ ...body, fullName: 'Different' });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_MISMATCH');
  });

  it('denies a worker access to user management (RBAC)', async () => {
    const res = await request(server).post('/api/v1/auth/login')
      .send({ phone: workerPhone, password: workerPassword });
    expect(res.status).toBe(200);
    workerCookie = res.headers['set-cookie'][0].split(';')[0];

    const denied = await request(server).get('/api/v1/users').set('Cookie', workerCookie);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERM_DENIED');
  });

  it('lets a worker update their own locale', async () => {
    const res = await request(server).patch('/api/v1/auth/me')
      .set('Cookie', workerCookie).send({ locale: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.data.locale).toBe('en');
  });

  it('locks an account after 5 failed logins', async () => {
    for (let i = 0; i < 5; i++) {
      await request(server).post('/api/v1/auth/login')
        .send({ phone: workerPhone, password: 'bad-password-123' });
    }
    const locked = await request(server).post('/api/v1/auth/login')
      .send({ phone: workerPhone, password: workerPassword });
    expect(locked.status).toBe(401);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    await prisma.user.update({
      where: { id: workerId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });

  it('patches the farm and writes an audit trail', async () => {
    const res = await request(server).patch('/api/v1/farm')
      .set('Cookie', ownerCookie).set('Idempotency-Key', randomUUID())
      .send({ pin: '731102' });
    expect(res.status).toBe(200);
    expect(res.body.data.pin).toBe('731102');

    const log = await request(server)
      .get('/api/v1/audit-log?entityType=Farm').set('Cookie', ownerCookie);
    expect(log.status).toBe(200);
    expect(log.body.data[0].action).toBe('update');
    expect(log.body.data[0].after.pin).toBe('731102');

    const versions = await prisma.recordVersion.findMany({ where: { entityType: 'Farm' } });
    expect(versions.length).toBeGreaterThan(0);
  });

  it('serves public health with db and disk signals', async () => {
    const res = await request(server).get('/api/v1/ops/health');
    expect(res.status).toBe(200);
    expect(res.body.data.db).toBe(true);
    expect(res.body.data.diskFreeGb).toBeGreaterThan(0);
  });
});
