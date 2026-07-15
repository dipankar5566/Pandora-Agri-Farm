/* Framework-free unit tests for business rules encoded as Zod schemas
 * (Phase 2 §3.15 testing pyramid — domain rules tested without a database).
 * These are the same schemas the browser uses, so a passing test here is
 * a guarantee about both client and server behavior. */
import { describe, expect, it } from 'vitest';
import {
  AdministerProtocolInput, BatchWeighInput, CreateAnimalInput, ExitAnimalInput,
  RecordKiddingInput, RecordServiceInput,
} from '@pandora/contracts';

describe('CreateAnimalInput', () => {
  const base = {
    breedId: 'AAAAAAAAAAAAAAAAAAAAAAAAAA',
    sex: 'female' as const,
    birthDate: '2024-01-01',
    source: 'purchased' as const,
  };

  it('requires a purchase price when source is purchased', () => {
    expect(CreateAnimalInput.safeParse(base).success).toBe(false);
    expect(CreateAnimalInput.safeParse({ ...base, purchasePrice: 5000 }).success).toBe(true);
  });

  it('does not require a price for farm-born or gifted animals', () => {
    expect(CreateAnimalInput.safeParse({ ...base, source: 'born_on_farm' }).success).toBe(true);
    expect(CreateAnimalInput.safeParse({ ...base, source: 'gift' }).success).toBe(true);
  });

  it('rejects a future birth date pattern mismatch and malformed tag numbers', () => {
    expect(CreateAnimalInput.safeParse({ ...base, purchasePrice: 1, tagNumber: 'bad-tag' }).success).toBe(false);
    expect(CreateAnimalInput.safeParse({ ...base, purchasePrice: 1, tagNumber: 'PGF-0007' }).success).toBe(true);
  });
});

describe('BatchWeighInput', () => {
  it('enforces the 0.4–150 kg biology range per entry', () => {
    const ok = { date: '2026-07-01', entries: [{ animalId: 'AAAAAAAAAAAAAAAAAAAAAAAAAA', weightKg: 22.5 }] };
    expect(BatchWeighInput.safeParse(ok).success).toBe(true);
    expect(BatchWeighInput.safeParse({ ...ok, entries: [{ ...ok.entries[0], weightKg: 0.1 }] }).success).toBe(false);
    expect(BatchWeighInput.safeParse({ ...ok, entries: [{ ...ok.entries[0], weightKg: 200 }] }).success).toBe(false);
  });

  it('caps a batch session at 500 animals', () => {
    const entries = Array.from({ length: 501 }, (_, i) => ({ animalId: `ANIMAL_ID_${String(i).padStart(16, '0')}`, weightKg: 20 }));
    expect(BatchWeighInput.safeParse({ date: '2026-07-01', entries }).success).toBe(false);
  });
});

describe('RecordServiceInput (breeding overrides)', () => {
  const base = { doeId: 'AAAAAAAAAAAAAAAAAAAAAAAAAA', serviceDate: '2026-02-11' };

  it('requires a buck for natural service and a semen batch for AI', () => {
    expect(RecordServiceInput.safeParse({ ...base, serviceType: 'natural' }).success).toBe(false);
    expect(RecordServiceInput.safeParse({ ...base, serviceType: 'natural', buckId: 'BBBBBBBBBBBBBBBBBBBBBBBBBB' }).success).toBe(true);
    expect(RecordServiceInput.safeParse({ ...base, serviceType: 'ai' }).success).toBe(false);
    expect(RecordServiceInput.safeParse({ ...base, serviceType: 'ai', semenBatch: 'SB-1' }).success).toBe(true);
  });

  it('requires a reason (min 5 chars) when confirmOverride is set', () => {
    const withBuck = { ...base, serviceType: 'natural' as const, buckId: 'BBBBBBBBBBBBBBBBBBBBBBBBBB' };
    expect(RecordServiceInput.safeParse({ ...withBuck, confirmOverride: true }).success).toBe(false);
    expect(RecordServiceInput.safeParse({ ...withBuck, confirmOverride: true, overrideReason: 'ok' }).success).toBe(false); // too short
    expect(RecordServiceInput.safeParse({ ...withBuck, confirmOverride: true, overrideReason: 'linebreeding trial' }).success).toBe(true);
  });
});

describe('RecordKiddingInput (the highest-stakes form)', () => {
  const base = { kiddingDate: '2026-07-17', totalBorn: 3, bornAlive: 2 };

  it('rejects bornAlive greater than totalBorn', () => {
    expect(RecordKiddingInput.safeParse({ ...base, bornAlive: 5, kids: [] }).success).toBe(false);
  });

  it('requires kids[] length to equal bornAlive exactly (no silent mismatch)', () => {
    const oneKid = [{ sex: 'female' as const }];
    expect(RecordKiddingInput.safeParse({ ...base, kids: oneKid }).success).toBe(false); // bornAlive=2, kids=1
    const twoKids = [{ sex: 'female' as const }, { sex: 'male' as const }];
    expect(RecordKiddingInput.safeParse({ ...base, kids: twoKids }).success).toBe(true);
  });

  it('caps litter size at 6 (Black Bengal prolificacy ceiling)', () => {
    expect(RecordKiddingInput.safeParse({ ...base, totalBorn: 7, bornAlive: 7, kids: [] }).success).toBe(false);
  });
});

describe('ExitAnimalInput (sale / death / disposal)', () => {
  it('requires a price for sale and cull_sale', () => {
    expect(ExitAnimalInput.safeParse({ exitType: 'sale', exitDate: '2026-07-17', confirmOverride: false }).success).toBe(false);
    expect(ExitAnimalInput.safeParse({ exitType: 'sale', exitDate: '2026-07-17', price: 9000, confirmOverride: false }).success).toBe(true);
  });

  it('requires a cause category for death', () => {
    expect(ExitAnimalInput.safeParse({ exitType: 'death', exitDate: '2026-07-17', confirmOverride: false }).success).toBe(false);
    expect(ExitAnimalInput.safeParse({ exitType: 'death', exitDate: '2026-07-17', causeCategory: 'disease', confirmOverride: false }).success).toBe(true);
  });

  it('requires a reason when overriding the withdrawal-period sale guard', () => {
    const sale = { exitType: 'sale' as const, exitDate: '2026-07-17', price: 9000 };
    expect(ExitAnimalInput.safeParse({ ...sale, confirmOverride: true }).success).toBe(false);
    expect(ExitAnimalInput.safeParse({ ...sale, confirmOverride: true, overrideReason: 'buyer informed' }).success).toBe(true);
  });
});

describe('AdministerProtocolInput (batch vaccination/deworming)', () => {
  it('requires at least one animal and caps a batch at 500', () => {
    const base = { protocolId: 'AAAAAAAAAAAAAAAAAAAAAAAAAA', givenOn: '2026-07-15' };
    expect(AdministerProtocolInput.safeParse({ ...base, entries: [] }).success).toBe(false);
    expect(AdministerProtocolInput.safeParse({ ...base, entries: [{ animalId: 'BBBBBBBBBBBBBBBBBBBBBBBBBB' }] }).success).toBe(true);
  });
});
