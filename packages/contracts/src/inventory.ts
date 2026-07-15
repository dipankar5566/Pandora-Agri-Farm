import { z } from 'zod';
import { DateOnly, Ulid } from './herd';

export const ItemType = z.enum(['medicine', 'vaccine', 'dewormer', 'feed', 'mineral', 'supplement', 'consumable', 'equipment']);
export const ItemUnit = z.enum(['kg', 'g', 'l', 'ml', 'piece', 'dose', 'vial', 'bag', 'bottle', 'packet', 'tablet']);
export const AnthelminticClass = z.enum(['benzimidazole', 'imidazothiazole', 'macrocyclic_lactone', 'salicylanilide', 'other']);
const Qty = z.coerce.number().positive().max(100000);

export const CreateItemInput = z.object({
  itemType: ItemType,
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().max(120).optional(),
  unit: ItemUnit,
  category: z.string().trim().max(60).optional(),
  anthelminticClass: AnthelminticClass.optional(),
  defaultDosePerKg: z.coerce.number().positive().max(1000).optional(),
  doseUnit: z.string().trim().max(20).optional(),
  withdrawalDays: z.number().int().min(0).max(120).optional(),
  minStockLevel: Qty.optional(),
  reorderQty: Qty.optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateItemInput = z.infer<typeof CreateItemInput>;

export const UpdateItemInput = CreateItemInput.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;

export const StockInInput = z.object({
  batchNo: z.string().trim().max(60).optional(),
  expiryDate: DateOnly.optional(),
  supplierId: Ulid.optional(),
  receivedOn: DateOnly,
  qtyReceived: Qty,
  unitCost: z.coerce.number().min(0).optional(),
  mrp: z.coerce.number().min(0).optional(),
  isOpening: z.boolean().default(false), // opening balance vs purchase
});
export type StockInInput = z.infer<typeof StockInInput>;

export const AdjustStockInput = z.object({
  batchId: Ulid.optional(),
  movementType: z.enum(['adjustment', 'wastage', 'expiry_writeoff', 'return']),
  qty: z.coerce.number().refine((v) => v !== 0, 'errors.qty_zero'), // signed
  reason: z.string().trim().min(3).max(300),
  movedAt: DateOnly.optional(),
});
export type AdjustStockInput = z.infer<typeof AdjustStockInput>;

export const CreateSupplierInput = z.object({
  name: z.string().trim().min(2).max(200),
  nameBn: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().max(500).optional(),
  gstin: z.string().trim().regex(/^[0-9A-Z]{15}$/).optional(),
  supplierType: z.enum(['medicine', 'feed', 'equipment', 'animal', 'general']).optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateSupplierInput = z.infer<typeof CreateSupplierInput>;
export const UpdateSupplierInput = CreateSupplierInput.partial();
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierInput>;
