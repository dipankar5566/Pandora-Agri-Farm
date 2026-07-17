# Section 4 — Map View & Fodder Integration

What everyone with `layout: view` sees, and the one live integration v1
ships: fodder-plot status on the map. All reads — no new mutations in this
section.

## 1. One read endpoint, enriched server-side

`GET /site-layout` returns the layout (plan reference, anchors) plus all
live features, each **enriched from its linked record at read time**:

- `refType: 'fodder_plot'` → plot name/block/`areaDecimal`, plus the growing
  crop if any (`cropName`, `variety`, `sownOn`, `ageDays`,
  `expectedHarvestOn`, cuts, total yield kg — the same shape
  `FodderService.listCrops` already computes) and a derived `status`.
- `refType: 'shed'` → `name`, `nameBn`.
- `refType: 'iot_device'` → `deviceType`, `serialNumber`, `installLocation`.

Enrichment and status derivation live in `layout.service.ts` (read-only
Prisma joins — no cross-service ceremony, per the flat-monolith rule). The
UI maps `status` to colour and nothing else; when status rules grow
(quarantine zones, task overlays), they grow in exactly one place.

**Broken links**: link targets are validated at write time (Section 1 §4),
but a fodder plot or shed can be soft-deleted *after* being drawn. The read
join detects this (`deletedAt` set / row gone), returns the feature with
`linkBroken: true`, and the panel shows *"Linked record no longer exists"*
with an Unlink action (edit perm). Never an error, never a hidden shape.

## 2. Plot status rules

Three states, from the interview, derived per linked plot:

| Status | Rule |
|---|---|
| `planted` | the plot has a crop with `status: growing` |
| `harvest_due` | that growing crop has `expectedHarvestOn` within the next **7 days or past** |
| `fallow` | no growing crop |

- The 7-day lead is a service constant (`HARVEST_DUE_DAYS = 7`), not a
  setting — it becomes configurable only if someone actually asks.
- Multi-cut crops (Napier) stay `planted` after each recorded cut because
  the crop remains `growing`; `expectedHarvestOn` marks the *first* cut, so
  a long-standing Napier plot reads `harvest_due` only until its date is
  cleared or the crop closed — an accepted v1 simplification, noted in the
  panel by showing the date itself.
- Unlinked plot shapes have no status; they render in the neutral unlinked
  style with a *Link to record…* affordance.

## 3. Status rendering (colour is never the only signal)

Fill styles for plot polygons, on top of Section 3 §6's base styles. All
colours come from the app's existing theme tokens (design-tokens.css), not
new hex values, so light/dark themes keep working:

| Status | Fill | Redundant cue |
|---|---|---|
| `planted` | success-green, ~20 % opacity | solid outline |
| `harvest_due` | warning-amber, ~30 % opacity | **thicker outline + sickle glyph** beside the label |
| `fallow` | neutral grey | **diagonal SVG hatch pattern** (one `<pattern>` def) |
| unlinked | plain pale fill | dotted outline |

Hatch + glyph + outline weight mean the three states remain distinguishable
for colour-blind viewers and on a grayscale printout (which Section 5's
export will produce). The legend (below) is the fourth cue.

**Legend**: a small collapsible card, bottom-left of the canvas — the three
plot statuses and the five kind glyphs, fully translated. The legend is also
rendered into the export.

## 4. Side panel

Clicking any feature opens a right-hand panel (MUI drawer, same pattern as
the rest of the app). Contents by case:

**Plot, linked** —
- Localized name (`nameBn ?? name` under `bn`, mirrored for `en`), block,
  status chip.
- Growing crop: name, variety, age in days, expected harvest date, cuts so
  far, total yield kg.
- **Area, both truths side by side**: computed from geometry
  (`1 bigha 4.3 katha (40.2 dec)`) and recorded `areaDecimal` from the land
  record, with the delta shown when they differ by > 10 % — the
  tracing-vs-record error flag from Section 2 §7.
- Notes, then **Open in Fodder →** (`/fodder?plot=<id>`; the Fodder page
  gets a trivial query-param read that pre-filters/highlights that plot —
  the only touch this module makes to an existing page).

**Plot, unlinked** — computed area, notes, *Link to record…* (edit perm;
picker of unmapped plots, as in Section 3 §3).

**Building** — localized shed name; notes. Deliberately nothing else:
pens/animal counts are the deferred animal-housing phase, and a teaser count
would create an expectation this version doesn't honour.

**IoT device point** — device type, serial, install location. Placement aid
only (per the approved IoT design); no readings, no status dot.

**Zone / line / point (unlinked)** — localized name, computed area or
length, notes.

In edit mode the panel additionally allows: rename (both languages), edit
notes, link/unlink record, delete — each a single PATCH/DELETE with the
usual Idempotency-Key and audit row. Geometry editing stays on the canvas
(Section 3 §4); the panel never moves vertices.

## 5. Hover & labels

- Hover highlights the shape (brightened fill, pointer cursor) and shows a
  tooltip with the localized name — enough to scan the farm without
  clicking.
- Polygon labels (Section 3 §6) show localized name; plots add the computed
  area as a second line when zoom permits. Label text follows the app
  locale switch live, like every other string.

## 6. Freshness

Standard react-query behaviour, same as other pages: refetch on window
focus and on a 60 s stale timer while the map is open. A harvest recorded on
the Fodder page is reflected on the map the next time it gains focus — no
websockets, no polling machinery, consistent with "live-or-fail" (never a
silently stale cache; the SW does not touch `/api/`).

## 7. i18n additions

New keys in **both** `en.json` and `bn.json` (house rule 13), the full set
this module introduces: `map.*` (page title, tools, calibrate dialog, legend,
panel labels, empty states, unsaved-changes guard), `units.*` (Section 2 §5),
`status.planted|harvest_due|fallow`, and error codes
`errors.plot_name_taken`-style additions from Section 5's API. Farm-entered
feature names are data, not translations — the `name`/`nameBn` pair covers
them.
