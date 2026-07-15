import { z } from 'zod';
import { DateOnly, Ulid } from './herd';

export const CreatePlotInput = z.object({
  name: z.string().trim().min(2).max(80),
  block: z.string().trim().max(20).optional(), // A / B per the land map
  areaDecimal: z.coerce.number().positive().max(100000).optional(),
  notes: z.string().max(500).optional(),
});
export type CreatePlotInput = z.infer<typeof CreatePlotInput>;
export const UpdatePlotInput = CreatePlotInput.partial();
export type UpdatePlotInput = z.infer<typeof UpdatePlotInput>;

export const SowCropInput = z.object({
  plotId: Ulid,
  cropName: z.string().trim().min(2).max(80),
  variety: z.string().trim().max(80).optional(),
  sownOn: DateOnly,
  expectedHarvestOn: DateOnly.optional(),
  costTotal: z.coerce.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
});
export type SowCropInput = z.infer<typeof SowCropInput>;

export const CloseCropInput = z.object({
  status: z.enum(['harvested', 'failed']),
  closedOn: DateOnly,
  failReason: z.string().trim().max(300).optional(),
  costTotal: z.coerce.number().min(0).optional(),
}).refine((v) => v.status !== 'failed' || v.failReason, {
  message: 'errors.fail_reason_required',
  path: ['failReason'],
});
export type CloseCropInput = z.infer<typeof CloseCropInput>;

export const RecordHarvestInput = z.object({
  harvestedOn: DateOnly,
  form: z.enum(['green', 'hay', 'silage']),
  qtyKg: z.coerce.number().positive().max(1000000),
  dryMatterPct: z.coerce.number().positive().max(100).optional(),
  itemId: Ulid, // the feed item the yield lands in
  notes: z.string().max(500).optional(),
});
export type RecordHarvestInput = z.infer<typeof RecordHarvestInput>;
