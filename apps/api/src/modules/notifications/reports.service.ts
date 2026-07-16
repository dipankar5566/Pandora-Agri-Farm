import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { FarmOpsService } from '../ops/farmops.service';
import { PrismaService } from '../../prisma.service';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const monthRange = (month: string) => {
  const start = day(`${month}-01`);
  const end = new Date(new Date(start).setMonth(start.getMonth() + 1));
  return { start, end };
};

/** Minimal CSV writer: quotes everything, escapes quotes, CRLF for Excel. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    headers.map(cell).join(','),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(',')),
  ].join('\r\n');
}

type Fetcher = (prisma: PrismaService, month?: string) => Promise<Array<Record<string, unknown>>>;

const dateFilter = (field: string, month?: string) =>
  month ? { [field]: { gte: monthRange(month).start, lt: monthRange(month).end } } : {};

/** Every exportable entity, with the RBAC module that guards it. */
export const EXPORTS: Record<string, { module: string; fetch: Fetcher }> = {
  animals: {
    module: 'livestock',
    fetch: async (p) =>
      (await p.animal.findMany({ where: { deletedAt: null }, include: { breed: { select: { name: true } } }, orderBy: { tagNumber: 'asc' } }))
        .map((a) => ({
          tag: a.tagNumber, name: a.name, breed: a.breed.name, sex: a.sex,
          birthDate: a.birthDate.toISOString().slice(0, 10), estimated: a.birthDateEstimated,
          status: a.status, weightKg: a.currentWeightKg, source: a.source,
          purchasePrice: a.purchasePrice,
        })),
  },
  weights: {
    module: 'livestock',
    fetch: async (p, m) =>
      (await p.weightRecord.findMany({ where: dateFilter('weighedOn', m), orderBy: { weighedOn: 'asc' } }))
        .map((w) => ({ animalId: w.animalId, date: w.weighedOn.toISOString().slice(0, 10), weightKg: w.weightKg, bcs: w.bcs })),
  },
  treatments: {
    module: 'health',
    fetch: async (p, m) =>
      (await p.treatment.findMany({ where: dateFilter('treatedAt', m), orderBy: { treatedAt: 'asc' } }))
        .map((t) => ({
          animalId: t.animalId, date: t.treatedAt.toISOString().slice(0, 10),
          itemId: t.itemId, dose: t.doseAmount, unit: t.doseUnit, route: t.route,
          withdrawalUntil: t.withdrawalUntil?.toISOString().slice(0, 10),
        })),
  },
  vaccinations: {
    module: 'health',
    fetch: async (p, m) =>
      (await p.protocolAdministration.findMany({
        where: dateFilter('givenOn', m),
        include: { protocol: { select: { name: true, type: true } } },
        orderBy: { givenOn: 'asc' },
      })).map((a) => ({
        animalId: a.animalId, protocol: a.protocol.name, type: a.protocol.type,
        date: a.givenOn.toISOString().slice(0, 10), dose: a.doseAmount, unit: a.doseUnit,
        nextDue: a.nextDueDate?.toISOString().slice(0, 10),
      })),
  },
  ledger: {
    module: 'finance',
    fetch: async (p, m) =>
      (await p.ledgerEntry.findMany({
        where: { deletedAt: null, ...dateFilter('entryDate', m) },
        include: { category: { select: { name: true } } },
        orderBy: { entryDate: 'asc' },
      })).map((e) => ({
        date: e.entryDate.toISOString().slice(0, 10), kind: e.kind, category: e.category.name,
        amount: e.amount, method: e.paymentMethod, counterparty: e.counterpartyName,
        description: e.description, auto: e.refType ?? '',
      })),
  },
  'stock-movements': {
    module: 'inventory',
    fetch: async (p, m) =>
      (await p.stockMovement.findMany({
        where: dateFilter('movedAt', m),
        include: { item: { select: { name: true, unit: true } } },
        orderBy: { movedAt: 'asc' },
        take: 10000,
      })).map((s) => ({
        date: s.movedAt.toISOString().slice(0, 10), item: s.item.name, type: s.movementType,
        qty: s.qty, unit: s.item.unit, ref: s.refType ?? '', reason: s.reason ?? '',
      })),
  },
  invoices: {
    module: 'sales',
    fetch: async (p, m) =>
      (await p.saleInvoice.findMany({
        where: dateFilter('invoiceDate', m),
        include: { customer: { select: { name: true } }, payments: { select: { amount: true } } },
        orderBy: { invoiceDate: 'asc' },
      })).map((i) => ({
        invoiceNo: i.invoiceNo, date: i.invoiceDate.toISOString().slice(0, 10),
        buyer: i.customer?.name ?? i.buyerName, total: i.total,
        paid: i.payments.reduce((n, x) => n + Number(x.amount), 0),
        cancelled: !!i.cancelledAt,
      })),
  },
  bills: {
    module: 'purchases',
    fetch: async (p, m) =>
      (await p.purchaseBill.findMany({
        where: dateFilter('billDate', m),
        include: { supplier: { select: { name: true } }, payments: { select: { amount: true } } },
        orderBy: { billDate: 'asc' },
      })).map((b) => ({
        purchaseNo: b.purchaseNo, supplierBillNo: b.billNo, date: b.billDate.toISOString().slice(0, 10),
        supplier: b.supplier.name, total: b.total,
        paid: b.payments.reduce((n, x) => n + Number(x.amount), 0),
        cancelled: !!b.cancelledAt,
      })),
  },
  attendance: {
    module: 'employees',
    fetch: async (p, m) =>
      (await p.attendanceRecord.findMany({
        where: dateFilter('date', m),
        include: { employee: { select: { fullName: true } } },
        orderBy: { date: 'asc' },
      })).map((a) => ({ employee: a.employee.fullName, date: a.date.toISOString().slice(0, 10), status: a.status })),
  },
  payroll: {
    module: 'employees',
    fetch: async (p, m) =>
      (await p.payrollRun.findMany({
        where: m ? { periodMonth: m } : {},
        include: { employee: { select: { fullName: true } } },
        orderBy: { periodMonth: 'asc' },
      })).map((r) => ({
        employee: r.employee.fullName, month: r.periodMonth,
        present: r.daysPresent, half: r.daysHalf, leave: r.daysLeave, absent: r.daysAbsent,
        gross: r.grossAmount, bonus: r.bonus, deductions: r.deductions, net: r.netAmount,
        paidOn: r.paidOn?.toISOString().slice(0, 10) ?? '',
      })),
  },
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly farmOps: FarmOpsService,
  ) {}

  async exportCsv(entity: string, month: string | undefined, actor: string) {
    const spec = EXPORTS[entity];
    if (!spec) throw AppError.notFound('export');
    const rows = await spec.fetch(this.prisma, month);
    await this.audit.log('export', 'Export', entity, null, { month: month ?? 'all', rows: rows.length, actor });
    return toCsv(rows);
  }

  /** The monthly farm report — one call, every domain (Phase 1 §19). */
  async monthly(month: string) {
    const { start, end } = monthRange(month);
    const range = { gte: start, lt: end };
    const [
      born, died, sold, purchased, activeNow,
      finance, administrations, casesOpened, casesClosed,
      feedKg, payroll, invoiced, billed, kiddings,
    ] = await Promise.all([
      this.prisma.animal.count({ where: { source: 'born_on_farm', birthDate: range, deletedAt: null } }),
      this.prisma.animalExit.count({ where: { exitType: 'death', exitDate: range } }),
      this.prisma.animalExit.count({ where: { exitType: { in: ['sale', 'cull_sale'] }, exitDate: range } }),
      this.prisma.animal.count({ where: { source: 'purchased', purchaseDate: range, deletedAt: null } }),
      this.prisma.animal.count({ where: { status: 'active', deletedAt: null } }),
      this.farmOps.summary(month),
      this.prisma.protocolAdministration.count({ where: { givenOn: range } }),
      this.prisma.healthCase.count({ where: { openedAt: range } }),
      this.prisma.healthCase.count({ where: { closedAt: range } }),
      this.prisma.feedLog.aggregate({ where: { fedOn: range }, _sum: { qty: true } }),
      this.prisma.payrollRun.aggregate({ where: { periodMonth: month }, _sum: { netAmount: true } }),
      this.prisma.saleInvoice.aggregate({ where: { invoiceDate: range, cancelledAt: null }, _sum: { total: true } }),
      this.prisma.purchaseBill.aggregate({ where: { billDate: range, cancelledAt: null }, _sum: { total: true } }),
      this.prisma.kidding.count({ where: { kiddingDate: range } }),
    ]);
    return {
      month,
      herd: { activeNow, born, died, sold, purchased, kiddings },
      health: { administrations, casesOpened, casesClosed },
      feed: { totalFedKg: Number(feedKg._sum.qty ?? 0) },
      money: {
        income: finance.income, expense: finance.expense, net: finance.net,
        costPerGoat: finance.costPerGoat,
        invoicedTotal: Number(invoiced._sum.total ?? 0),
        purchasedTotal: Number(billed._sum.total ?? 0),
        payrollNet: Number(payroll._sum.netAmount ?? 0),
        byCategory: finance.byCategory,
      },
    };
  }
}
