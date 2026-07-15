import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import type {
  CancelPurchaseBillInput, CreatePurchaseBillInput, RecordPurchasePaymentInput,
} from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const round2 = (n: number) => Math.round(n * 100) / 100;
const EXPIRY_REQUIRED_TYPES = new Set(['medicine', 'vaccine', 'dewormer']);

/** Expense category per item type (payment booking). */
const CATEGORY_BY_TYPE: Record<string, string> = {
  feed: 'Feed', mineral: 'Feed', supplement: 'Feed',
  medicine: 'Medicine', vaccine: 'Vaccine', dewormer: 'Medicine',
  equipment: 'Equipment', consumable: 'Miscellaneous',
};

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async nextPurchaseNo(tx: Tx): Promise<string> {
    const row = await tx.$queryRaw<Array<{ value: number }>>`
      UPDATE settings SET value = (value::int + 1)::text::jsonb
      WHERE key = 'purchase.next' RETURNING (value::int - 1) AS value`;
    let n = row[0]?.value ?? 1;
    let no = `PUR-${String(n).padStart(4, '0')}`;
    while (await tx.purchaseBill.findUnique({ where: { purchaseNo: no }, select: { id: true } })) {
      n += 1;
      no = `PUR-${String(n).padStart(4, '0')}`;
      await tx.setting.update({ where: { key: 'purchase.next' }, data: { value: n + 1 } });
    }
    return no;
  }

  /**
   * A bill IS the goods receipt: every line creates an item batch and a
   * purchase stock movement in the same transaction (Phase 1's PO→GRN→bill
   * chain collapsed to one act — the lean reality of a farm-gate purchase).
   */
  async createBill(input: CreatePurchaseBillInput, actor: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null } });
    if (!supplier) throw AppError.notFound('supplier');
    const items = await this.prisma.item.findMany({
      where: { id: { in: input.lines.map((l) => l.itemId) }, deletedAt: null },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));
    for (const line of input.lines) {
      const item = itemById.get(line.itemId);
      if (!item) throw AppError.notFound('item');
      if (EXPIRY_REQUIRED_TYPES.has(item.itemType) && !line.expiryDate) {
        throw new AppError(400, 'EXPIRY_REQUIRED', 'errors.expiry_required', { item: item.name }, 'expiryDate');
      }
    }
    const billDate = day(input.billDate);
    const subtotal = round2(input.lines.reduce((n, l) => n + l.qty * l.unitCost, 0));
    const total = round2(subtotal + input.otherCharges);
    if (input.paidNow !== undefined && input.paidNow > total) {
      throw AppError.conflict('OVERPAYMENT', { total });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const billId = ulid();
      const bill = await tx.purchaseBill.create({
        data: {
          id: billId, purchaseNo: await this.nextPurchaseNo(tx),
          billNo: input.billNo, supplierId: supplier.id, billDate,
          subtotal, otherCharges: input.otherCharges, total,
          notes: input.notes, createdBy: actor,
        },
      });
      for (const line of input.lines) {
        const item = itemById.get(line.itemId)!;
        const batch = await tx.itemBatch.create({
          data: {
            id: ulid(), itemId: item.id, batchNo: line.batchNo,
            expiryDate: line.expiryDate ? day(line.expiryDate) : undefined,
            supplierId: supplier.id, receivedOn: billDate,
            qtyReceived: line.qty, qtyRemaining: 0, // trigger fills via movement
            unitCost: line.unitCost, createdBy: actor,
          },
        });
        await tx.stockMovement.create({
          data: {
            id: ulid(), itemId: item.id, batchId: batch.id, movementType: 'purchase',
            qty: line.qty, refType: 'purchase_bill', refId: billId,
            movedAt: billDate, createdBy: actor,
          },
        });
        await tx.item.update({ where: { id: item.id }, data: { costPriceLatest: line.unitCost } });
        await tx.purchaseBillLine.create({
          data: {
            id: ulid(), billId, itemId: item.id, batchId: batch.id,
            qty: line.qty, unitCost: line.unitCost, amount: round2(line.qty * line.unitCost),
          },
        });
      }
      if (input.paidNow) {
        await this.applyPayment(tx, {
          bill: { id: billId, purchaseNo: bill.purchaseNo, supplierId: supplier.id, supplierName: supplier.name },
          amount: input.paidNow, method: input.paymentMethod, paidOn: billDate, actor,
        });
      }
      await this.audit.log('create', 'PurchaseBill', billId, null, {
        purchaseNo: bill.purchaseNo, supplier: supplier.name, total, lines: input.lines.length, paidNow: input.paidNow,
      }, tx);
      return bill;
    }, { timeout: 30000 });
    return this.getBill(result.id);
  }

  /** Payment row + cash-basis expense ledger entry, same tx (mirrors sales). */
  private async applyPayment(tx: Tx, opts: {
    bill: { id: string; purchaseNo: string; supplierId: string; supplierName: string };
    amount: number; method: string; paidOn: Date; reference?: string; notes?: string; actor: string;
  }) {
    const payment = await tx.purchasePayment.create({
      data: {
        id: ulid(), supplierId: opts.bill.supplierId, billId: opts.bill.id,
        amount: opts.amount, method: opts.method as never, paidOn: opts.paidOn,
        reference: opts.reference, notes: opts.notes, createdBy: opts.actor,
      },
    });
    // Category = the bill's dominant item type by line value.
    const lines = await tx.purchaseBillLine.findMany({
      where: { billId: opts.bill.id },
      include: { bill: false },
    });
    const items = await tx.item.findMany({ where: { id: { in: lines.map((l) => l.itemId) } } });
    const typeById = new Map(items.map((i) => [i.id, i.itemType]));
    const valueByCat = new Map<string, number>();
    for (const l of lines) {
      const cat = CATEGORY_BY_TYPE[typeById.get(l.itemId) ?? ''] ?? 'Miscellaneous';
      valueByCat.set(cat, (valueByCat.get(cat) ?? 0) + Number(l.amount));
    }
    const catName = [...valueByCat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Miscellaneous';
    const cat = await tx.financeCategory.findUnique({ where: { kind_name: { kind: 'expense', name: catName } } });
    if (cat) {
      await tx.ledgerEntry.create({
        data: {
          id: ulid(), entryDate: opts.paidOn, kind: 'expense', categoryId: cat.id,
          amount: opts.amount, paymentMethod: opts.method as never,
          counterpartyName: opts.bill.supplierName,
          refType: 'purchase_payment', refId: payment.id,
          description: `Auto: payment against ${opts.bill.purchaseNo}`, createdBy: opts.actor,
        },
      });
    }
    return payment;
  }

  async listBills(opts: { supplierId?: string; unpaidOnly?: boolean }) {
    const bills = await this.prisma.purchaseBill.findMany({
      where: { ...(opts.supplierId ? { supplierId: opts.supplierId } : {}) },
      include: {
        supplier: { select: { name: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { id: 'desc' },
      take: 200,
    });
    const rows = bills.map((b) => {
      const paid = round2(b.payments.reduce((n, p) => n + Number(p.amount), 0));
      return {
        ...b, payments: undefined, paid,
        outstanding: b.cancelledAt ? 0 : round2(Number(b.total) - paid),
      };
    });
    return opts.unpaidOnly ? rows.filter((r) => !r.cancelledAt && r.outstanding > 0) : rows;
  }

  async getBill(id: string) {
    const bill = await this.prisma.purchaseBill.findUnique({
      where: { id },
      include: { supplier: true, lines: true, payments: { orderBy: { paidOn: 'asc' } } },
    });
    if (!bill) throw AppError.notFound('bill');
    const items = await this.prisma.item.findMany({
      where: { id: { in: bill.lines.map((l) => l.itemId) } },
      select: { id: true, name: true, unit: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));
    const paid = round2(bill.payments.reduce((n, p) => n + Number(p.amount), 0));
    return {
      ...bill,
      lines: bill.lines.map((l) => ({ ...l, item: itemById.get(l.itemId) })),
      paid,
      outstanding: bill.cancelledAt ? 0 : round2(Number(bill.total) - paid),
    };
  }

  async recordPayment(input: RecordPurchasePaymentInput, actor: string) {
    if (!input.billId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId!, deletedAt: null } });
      if (!supplier) throw AppError.notFound('supplier');
      return this.prisma.$transaction(async (tx) => {
        const payment = await tx.purchasePayment.create({
          data: {
            id: ulid(), supplierId: supplier.id, amount: input.amount,
            method: input.method, paidOn: day(input.paidOn),
            reference: input.reference, notes: input.notes, createdBy: actor,
          },
        });
        const cat = await tx.financeCategory.findUnique({ where: { kind_name: { kind: 'expense', name: 'Miscellaneous' } } });
        if (cat) {
          await tx.ledgerEntry.create({
            data: {
              id: ulid(), entryDate: day(input.paidOn), kind: 'expense', categoryId: cat.id,
              amount: input.amount, paymentMethod: input.method,
              counterpartyName: supplier.name, refType: 'purchase_payment', refId: payment.id,
              description: 'Auto: on-account supplier payment', createdBy: actor,
            },
          });
        }
        await this.audit.log('create', 'PurchasePayment', payment.id, null, { supplier: supplier.name, ...input }, tx);
        return payment;
      });
    }

    const bill = await this.getBill(input.billId);
    if (bill.cancelledAt) throw AppError.conflict('BILL_CANCELLED');
    if (input.amount > bill.outstanding) {
      throw AppError.conflict('OVERPAYMENT', { outstanding: bill.outstanding });
    }
    return this.prisma.$transaction(async (tx) => {
      const payment = await this.applyPayment(tx, {
        bill: { id: bill.id, purchaseNo: bill.purchaseNo, supplierId: bill.supplierId, supplierName: bill.supplier.name },
        amount: input.amount, method: input.method, paidOn: day(input.paidOn),
        reference: input.reference, notes: input.notes, actor,
      });
      await this.audit.log('create', 'PurchasePayment', payment.id, null, { purchaseNo: bill.purchaseNo, amount: input.amount }, tx);
      return payment;
    });
  }

  /**
   * Cancel an unpaid bill whose stock is untouched: return-movements zero the
   * batches (the append-only ledger records the reversal, never erases it).
   */
  async cancelBill(id: string, input: CancelPurchaseBillInput, actor: string) {
    const bill = await this.getBill(id);
    if (bill.cancelledAt) throw AppError.conflict('BILL_CANCELLED');
    if (bill.paid > 0) throw AppError.conflict('BILL_HAS_PAYMENTS');
    const batches = await this.prisma.itemBatch.findMany({
      where: { id: { in: bill.lines.map((l) => l.batchId) } },
    });
    for (const b of batches) {
      if (Number(b.qtyRemaining) !== Number(b.qtyReceived)) {
        throw AppError.conflict('BILL_STOCK_USED', { batchNo: b.batchNo });
      }
    }
    return this.prisma.$transaction(async (tx) => {
      for (const b of batches) {
        await tx.stockMovement.create({
          data: {
            id: ulid(), itemId: b.itemId, batchId: b.id, movementType: 'return',
            qty: -Number(b.qtyReceived), refType: 'purchase_bill_cancel', refId: id,
            movedAt: new Date(), reason: input.reason, createdBy: actor,
          },
        });
      }
      const cancelled = await tx.purchaseBill.update({
        where: { id },
        data: { cancelledAt: new Date(), cancelReason: input.reason },
      });
      await this.audit.log('update', 'PurchaseBill', id, { cancelledAt: null }, { cancelled: true, reason: input.reason }, tx);
      return cancelled;
    });
  }

  /** Supplier balances for the purchases page. */
  async supplierOutstanding() {
    const [billed, paid] = await Promise.all([
      this.prisma.purchaseBill.groupBy({
        by: ['supplierId'], where: { cancelledAt: null }, _sum: { total: true },
      }),
      this.prisma.purchasePayment.groupBy({ by: ['supplierId'], _sum: { amount: true } }),
    ]);
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: billed.map((b) => b.supplierId) }, deletedAt: null },
      select: { id: true, name: true, phone: true },
    });
    const paidBy = new Map(paid.map((p) => [p.supplierId, Number(p._sum.amount ?? 0)]));
    const byId = new Map(suppliers.map((s) => [s.id, s]));
    return billed
      .map((b) => ({
        supplier: byId.get(b.supplierId),
        billed: Number(b._sum.total ?? 0),
        paid: paidBy.get(b.supplierId) ?? 0,
        outstanding: round2(Number(b._sum.total ?? 0) - (paidBy.get(b.supplierId) ?? 0)),
      }))
      .filter((r) => r.supplier)
      .sort((a, b) => b.outstanding - a.outstanding);
  }
}
