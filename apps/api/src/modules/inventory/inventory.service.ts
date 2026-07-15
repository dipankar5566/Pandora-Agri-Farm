import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import type {
  AdjustStockInput, CreateItemInput, CreateSupplierInput, StockInInput,
  UpdateItemInput, UpdateSupplierInput,
} from '@pandora/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma.service';

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const EXPIRY_REQUIRED_TYPES = new Set(['medicine', 'vaccine', 'dewormer']);

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── items ──────────────────────────────────────────────────────────
  async listItems(opts: { type?: string; belowMin?: boolean; q?: string }) {
    const items = await this.prisma.item.findMany({
      where: {
        deletedAt: null,
        ...(opts.type ? { itemType: opts.type as never } : {}),
        ...(opts.q ? { name: { contains: opts.q, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    const sums = await this.prisma.stockMovement.groupBy({
      by: ['itemId'], _sum: { qty: true },
      where: { itemId: { in: items.map((i) => i.id) } },
    });
    const onHand = new Map(sums.map((s) => [s.itemId, Number(s._sum.qty ?? 0)]));
    const expiring = await this.prisma.itemBatch.groupBy({
      by: ['itemId'],
      where: {
        itemId: { in: items.map((i) => i.id) },
        qtyRemaining: { gt: 0 },
        expiryDate: { lte: new Date(Date.now() + 30 * 86400000) },
      },
      _count: true,
    });
    const expiringSet = new Set(expiring.map((e) => e.itemId));
    const rows = items.map((i) => ({
      ...i,
      onHand: onHand.get(i.id) ?? 0,
      belowMin: i.minStockLevel != null && (onHand.get(i.id) ?? 0) < Number(i.minStockLevel),
      hasExpiringBatch: expiringSet.has(i.id),
    }));
    return opts.belowMin ? rows.filter((r) => r.belowMin) : rows;
  }

  async createItem(input: CreateItemInput, actor: string) {
    const clash = await this.prisma.item.findFirst({
      where: { name: input.name, itemType: input.itemType, deletedAt: null },
    });
    if (clash) throw AppError.conflict('ITEM_EXISTS');
    const item = await this.prisma.item.create({
      data: { id: ulid(), ...input, createdBy: actor },
    });
    await this.audit.log('create', 'Item', item.id, null, input);
    return item;
  }

  async updateItem(id: string, input: UpdateItemInput, actor: string) {
    const before = await this.prisma.item.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw AppError.notFound('item');
    const item = await this.prisma.item.update({ where: { id }, data: { ...input, updatedBy: actor } });
    await this.audit.log('update', 'Item', id, before, input);
    await this.audit.version('Item', id, item);
    return item;
  }

  // ── stock in / batches ────────────────────────────────────────────
  async stockIn(itemId: string, input: StockInInput, actor: string) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!item) throw AppError.notFound('item');
    if (EXPIRY_REQUIRED_TYPES.has(item.itemType) && !input.expiryDate) {
      throw new AppError(400, 'EXPIRY_REQUIRED', 'errors.expiry_required', undefined, 'expiryDate');
    }
    if (input.supplierId) {
      const s = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null } });
      if (!s) throw AppError.notFound('supplier');
    }
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.itemBatch.create({
        data: {
          id: ulid(), itemId, batchNo: input.batchNo,
          expiryDate: input.expiryDate ? day(input.expiryDate) : undefined,
          supplierId: input.supplierId, receivedOn: day(input.receivedOn),
          qtyReceived: input.qtyReceived, qtyRemaining: 0, // trigger fills via movement
          unitCost: input.unitCost, mrp: input.mrp, createdBy: actor,
        },
      });
      await tx.stockMovement.create({
        data: {
          id: ulid(), itemId, batchId: batch.id,
          movementType: input.isOpening ? 'opening' : 'purchase',
          qty: input.qtyReceived, movedAt: day(input.receivedOn), createdBy: actor,
        },
      });
      if (input.unitCost !== undefined) {
        await tx.item.update({ where: { id: itemId }, data: { costPriceLatest: input.unitCost } });
      }
      await this.audit.log('create', 'ItemBatch', batch.id, null, { item: item.name, ...input }, tx);
      return tx.itemBatch.findUniqueOrThrow({ where: { id: batch.id } });
    });
  }

  /** FEFO order: earliest expiry first, in-stock only. */
  async batches(itemId: string, inStockOnly = true) {
    return this.prisma.itemBatch.findMany({
      where: { itemId, ...(inStockOnly ? { qtyRemaining: { gt: 0 } } : {}) },
      include: { supplier: { select: { name: true } } },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedOn: 'asc' }],
    });
  }

  async movements(itemId: string, limit = 100) {
    return this.prisma.stockMovement.findMany({
      where: { itemId },
      include: { batch: { select: { batchNo: true } } },
      orderBy: { id: 'desc' },
      take: limit,
    });
  }

  // ── adjustments / wastage ─────────────────────────────────────────
  async adjust(itemId: string, input: AdjustStockInput, actor: string) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!item) throw AppError.notFound('item');
    if (input.batchId) {
      const batch = await this.prisma.itemBatch.findFirst({ where: { id: input.batchId, itemId } });
      if (!batch) throw AppError.notFound('batch');
    } else if (input.qty < 0) {
      // Non-batch outflow: verify the item-level balance covers it.
      const sum = await this.prisma.stockMovement.aggregate({ where: { itemId }, _sum: { qty: true } });
      if (Number(sum._sum.qty ?? 0) + input.qty < 0) {
        throw AppError.conflict('STOCK_INSUFFICIENT', { available: Number(sum._sum.qty ?? 0) });
      }
    }
    try {
      const mv = await this.prisma.$transaction(async (tx) => {
        const mv = await tx.stockMovement.create({
          data: {
            id: ulid(), itemId, batchId: input.batchId, movementType: input.movementType,
            qty: input.qty, reason: input.reason,
            movedAt: input.movedAt ? day(input.movedAt) : new Date(), createdBy: actor,
          },
        });
        await this.audit.log('create', 'StockMovement', mv.id, null, { item: item.name, ...input }, tx);
        return mv;
      });
      return mv;
    } catch (e) {
      // Batch CHECK (qty_remaining >= 0) violated → the ledger refused it.
      if (e instanceof Prisma.PrismaClientKnownRequestError || /chk_batch_qty/.test(String(e))) {
        throw AppError.conflict('STOCK_INSUFFICIENT');
      }
      throw e;
    }
  }

  /**
   * Consume stock inside a caller's transaction (used by Health treatments,
   * feed logs …). FEFO-picks a batch when none given. Throws STOCK_INSUFFICIENT
   * or BATCH_EXPIRED — callers rely on these for their own contracts.
   */
  async consume(
    tx: Tx, itemId: string, qty: number,
    ref: { type: string; id: string }, opts: { batchId?: string; onDate?: Date; actor?: string } = {},
  ) {
    if (qty <= 0) throw new AppError(400, 'BIOLOGY_RANGE', 'errors.qty_positive');
    const onDate = opts.onDate ?? new Date();
    let batch;
    if (opts.batchId) {
      batch = await tx.itemBatch.findUnique({ where: { id: opts.batchId } });
      if (!batch || batch.itemId !== itemId) throw AppError.notFound('batch');
    } else {
      batch = await tx.itemBatch.findFirst({
        where: { itemId, qtyRemaining: { gte: qty }, OR: [{ expiryDate: null }, { expiryDate: { gte: onDate } }] },
        orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }],
      });
      if (!batch) throw AppError.conflict('STOCK_INSUFFICIENT', { requested: qty });
    }
    if (batch.expiryDate && batch.expiryDate < onDate) throw AppError.conflict('BATCH_EXPIRED', { batchNo: batch.batchNo });
    if (Number(batch.qtyRemaining) < qty) {
      throw AppError.conflict('STOCK_INSUFFICIENT', { available: Number(batch.qtyRemaining), requested: qty });
    }
    await tx.stockMovement.create({
      data: {
        id: ulid(), itemId, batchId: batch.id, movementType: 'consumption',
        qty: -qty, refType: ref.type, refId: ref.id, movedAt: onDate, createdBy: opts.actor,
      },
    });
    return { batchId: batch.id, batchNo: batch.batchNo, expiryDate: batch.expiryDate };
  }

  // ── alert queries (dashboard feeds) ──────────────────────────────
  async expiring(days = 30) {
    const rows = await this.prisma.itemBatch.findMany({
      where: {
        qtyRemaining: { gt: 0 },
        expiryDate: { not: null, lte: new Date(Date.now() + days * 86400000) },
      },
      include: { item: { select: { name: true, nameBn: true, unit: true } } },
      orderBy: { expiryDate: 'asc' },
    });
    return rows.map((b) => ({
      ...b,
      daysToExpiry: Math.ceil((b.expiryDate!.getTime() - Date.now()) / 86400000),
    }));
  }

  // ── suppliers ─────────────────────────────────────────────────────
  listSuppliers() {
    return this.prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async createSupplier(input: CreateSupplierInput, actor: string) {
    const supplier = await this.prisma.supplier.create({ data: { id: ulid(), ...input, createdBy: actor } });
    await this.audit.log('create', 'Supplier', supplier.id, null, input);
    return supplier;
  }

  async updateSupplier(id: string, input: UpdateSupplierInput, actor: string) {
    const before = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw AppError.notFound('supplier');
    const supplier = await this.prisma.supplier.update({ where: { id }, data: { ...input, updatedBy: actor } });
    await this.audit.log('update', 'Supplier', id, before, input);
    return supplier;
  }
}
