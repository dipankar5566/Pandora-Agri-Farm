# Section 1 — Overview & Data Model

## 1. What this module is

One new bounded context, `apps/api/src/modules/layout/`, one new web page
(`SiteMap.tsx`, route `/map`), two new tables. The manager uploads the
existing siteplan image once, pins two or more anchor points to real GPS
coordinates, then traces plots, sheds, fixtures, and zones as vector shapes
over it. Everyone with `layout: view` sees the live map; fodder-plot shapes
render with crop status and open a side panel.

Explicitly **not** in this module (deferred, in interview-agreed order):
animal-housing view per shed, location-tagged tasks, IoT zone/coverage
display. The data model below leaves them a seat (via `refType`/`refId`)
without building them.

## 2. The coordinate-space decision (everything hangs on this)

Shapes are stored in **plan-pixel coordinates** — x/y positions on the
uploaded siteplan image — not in lat/lng.

- Geo-referencing lives in one place: the layout's **anchor list** (plan
  point ↔ GPS point pairs). Lat/lng for any shape is *derived* through the
  anchor transform whenever needed.
- This is what makes the interview requirement "re-pin anchors later without
  redrawing anything" true by construction: correcting a sloppy GPS anchor
  edits one row; every drawn shape is untouched and every derived
  coordinate/area silently improves.
- The transform (similarity: scale + rotation + translation, least-squares
  when >2 anchors) and area math are Section 2's subject.

**Rejected — storing shapes in lat/lng**: every anchor correction would
require rewriting every geometry row, and drawing before calibration would be
impossible. **Rejected — storing both**: two sources of truth, guaranteed
drift (violates the codebase's single-truth discipline).

## 3. Tables

Two tables, following every house rule: ULID `char(26)` PKs, snake_case
`@@map`, soft delete, audit columns, RESTRICT FKs.

```prisma
enum FeatureKind {
  plot        // farming/fodder plot   → polygon
  building    // shed, store, office   → polygon
  zone        // paddock, functional   → polygon (may overlap anything)
  line        // fence, path, pipe     → polyline
  point       // tube well, gate, tap  → point marker
}

model SiteLayout {
  id               String    @id @db.Char(26)
  name             String                                  // "Pandora Farm — Tantipara"
  planAttachmentId String?   @map("plan_attachment_id") @db.Char(26)
  planWidth        Int?      @map("plan_width")            // stored image px, set on upload
  planHeight       Int?      @map("plan_height")
  anchors          Json      @default("[]")                // [{ x, y, lat, lng, label }]
  createdAt        DateTime  @default(now()) @map("created_at")
  createdBy        String?   @map("created_by") @db.Char(26)
  updatedAt        DateTime  @updatedAt @map("updated_at")
  updatedBy        String?   @map("updated_by") @db.Char(26)
  deletedAt        DateTime? @map("deleted_at")
  deletedBy        String?   @map("deleted_by") @db.Char(26)
  features         SiteFeature[]

  @@map("site_layouts")
}

model SiteFeature {
  id        String      @id @db.Char(26)
  layoutId  String      @map("layout_id") @db.Char(26)
  kind      FeatureKind
  name      String                                        // "Plot A-1", "Buck Shed"
  nameBn    String?     @map("name_bn")                   // same bilingual pattern as Shed
  geometry  Json                                          // [[x,y],…] plan-pixel vertices; [[x,y]] for point
  refType   String?     @map("ref_type")                  // 'fodder_plot' | 'shed' | 'iot_device' | null
  refId     String?     @map("ref_id") @db.Char(26)
  zIndex    Int         @default(0) @map("z_index")       // zones render under plots/buildings
  notes     String?
  createdAt DateTime    @default(now()) @map("created_at")
  createdBy String?     @map("created_by") @db.Char(26)
  updatedAt DateTime    @updatedAt @map("updated_at")
  updatedBy String?     @map("updated_by") @db.Char(26)
  deletedAt DateTime?   @map("deleted_at")
  deletedBy String?     @map("deleted_by") @db.Char(26)
  layout    SiteLayout  @relation(fields: [layoutId], references: [id])

  @@index([layoutId, kind])
  @@map("site_features")
}
```

Hand-written SQL appended to the migration draft (rule 12):

- Partial unique index: one live layout —
  `CREATE UNIQUE INDEX site_layouts_singleton ON site_layouts ((true)) WHERE deleted_at IS NULL;`
  v1 is one farm, one map. Dropping this index is the entire "multi-layout"
  migration if that day ever comes.
- Partial unique index on `site_features (layout_id, ref_type, ref_id) WHERE
  deleted_at IS NULL AND ref_type IS NOT NULL` — a fodder plot or shed can be
  drawn on the map **once**. Two shapes claiming the same plot is a data bug,
  not a feature.
- CHECK: `jsonb_array_length(geometry) >= 1`. Kind-specific vertex minimums
  (polygon ≥ 3, line ≥ 2) are validated in contracts; the DB check is the
  integrity floor.

## 4. What is deliberately absent

- **No `color`, `fillOpacity`, or style columns.** Rendering style derives
  entirely from `kind` (and, for plots, live crop status). One less thing to
  keep bilingual/consistent, and the map stays legible because nobody can
  hand-pick 12 colours. Revisit only if a real need appears.
- **No `area` column.** Area is pure math over `geometry` + anchors —
  computed at read time (and by the UI live while drawing). Storing it would
  create a second truth that goes stale on every anchor re-pin. The *legal*
  area stays where it already lives: `FodderPlot.areaDecimal`.
- **No geometry history.** Interview decision: current state only. Edits
  UPDATE in place; the audit log (rule 11) still records before/after
  snapshots of every mutation, which is recovery enough.
- **No FK on `refId`.** Polymorphic by design, same as `stock_movements.ref_*`
  and `attachments.entity_*` precedent. The service validates the referenced
  row exists and is live at write time.

## 5. Links to existing records

| `refType` | Points at | v1 behaviour |
|---|---|---|
| `fodder_plot` | `fodder_plots.id` | Status colour from live crops; side panel shows growing crop, sown date, recorded vs computed area; link to `/fodder`. |
| `shed` | `sheds.id` | Name/nameBn shown from the shed record. No animal view yet (later phase). |
| `iot_device` | `iot_devices.id` | Point markers for gateways/readers/sensors. Placement aid only — no coverage or geofence semantics (per approved IoT design, docs/iot/06 §2.2). |
| `null` | — | Standalone fixture: fence, path, tube well, gate, water point, future-planning sketch. |

Linking is optional at draw time: the manager can trace the whole farm first
and attach records later from the feature's side panel.

## 6. Contracts (packages/contracts)

New schemas, single validation truth as always:

- `FeatureKind` enum mirroring the Prisma enum.
- `PointPx = z.tuple([z.number(), z.number()])` with bounds sanity
  (0 ≤ value ≤ 20000).
- `CreateFeatureInput` / `UpdateFeatureInput`: name (trimmed, 1–120),
  optional `nameBn`, kind, geometry refined per kind (point = exactly 1
  vertex, line ≥ 2, polygon ≥ 3 and non-self-intersecting), optional
  `refType`+`refId` (both or neither), notes ≤ 500.
- `SetAnchorsInput`: 2–8 anchors, each `{ x, y, lat, lng, label? }` with
  lat 20–28, lng 85–90 (Birbhum sanity band — catches swapped lat/lng, the
  classic field-entry mistake), and a refinement that anchor plan-points are
  not coincident.
- `MODULES` gains `'layout'`; `MATRIX` in `prisma/seed.ts` gains the row
  (owner/manager `approve`, others `view`) — reseed adds it without touching
  farm edits.

## 7. Section map for what follows

- **Section 2** — anchor transform math, area/length computation, unit
  conversions (m² ↔ katha/bigha/decimal/sq ft), calibration UX including
  "rough guess now, re-pin later".
- **Section 3** — editor UX: upload, tracing tools per kind, vertex editing,
  snapping, undo, keyboard.
- **Section 4** — map view: status colouring rules, side panel contents,
  bilingual labels, jump-through links.
- **Section 5** — API surface, permissions, audit points, siteplan upload
  specifics (resolution cap), and PNG/PDF export.
