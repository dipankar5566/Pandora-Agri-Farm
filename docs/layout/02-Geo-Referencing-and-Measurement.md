# Section 2 — Geo-Referencing & Measurement

Everything in this section is pure math over Section 1's data: shapes in
plan-pixel space, anchors as `{x, y, lat, lng, label}` pairs. No new tables.

## 1. Where the math lives

One file, `packages/contracts/src/geometry.ts`, exported from the package —
pure functions, zero dependencies. The same code runs in the browser (live
area readout while the manager drags a vertex) and in the API (side-panel
figures, export labels). Contracts is already the shared single-truth
package; a second implementation on either side would drift, and the drawn
"12.4 katha" must be the same number the server prints on the PDF.

Unit-tested DB-free in `apps/api/test/unit/geometry.spec.ts` (round-trip
transforms, known-square areas, orientation, residuals, conversion
constants, self-intersection).

## 2. Lat/lng ↔ local metres

The farm is ~105 m across; over that span a flat-earth approximation is
sub-centimetre. Pick the first anchor's GPS point as origin and use the
equirectangular projection:

```
east  (m) = (lng − lng₀) · cos(lat₀ · π/180) · 111320
north (m) = (lat − lat₀) · 110574
```

No geodesy library. (Error grows with distance; at 200 m it is still < 1 cm
— irrelevant against ±3–5 m phone GPS.)

## 3. The plan → world transform

A **similarity transform**: uniform scale `s`, rotation `θ`, translation.
Four degrees of freedom, exactly determined by 2 anchors, least-squares
(Umeyama, reflection disallowed) for 3+.

- **The y-flip, stated once so nobody ships the classic bug:** image y grows
  *downward*, northing grows *upward*. All plan points enter the solver as
  `(x, −y)`; after that it is a pure rotation problem. Without the flip the
  best fit is a mirror image and every derived lat/lng is silently wrong.
- With 2 anchors: `s = |m₂−m₁| / |p₂−p₁|`, `θ` from the angle between the
  two segment vectors, translation from anchor 1. Exact fit, zero residual
  by construction.
- With 3+ anchors: least-squares fit; each anchor gets a **residual in
  metres** (distance between its GPS point and where the transform puts its
  plan point). Residuals are surfaced in the UI — a residual > 5 m almost
  always means one anchor was typed wrong or pinned on the wrong corner.

Inverse transform (`latLngToPlan`) is the same similarity inverted — needed
later when IoT devices or survey readings arrive as GPS and must land on the
map.

**Rejected — affine (6-dof):** allows shear/anisotropic scale, which makes
"area" direction-dependent and can't actually rescue a hand-drawn plan
anyway. **Rejected — homography:** needs 4+ points, overfits GPS noise, and
a scanned drawing has no perspective to correct. If the siteplan itself is
not to scale, no transform fixes that — see §7.

## 4. Areas and lengths

Rotation and translation preserve area, so there is no need to transform
every vertex:

```
areaM2   = |shoelace(vertices_px)| · s²
lengthM  = Σ |segment_px| · s
```

Shoelace over the raw pixel vertices, one multiplication. Computed live in
the editor on every vertex drag, and by the API for panels/exports.
Self-intersection (checked in contracts validation, Section 1 §6) matters
here: shoelace on a bowtie polygon returns garbage, which is why
self-intersecting polygons are rejected at input, not rendered and mis-measured.

## 5. Units

Canonical unit: **m²** (and metres for lines). Exact constants
(1 ft = 0.3048 m exactly; West Bengal standard katha):

| Unit | Definition | m² |
|---|---|---|
| sq ft | — | 0.09290304 |
| decimal / শতক | 1⁄100 acre = 435.6 sq ft | 40.4685642 |
| katha / কাঠা | 720 sq ft | 66.8901888 |
| bigha / বিঘা | 20 katha = 14400 sq ft | 1337.803776 |
| acre | 100 decimal | 4046.8564224 |

Display rules by feature kind:

- **plot, zone** → `B bigha K katha` (mixed-radix, katha to 1 dp) with
  decimal in parentheses, because `FodderPlot.areaDecimal` — the legal
  record — is in decimals and the two must be comparable at a glance:
  `1 bigha 4.3 katha (40.2 dec)`.
- **building** → sq ft (integer) with m² alongside: `860 sq ft (80 m²)`.
- **line** → metres (1 dp), feet in parentheses.
- Unit names are i18n keys in both `en.json` and `bn.json`
  (`units.katha` → কাঠা, `units.bigha` → বিঘা, `units.decimal` → শতক,
  `units.sqft` → বর্গফুট, `units.m2`, `units.m`). Digits render in the
  locale's standard numerals, same as the rest of the app.

Sanity example used in tests: the whole farm ≈ 2.7 acres = 270 decimal =
10,926 m² ≈ **8 bigha 3.4 katha** — the traced farm boundary should land
near this, and the calibration UI uses it as a smoke test (§6).

## 6. Calibration UX

A "Calibrate" action on the map page (perm `layout: approve` — anchors move
every measurement on the farm, so they get the same gate as other
farm-shaping settings). Dialog flow:

1. **Pick a plan point**: click a recognisable spot on the siteplan —
   a gate post, shed corner, boundary corner. Crosshair zoom for precision.
2. **Enter its GPS coordinates**, either way:
   - *Google Maps method (recommended)*: long-press the same spot in Google
     Maps satellite view on any phone, copy the coordinates, paste — the
     field accepts the pasted `"23.9061, 87.5412"` format directly.
   - *Stand-there method*: open any GPS/compass app at the spot, type lat/lng.
3. **Repeat for a second point as far away as possible** — opposite corners
   of the property, ideally. Baseline length is the entire defence against
   GPS noise: a 4 m error over a 140 m diagonal is ~3 % scale error; the
   same error over a 30 m baseline is ~13 % (≈ 27 % on areas). The dialog
   warns if the two plan points are closer than 25 % of the image diagonal.
4. On save the dialog shows the consequences immediately: the implied scale
   (`1 px = 0.038 m`), and — once a farm-boundary polygon exists — the
   computed total area next to "recorded ~2.7 acres". A wildly-off total is
   caught here, in the dialog, not months later on a printed map.
5. **Optional 3rd–8th anchors**: each shows its residual in metres;
   anything > 5 m is highlighted with "check this one".

Validation is `SetAnchorsInput` (Section 1 §6): 2–8 anchors, Birbhum
lat/lng sanity band (catches swapped lat/lng), non-coincident plan points.

**Re-pinning** is the same dialog, any time. Because shapes live in pixel
space (Section 1 §2), editing anchors rewrites nothing — the audit log gets
one `update SiteLayout` row with before/after anchors, and every area,
coordinate, and future IoT placement silently improves. This is the
interview's "rough guess works initially, re-pin later" requirement, kept
by construction.

**Uncalibrated state** (0–1 anchors): drawing, naming, linking, colouring
all work. Measurements and lat/lng show as "—" with a *Not calibrated —
set 2 GPS anchors* chip that opens the dialog. Nothing blocks tracing the
whole farm before anyone walks outside with a phone.

## 7. Honest limits (stated in the UI, not hidden)

- **The map is only as true to scale as the siteplan drawing.** If the plan
  is schematic, computed areas inherit its distortion uniformly. This is why
  computed area is displayed *next to* `FodderPlot.areaDecimal`, never
  written into it — the legal record stays authoritative, and a consistent
  gap between the two across all plots is itself a useful signal that the
  plan drawing is off-scale.
- **Phone GPS is ±3–5 m.** Mitigations are baked into the flow: long
  baselines (§6.3's warning), the Google-Maps-pin method (satellite imagery
  is usually better registered than a raw phone fix), and 3+ anchors with
  visible residuals.

## 8. Plan-image replacement (coordinate-space consequence)

Geometry is bound to the plan's pixel space, so replacing the siteplan image
is not a free operation once features exist:

- **Same pixel dimensions** (e.g. a cleaner scan of the same file): allowed
  silently — coordinates still line up.
- **Different dimensions**: soft-rule override (the codebase's standard 422
  `RULE_OVERRIDE_REQUIRED` with `params.warnings[]`): *"N features and M
  anchors were positioned on the old image and may no longer align;
  re-check anchors after replacing."* With `confirmOverride: true` +
  `overrideReason`, the image is swapped and all geometry kept — usually
  right for a rescan at higher resolution, where one anchor re-pin session
  fixes everything. Upload mechanics themselves are Section 5.

## 9. Function inventory (`packages/contracts/src/geometry.ts`)

| Function | Used by |
|---|---|
| `solveTransform(anchors)` → `{s, theta, tx, ty} \| null` | editor, API, both directions below |
| `planToLatLng(pt, transform, origin)` / `latLngToPlan(...)` | export labels, future IoT placement |
| `anchorResiduals(anchors)` → metres per anchor | calibration dialog |
| `polygonAreaM2(pts, s)` / `polylineLengthM(pts, s)` | editor live readout, side panel, export |
| `isSelfIntersecting(pts)` | contracts refinement for polygon inputs |
| `toDisplayArea(m2, kind)` → `{bigha, katha, decimal}` etc. | web + PDF label formatting |
