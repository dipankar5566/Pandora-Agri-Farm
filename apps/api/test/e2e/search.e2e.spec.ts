/* Universal search e2e: fans out across animals/items/suppliers/tasks/
 * ledger, and each group is gated by the caller's own module permission. */
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

describe('universal search', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ownerCookie: string;
  let visitorCookie: string;
  let animalId: string;
  const needle = `Zephyr${Date.now()}`;

  const post = (url: string, body: object, cookie: string) =>
    request(server).post(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
  const get = (url: string, cookie: string) => request(server).get(url).set('Cookie', cookie);

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
    ownerCookie = login.headers['set-cookie'][0].split(';')[0];

    const breeds = await get('/api/v1/breeds', ownerCookie);
    const a = await post('/api/v1/animals', {
      breedId: breeds.body.data[0].id, sex: 'female', birthDate: '2024-01-01',
      source: 'purchased', purchasePrice: 5000, name: needle,
    }, ownerCookie);
    animalId = a.body.data.id;

    const visitorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'visitor' } });
    const visitorPhone = uniquePhone();
    await post('/api/v1/users', {
      fullName: 'Search Visitor', phone: visitorPhone, password: 'visitor-pass-1234',
      locale: 'en', roleIds: [visitorRole.id],
    }, ownerCookie);
    const vLogin = await request(server).post('/api/v1/auth/login').send({ phone: visitorPhone, password: 'visitor-pass-1234' });
    visitorCookie = vLogin.headers['set-cookie'][0].split(';')[0];
  });

  afterAll(async () => {
    await prisma.animalEvent.deleteMany({ where: { animalId } });
    await prisma.weightRecord.deleteMany({ where: { animalId } });
    await prisma.animal.deleteMany({ where: { id: animalId } });
    const visitor = await prisma.user.findFirst({ where: { fullName: 'Search Visitor' } });
    if (visitor) {
      await prisma.session.deleteMany({ where: { userId: visitor.id } });
      await prisma.userRole.deleteMany({ where: { userId: visitor.id } });
      await prisma.user.delete({ where: { id: visitor.id } });
    }
    await app.close();
  });

  it('finds an animal by a fragment of its name, case-insensitively', async () => {
    const res = await get(`/api/v1/search?q=${needle.toLowerCase().slice(0, 8)}`, ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.animals.some((a: any) => a.id === animalId)).toBe(true);
  });

  it('rejects an empty query', async () => {
    const res = await get('/api/v1/search?q=', ownerCookie);
    expect(res.status).toBe(400);
  });

  it('an owner sees the ledger group; a visitor (dashboard:view only) does not', async () => {
    const ownerRes = await get('/api/v1/search?q=goat', ownerCookie);
    expect(ownerRes.body.data).toHaveProperty('ledger');
    expect(ownerRes.body.data).toHaveProperty('animals');

    const visitorRes = await get('/api/v1/search?q=goat', visitorCookie);
    expect(visitorRes.status).toBe(200);
    expect(visitorRes.body.data).not.toHaveProperty('ledger');
    expect(visitorRes.body.data).not.toHaveProperty('animals');
  });
});
