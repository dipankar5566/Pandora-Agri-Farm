# Section 5 — API, Permissions & Export

The whole HTTP surface, who may call what, what gets audited, siteplan
upload mechanics, and how the map leaves the app as a file.

## 1. Endpoints

House conventions throughout: kebab-case, actions as sub-posts, every
mutation requires `Idempotency-Key`, Zod validation via
`@Body(new ZodPipe(...))` from contracts.

| Route | Perm | Notes |
|---|---|---|
| `GET  /site-layout` | `layout: view` | layout + enriched features (Section 4 §1) |
| `PUT  /site-layout/plan` | `layout: approve` | multipart image upload (§3) |
| `PUT  /site-layout/anchors` | `layout: approve` | `SetAnchorsInput`; re-pin any time |
| `POST /site-features` | `layout: edit` | `CreateFeatureInput` |
| `PATCH /site-features/:id` | `layout: edit` | `UpdateFeatureInput` (geometry, names, link, notes) |
| `DELETE /site-features/:id` | `layout: edit` | soft delete |

**No `POST /site-layout`.** The singleton row is created by `seed.ts` as an
idempotent upsert (name "Pandora Farm"), alongside the new `layout` row in
the permission `MATRIX` (owner/manager `approve`, other roles `view`).
Running `npm run seed` after deploy is the entire data migration.

**Permission levels mean**: `view` = see the map and panels; `edit` = draw,
move, rename, link, delete features; `approve` = replace the plan image and
set GPS anchors — the two operations that move every measurement on the
farm, gated like other farm-shaping settings.

## 2. Error codes

New codes, SCREAMING_SNAKE + `errors.*` messageCode in both locales:

| Code | Status | When |
|---|---|---|
| `FEATURE_NOT_FOUND` | 404 | id missing or soft-deleted |
| `REF_NOT_FOUND` | 404 | linking to a fodder plot / shed / device that doesn't exist or is deleted |
| `REF_ALREADY_MAPPED` | 409 | second shape claims the same record — backstops the partial unique index; the UI normally prevents this by hiding mapped records (Section 3 §3) |
| `PLAN_DIMENSIONS_CHANGED` | 422 | replacement image has different pixel dimensions while features exist — `RULE_OVERRIDE_REQUIRED` flow with `params.warnings[]` (Section 2 §8); proceeds with `confirmOverride: true` + `overrideReason` |
| `NOT_AN_IMAGE` | 400 | reused existing code from the photo pipeline |

Geometry shape errors (too few vertices, self-intersection, out-of-band
anchors) are Zod refinements → the standard 400 validation envelope; they
need no bespoke codes.

## 3. Siteplan upload

Reuses the existing `Attachment` table and sharp pipeline
(`files.service.ts` precedent) with two deliberate differences from animal
photos:

- **Resolution cap 4096 px** longest side (not 1200): the plan carries text
  and thin lines that must survive tracing zoom. JPEG q85. Resulting file is
  ~1–3 MB — noise against the disk budget, and the uploads dir is already
  inside the nightly backup path.
- `entityType: 'SiteLayout'`, `kind: 'siteplan'`, dedupe by content hash as
  usual. The layout row stores `planAttachmentId` + the resized
  `planWidth`/`planHeight` (the values all geometry is bound to). A replaced
  plan's old attachment row is kept (soft history for free); only the
  pointer moves.

**Images only — PDF is not accepted.** Rasterizing PDF server-side means a
poppler/ghostscript dependency for a one-time operation. If the siteplan is
a PDF, macOS Preview exports a page as PNG/JPEG in two clicks; the
USER-GUIDE documents this. (Revisit only if plan uploads somehow become
frequent, which "current state only" says they won't.)

Upload response returns the stored dimensions and, when
`PLAN_DIMENSIONS_CHANGED` was overridden, echoes the warning so the UI can
immediately prompt an anchor re-check.

## 4. Transactions, audit, timeline

- Each feature mutation = feature row + `audit.log(...)` in one
  `$transaction` (rule 4). There are **no** stock, ledger, task, or timeline
  side effects anywhere in this module — the map is master data + geometry.
- `SiteLayout` is a master record: plan and anchor updates call
  `audit.version(...)` in addition to `audit.log` (rule 11), so anchor
  history is reconstructable even though the map itself is
  current-state-only.
- No `animal_events` writes — the timeline is animal-scoped and nothing here
  touches an animal.

## 5. Export

Two paths, zero new dependencies, both client-side:

- **PNG (“Export image” button)**: the page serializes the live SVG —
  with labels forced visible, the legend group included, and the plan
  image inlined as a data URL (same-origin fetch from the attachment
  stream, so the canvas is never tainted) — draws it to an offscreen canvas
  at 2× resolution, and downloads `farm-map-YYYY-MM-DD.png`. This is the
  WhatsApp/wall artifact. It exports **in the current UI language**, so a
  Bengali map for the office wall is just: switch locale, export.
- **PDF (“Print” button)**: a `@media print` stylesheet hides the app
  chrome, fits the map to the page landscape, and adds a header (farm name,
  date, scale note) + legend. The browser's print dialog does PDF for free.

Status colours survive grayscale printing because Section 4 §3 made hatch,
glyph, and outline weight carry the information redundantly.

**Rejected — server-side rendering**: headless-browser or SVG-rasterizer
dependencies to produce a file the client already has on screen.

## 6. Tests shipped with the module (same commit, per house rules)

**Unit (`test/unit/`, DB-free)**
- `geometry.spec.ts`: transform round-trips, y-flip orientation (a known
  north-up square must come out north-up), 2-anchor exactness, 3-anchor
  residuals, shoelace areas against hand-computed figures, unit-conversion
  constants (2.7 acres ≈ 8 bigha 3.4 katha), self-intersection detection.
- `layout-contracts.spec.ts`: per-kind vertex minimums, both-or-neither
  `refType`/`refId`, anchor lat/lng sanity band, coincident-anchor
  rejection.

**E2E (`test/e2e/layout.e2e-spec.ts`, real Postgres)**
- Feature CRUD with audit rows asserted; soft delete leaves the row.
- `REF_ALREADY_MAPPED` 409 from the partial unique index (two shapes, one
  plot).
- Status derivation: fixture plot + crop `sownOn: past(30)`,
  `expectedHarvestOn: future(3)` → `harvest_due`; crop closed → `fallow`.
  Relative dates only.
- Broken-link enrichment: soft-delete the fodder plot → `linkBroken: true`.
- Anchors PUT → GET returns geometry-derived areas; `audit.version` row
  exists.
- Plan replacement dimension-change 422 → override succeeds with reason
  stored.
- RBAC: `view`-only token can GET but not POST.
- Fixtures self-heal in `beforeAll` and clean up in `afterAll`
  (features → layout pointer reset → attachments; fodder fixtures per the
  existing pattern).

## 7. Build & rollout order

1. `packages/contracts`: `FeatureKind`, inputs, `geometry.ts`, `'layout'`
   in `MODULES` → `npm run build -w packages/contracts`.
2. Prisma migration (`--create-only`, then hand-append the two partial
   unique indexes + geometry CHECK) → `migrate deploy`.
3. `prisma/seed.ts`: `MATRIX` row + singleton layout upsert → `npm run seed`.
4. `apps/api/src/modules/layout/` (`layout.service.ts`,
   `layout.controller.ts`), registered in the flat `AppModule`; rebuild api.
5. `apps/web`: `/map` route + nav entry, `SiteMap.tsx`, map components,
   `?plot=` param on Fodder page, i18n keys in **both** locale files.
6. Tests green (target: existing 95 + new suite, all passing), USER-GUIDE
   section (upload, Preview-PDF-conversion note, calibration walkthrough,
   export), RUNBOOK untouched (no new processes, ports, or launchd jobs —
   the module rides entirely inside the existing API).
