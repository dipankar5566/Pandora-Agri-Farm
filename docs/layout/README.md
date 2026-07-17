# Site Layout Module — Design Series

A farm map for Pandora Goat Farm: the manager traces vector shapes over the
existing siteplan image, geo-referenced to real coordinates, with fodder-plot
status as the first live integration. Interviewed goal recorded 2026-07-17.

**Status: implemented 2026-07-17** — `apps/api/src/modules/layout/`,
`apps/web/src/pages/SiteMap.tsx` (+ `components/map/`),
`packages/contracts/src/{layout,geometry}.ts`, migration
`20260716225111_site_layout`. 27 tests (12 geometry, 10 contracts, e2e suite).
User-facing walkthrough in `docs/USER-GUIDE.md` §Farm Map.

## Sections

| # | Section | Status |
|---|---------|--------|
| 1 | [Overview & Data Model](01-Overview-and-Data-Model.md) | approved 2026-07-17 |
| 2 | [Geo-Referencing & Measurement](02-Geo-Referencing-and-Measurement.md) | approved 2026-07-17 |
| 3 | [Editor UX (tracing & editing)](03-Editor-UX.md) | approved 2026-07-17 |
| 4 | [Map View & Fodder Integration](04-Map-View-and-Fodder-Integration.md) | approved 2026-07-17 |
| 5 | [API, Permissions & Export](05-API-Permissions-and-Export.md) | approved 2026-07-17 |

## Goal (from the interview)

- Trace vector shapes over the farm's **existing siteplan image/PDF** shown as
  a locked background layer. Manager draws/edits with a mouse on the desktop;
  everyone else mostly views.
- Feature kinds from day one: **fodder/crop plots, buildings & sheds,
  fixtures/infrastructure** (points and lines: tube well, water points,
  fencing, gates), and **zones/paddocks** that may overlap other features.
- **Geo-referenced from day one**: pin 2+ siteplan points to real GPS lat/lng
  at setup. Anchors must be re-pinnable later without disturbing drawn shapes.
- Areas auto-computed; display in **katha/bigha** for land and **sq ft / m²**
  for structures.
- Lifecycle: **current state only** — boundaries edited in place, no map
  versioning.
- **v1 integration: fodder** — plots colour-coded by status
  (planted / fallow / harvest-due), click opens a detail side panel with a
  jump-through link to the module record. Animal housing, location-tagged
  tasks, and IoT come later.
- Output: in-app bilingual map page **and** a labelled image/PDF export for
  printing / WhatsApp.

## Reconciliation — interview brief vs. code reality

Verified against the codebase on 2026-07-17 before any design was written.

| Brief said | Code reality | Design consequence |
|---|---|---|
| "Plots/sheds become real entities linked to the ERP" | `FodderPlot` (name, block, `areaDecimal`), `Shed` (with `nameBn`), `Pen`, and `IotDevice` **already exist** as master data | The map stores **geometry that references existing records** (`refType`/`refId`, the codebase's established polymorphic-link idiom). It never duplicates plot/shed master data. Standalone fixtures (tube well, fence line) that have no ERP record are map-only features. |
| Areas in katha/bigha and sq ft/m | `FodderPlot.areaDecimal` already records legal areas in **decimal** units (WB land-record practice; `block` comment cites Plot 2308, Mouza Tantipara) | Geometry computes area in m² canonically; UI converts for display (katha/bigha/decimal/sq ft). The computed area is shown **alongside** the recorded `areaDecimal` — it never overwrites it. A visible delta flags tracing or record errors. |
| "IoT foundation — zones for geofencing" | The approved IoT design (docs/iot/06 §2.2) **rejected polygon geofencing**: location is zone-level BLE presence, and a zone is a `zoneLabel` on the gateway device record — deliberately not a master-data table | The map serves IoT as a **placement and survey aid**: device markers (gateways, readers, env sensors from `IotDevice.installLocation`) and drawn zone areas that *illustrate* gateway coverage. Zone shapes carry no enforcement semantics, and this module introduces no Zone table — consistent with the approved IoT decision. |
| Trace over siteplan image; export PDF/image | `Attachment` model + sharp pipeline exists (herd photos, 1200 px cap) | Reuse the same table and service pattern with `kind: 'siteplan'` and a **higher resolution cap** (a 1200 px siteplan is unreadable). No new storage mechanism. |
| Drawing/editing UI | No map/canvas library in `apps/web`; PWA is offline-tolerant; farm internet is unreliable; service worker never caches `/api/` | **Hand-rolled SVG editor** over the static siteplan image. No Leaflet/OpenLayers: there are no map tiles to serve (self-hosted, no internet dependency allowed), and an image-plus-polygons editor is small. Zero new runtime dependencies. |
| New module | RBAC modules are a fixed list (`MODULES` in contracts + `MATRIX` in seed) | New `layout` permission module, wired per architecture rule 3. |
