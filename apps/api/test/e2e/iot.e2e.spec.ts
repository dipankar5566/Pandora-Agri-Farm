/* IoT pilot scaffold e2e: device registration (ear tag + gateway),
 * duplicate-serial rejection, API-key-authenticated reading ingestion,
 * wrong/missing-key and inactive/nonexistent-device rejection, readback. */
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

describe('iot pilot module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let breedId: string;
  let animalId: string;
  let tagDeviceId: string;
  let gatewayDeviceId: string;
  let gatewayKey: string;
  const deviceIds: string[] = [];

  const post = (url: string, body: object) =>
    request(server).post(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
  const get = (url: string) => request(server).get(url).set('Cookie', cookie);
  const postDevice = (url: string, key: string | undefined, body: object) => {
    const req = request(server).post(url).send(body);
    return key === undefined ? req : req.set('x-device-key', key);
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
    const animal = await post('/api/v1/animals', {
      breedId, birthDate: '2023-06-01', source: 'purchased', purchasePrice: 8000, sex: 'female', weightKg: 22,
    });
    expect(animal.status).toBe(201);
    animalId = animal.body.data.id;
  });

  afterAll(async () => {
    await prisma.sensorReading.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await prisma.iotDevice.deleteMany({ where: { id: { in: deviceIds } } });
    await prisma.$executeRaw`SET session_replication_role = replica`;
    await prisma.$executeRaw`DELETE FROM animal_events WHERE animal_id = ${animalId}`;
    await prisma.$executeRaw`DELETE FROM weight_records WHERE animal_id = ${animalId}`;
    await prisma.$executeRaw`DELETE FROM animals WHERE id = ${animalId}`;
    await prisma.$executeRaw`SET session_replication_role = DEFAULT`;
    await app.close();
  });

  it('registers an ear tag against an animal', async () => {
    const serial = `PILOT-TAG-${Date.now()}`;
    const res = await post('/api/v1/iot/devices', { deviceType: 'ear_tag', serialNumber: serial, animalId });
    expect(res.status).toBe(201);
    expect(res.body.data.apiKey).toBeUndefined(); // ear tags never get an API key
    tagDeviceId = res.body.data.id;
    deviceIds.push(tagDeviceId);

    const dup = await post('/api/v1/iot/devices', { deviceType: 'ear_tag', serialNumber: serial, animalId });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('SERIAL_TAKEN');
  });

  it('rejects an ear tag with no animal assigned', async () => {
    const res = await post('/api/v1/iot/devices', {
      deviceType: 'ear_tag', serialNumber: `PILOT-TAG-NOANIMAL-${Date.now()}`,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields?.[0]?.messageCode).toBe('errors.ear_tag_requires_animal');
  });

  it('registers a gateway and issues a one-time API key', async () => {
    const res = await post('/api/v1/iot/devices', {
      deviceType: 'ble_gateway', serialNumber: `PILOT-GW-${Date.now()}`, installLocation: 'Barn Pen A',
    });
    expect(res.status).toBe(201);
    expect(typeof res.body.data.apiKey).toBe('string');
    gatewayDeviceId = res.body.data.id;
    gatewayKey = res.body.data.apiKey;
    deviceIds.push(gatewayDeviceId);

    const listed = await get('/api/v1/iot/devices');
    expect(listed.body.data.some((d: any) => d.id === gatewayDeviceId)).toBe(true);
    expect(listed.body.data.find((d: any) => d.id === gatewayDeviceId).apiKeyHash).toBeTruthy();
  });

  it('ingests a batch with the issued key and updates device state', async () => {
    const now = new Date().toISOString();
    const res = await postDevice('/api/v1/iot/readings', gatewayKey, {
      readings: [
        { deviceId: tagDeviceId, readingType: 'accelerometer_activity', capturedAt: now, value: 12.5, gatewayId: gatewayDeviceId },
        { deviceId: tagDeviceId, readingType: 'battery_pct', capturedAt: now, value: 87, gatewayId: gatewayDeviceId },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.accepted).toBe(2);

    const device = await prisma.iotDevice.findUnique({ where: { id: tagDeviceId } });
    expect(device?.batteryPct).toBe(87);
    expect(device?.lastSeenAt).toBeTruthy();

    const readings = await get(`/api/v1/iot/devices/${tagDeviceId}/readings`);
    expect(readings.body.data).toHaveLength(2);
  });

  it('rejects ingestion with a missing or wrong device key', async () => {
    const now = new Date().toISOString();
    const missing = await postDevice('/api/v1/iot/readings', undefined, {
      readings: [{ deviceId: tagDeviceId, readingType: 'battery_pct', capturedAt: now, value: 50 }],
    });
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('DEVICE_KEY_INVALID');

    const wrong = await postDevice('/api/v1/iot/readings', 'not-the-real-key', {
      readings: [{ deviceId: tagDeviceId, readingType: 'battery_pct', capturedAt: now, value: 50, gatewayId: gatewayDeviceId }],
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('DEVICE_KEY_INVALID');
  });

  it('rejects ingestion to a nonexistent or inactive device', async () => {
    const now = new Date().toISOString();
    const missingDevice = await postDevice('/api/v1/iot/readings', gatewayKey, {
      readings: [{ deviceId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', readingType: 'battery_pct', capturedAt: now, value: 50 }],
    });
    expect(missingDevice.status).toBe(404);

    await prisma.iotDevice.update({ where: { id: tagDeviceId }, data: { status: 'retired' } });
    const inactive = await postDevice('/api/v1/iot/readings', gatewayKey, {
      readings: [{ deviceId: tagDeviceId, readingType: 'battery_pct', capturedAt: now, value: 50 }],
    });
    expect(inactive.status).toBe(409);
    expect(inactive.body.error.code).toBe('DEVICE_INACTIVE');
  });
});
