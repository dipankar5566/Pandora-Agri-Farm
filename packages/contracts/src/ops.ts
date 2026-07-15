import { z } from 'zod';
import { DateOnly, Ulid } from './herd';

// ── feed ─────────────────────────────────────────────────────────────
export const SaveFeedDayInput = z.object({
  date: DateOnly,
  rows: z.array(z.object({
    penId: Ulid,
    itemId: Ulid,
    qty: z.coerce.number().positive().max(10000),
    wastageQty: z.coerce.number().min(0).default(0),
  })).min(1).max(100),
});
export type SaveFeedDayInput = z.infer<typeof SaveFeedDayInput>;

// ── finance ──────────────────────────────────────────────────────────
export const CreateLedgerEntryInput = z.object({
  entryDate: DateOnly,
  kind: z.enum(['income', 'expense']),
  categoryId: Ulid,
  amount: z.coerce.number().positive().max(100000000),
  paymentMethod: z.enum(['cash', 'bank', 'upi', 'cheque', 'credit']).default('cash'),
  counterpartyName: z.string().trim().max(200).optional(),
  animalId: Ulid.optional(),
  description: z.string().max(500).optional(),
});
export type CreateLedgerEntryInput = z.infer<typeof CreateLedgerEntryInput>;

export const UpdateLedgerEntryInput = CreateLedgerEntryInput.partial();
export type UpdateLedgerEntryInput = z.infer<typeof UpdateLedgerEntryInput>;

// ── tasks ────────────────────────────────────────────────────────────
export const CreateTaskInput = z.object({
  title: z.string().trim().min(2).max(200),
  taskType: z.enum(['feeding', 'cleaning', 'inspection', 'maintenance', 'custom']).default('custom'),
  dueOn: DateOnly,
  animalId: Ulid.optional(),
  penId: Ulid.optional(),
  assignedTo: Ulid.optional(),
  recurrence: z.enum(['daily', 'weekly']).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const CompleteTaskInput = z.object({ notes: z.string().max(300).optional() });
export const SkipTaskInput = z.object({ reason: z.string().trim().min(3).max(300) });
