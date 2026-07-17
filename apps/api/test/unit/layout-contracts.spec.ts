/* Site-layout input rules (docs/layout/01 §6) — DB-free Zod tests. */
import { describe, expect, it } from 'vitest';
import { CreateFeatureInput, SetAnchorsInput, UpdateFeatureInput } from '@pandora/contracts';

const ULID = 'AAAAAAAAAAAAAAAAAAAAAAAAAA';
const square = [[0, 0], [100, 0], [100, 100], [0, 100]];

describe('CreateFeatureInput', () => {
  const base = { kind: 'plot' as const, name: 'Plot A-1', geometry: square };

  it('enforces per-kind vertex minimums', () => {
    expect(CreateFeatureInput.safeParse(base).success).toBe(true);
    expect(CreateFeatureInput.safeParse({ ...base, geometry: square.slice(0, 2) }).success).toBe(false);
    expect(CreateFeatureInput.safeParse({ kind: 'line', name: 'Fence', geometry: square.slice(0, 2) }).success).toBe(true);
    expect(CreateFeatureInput.safeParse({ kind: 'line', name: 'Fence', geometry: square.slice(0, 1) }).success).toBe(false);
    expect(CreateFeatureInput.safeParse({ kind: 'point', name: 'Tube well', geometry: [[5, 5]] }).success).toBe(true);
  });

  it('a point is exactly one vertex', () => {
    expect(CreateFeatureInput.safeParse({ kind: 'point', name: 'Gate', geometry: [[1, 1], [2, 2]] }).success).toBe(false);
  });

  it('rejects self-intersecting polygons', () => {
    const bowtie = [[0, 0], [10, 10], [10, 0], [0, 10]];
    expect(CreateFeatureInput.safeParse({ ...base, geometry: bowtie }).success).toBe(false);
    expect(CreateFeatureInput.safeParse({ kind: 'line', name: 'Pipe', geometry: bowtie }).success).toBe(true); // lines may cross themselves
  });

  it('refType and refId come together or not at all', () => {
    expect(CreateFeatureInput.safeParse({ ...base, refType: 'fodder_plot' }).success).toBe(false);
    expect(CreateFeatureInput.safeParse({ ...base, refId: ULID }).success).toBe(false);
    expect(CreateFeatureInput.safeParse({ ...base, refType: 'fodder_plot', refId: ULID }).success).toBe(true);
  });

  it('rejects out-of-band coordinates', () => {
    expect(CreateFeatureInput.safeParse({ ...base, geometry: [[-5, 0], [100, 0], [100, 100]] }).success).toBe(false);
    expect(CreateFeatureInput.safeParse({ ...base, geometry: [[0, 0], [30000, 0], [100, 100]] }).success).toBe(false);
  });
});

describe('UpdateFeatureInput', () => {
  it('unlinks with refType and refId both null — never one-sided', () => {
    expect(UpdateFeatureInput.safeParse({ refType: null, refId: null }).success).toBe(true);
    expect(UpdateFeatureInput.safeParse({ refType: null }).success).toBe(false);
    expect(UpdateFeatureInput.safeParse({ refId: null }).success).toBe(false);
    expect(UpdateFeatureInput.safeParse({ refType: 'shed', refId: ULID }).success).toBe(true);
    expect(UpdateFeatureInput.safeParse({ refType: 'shed' }).success).toBe(false);
  });

  it('re-checks geometry rules when kind and geometry arrive together', () => {
    expect(UpdateFeatureInput.safeParse({ kind: 'plot', geometry: [[0, 0], [1, 1]] }).success).toBe(false);
    expect(UpdateFeatureInput.safeParse({ geometry: [[0, 0], [1, 1]] }).success).toBe(true); // kind unknown here — service re-checks against the stored row
  });
});

describe('SetAnchorsInput', () => {
  const a = (x: number, y: number, lat = 23.9, lng = 87.54) => ({ x, y, lat, lng });

  it('needs at least 2 anchors', () => {
    expect(SetAnchorsInput.safeParse({ anchors: [a(0, 0)] }).success).toBe(false);
    expect(SetAnchorsInput.safeParse({ anchors: [a(0, 0), a(400, 300)] }).success).toBe(true);
  });

  it('catches swapped lat/lng via the Birbhum sanity band', () => {
    expect(SetAnchorsInput.safeParse({ anchors: [a(0, 0, 87.54, 23.9), a(400, 300)] }).success).toBe(false);
  });

  it('rejects coincident plan points (no transform exists)', () => {
    expect(SetAnchorsInput.safeParse({ anchors: [a(10, 10), a(10, 10, 23.91)] }).success).toBe(false);
  });
});
