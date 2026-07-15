/* Sales e2e: customers, invoices that exit animal lines atomically,
 * payments → ledger income (cash basis), outstanding math, overpayment
 * guard, cancel-unpaid restores animals, cancel-paid refused. */
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
const today = () => new Date().toISOString().slice(0, 10);

describe('sales module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let customerId: string;
  let invoiceId: string;
  const animalIds: string[] = [];

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

    const breeds = await get('/api/v1/breeds');
    for (let i = 0; i < 3; i++) {
      const a = await post('/api/v1/animals', {
        breedId: breeds.body.data[0].id, sex: 'male', birthDate: '2024-06-01',
        source: 'purchased', purchasePrice: 6000, weightKg: 22 + i,
      });
      animalIds.push(a.body.data.id);
    }
  });

  afterAll(async () => {
    const lines = await prisma.saleInvoiceLine.findMany({ where: { animalId: { in: animalIds } } });
    const invIds = [...new Set(lines.map((l) => l.invoiceId))];
    const pays = await prisma.salePayment.findMany({ where: { invoiceId: { in: invIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { refType: 'sale_payment', refId: { in: pays.map((p) => p.id) } } });
    await prisma.salePayment.deleteMany({ where: { invoiceId: { in: invIds } } });
    await prisma.saleInvoiceLine.deleteMany({ where: { invoiceId: { in: invIds } } });
    await prisma.saleInvoice.deleteMany({ where: { id: { in: invIds } } });
    if (customerId) {
      await prisma.salePayment.deleteMany({ where: { customerId } });
      await prisma.customer.delete({ where: { id: customerId } });
    }
    await prisma.animalEvent.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.weightRecord.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.animalExit.deleteMany({ where: { animalId: { in: animalIds } } });
    await prisma.animal.deleteMany({ where: { id: { in: animalIds } } });
    await app.close();
  });

  it('creates a customer', async () => {
    const res = await post('/api/v1/customers', {
      name: `Trader ${Date.now()}`, customerType: 'trader', phone: '9830012345',
    });
    expect(res.status).toBe(201);
    customerId = res.body.data.id;
  });

  it('invoices two goats + manure, exits the goats, books partial cash payment', async () => {
    const res = await post('/api/v1/sale-invoices', {
      customerId, invoiceDate: today(),
      lines: [
        { lineType: 'animal', animalId: animalIds[0], qty: 1, unitPrice: 9000 },
        { lineType: 'animal', animalId: animalIds[1], qty: 1, unitPrice: 9500 },
        { lineType: 'manure', description: 'Manure 10 bags', qty: 10, unit: 'bag', unitPrice: 50 },
      ],
      paidNow: 10000,
    });
    expect(res.status).toBe(201);
    invoiceId = res.body.data.id;
    expect(res.body.data.invoiceNo).toMatch(/^INV-\d{4}$/);
    expect(Number(res.body.data.total)).toBe(19000);
    expect(res.body.data.paid).toBe(10000);
    expect(res.body.data.outstanding).toBe(9000);
    expect(res.body.data.lines.find((l: any) => l.lineType === 'animal').hsnCode).toBe('0104');

    // Animals exited by the invoice, timeline updated.
    const a0 = await get(`/api/v1/animals/${animalIds[0]}`);
    expect(a0.body.data.status).toBe('sold');
    const tl = await get(`/api/v1/animals/${animalIds[0]}/timeline`);
    expect(tl.body.data[0].summaryCode).toBe('timeline.sold_invoice');

    // Cash-basis income booked from the payment, not the invoice total.
    const ledger = await get(`/api/v1/ledger-entries?month=${today().slice(0, 7)}&kind=income`);
    const entry = ledger.body.data.find((e: any) => e.refType === 'sale_payment' && Number(e.amount) === 10000);
    expect(entry).toBeTruthy();
    expect(entry.category.name).toBe('Goat Sale');
  });

  it('refuses to invoice an already-sold animal', async () => {
    const res = await post('/api/v1/sale-invoices', {
      customerId, invoiceDate: today(),
      lines: [{ lineType: 'animal', animalId: animalIds[0], qty: 1, unitPrice: 8000 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ANIMAL_NOT_ACTIVE');
  });

  it('guards overpayment, then settles the balance exactly', async () => {
    const over = await post('/api/v1/sale-payments', { invoiceId, amount: 9001, paidOn: today() });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('OVERPAYMENT');

    const ok = await post('/api/v1/sale-payments', { invoiceId, amount: 9000, method: 'upi', paidOn: today() });
    expect(ok.status).toBe(201);
    const inv = await get(`/api/v1/sale-invoices/${invoiceId}`);
    expect(inv.body.data.outstanding).toBe(0);

    const customers = await get('/api/v1/customers');
    const mine = customers.body.data.find((c: any) => c.id === customerId);
    expect(mine.outstanding).toBe(0);
  });

  it('cancelling an unpaid invoice returns the animal to the herd', async () => {
    const inv = await post('/api/v1/sale-invoices', {
      buyerName: 'Walk-in test', invoiceDate: today(),
      lines: [{ lineType: 'animal', animalId: animalIds[2], qty: 1, unitPrice: 7000 }],
    });
    expect(inv.status).toBe(201);
    const sold = await get(`/api/v1/animals/${animalIds[2]}`);
    expect(sold.body.data.status).toBe('sold');

    const cancel = await post(`/api/v1/sale-invoices/${inv.body.data.id}/cancel`, { reason: 'deal fell through' });
    expect(cancel.status).toBe(201);
    const restored = await get(`/api/v1/animals/${animalIds[2]}`);
    expect(restored.body.data.status).toBe('active');
  });

  it('refuses to cancel an invoice that has payments', async () => {
    const res = await post(`/api/v1/sale-invoices/${invoiceId}/cancel`, { reason: 'should not work' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVOICE_HAS_PAYMENTS');
  });
});
