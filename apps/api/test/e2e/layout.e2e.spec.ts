/* Site-layout e2e: feature CRUD with audit rows, one-shape-per-record 409,
 * fodder status derivation, broken links, anchors (audit.version), plan
 * upload with the dimension-change override, RBAC. The layout row is a real
 * singleton shared with the farm — its plan/anchors are snapshotted in
 * beforeAll and restored in afterAll. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { ctxStore } from '../../src/common/request-context';
import { PrismaService } from '../../src/prisma.service';

const OWNER_PHONE = process.env.SEED_OWNER_PHONE ?? '9999999999';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? '';
const past = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const future = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

describe('site layout module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let layoutId: string;
  let layoutSnapshot: { planAttachmentId: string | null; planWidth: number | null; planHeight: number | null; anchors: unknown };
  const startedAt = new Date();

  const plotName = `E2E-MAP-PLOT-${Date.now()}`;
  const plot2Name = `E2E-MAP-PLOT2-${Date.now()}`;
  let plotId: string;
  let plot2Id: string;
  let dueFeatureId: string;
  const attachmentIds: string[] = [];

  const workerPhone = `70000${String(Date.now()).slice(-5)}`;
  let workerId: string;
  let workerCookie: string;

  const post = (url: string, body: object) =>
    request(server).post(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
  const patch = (url: string, body: object) =>
    request(server).patch(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
  const put = (url: string, body: object) =>
    request(server).put(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
  const del = (url: string) =>
    request(server).delete(url).set('Cookie', cookie).set('Idempotency-Key', randomUUID());
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

    // self-heal stale fixtures from a crashed previous run
    await prisma.siteFeature.deleteMany({ where: { name: { startsWith: 'E2E-MAP' } } });
    const layout = await prisma.siteLayout.findFirstOrThrow({ where: { deletedAt: null } });
    layoutId = layout.id;
    layoutSnapshot = {
      planAttachmentId: layout.planAttachmentId, planWidth: layout.planWidth,
      planHeight: layout.planHeight, anchors: layout.anchors,
    };
    // the farm may have a real plan uploaded — plan tests assume a clean slate
    // (first upload must 200, not trip PLAN_DIMENSIONS_CHANGED); afterAll restores it
    await prisma.siteLayout.update({
      where: { id: layoutId },
      data: { planAttachmentId: null, planWidth: null, planHeight: null },
    });

    // fodder fixtures: a plot with a crop due in 3 days, and one with no crop
    const p1 = await post('/api/v1/fodder-plots', { name: plotName, block: 'A', areaDecimal: 40 });
    expect(p1.status).toBe(201);
    plotId = p1.body.data.id;
    const p2 = await post('/api/v1/fodder-plots', { name: plot2Name });
    plot2Id = p2.body.data.id;
    const sow = await post('/api/v1/fodder-crops', {
      plotId, cropName: 'Napier', sownOn: past(60), expectedHarvestOn: future(3),
    });
    expect(sow.status).toBe(201);

    // worker: layout view but not edit
    const workerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'worker' } });
    workerId = ulid();
    await prisma.user.create({
      data: {
        id: workerId, fullName: 'E2E Map Worker', phone: workerPhone,
        passwordHash: await argon2.hash('map-worker-pass', { type: argon2.argon2id }),
        roles: { create: [{ roleId: workerRole.id }] },
      },
    });
    const wl = await request(server).post('/api/v1/auth/login').send({ phone: workerPhone, password: 'map-worker-pass' });
    workerCookie = wl.headers['set-cookie'][0].split(';')[0];
  });

  afterAll(async () => {
    await prisma.siteFeature.deleteMany({ where: { name: { startsWith: 'E2E-MAP' } } });
    await prisma.siteLayout.update({ where: { id: layoutId }, data: { ...layoutSnapshot as object } });
    await prisma.recordVersion.deleteMany({
      where: { entityType: 'SiteLayout', entityId: layoutId, changedAt: { gte: startedAt } },
    });
    if (attachmentIds.length) await prisma.attachment.deleteMany({ where: { id: { in: attachmentIds } } });
    // fodder chain: harvests → crops → plots (no harvests recorded here)
    await prisma.fodderCrop.deleteMany({ where: { plotId: { in: [plotId, plot2Id] } } });
    await prisma.fodderPlot.deleteMany({ where: { id: { in: [plotId, plot2Id] } } });
    if (workerId) {
      await prisma.session.deleteMany({ where: { userId: workerId } });
      await prisma.userRole.deleteMany({ where: { userId: workerId } });
      await prisma.user.delete({ where: { id: workerId } });
    }
    await app.close();
  });

  it('serves the seeded singleton layout', async () => {
    const res = await get('/api/v1/site-layout');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(layoutId);
    expect(Array.isArray(res.body.data.features)).toBe(true);
  });

  it('creates a linked plot feature with an audit row in the same commit', async () => {
    const res = await post('/api/v1/site-features', {
      kind: 'plot', name: 'E2E-MAP Plot A', nameBn: 'ই২ই জমি',
      geometry: [[100, 100], [300, 100], [300, 260], [100, 260]],
      refType: 'fodder_plot', refId: plotId,
    });
    expect(res.status).toBe(201);
    dueFeatureId = res.body.data.id;
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'SiteFeature', entityId: dueFeatureId, action: 'create' },
    });
    expect(audit).not.toBeNull();
  });

  it('derives harvest_due from the growing crop and enriches the panel data', async () => {
    const res = await get('/api/v1/site-layout');
    const f = res.body.data.features.find((x: any) => x.id === dueFeatureId);
    expect(f.status).toBe('harvest_due'); // expectedHarvestOn is 3 days out (≤ 7-day lead)
    expect(f.plot.name).toBe(plotName);
    expect(f.plot.areaDecimal).toBeDefined();
    expect(f.plot.crop.cropName).toBe('Napier');
    expect(f.plot.crop.ageDays).toBeGreaterThanOrEqual(59);
  });

  it('rejects a second shape for the same fodder plot (REF_ALREADY_MAPPED)', async () => {
    const res = await post('/api/v1/site-features', {
      kind: 'plot', name: 'E2E-MAP duplicate',
      geometry: [[400, 100], [500, 100], [500, 200]],
      refType: 'fodder_plot', refId: plotId,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REF_ALREADY_MAPPED');
  });

  it('rejects links to records that do not exist (REF_NOT_FOUND)', async () => {
    const res = await post('/api/v1/site-features', {
      kind: 'plot', name: 'E2E-MAP bogus link',
      geometry: [[400, 100], [500, 100], [500, 200]],
      refType: 'fodder_plot', refId: ulid(),
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REF_NOT_FOUND');
  });

  it('updates geometry but blocks degenerate edits against the stored kind', async () => {
    const bad = await patch(`/api/v1/site-features/${dueFeatureId}`, { geometry: [[0, 0], [1, 1]] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('GEOMETRY_INVALID');
    const ok = await patch(`/api/v1/site-features/${dueFeatureId}`, {
      geometry: [[100, 100], [320, 100], [320, 280], [100, 280]],
    });
    expect(ok.status).toBe(200);
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'SiteFeature', entityId: dueFeatureId, action: 'update' },
    });
    expect(audit).not.toBeNull();
  });

  it('turns fallow when the crop closes, planted while it grows without a due date', async () => {
    const crops = await get(`/api/v1/fodder-crops?status=growing`);
    const crop = crops.body.data.find((c: any) => c.plot?.name === plotName);
    await patch(`/api/v1/fodder-crops/${crop.id}`, { status: 'harvested', closedOn: past(0) });
    let res = await get('/api/v1/site-layout');
    expect(res.body.data.features.find((x: any) => x.id === dueFeatureId).status).toBe('fallow');

    await post('/api/v1/fodder-crops', { plotId, cropName: 'Berseem', sownOn: past(1) });
    res = await get('/api/v1/site-layout');
    expect(res.body.data.features.find((x: any) => x.id === dueFeatureId).status).toBe('planted');
  });

  it('flags a broken link when the fodder plot is soft-deleted later', async () => {
    const f = await post('/api/v1/site-features', {
      kind: 'plot', name: 'E2E-MAP broken', geometry: [[600, 100], [700, 100], [700, 200]],
      refType: 'fodder_plot', refId: plot2Id,
    });
    expect(f.status).toBe(201);
    await prisma.fodderPlot.update({ where: { id: plot2Id }, data: { deletedAt: new Date() } });
    const res = await get('/api/v1/site-layout');
    const broken = res.body.data.features.find((x: any) => x.id === f.body.data.id);
    expect(broken.linkBroken).toBe(true);
    // unlink is a PATCH with both refs null
    const unlink = await patch(`/api/v1/site-features/${f.body.data.id}`, { refType: null, refId: null });
    expect(unlink.status).toBe(200);
    expect(unlink.body.data.refId).toBeNull();
    await prisma.fodderPlot.update({ where: { id: plot2Id }, data: { deletedAt: null } });
  });

  it('sets GPS anchors with a version snapshot; areas become derivable', async () => {
    const res = await put('/api/v1/site-layout/anchors', {
      anchors: [
        { x: 0, y: 0, lat: 23.9, lng: 87.54, label: 'NW corner' },
        { x: 400, y: 300, lat: 23.8985, lng: 87.5417 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.anchors).toHaveLength(2);
    const version = await prisma.recordVersion.findFirst({
      where: { entityType: 'SiteLayout', entityId: layoutId },
      orderBy: { versionNo: 'desc' },
    });
    expect(version).not.toBeNull();
    const bad = await put('/api/v1/site-layout/anchors', {
      anchors: [{ x: 0, y: 0, lat: 87.54, lng: 23.9 }, { x: 400, y: 300, lat: 23.9, lng: 87.54 }],
    });
    expect(bad.status).toBe(400); // swapped lat/lng caught by the sanity band
  });

  it('uploads a plan, then requires an override when dimensions change', async () => {
    const png = await sharp({ create: { width: 100, height: 80, channels: 3, background: { r: 220, g: 230, b: 220 } } })
      .png().toBuffer();
    const up = await request(server).put('/api/v1/site-layout/plan')
      .set('Cookie', cookie).set('Idempotency-Key', randomUUID())
      .attach('file', png, 'plan.png');
    expect(up.status).toBe(200);
    expect(up.body.data.planWidth).toBe(100);
    expect(up.body.data.planHeight).toBe(80);
    attachmentIds.push(up.body.data.planAttachmentId);

    const served = await get('/api/v1/site-layout/plan');
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/jpeg');

    const png2 = await sharp({ create: { width: 120, height: 90, channels: 3, background: { r: 210, g: 220, b: 210 } } })
      .png().toBuffer();
    const blocked = await request(server).put('/api/v1/site-layout/plan')
      .set('Cookie', cookie).set('Idempotency-Key', randomUUID())
      .attach('file', png2, 'plan2.png');
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('RULE_OVERRIDE_REQUIRED');
    expect(blocked.body.error.params.warnings).toContain('PLAN_DIMENSIONS_CHANGED');

    const forced = await request(server).put('/api/v1/site-layout/plan')
      .set('Cookie', cookie).set('Idempotency-Key', randomUUID())
      .field('confirmOverride', 'true')
      .field('overrideReason', 'higher-resolution rescan (e2e)')
      .attach('file', png2, 'plan2.png');
    expect(forced.status).toBe(200);
    expect(forced.body.data.planWidth).toBe(120);
    attachmentIds.push(forced.body.data.planAttachmentId);
  });

  it('soft-deletes a feature and keeps the row', async () => {
    const res = await del(`/api/v1/site-features/${dueFeatureId}`);
    expect(res.status).toBe(200);
    const listed = await get('/api/v1/site-layout');
    expect(listed.body.data.features.some((x: any) => x.id === dueFeatureId)).toBe(false);
    const row = await prisma.siteFeature.findUnique({ where: { id: dueFeatureId } });
    expect(row?.deletedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'SiteFeature', entityId: dueFeatureId, action: 'soft_delete' },
    });
    expect(audit).not.toBeNull();
  });

  it('RBAC: layout view can read the map but not draw on it', async () => {
    const read = await request(server).get('/api/v1/site-layout').set('Cookie', workerCookie);
    expect(read.status).toBe(200);
    const write = await request(server).post('/api/v1/site-features')
      .set('Cookie', workerCookie).set('Idempotency-Key', randomUUID())
      .send({ kind: 'point', name: 'E2E-MAP nope', geometry: [[1, 1]] });
    expect(write.status).toBe(403);
    const anchor = await request(server).put('/api/v1/site-layout/anchors')
      .set('Cookie', workerCookie).set('Idempotency-Key', randomUUID())
      .send({ anchors: [{ x: 0, y: 0, lat: 23.9, lng: 87.54 }, { x: 1, y: 1, lat: 23.9, lng: 87.54 }] });
    expect(anchor.status).toBe(403);
  });
});
