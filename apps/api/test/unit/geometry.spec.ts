/* Geometry math for the site layout (docs/layout/02) — DB-free. The same
 * functions run in browser and API, so a passing test here pins both. */
import { describe, expect, it } from 'vitest';
import {
  anchorResiduals, isSelfIntersecting, latLngToPlan, M2_PER_ACRE, M2_PER_BIGHA,
  M2_PER_DECIMAL, M2_PER_KATHA, M2_PER_SQFT, planToLatLng, polygonAreaM2,
  polylineLengthM, solveTransform, toDisplayArea, type Anchor,
} from '@pandora/contracts';

const LAT0 = 23.9; const LNG0 = 87.54; // Birbhum-ish
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = Math.cos((LAT0 * Math.PI) / 180) * 111320;

/** GPS point at (east, north) metres from origin — flat-earth, farm scale. */
const gps = (east: number, north: number) => ({
  lat: LAT0 + north / M_PER_DEG_LAT,
  lng: LNG0 + east / M_PER_DEG_LNG,
});

/** Synthetic truth: 1 px = 0.5 m, plan axis-aligned with north (no rotation). */
const anchor = (x: number, y: number): Anchor => ({ x, y, ...gps(x * 0.5, -y * 0.5) });

describe('solveTransform', () => {
  it('is exact for 2 anchors and recovers the synthetic scale', () => {
    const t = solveTransform([anchor(0, 0), anchor(400, 0)])!;
    expect(t.s).toBeCloseTo(0.5, 6);
    expect(Math.abs(t.theta)).toBeLessThan(1e-9);
  });

  it('returns null below 2 anchors or for coincident plan points', () => {
    expect(solveTransform([anchor(0, 0)])).toBeNull();
    expect(solveTransform([anchor(10, 10), { ...anchor(10, 10), lat: LAT0 + 0.001 }])).toBeNull();
  });

  it('keeps north up: larger plan y (down on the image) means smaller latitude', () => {
    const t = solveTransform([anchor(0, 0), anchor(400, 0)])!;
    const south = planToLatLng([0, 100], t);
    expect(south.lat).toBeLessThan(LAT0); // without the y-flip this mirrors
    const east = planToLatLng([100, 0], t);
    expect(east.lng).toBeGreaterThan(LNG0);
  });

  it('round-trips plan → lat/lng → plan to sub-pixel accuracy', () => {
    const t = solveTransform([anchor(0, 0), anchor(400, 300)])!;
    for (const pt of [[12, 34], [399, 1], [200, 250]] as const) {
      const back = latLngToPlan(planToLatLng([pt[0], pt[1]], t).lat, planToLatLng([pt[0], pt[1]], t).lng, t);
      expect(back[0]).toBeCloseTo(pt[0], 3);
      expect(back[1]).toBeCloseTo(pt[1], 3);
    }
  });

  it('handles a rotated plan (least-squares over 3 anchors, ~0 residuals)', () => {
    // plan rotated 90°: plan +x points north ⇒ (x, y) → east = 0.5·y? Build via mapping:
    // world east = 0.5·y, north = 0.5·x
    const rot = (x: number, y: number): Anchor => ({ x, y, ...gps(0.5 * y, 0.5 * x) });
    const anchors = [rot(0, 0), rot(300, 0), rot(0, 300)];
    const t = solveTransform(anchors)!;
    expect(t.s).toBeCloseTo(0.5, 6);
    const res = anchorResiduals(anchors)!;
    for (const r of res) expect(r).toBeLessThan(0.01);
  });

  it('surfaces a bad anchor as a large residual', () => {
    const anchors = [anchor(0, 0), anchor(400, 0), anchor(0, 300)];
    anchors[2] = { ...anchors[2], lat: anchors[2].lat + 20 / M_PER_DEG_LAT }; // 20 m off
    const res = anchorResiduals(anchors)!;
    expect(Math.max(...res)).toBeGreaterThan(5);
  });
});

describe('areas & lengths', () => {
  it('measures a 100×100 px square at 0.5 m/px as 2500 m²', () => {
    const square: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];
    expect(polygonAreaM2(square, 0.5)).toBeCloseTo(2500, 6);
  });

  it('measures a 3-4-5 polyline', () => {
    expect(polylineLengthM([[0, 0], [30, 0], [30, 40]], 1)).toBeCloseTo(70, 6);
    expect(polylineLengthM([[0, 0], [30, 40]], 0.5)).toBeCloseTo(25, 6);
  });

  it('rejects self-intersecting outlines (shoelace would mis-measure them)', () => {
    const bowtie: Array<[number, number]> = [[0, 0], [10, 10], [10, 0], [0, 10]];
    const square: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(isSelfIntersecting(bowtie)).toBe(true);
    expect(isSelfIntersecting(square)).toBe(false);
    expect(isSelfIntersecting([[0, 0], [10, 0], [5, 8]])).toBe(false); // triangle can't
  });
});

describe('unit constants & display (WB standard: katha = 720 sq ft)', () => {
  it('pins the exact conversion chain', () => {
    expect(M2_PER_SQFT).toBeCloseTo(0.09290304, 10);
    expect(M2_PER_KATHA).toBeCloseTo(720 * M2_PER_SQFT, 10);
    expect(M2_PER_BIGHA).toBeCloseTo(20 * M2_PER_KATHA, 10);
    expect(M2_PER_DECIMAL).toBeCloseTo(435.6 * M2_PER_SQFT, 10);
    expect(M2_PER_ACRE).toBeCloseTo(100 * M2_PER_DECIMAL, 10);
  });

  it('shows the whole farm (~2.7 acres) as ≈ 8 bigha 3.4 katha, 270 decimal', () => {
    const d = toDisplayArea(2.7 * M2_PER_ACRE);
    expect(d.bigha).toBe(8);
    expect(d.katha).toBeCloseTo(3.4, 1);
    expect(d.decimal).toBeCloseTo(270, 0);
  });

  it('never displays “0 bigha 20 katha”', () => {
    const d = toDisplayArea(19.99 * M2_PER_KATHA);
    expect(d.bigha).toBe(1);
    expect(d.katha).toBe(0);
  });
});
