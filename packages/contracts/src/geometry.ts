// Pure geometry for the site layout: plan-pixel shapes + GPS anchors →
// metres, areas, lat/lng. Shared by browser (live readouts) and API
// (panels, export labels) so the numbers can never disagree.
// Design: docs/layout/02-Geo-Referencing-and-Measurement.md

export type PointPx = [number, number];
export interface Anchor { x: number; y: number; lat: number; lng: number; label?: string }
/** Similarity transform: plan px (y-down) → local metres (y-north), then + origin. */
export interface PlanTransform {
  s: number;      // metres per pixel
  theta: number;  // rotation, radians
  tx: number;     // translation, metres east of origin
  ty: number;     // translation, metres north of origin
  lat0: number;   // GPS origin (first anchor)
  lng0: number;
}

const EARTH_M_PER_DEG_LAT = 110574;
const EARTH_M_PER_DEG_LNG_EQ = 111320;

/** Flat-earth local metres relative to (lat0, lng0). Sub-cm at farm scale. */
export function latLngToLocal(lat: number, lng: number, lat0: number, lng0: number): PointPx {
  const east = (lng - lng0) * Math.cos((lat0 * Math.PI) / 180) * EARTH_M_PER_DEG_LNG_EQ;
  const north = (lat - lat0) * EARTH_M_PER_DEG_LAT;
  return [east, north];
}

export function localToLatLng(east: number, north: number, lat0: number, lng0: number): { lat: number; lng: number } {
  return {
    lat: lat0 + north / EARTH_M_PER_DEG_LAT,
    lng: lng0 + east / (Math.cos((lat0 * Math.PI) / 180) * EARTH_M_PER_DEG_LNG_EQ),
  };
}

/**
 * Least-squares similarity fit (Umeyama, reflection disallowed) from plan
 * points to local metres. Plan y grows downward, north grows upward, so plan
 * points enter as (x, −y) — without this flip the best fit is a mirror image.
 * Exact for 2 anchors; least-squares for more. Null below 2 anchors or when
 * anchors are coincident.
 */
export function solveTransform(anchors: Anchor[]): PlanTransform | null {
  if (anchors.length < 2) return null;
  const lat0 = anchors[0].lat;
  const lng0 = anchors[0].lng;
  const src = anchors.map((a) => [a.x, -a.y] as PointPx);
  const dst = anchors.map((a) => latLngToLocal(a.lat, a.lng, lat0, lng0));

  const n = anchors.length;
  const mean = (pts: PointPx[]) =>
    [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n] as PointPx;
  const [sx, sy] = mean(src);
  const [dx, dy] = mean(dst);

  let a = 0; let b = 0; let srcVar = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i][0] - sx; const py = src[i][1] - sy;
    const qx = dst[i][0] - dx; const qy = dst[i][1] - dy;
    a += px * qx + py * qy;   // Σ p·q   (cos component)
    b += px * qy - py * qx;   // Σ p×q   (sin component)
    srcVar += px * px + py * py;
  }
  if (srcVar === 0) return null; // coincident plan points
  const theta = Math.atan2(b, a);
  const s = Math.hypot(a, b) / srcVar;
  if (!Number.isFinite(s) || s <= 0) return null;
  const cos = Math.cos(theta); const sin = Math.sin(theta);
  const tx = dx - s * (cos * sx - sin * sy);
  const ty = dy - s * (sin * sx + cos * sy);
  return { s, theta, tx, ty, lat0, lng0 };
}

function planToLocal([x, y]: PointPx, t: PlanTransform): PointPx {
  const px = x; const py = -y; // the y-flip, once
  const cos = Math.cos(t.theta); const sin = Math.sin(t.theta);
  return [t.s * (cos * px - sin * py) + t.tx, t.s * (sin * px + cos * py) + t.ty];
}

export function planToLatLng(pt: PointPx, t: PlanTransform): { lat: number; lng: number } {
  const [east, north] = planToLocal(pt, t);
  return localToLatLng(east, north, t.lat0, t.lng0);
}

export function latLngToPlan(lat: number, lng: number, t: PlanTransform): PointPx {
  const [east, north] = latLngToLocal(lat, lng, t.lat0, t.lng0);
  const cos = Math.cos(t.theta); const sin = Math.sin(t.theta);
  const px = (cos * (east - t.tx) + sin * (north - t.ty)) / t.s;
  const py = (-sin * (east - t.tx) + cos * (north - t.ty)) / t.s;
  return [px, -py];
}

/** Per-anchor fit error in metres; [0, 0] by construction for 2 anchors. */
export function anchorResiduals(anchors: Anchor[]): number[] | null {
  const t = solveTransform(anchors);
  if (!t) return null;
  return anchors.map((a) => {
    const [e, nrt] = planToLocal([a.x, a.y], t);
    const [ge, gn] = latLngToLocal(a.lat, a.lng, t.lat0, t.lng0);
    return Math.hypot(e - ge, nrt - gn);
  });
}

/** Shoelace × s². Rotation/translation preserve area, so no vertex transform. */
export function polygonAreaM2(pts: PointPx[], metersPerPx: number): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2) * metersPerPx * metersPerPx;
}

export function polylineLengthM(pts: PointPx[], metersPerPx: number): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return len * metersPerPx;
}

function segmentsIntersect(p1: PointPx, p2: PointPx, p3: PointPx, p4: PointPx): boolean {
  const d = (a: PointPx, b: PointPx, c: PointPx) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1); const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3); const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when any two non-adjacent edges of the closed polygon cross. */
export function isSelfIntersecting(pts: PointPx[]): boolean {
  const n = pts.length;
  if (n < 4) return false; // a triangle cannot self-intersect
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const nextI = (i + 1) % n;
      const nextJ = (j + 1) % n;
      if (i === j || nextI === j || nextJ === i) continue; // adjacent edges share a vertex
      if (segmentsIntersect(pts[i], pts[nextI], pts[j], pts[nextJ])) return true;
    }
  }
  return false;
}

// ── units (exact constants; WB standard katha = 720 sq ft) ──────────────
export const M2_PER_SQFT = 0.09290304;
export const M2_PER_DECIMAL = 435.6 * M2_PER_SQFT;   // 40.46856…
export const M2_PER_KATHA = 720 * M2_PER_SQFT;       // 66.89018…
export const M2_PER_BIGHA = 20 * M2_PER_KATHA;       // 1337.80377…
export const M2_PER_ACRE = 100 * M2_PER_DECIMAL;

export interface DisplayArea {
  m2: number;
  sqft: number;
  decimal: number;
  bigha: number;   // whole bighas
  katha: number;   // remaining katha, 1 dp
}

export function toDisplayArea(m2: number): DisplayArea {
  const totalKatha = m2 / M2_PER_KATHA;
  let bigha = Math.floor(totalKatha / 20);
  let katha = Math.round((totalKatha - bigha * 20) * 10) / 10;
  if (katha >= 20) { bigha += 1; katha = 0; } // 19.99 katha must not display as "0 bigha 20 katha"
  return {
    m2: Math.round(m2 * 10) / 10,
    sqft: Math.round(m2 / M2_PER_SQFT),
    decimal: Math.round((m2 / M2_PER_DECIMAL) * 10) / 10,
    bigha,
    katha,
  };
}
