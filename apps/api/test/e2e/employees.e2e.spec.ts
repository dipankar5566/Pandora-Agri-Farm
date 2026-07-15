/* Employees e2e: register, day-batch attendance upsert, payroll math
 * (monthly /26 with paid leave + cap; daily without leave pay), unique
 * run per month, paying books Labour expense. */
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
// Use LAST month so today's date can never collide with the fixture days.
const lastMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const M = lastMonth();

describe('employees module', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie: string;
  let monthlyId: string;
  let dailyId: string;
  let runId: string;
  const employeeIds: string[] = [];

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

    // Self-heal: an interrupted previous run may have left fixtures behind,
    // which would corrupt the payroll math assertions. Clean before starting.
    const stale = await prisma.employee.findMany({
      where: { fullName: { in: ['Test Rakhal', 'Test Daily Hand'] } },
      select: { id: true },
    });
    if (stale.length) {
      const staleIds = stale.map((s) => s.id);
      const staleRuns = await prisma.payrollRun.findMany({ where: { employeeId: { in: staleIds } } });
      await prisma.ledgerEntry.deleteMany({ where: { refType: 'payroll_run', refId: { in: staleRuns.map((r) => r.id) } } });
      await prisma.payrollRun.deleteMany({ where: { employeeId: { in: staleIds } } });
      await prisma.attendanceRecord.deleteMany({ where: { employeeId: { in: staleIds } } });
      await prisma.employee.deleteMany({ where: { id: { in: staleIds } } });
    }
  });

  afterAll(async () => {
    const runs = await prisma.payrollRun.findMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { refType: 'payroll_run', refId: { in: runs.map((r) => r.id) } } });
    await prisma.payrollRun.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.attendanceRecord.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
    await app.close();
  });

  it('registers monthly and daily-wage employees', async () => {
    const m = await post('/api/v1/employees', {
      fullName: 'Test Rakhal', wageType: 'monthly', wageRate: 13000, joinedOn: `${M}-01`,
    });
    expect(m.status).toBe(201);
    monthlyId = m.body.data.id;
    employeeIds.push(monthlyId);

    const d = await post('/api/v1/employees', {
      fullName: 'Test Daily Hand', wageType: 'daily', wageRate: 450, joinedOn: `${M}-01`,
    });
    dailyId = d.body.data.id;
    employeeIds.push(dailyId);
  });

  it('marks a day for everyone and re-marking upserts, not duplicates', async () => {
    const mark = await post('/api/v1/attendance', {
      date: `${M}-05`,
      entries: [
        { employeeId: monthlyId, status: 'present' },
        { employeeId: dailyId, status: 'absent' },
      ],
    });
    expect(mark.status).toBe(201);

    const fix = await post('/api/v1/attendance', {
      date: `${M}-05`,
      entries: [{ employeeId: dailyId, status: 'present' }], // correction
    });
    expect(fix.status).toBe(201);
    const month = await get(`/api/v1/attendance?month=${M}`);
    const dailyMarks = month.body.data.filter((a: any) => a.employeeId === dailyId);
    expect(dailyMarks).toHaveLength(1);
    expect(dailyMarks[0].status).toBe('present');
  });

  it('computes payroll: monthly ÷26 with paid leave, daily without', async () => {
    // Build a small month: 10 present, 2 half, 1 leave, 1 absent for both.
    const days: Array<[string, string]> = [];
    for (let i = 6; i <= 15; i++) days.push([`${M}-${String(i).padStart(2, '0')}`, 'present']);
    days.push([`${M}-16`, 'half_day'], [`${M}-17`, 'half_day'], [`${M}-18`, 'leave'], [`${M}-19`, 'absent']);
    for (const [date, status] of days) {
      await post('/api/v1/attendance', {
        date,
        entries: [
          { employeeId: monthlyId, status },
          { employeeId: dailyId, status },
        ],
      });
    }
    // monthly: units incl. day-05 present = 11 + 0.5*2 + 1(leave paid) = 13 → 13000/26*13 = 6500
    const m = await post('/api/v1/payroll/preview', { employeeId: monthlyId, month: M });
    expect(m.body.data.daysPresent).toBe(11);
    expect(m.body.data.suggestedGross).toBe(6500);
    // daily: units = 11 + 1 (leave unpaid) = 12 → 450*12 = 5400
    const d = await post('/api/v1/payroll/preview', { employeeId: dailyId, month: M });
    expect(d.body.data.suggestedGross).toBe(5400);
  });

  it('creates a run with bonus/deduction, refuses a duplicate month', async () => {
    const run = await post('/api/v1/payroll', {
      employeeId: monthlyId, month: M, bonus: 500, deductions: 200,
    });
    expect(run.status).toBe(201);
    runId = run.body.data.id;
    expect(Number(run.body.data.netAmount)).toBe(6800); // 6500 + 500 − 200

    const dup = await post('/api/v1/payroll', { employeeId: monthlyId, month: M });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('PAYROLL_ALREADY_RUN');
  });

  it('paying the run books a Labour expense; paying twice is refused', async () => {
    const pay = await post(`/api/v1/payroll/${runId}/pay`, { paidOn: `${M}-28`, method: 'cash' });
    expect(pay.status).toBe(201);

    const ledger = await get(`/api/v1/ledger-entries?month=${M}&kind=expense`);
    const entry = ledger.body.data.find((e: any) => e.refType === 'payroll_run' && e.refId === runId);
    expect(entry).toBeTruthy();
    expect(Number(entry.amount)).toBe(6800);
    expect(entry.category.name).toBe('Labour');

    const again = await post(`/api/v1/payroll/${runId}/pay`, { paidOn: `${M}-29` });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYROLL_ALREADY_PAID');
  });

  it('shows this-month attendance percentage on the employee list', async () => {
    const res = await get('/api/v1/employees');
    const mine = res.body.data.find((e: any) => e.id === monthlyId);
    expect(mine.thisMonth).toBeDefined(); // fixture days are last month → 0 marked this month
  });
});
