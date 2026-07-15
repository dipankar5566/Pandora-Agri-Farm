import { z } from 'zod';
import { DateOnly, Ulid, WeightKg } from './herd';

export const CaseSeverity = z.enum(['mild', 'moderate', 'severe', 'critical']);
export const TreatmentRoute = z.enum(['oral', 'sc', 'im', 'iv', 'topical', 'intranasal', 'other']);

export const OpenCaseInput = z.object({
  animalId: Ulid,
  openedAt: DateOnly.optional(),
  symptoms: z.string().trim().min(3).max(2000),
  provisionalDiagnosis: z.string().max(500).optional(),
  severity: CaseSeverity,
  vetName: z.string().max(120).optional(),
});
export type OpenCaseInput = z.infer<typeof OpenCaseInput>;

export const UpdateCaseInput = z.object({
  symptoms: z.string().trim().min(3).max(2000).optional(),
  provisionalDiagnosis: z.string().max(500).nullable().optional(),
  finalDiagnosis: z.string().max(500).nullable().optional(),
  severity: CaseSeverity.optional(),
  vetName: z.string().max(120).nullable().optional(),
});
export type UpdateCaseInput = z.infer<typeof UpdateCaseInput>;

export const AddVitalInput = z.object({
  recordedAt: DateOnly.optional(),
  temperatureC: z.coerce.number().min(35).max(43).optional(),
  pulseBpm: z.number().int().min(40).max(200).optional(),
  respirationRpm: z.number().int().min(10).max(90).optional(),
  notes: z.string().max(500).optional(),
}).refine((v) => v.temperatureC !== undefined || v.pulseBpm !== undefined || v.respirationRpm !== undefined, {
  message: 'errors.vital_required',
  path: ['temperatureC'],
});
export type AddVitalInput = z.infer<typeof AddVitalInput>;

export const IsolateInput = z.object({ penId: Ulid });
export type IsolateInput = z.infer<typeof IsolateInput>;

export const CloseCaseInput = z.object({
  status: z.enum(['recovered', 'referred', 'died']),
  outcomeNotes: z.string().max(1000).optional(),
  // Required when status = died — the exit happens in the same operation.
  exit: z.object({
    exitDate: DateOnly,
    causeCategory: z.enum(['disease', 'accident', 'predator', 'poisoning', 'birth_complication', 'unknown']),
    causeDetail: z.string().max(1000).optional(),
    postMortemDone: z.boolean().optional(),
  }).optional(),
}).refine((v) => v.status !== 'died' || v.exit, {
  message: 'errors.exit_required_on_death',
  path: ['exit'],
});
export type CloseCaseInput = z.infer<typeof CloseCaseInput>;

export const RecordTreatmentInput = z.object({
  animalId: Ulid,
  caseId: Ulid.optional(),
  treatedAt: DateOnly.optional(),
  itemId: Ulid,
  batchId: Ulid.optional(), // FEFO-picked when omitted
  doseAmount: z.coerce.number().positive().max(10000),
  doseUnit: z.string().trim().min(1).max(20),
  route: TreatmentRoute,
  weightAtTreatmentKg: WeightKg.optional(),
  prescribedBy: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});
export type RecordTreatmentInput = z.infer<typeof RecordTreatmentInput>;

export const AdministerProtocolInput = z.object({
  protocolId: Ulid,
  givenOn: DateOnly,
  itemId: Ulid.optional(),
  batchId: Ulid.optional(),
  vetName: z.string().max(120).optional(),
  entries: z.array(z.object({
    animalId: Ulid,
    doseOverride: z.coerce.number().positive().optional(),
  })).min(1).max(500),
  confirmOverride: z.boolean().default(false), // anthelmintic same-class rotation nudge
  notes: z.string().max(500).optional(),
});
export type AdministerProtocolInput = z.infer<typeof AdministerProtocolInput>;

export const UpsertProtocolInput = z.object({
  type: z.enum(['vaccination', 'deworming', 'dipping', 'other']),
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().max(120).optional(),
  defaultItemId: Ulid.nullable().optional(),
  firstDoseAgeDays: z.number().int().min(1).max(3650).nullable().optional(),
  boosterAfterDays: z.number().int().min(1).max(365).nullable().optional(),
  repeatIntervalDays: z.number().int().min(1).max(3650).nullable().optional(),
  dosePerKg: z.coerce.number().positive().nullable().optional(),
  doseFixed: z.coerce.number().positive().nullable().optional(),
  doseUnit: z.string().max(20).nullable().optional(),
  appliesTo: z.enum(['all', 'female', 'male', 'kid', 'adult', 'pregnant']).default('all'),
  isActive: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});
export type UpsertProtocolInput = z.infer<typeof UpsertProtocolInput>;
