import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type {
  CreateEmployeeInput, CreatePayrollRunInput, MarkAttendanceInput,
  PayPayrollInput, UpdateEmployeeInput,
} from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const round2 = (n: number) => Math.round(n * 100) / 100;
const MONTHLY_DIVISOR = 26; // standard Indian working-days divisor

const monthRange = (month: string) => {
  const start = day(`${month}-01`);
  const end = new Date(new Date(start).setMonth(start.getMonth() + 1));
  return { start, end };
};

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── employees ──────────────────────────────────────────────────────
  async list() {
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null },
      orderBy: { fullName: 'asc' },
    });
    // This-month attendance % as the lean performance signal (Phase 1 "Performance").
    const { start, end } = monthRange(new Date().toISOString().slice(0, 7));
    const marks = await this.prisma.attendanceRecord.groupBy({
      by: ['employeeId', 'status'],
      where: { date: { gte: start, lt: end } },
      _count: true,
    });
    const byEmp = new Map<string, Record<string, number>>();
    for (const m of marks) {
      const rec = byEmp.get(m.employeeId) ?? {};
      rec[m.status] = m._count;
      byEmp.set(m.employeeId, rec);
    }
    return employees.map((e) => {
      const rec = byEmp.get(e.id) ?? {};
      const marked = Object.values(rec).reduce((n, c) => n + c, 0);
      const presentUnits = (rec.present ?? 0) + 0.5 * (rec.half_day ?? 0);
      return {
        ...e,
        thisMonth: {
          marked,
          present: rec.present ?? 0, absent: rec.absent ?? 0,
          halfDay: rec.half_day ?? 0, leave: rec.leave ?? 0,
          attendancePct: marked > 0 ? Math.round((presentUnits / marked) * 100) : null,
        },
      };
    });
  }

  async create(input: CreateEmployeeInput, actor: string) {
    const employee = await this.prisma.employee.create({
      data: { id: ulid(), ...input, joinedOn: day(input.joinedOn), createdBy: actor },
    });
    await this.audit.log('create', 'Employee', employee.id, null, input);
    return employee;
  }

  async update(id: string, input: UpdateEmployeeInput, actor: string) {
    const before = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw AppError.notFound('employee');
    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        ...input,
        joinedOn: input.joinedOn ? day(input.joinedOn) : undefined,
        leftOn: input.leftOn === null ? null : input.leftOn ? day(input.leftOn) : undefined,
        updatedBy: actor,
      },
    });
    await this.audit.log('update', 'Employee', id, before, input);
    await this.audit.version('Employee', id, employee);
    return employee;
  }

  // ── attendance ─────────────────────────────────────────────────────
  async markDay(input: MarkAttendanceInput, actor: string) {
    const date = day(input.date);
    const ids = input.entries.map((e) => e.employeeId);
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (employees.length !== new Set(ids).size) throw AppError.notFound('employee');

    await this.prisma.$transaction(async (tx) => {
      for (const entry of input.entries) {
        await tx.attendanceRecord.upsert({
          where: { employeeId_date: { employeeId: entry.employeeId, date } },
          create: { id: ulid(), employeeId: entry.employeeId, date, status: entry.status, notes: entry.notes, createdBy: actor },
          update: { status: entry.status, notes: entry.notes },
        });
      }
      await this.audit.log('update', 'AttendanceRecord', null, null, { date: input.date, marked: input.entries.length }, tx);
    });
    return { marked: input.entries.length };
  }

  async monthAttendance(month: string) {
    const { start, end } = monthRange(month);
    return this.prisma.attendanceRecord.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });
  }

  // ── payroll ────────────────────────────────────────────────────────
  /**
   * Suggested gross from attendance:
   *  monthly: rate/26 per present-unit (leave paid), capped at the full rate;
   *  daily:   rate per present-unit (leave unpaid).
   * The user adjusts bonus/deductions before confirming — the computation is
   * a suggestion, not a verdict.
   */
  async preview(employeeId: string, month: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
    if (!employee) throw AppError.notFound('employee');
    const { start, end } = monthRange(month);
    const marks = await this.prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: start, lt: end } },
    });
    const count = (s: string) => marks.filter((m) => m.status === s).length;
    const daysPresent = count('present');
    const daysHalf = count('half_day');
    const daysLeave = count('leave');
    const daysAbsent = count('absent');
    const rate = Number(employee.wageRate);
    const paidUnits = daysPresent + 0.5 * daysHalf + (employee.wageType === 'monthly' ? daysLeave : 0);
    const gross = employee.wageType === 'monthly'
      ? Math.min(rate, round2((rate / MONTHLY_DIVISOR) * paidUnits))
      : round2(rate * paidUnits);
    return {
      employee: { id: employee.id, fullName: employee.fullName, wageType: employee.wageType, wageRate: rate },
      month, daysPresent, daysHalf, daysLeave, daysAbsent,
      paidUnits, suggestedGross: gross,
      alreadyRun: !!(await this.prisma.payrollRun.findUnique({
        where: { employeeId_periodMonth: { employeeId, periodMonth: month } },
      })),
    };
  }

  async createRun(input: CreatePayrollRunInput, actor: string) {
    const p = await this.preview(input.employeeId, input.month);
    if (p.alreadyRun) throw AppError.conflict('PAYROLL_ALREADY_RUN', { month: input.month });
    const net = round2(p.suggestedGross + input.bonus - input.deductions);
    if (net < 0) throw AppError.conflict('PAYROLL_NEGATIVE_NET');
    const run = await this.prisma.payrollRun.create({
      data: {
        id: ulid(), employeeId: input.employeeId, periodMonth: input.month,
        daysPresent: p.daysPresent, daysHalf: p.daysHalf,
        daysLeave: p.daysLeave, daysAbsent: p.daysAbsent,
        grossAmount: p.suggestedGross, bonus: input.bonus, deductions: input.deductions,
        netAmount: net, notes: input.notes, createdBy: actor,
      },
    });
    await this.audit.log('create', 'PayrollRun', run.id, null, { employee: p.employee.fullName, month: input.month, net });
    return run;
  }

  async listRuns(month?: string) {
    const runs = await this.prisma.payrollRun.findMany({
      where: month ? { periodMonth: month } : {},
      include: { employee: { select: { fullName: true, wageType: true } } },
      orderBy: { id: 'desc' },
      take: 200,
    });
    return runs;
  }

  /** Paying a run books the Labour expense (cash basis, same tx). */
  async pay(id: string, input: PayPayrollInput, actor: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { employee: true } });
    if (!run) throw AppError.notFound('payroll run');
    if (run.paidOn) throw AppError.conflict('PAYROLL_ALREADY_PAID');
    return this.prisma.$transaction(async (tx) => {
      const paid = await tx.payrollRun.update({
        where: { id },
        data: { paidOn: day(input.paidOn), paymentMethod: input.method },
      });
      const cat = await tx.financeCategory.findUnique({ where: { kind_name: { kind: 'expense', name: 'Labour' } } });
      if (cat) {
        await tx.ledgerEntry.create({
          data: {
            id: ulid(), entryDate: day(input.paidOn), kind: 'expense', categoryId: cat.id,
            amount: run.netAmount, paymentMethod: input.method,
            counterpartyName: run.employee.fullName,
            refType: 'payroll_run', refId: id,
            description: `Auto: wages ${run.periodMonth}`, createdBy: actor,
          },
        });
      }
      await this.audit.log('update', 'PayrollRun', id, { paidOn: null }, { paidOn: input.paidOn, net: Number(run.netAmount) }, tx);
      return paid;
    });
  }
}
