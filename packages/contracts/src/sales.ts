import { z } from 'zod';
import { DateOnly, Ulid } from './herd';

export const CustomerType = z.enum(['individual', 'trader', 'butcher', 'institution', 'other']);

export const CreateCustomerInput = z.object({
  name: z.string().trim().min(2).max(200),
  nameBn: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().max(500).optional(),
  gstin: z.string().trim().regex(/^[0-9A-Z]{15}$/).optional(),
  customerType: CustomerType.default('individual'),
  notes: z.string().max(1000).optional(),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerInput>;
export const UpdateCustomerInput = CreateCustomerInput.partial();
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerInput>;

const InvoiceLine = z.object({
  lineType: z.enum(['animal', 'manure', 'vermicompost', 'feed', 'other']),
  animalId: Ulid.optional(),
  description: z.string().trim().max(200).optional(), // auto-filled for animal lines
  hsnCode: z.string().trim().max(10).optional(),
  qty: z.coerce.number().positive().max(100000).default(1),
  unit: z.string().trim().max(15).default('piece'),
  unitPrice: z.coerce.number().min(0).max(10000000),
  gstRatePct: z.coerce.number().min(0).max(28).default(0),
}).superRefine((v, ctx) => {
  if (v.lineType === 'animal' && !v.animalId) {
    ctx.addIssue({ code: 'custom', message: 'errors.animal_required', path: ['animalId'] });
  }
  if (v.lineType !== 'animal' && !v.description) {
    ctx.addIssue({ code: 'custom', message: 'errors.description_required', path: ['description'] });
  }
});

export const CreateInvoiceInput = z.object({
  customerId: Ulid.optional(),
  buyerName: z.string().trim().max(200).optional(), // walk-in
  invoiceDate: DateOnly,
  lines: z.array(InvoiceLine).min(1).max(50),
  notes: z.string().max(1000).optional(),
  // convenience: record a payment at the same time (farm-gate cash sale)
  paidNow: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'bank', 'upi', 'cheque', 'credit']).default('cash'),
}).refine((v) => v.customerId || v.buyerName, {
  message: 'errors.customer_or_buyer_required',
  path: ['customerId'],
});
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInput>;

export const RecordSalePaymentInput = z.object({
  invoiceId: Ulid.optional(),
  customerId: Ulid.optional(), // on-account payment when no invoice given
  amount: z.coerce.number().positive().max(10000000),
  method: z.enum(['cash', 'bank', 'upi', 'cheque', 'credit']).default('cash'),
  paidOn: DateOnly,
  reference: z.string().trim().max(100).optional(),
  notes: z.string().max(500).optional(),
}).refine((v) => v.invoiceId || v.customerId, {
  message: 'errors.invoice_or_customer_required',
  path: ['invoiceId'],
});
export type RecordSalePaymentInput = z.infer<typeof RecordSalePaymentInput>;

export const CancelInvoiceInput = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type CancelInvoiceInput = z.infer<typeof CancelInvoiceInput>;
