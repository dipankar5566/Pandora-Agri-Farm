import { z } from 'zod';
import { Bcs, DateOnly, Ulid, WeightKg, AnimalSex } from './herd';

export const RecordHeatInput = z.object({
  doeId: Ulid,
  detectedOn: DateOnly,
  signs: z.string().max(300).optional(),
  notes: z.string().max(500).optional(),
});
export type RecordHeatInput = z.infer<typeof RecordHeatInput>;

export const RecordServiceInput = z.object({
  doeId: Ulid,
  serviceType: z.enum(['natural', 'ai']),
  buckId: Ulid.optional(),
  semenBatch: z.string().trim().max(80).optional(),
  semenSource: z.string().trim().max(120).optional(),
  technician: z.string().trim().max(120).optional(),
  serviceDate: DateOnly,
  heatRecordId: Ulid.optional(),
  notes: z.string().max(500).optional(),
  // Soft-rule override (underage/underweight doe, inbreeding): must carry a reason.
  confirmOverride: z.boolean().default(false),
  overrideReason: z.string().trim().min(5).max(300).optional(),
}).superRefine((v, ctx) => {
  if (v.serviceType === 'natural' && !v.buckId) {
    ctx.addIssue({ code: 'custom', message: 'errors.buck_required', path: ['buckId'] });
  }
  if (v.serviceType === 'ai' && !v.semenBatch) {
    ctx.addIssue({ code: 'custom', message: 'errors.semen_batch_required', path: ['semenBatch'] });
  }
  if (v.confirmOverride && !v.overrideReason) {
    ctx.addIssue({ code: 'custom', message: 'errors.override_reason_required', path: ['overrideReason'] });
  }
});
export type RecordServiceInput = z.infer<typeof RecordServiceInput>;

export const RecordDiagnosisInput = z.object({
  diagnosedOn: DateOnly,
  method: z.enum(['ultrasound', 'palpation', 'non_return', 'ballottement', 'other']),
  result: z.enum(['pregnant', 'open', 'inconclusive']),
  notes: z.string().max(500).optional(),
});
export type RecordDiagnosisInput = z.infer<typeof RecordDiagnosisInput>;

export const RecordKiddingInput = z.object({
  kiddingDate: DateOnly,
  assisted: z.boolean().default(false),
  complication: z.enum(['none', 'dystocia', 'retained_placenta', 'prolapse', 'other']).default('none'),
  complicationNotes: z.string().max(500).optional(),
  totalBorn: z.number().int().min(1).max(6),
  bornAlive: z.number().int().min(0).max(6),
  colostrumWithin1h: z.boolean().optional(),
  kids: z.array(z.object({
    sex: AnimalSex,
    birthWeightKg: WeightKg.optional(),
    tagNumber: z.string().trim().regex(/^[A-Z]{2,6}-\d{1,6}$/).nullable().optional(),
    name: z.string().trim().max(80).optional(),
  })).max(6),
  confirmOverride: z.boolean().default(false), // premature (< gestation-10d) confirmation
  notes: z.string().max(1000).optional(),
}).superRefine((v, ctx) => {
  if (v.bornAlive > v.totalBorn) {
    ctx.addIssue({ code: 'custom', message: 'errors.born_alive_exceeds_total', path: ['bornAlive'] });
  }
  if (v.kids.length !== v.bornAlive) {
    ctx.addIssue({ code: 'custom', message: 'errors.kids_length_mismatch', path: ['kids'] });
  }
});
export type RecordKiddingInput = z.infer<typeof RecordKiddingInput>;

export const RecordAbortionInput = z.object({
  abortionDate: DateOnly,
  reason: z.string().trim().min(3).max(500),
});
export type RecordAbortionInput = z.infer<typeof RecordAbortionInput>;

export { Bcs };
