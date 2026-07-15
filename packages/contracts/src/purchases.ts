import { z } from 'zod';
import { DateOnly, Ulid } from './herd';

const BillLine = z.object({
  itemId: Ulid,
  qty: z.coerce.number().positive().max(100000),
  unitCost: z.coerce.number().min(0).max(10000000),
  batchNo: z.string().trim().max(60).optional(),
  expiryDate: DateOnly.optional(), // mandatory for medicine-class items (DB trigger)
});

export const CreatePurchaseBillInput = z.object({
  supplierId: Ulid,
  billNo: z.string().trim().max(60).optional(), // the supplier's own number
  billDate: DateOnly,
  lines: z.array(BillLine).min(1).max(50),
  otherCharges: z.coerce.number().min(0).default(0), // freight etc.
  notes: z.string().max(1000).optional(),
  paidNow: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'bank', 'upi', 'cheque', 'credit']).default('cash'),
});
export type CreatePurchaseBillInput = z.infer<typeof CreatePurchaseBillInput>;

export const RecordPurchasePaymentInput = z.object({
  billId: Ulid.optional(),
  supplierId: Ulid.optional(), // on-account when no bill given
  amount: z.coerce.number().positive().max(10000000),
  method: z.enum(['cash', 'bank', 'upi', 'cheque', 'credit']).default('cash'),
  paidOn: DateOnly,
  reference: z.string().trim().max(100).optional(),
  notes: z.string().max(500).optional(),
}).refine((v) => v.billId || v.supplierId, {
  message: 'errors.bill_or_supplier_required',
  path: ['billId'],
});
export type RecordPurchasePaymentInput = z.infer<typeof RecordPurchasePaymentInput>;

export const CancelPurchaseBillInput = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type CancelPurchaseBillInput = z.infer<typeof CancelPurchaseBillInput>;
