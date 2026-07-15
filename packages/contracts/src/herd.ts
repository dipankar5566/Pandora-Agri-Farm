import { z } from 'zod';

export const Ulid = z.string().length(26);
export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'errors.date_invalid');
export const WeightKg = z.coerce.number().min(0.4).max(150);
export const Bcs = z.coerce.number().min(1).max(5).multipleOf(0.5);

export const AnimalSex = z.enum(['female', 'male', 'wether']);
export const AnimalSource = z.enum(['born_on_farm', 'purchased', 'gift', 'exchange', 'other']);
export const AnimalStatus = z.enum(['active', 'sold', 'died', 'disposed', 'culled', 'lost']);
export const ExitType = z.enum(['sale', 'death', 'disposal', 'cull_sale', 'lost']);
export const PenPurpose = z.enum(['general', 'kidding', 'buck', 'kid', 'isolation', 'hospital', 'quarantine', 'fattening']);
export const MoveReason = z.enum(['routine', 'isolation', 'kidding', 'weaning', 'sale_prep', 'treatment', 'other']);

export const CreateAnimalInput = z.object({
  tagNumber: z.string().trim().regex(/^[A-Z]{2,6}-\d{1,6}$/).optional(), // omitted → auto
  rfidTag: z.string().trim().max(64).optional(),
  name: z.string().trim().max(80).optional(),
  breedId: Ulid,
  crossPercent: z.number().int().min(1).max(99).optional(),
  sex: AnimalSex,
  birthDate: DateOnly,
  birthDateEstimated: z.boolean().default(false),
  damId: Ulid.optional(),
  sireId: Ulid.optional(),
  source: AnimalSource,
  purchasePrice: z.coerce.number().min(0).optional(),
  purchaseDate: DateOnly.optional(),
  supplierName: z.string().trim().max(200).optional(),
  currentPenId: Ulid.optional(),
  groupLabel: z.string().trim().max(60).optional(),
  colorMarkings: z.string().trim().max(200).optional(),
  weightKg: WeightKg.optional(), // initial weight → first weight_record
  bcs: Bcs.optional(),
  notes: z.string().max(2000).optional(),
}).refine((v) => v.source !== 'purchased' || v.purchasePrice !== undefined, {
  message: 'errors.purchase_price_required', path: ['purchasePrice'],
});
export type CreateAnimalInput = z.infer<typeof CreateAnimalInput>;

export const UpdateAnimalInput = z.object({
  rfidTag: z.string().trim().max(64).nullable().optional(),
  name: z.string().trim().max(80).nullable().optional(),
  breedId: Ulid.optional(),
  crossPercent: z.number().int().min(1).max(99).nullable().optional(),
  birthDate: DateOnly.optional(),
  birthDateEstimated: z.boolean().optional(),
  damId: Ulid.nullable().optional(),
  sireId: Ulid.nullable().optional(),
  groupLabel: z.string().trim().max(60).nullable().optional(),
  colorMarkings: z.string().trim().max(200).nullable().optional(),
  insurance: z.object({
    policyNo: z.string().max(60),
    insurer: z.string().max(120),
    sumInsured: z.number().min(0),
    validTill: DateOnly,
  }).nullable().optional(),
  medicalNotes: z.string().max(4000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateAnimalInput = z.infer<typeof UpdateAnimalInput>;

export const BulkIntakeInput = z.object({
  defaults: z.object({
    breedId: Ulid,
    source: AnimalSource.default('purchased'),
    currentPenId: Ulid.optional(),
    purchaseDate: DateOnly.optional(),
  }),
  rows: z.array(z.object({
    tagNumber: z.string().trim().regex(/^[A-Z]{2,6}-\d{1,6}$/).optional(),
    sex: AnimalSex,
    ageMonths: z.number().int().min(0).max(180).optional(),
    birthDate: DateOnly.optional(),
    weightKg: WeightKg.optional(),
    purchasePrice: z.coerce.number().min(0).optional(),
    name: z.string().trim().max(80).optional(),
  }).refine((r) => r.ageMonths !== undefined || r.birthDate !== undefined, {
    message: 'errors.age_or_birthdate_required', path: ['ageMonths'],
  })).min(1).max(200),
});
export type BulkIntakeInput = z.infer<typeof BulkIntakeInput>;

export const MoveAnimalInput = z.object({
  toPenId: Ulid,
  reason: MoveReason.default('routine'),
  movedAt: DateOnly.optional(), // defaults to today
  notes: z.string().max(500).optional(),
});
export type MoveAnimalInput = z.infer<typeof MoveAnimalInput>;

export const ExitAnimalInput = z.object({
  exitType: ExitType,
  exitDate: DateOnly,
  buyerName: z.string().trim().max(200).optional(),
  liveWeightKg: WeightKg.optional(),
  price: z.coerce.number().min(0).optional(),
  causeCategory: z.enum(['disease', 'accident', 'predator', 'poisoning', 'birth_complication', 'unknown']).optional(),
  causeDetail: z.string().max(1000).optional(),
  postMortemDone: z.boolean().optional(),
  disposalMethod: z.enum(['burial', 'rendering', 'other']).optional(),
  notes: z.string().max(1000).optional(),
}).superRefine((v, ctx) => {
  if ((v.exitType === 'sale' || v.exitType === 'cull_sale') && v.price === undefined) {
    ctx.addIssue({ code: 'custom', message: 'errors.sale_price_required', path: ['price'] });
  }
  if (v.exitType === 'death' && !v.causeCategory) {
    ctx.addIssue({ code: 'custom', message: 'errors.death_cause_required', path: ['causeCategory'] });
  }
});
export type ExitAnimalInput = z.infer<typeof ExitAnimalInput>;

export const BatchWeighInput = z.object({
  date: DateOnly,
  confirmAnomalies: z.boolean().default(false), // >15% jump vs last weight needs confirmation
  entries: z.array(z.object({
    animalId: Ulid,
    weightKg: WeightKg,
    bcs: Bcs.optional(),
  })).min(1).max(500),
});
export type BatchWeighInput = z.infer<typeof BatchWeighInput>;

export const CreatePenInput = z.object({
  shedId: Ulid,
  name: z.string().trim().min(1).max(60),
  purpose: PenPurpose.default('general'),
  capacity: z.number().int().min(1).max(500).optional(),
});
export const CreateShedInput = z.object({
  name: z.string().trim().min(1).max(60),
  nameBn: z.string().trim().max(60).optional(),
});

export const ListAnimalsQuery = z.object({
  q: z.string().trim().max(60).optional(),
  status: AnimalStatus.optional(),
  breedId: Ulid.optional(),
  penId: Ulid.optional(),
  sex: AnimalSex.optional(),
  cursor: Ulid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListAnimalsQuery = z.infer<typeof ListAnimalsQuery>;
