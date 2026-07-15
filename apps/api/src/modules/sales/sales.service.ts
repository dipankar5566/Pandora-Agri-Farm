import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import type {
  CancelInvoiceInput, CreateCustomerInput, CreateInvoiceInput,
  RecordSalePaymentInput, UpdateCustomerInput,
} from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── customers ──────────────────────────────────────────────────────
  async listCustomers() {
    const customers = await this.prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    // Outstanding per customer = non-cancelled invoice totals − their payments.
    const [invoiced, paid] = await Promise.all([
      this.prisma.saleInvoice.groupBy({
        by: ['customerId'],
        where: { cancelledAt: null, customerId: { not: null } },
        _sum: { total: true },
      }),
      this.prisma.salePayment.groupBy({
        by: ['customerId'],
        where: { customerId: { not: null } },
        _sum: { amount: true },
      }),
    ]);
    const inv = new Map(invoiced.map((r) => [r.customerId, Number(r._sum.total ?? 0)]));
    const pay = new Map(paid.map((r) => [r.customerId, Number(r._sum.amount ?? 0)]));
    return customers.map((c) => ({
      ...c,
      outstanding: round2((inv.get(c.id) ?? 0) - (pay.get(c.id) ?? 0)),
    }));
  }

  async createCustomer(input: CreateCustomerInput, actor: string) {
    const customer = await this.prisma.customer.create({ data: { id: ulid(), ...input, createdBy: actor } });
    await this.audit.log('create', 'Customer', customer.id, null, input);
    return customer;
  }

  async updateCustomer(id: string, input: UpdateCustomerInput, actor: string) {
    const before = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw AppError.notFound('customer');
    const customer = await this.prisma.customer.update({ where: { id }, data: { ...input, updatedBy: actor } });
    await this.audit.log('update', 'Customer', id, before, input);
    return customer;
  }

  // ── invoice numbering (INV-0001, settings counter, in-transaction) ─
  private async nextInvoiceNo(tx: Tx): Promise<string> {
    const row = await tx.$queryRaw<Array<{ value: number }>>`
      UPDATE settings SET value = (value::int + 1)::text::jsonb
      WHERE key = 'invoice.next' RETURNING (value::int - 1) AS value`;
    let n = row[0]?.value ?? 1;
    let no = `INV-${String(n).padStart(4, '0')}`;
    while (await tx.saleInvoice.findUnique({ where: { invoiceNo: no }, select: { id: true } })) {
      n += 1;
      no = `INV-${String(n).padStart(4, '0')}`;
      await tx.setting.update({ where: { key: 'invoice.next' }, data: { value: n + 1 } });
    }
    return no;
  }

  /**
   * Creating an invoice with animal lines EXITS those animals in the same
   * transaction (sale, price = line amount). All sale income is recognized
   * from payments — this method books no ledger entry itself unless paidNow.
   */
  async createInvoice(input: CreateInvoiceInput, actor: string) {
    if (input.customerId) {
      const c = await this.prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
      if (!c) throw AppError.notFound('customer');
    }
    // Resolve + validate animal lines up front.
    const animalIds = input.lines.filter((l) => l.lineType === 'animal').map((l) => l.animalId!);
    if (new Set(animalIds).size !== animalIds.length) throw AppError.conflict('ANIMAL_DUPLICATED_ON_INVOICE');
    const animals = animalIds.length
      ? await this.prisma.animal.findMany({ where: { id: { in: animalIds }, deletedAt: null } })
      : [];
    const byId = new Map(animals.map((a) => [a.id, a]));
    for (const id of animalIds) {
      const a = byId.get(id);
      if (!a) throw AppError.notFound('animal');
      if (a.status !== 'active') throw AppError.conflict('ANIMAL_NOT_ACTIVE', { tag: a.tagNumber });
    }
    // Withdrawal-period sale guard applies here exactly as on the exit path.
    for (const id of animalIds) {
      const w = await this.activeWithdrawalUntil(id);
      if (w) {
        throw new AppError(422, 'RULE_OVERRIDE_REQUIRED', 'errors.rule_override_required', {
          warnings: ['WITHDRAWAL_ACTIVE'], tag: byId.get(id)!.tagNumber,
          withdrawalUntil: w.toISOString().slice(0, 10),
        });
      }
    }

    const invoiceDate = day(input.invoiceDate);
    const buyerLabel = input.buyerName ?? (input.customerId
      ? (await this.prisma.customer.findUnique({ where: { id: input.customerId } }))!.name
      : null);

    const result = await this.prisma.$transaction(async (tx) => {
      const invoiceId = ulid();
      let subtotal = 0;
      let taxAmount = 0;
      const lineRows = input.lines.map((l) => {
        const animal = l.animalId ? byId.get(l.animalId) : undefined;
        const amount = round2(l.qty * l.unitPrice);
        const tax = round2((amount * l.gstRatePct) / 100);
        subtotal = round2(subtotal + amount);
        taxAmount = round2(taxAmount + tax);
        return {
          id: ulid(), invoiceId, lineType: l.lineType, animalId: l.animalId,
          description: l.description ?? (animal ? `Goat ${animal.tagNumber}` : ''),
          hsnCode: l.hsnCode ?? (l.lineType === 'animal' ? '0104' : undefined),
          qty: l.qty, unit: l.lineType === 'animal' ? 'piece' : l.unit,
          unitPrice: l.unitPrice, gstRatePct: l.gstRatePct, amount,
        };
      });
      const total = round2(subtotal + taxAmount);
      if (input.paidNow !== undefined && input.paidNow > total) {
        throw AppError.conflict('OVERPAYMENT', { total });
      }

      const invoice = await tx.saleInvoice.create({
        data: {
          id: invoiceId, invoiceNo: await this.nextInvoiceNo(tx),
          customerId: input.customerId, buyerName: input.buyerName,
          invoiceDate, subtotal, taxAmount, total, notes: input.notes, createdBy: actor,
        },
      });
      await tx.saleInvoiceLine.createMany({ data: lineRows });

      // Exit each animal line: exit row + status + timeline, referencing this invoice.
      for (const line of lineRows) {
        if (!line.animalId) continue;
        const animal = byId.get(line.animalId)!;
        const exit = await tx.animalExit.create({
          data: {
            id: ulid(), animalId: animal.id, exitType: 'sale', exitDate: invoiceDate,
            buyerName: buyerLabel, price: line.amount,
            liveWeightKg: animal.currentWeightKg, createdBy: actor,
          },
        });
        await tx.animal.update({
          where: { id: animal.id },
          data: { status: 'sold', statusDate: invoiceDate, updatedBy: actor },
        });
        await tx.animalEvent.create({
          data: {
            id: ulid(), animalId: animal.id, eventType: 'sold', occurredAt: invoiceDate,
            summaryCode: 'timeline.sold_invoice',
            summaryParams: { invoiceNo: invoice.invoiceNo, price: Number(line.amount) } as object,
            refType: 'sale_invoice', refId: invoiceId,
          },
        });
        void exit;
      }

      let payment = null;
      if (input.paidNow) {
        payment = await this.applyPayment(tx, {
          invoice, amount: input.paidNow, method: input.paymentMethod,
          paidOn: invoiceDate, actor,
        });
      }
      await this.audit.log('create', 'SaleInvoice', invoiceId, null, {
        invoiceNo: invoice.invoiceNo, total, lines: lineRows.length, paidNow: input.paidNow,
      }, tx);
      return { invoice, payment };
    }, { timeout: 30000 });
    return this.getInvoice(result.invoice.id);
  }

  private async activeWithdrawalUntil(animalId: string): Promise<Date | null> {
    const now = new Date();
    const [t, p] = await Promise.all([
      this.prisma.treatment.findFirst({
        where: { animalId, withdrawalUntil: { gte: now } },
        orderBy: { withdrawalUntil: 'desc' }, select: { withdrawalUntil: true },
      }),
      this.prisma.protocolAdministration.findFirst({
        where: { animalId, withdrawalUntil: { gte: now } },
        orderBy: { withdrawalUntil: 'desc' }, select: { withdrawalUntil: true },
      }),
    ]);
    const dates = [t?.withdrawalUntil, p?.withdrawalUntil].filter((d): d is Date => !!d);
    return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  }

  /** Shared payment application: payment row + ledger income entry, same tx. */
  private async applyPayment(tx: Tx, opts: {
    invoice: { id: string; invoiceNo: string; customerId: string | null; buyerName: string | null };
    amount: number; method: string; paidOn: Date; reference?: string; notes?: string; actor: string;
  }) {
    const payment = await tx.salePayment.create({
      data: {
        id: ulid(), customerId: opts.invoice.customerId, invoiceId: opts.invoice.id,
        amount: opts.amount, method: opts.method as never, paidOn: opts.paidOn,
        reference: opts.reference, notes: opts.notes, createdBy: opts.actor,
      },
    });
    // Category by the invoice's dominant line type.
    const lines = await tx.saleInvoiceLine.findMany({ where: { invoiceId: opts.invoice.id } });
    const hasAnimal = lines.some((l) => l.lineType === 'animal');
    const hasManure = lines.some((l) => l.lineType === 'manure' || l.lineType === 'vermicompost');
    const catName = hasAnimal ? 'Goat Sale' : hasManure ? 'Manure Sale' : 'Other Income';
    const cat = await tx.financeCategory.findUnique({ where: { kind_name: { kind: 'income', name: catName } } });
    if (cat) {
      await tx.ledgerEntry.create({
        data: {
          id: ulid(), entryDate: opts.paidOn, kind: 'income', categoryId: cat.id,
          amount: opts.amount, paymentMethod: opts.method as never,
          counterpartyName: opts.invoice.buyerName,
          refType: 'sale_payment', refId: payment.id,
          description: `Auto: payment against ${opts.invoice.invoiceNo}`, createdBy: opts.actor,
        },
      });
    }
    return payment;
  }

  /**
   * Fast path used by HerdService.exit inside ITS transaction: one-line
   * invoice + full cash payment + ledger entry — the farm-gate cash sale.
   */
  async cashSaleFromExit(tx: Tx, opts: {
    animalId: string; tagNumber: string; exitId: string; exitDate: Date;
    price: number; buyerName?: string | null; actor: string;
  }) {
    const invoiceId = ulid();
    const invoice = await tx.saleInvoice.create({
      data: {
        id: invoiceId, invoiceNo: await this.nextInvoiceNo(tx),
        buyerName: opts.buyerName ?? 'Cash sale', invoiceDate: opts.exitDate,
        subtotal: opts.price, taxAmount: 0, total: opts.price,
        refType: 'animal_exit', refId: opts.exitId, createdBy: opts.actor,
      },
    });
    await tx.saleInvoiceLine.create({
      data: {
        id: ulid(), invoiceId, lineType: 'animal', animalId: opts.animalId,
        description: `Goat ${opts.tagNumber}`, hsnCode: '0104',
        qty: 1, unit: 'piece', unitPrice: opts.price, gstRatePct: 0, amount: opts.price,
      },
    });
    await this.applyPayment(tx, {
      invoice: { id: invoiceId, invoiceNo: invoice.invoiceNo, customerId: null, buyerName: invoice.buyerName },
      amount: opts.price, method: 'cash', paidOn: opts.exitDate, actor: opts.actor,
    });
    return invoice;
  }

  // ── queries ────────────────────────────────────────────────────────
  async listInvoices(opts: { customerId?: string; unpaidOnly?: boolean }) {
    const invoices = await this.prisma.saleInvoice.findMany({
      where: { ...(opts.customerId ? { customerId: opts.customerId } : {}) },
      include: {
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
        lines: { select: { lineType: true } },
      },
      orderBy: { id: 'desc' },
      take: 200,
    });
    const rows = invoices.map((inv) => {
      const paid = round2(inv.payments.reduce((n, p) => n + Number(p.amount), 0));
      return {
        ...inv,
        payments: undefined,
        paid,
        outstanding: inv.cancelledAt ? 0 : round2(Number(inv.total) - paid),
        lineTypes: [...new Set(inv.lines.map((l) => l.lineType))],
        lines: undefined,
      };
    });
    return opts.unpaidOnly ? rows.filter((r) => !r.cancelledAt && r.outstanding > 0) : rows;
  }

  async getInvoice(id: string) {
    const inv = await this.prisma.saleInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: true,
        payments: { orderBy: { paidOn: 'asc' } },
      },
    });
    if (!inv) throw AppError.notFound('invoice');
    const paid = round2(inv.payments.reduce((n, p) => n + Number(p.amount), 0));
    return { ...inv, paid, outstanding: inv.cancelledAt ? 0 : round2(Number(inv.total) - paid) };
  }

  async recordPayment(input: RecordSalePaymentInput, actor: string) {
    if (!input.invoiceId) {
      // On-account payment: no invoice, just customer + ledger.
      const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId!, deletedAt: null } });
      if (!customer) throw AppError.notFound('customer');
      return this.prisma.$transaction(async (tx) => {
        const payment = await tx.salePayment.create({
          data: {
            id: ulid(), customerId: customer.id, amount: input.amount,
            method: input.method, paidOn: day(input.paidOn),
            reference: input.reference, notes: input.notes, createdBy: actor,
          },
        });
        const cat = await tx.financeCategory.findUnique({ where: { kind_name: { kind: 'income', name: 'Other Income' } } });
        if (cat) {
          await tx.ledgerEntry.create({
            data: {
              id: ulid(), entryDate: day(input.paidOn), kind: 'income', categoryId: cat.id,
              amount: input.amount, paymentMethod: input.method,
              counterpartyName: customer.name, refType: 'sale_payment', refId: payment.id,
              description: 'Auto: on-account customer payment', createdBy: actor,
            },
          });
        }
        await this.audit.log('create', 'SalePayment', payment.id, null, { customer: customer.name, ...input }, tx);
        return payment;
      });
    }

    const invoice = await this.getInvoice(input.invoiceId);
    if (invoice.cancelledAt) throw AppError.conflict('INVOICE_CANCELLED');
    if (input.amount > invoice.outstanding) {
      throw AppError.conflict('OVERPAYMENT', { outstanding: invoice.outstanding });
    }
    return this.prisma.$transaction(async (tx) => {
      const payment = await this.applyPayment(tx, {
        invoice: { id: invoice.id, invoiceNo: invoice.invoiceNo, customerId: invoice.customerId, buyerName: invoice.buyerName ?? invoice.customer?.name ?? null },
        amount: input.amount, method: input.method, paidOn: day(input.paidOn),
        reference: input.reference, notes: input.notes, actor,
      });
      await this.audit.log('create', 'SalePayment', payment.id, null, { invoiceNo: invoice.invoiceNo, amount: input.amount }, tx);
      return payment;
    });
  }

  /** Cancel an UNPAID invoice: animals return to the herd, exits are removed. */
  async cancelInvoice(id: string, input: CancelInvoiceInput, actor: string) {
    const invoice = await this.getInvoice(id);
    if (invoice.cancelledAt) throw AppError.conflict('INVOICE_CANCELLED');
    if (invoice.paid > 0) throw AppError.conflict('INVOICE_HAS_PAYMENTS');

    return this.prisma.$transaction(async (tx) => {
      for (const line of invoice.lines) {
        if (!line.animalId) continue;
        await tx.animalExit.deleteMany({ where: { animalId: line.animalId } });
        await tx.animal.update({
          where: { id: line.animalId },
          data: { status: 'active', statusDate: new Date(), updatedBy: actor },
        });
        await tx.animalEvent.create({
          data: {
            id: ulid(), animalId: line.animalId, eventType: 'status_changed', occurredAt: new Date(),
            summaryCode: 'timeline.sale_cancelled',
            summaryParams: { invoiceNo: invoice.invoiceNo, reason: input.reason } as object,
            refType: 'sale_invoice', refId: id,
          },
        });
      }
      const cancelled = await tx.saleInvoice.update({
        where: { id },
        data: { cancelledAt: new Date(), cancelReason: input.reason },
      });
      await this.audit.log('update', 'SaleInvoice', id, { cancelledAt: null }, { cancelled: true, reason: input.reason }, tx);
      return cancelled;
    });
  }
}
