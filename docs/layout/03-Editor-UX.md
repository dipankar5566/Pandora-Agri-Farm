# Section 3 — Editor UX (tracing & editing)

Desktop, mouse-first (interview decision). View mode works anywhere the PWA
runs; edit affordances need `layout: edit` and a pointer. Everything here is
hand-rolled SVG inside the existing React/MUI app — no canvas, no library.

## 1. Page anatomy

`/map` route, `SiteMap.tsx`, nav entry between Fodder and Finance. One page,
two modes:

- **View mode** (default, perm `layout: view`): pan/zoom, kind-visibility
  toggles, click features → side panel (Section 4's subject).
- **Edit mode** (toolbar switch, perm `layout: edit`): adds the drawing
  toolbar, selection handles, and the save/cancel bar. Same canvas — not a
  separate screen, so what the manager edits is exactly what everyone sees.

Components:

```
src/pages/SiteMap.tsx            page: data loading, mode, toolbar, side panel
src/components/map/MapCanvas.tsx SVG viewport — pan/zoom/viewBox only
src/components/map/FeatureShape.tsx  one feature → SVG element(s) by kind
src/components/map/DrawLayer.tsx     in-progress geometry + vertex handles
```

Editor interaction state is one reducer (a small state machine:
`idle | drawing(kind) | selected(id) | draggingVertex | panning`) — not
scattered `useState`. It is the only nontrivial state on the page; features
themselves stay in react-query.

## 2. Viewport

SVG `viewBox` is the single source of pan/zoom truth. Wheel zooms about the
cursor (0.2×–20×), drag on empty space pans, a Fit button (and initial
state) frames the plan image. Pinch-zoom works on touch for viewing; no
drawing affordances are offered on coarse pointers.

The siteplan renders as an SVG `<image>` at native pixel size — which is
what makes plan-pixel geometry (Section 1 §2) identical to SVG user units,
no coordinate conversion layer anywhere in the front end. A background
opacity slider (100 %–20 %) lets traced shapes read clearly against a busy
scan; it is a view preference, not persisted.

**No plan uploaded yet**: the canvas shows a neutral grid and an *Upload
siteplan* card (upload API is Section 5). Drawing on the bare grid works —
the pixel space is simply the grid's — so nothing blocks sketching before
the scan is ready, but upload-first is the documented happy path
(USER-GUIDE will say so).

## 3. Drawing tools

Toolbar offers one tool per geometry style; the five feature kinds map onto
them:

| Tool | Kinds | Gesture |
|---|---|---|
| Polygon | plot, building, zone | click each vertex; **Enter** or click-first-vertex closes; **Esc** cancels; live area readout follows the cursor (geometry.ts, same numbers as everywhere else) |
| Line | line (fence, path, pipe) | click vertices; **Enter** finishes; live length readout |
| Point | point (tube well, gate, tap) | single click places the marker |

On finish, a small dialog collects: kind (pre-selected from the tool,
changeable within the geometry style), name, নাম (optional `nameBn`),
optional link to an existing record, notes. **Link pickers show only
unlinked records** — the partial unique index (Section 1 §3) means a
`FodderPlot` already on the map simply doesn't appear in the list, so the
constraint is discovered as an empty option, not a 409. Saving POSTs the
feature (Idempotency-Key as on every mutation) and returns to `idle`.

Linking is optional and revisitable: the side panel of any unlinked plot or
building shape offers *Link to record…* later. Trace the whole farm in one
sitting; wire records up afterwards.

## 4. Selection & vertex editing

Click a shape in edit mode to select it:

- **Vertex handles** on every vertex — drag to move (area/length readout
  updates live).
- **Midpoint handles** (hollow, on each edge) — drag to insert a vertex.
- **Right-click a vertex** (or select-vertex + Delete) removes it, refused
  below the kind's minimum (3 for polygons, 2 for lines).
- **Drag the shape body** moves the whole feature.
- **Delete key** on a selected shape soft-deletes the feature — after a
  confirm dialog naming it ("Delete *Plot A-1*?"); linked features' dialog
  notes the link is severed, the referenced record is untouched.

Geometry edits do **not** PATCH on every mouse-up. Selecting a shape starts
a local editing buffer; a save/cancel bar appears ("*Plot A-1* — unsaved
changes"). Save issues one PATCH with the final geometry; Cancel restores
the loaded shape. One audit row per editing session instead of forty, and a
mid-edit mistake is a Cancel, not an archaeology dig.

**Undo/redo** (Cmd+Z / Shift+Cmd+Z) operates on the in-session buffer —
vertex moves, inserts, deletes since selection. It never spans saves; the
server knows nothing of it.

## 5. Snapping

While drawing or dragging a vertex, the cursor snaps to any existing vertex
within 8 *screen* pixels (so zooming in naturally gives finer control).
Snapped vertices share exact coordinates — this is how two adjacent plots
share a boundary without a sliver gap, and how a fence line lands exactly on
plot corners. Hold **Alt** to suppress snapping. Snap targets are vertices
only — edge- and grid-snapping are complexity without a farm-shaped payoff
(revisit only if tracing shows real pain).

## 6. Base rendering style (derived, never stored)

Per Section 1 §4 there are no style columns; `FeatureShape.tsx` derives
everything from `kind`:

| Kind | Style |
|---|---|
| zone | translucent amber fill (~12 % opacity), dashed outline — always rendered *beneath* other kinds (zIndex default −10) so overlapping zones tint rather than cover |
| plot | green outline, pale fill — the fill colour is Section 4's status story |
| building | grey-brown fill, solid outline |
| line | dashed stroke, no fill |
| point | MUI icon marker by convention (name-keyed later if needed; v1 one marker glyph) |
| any selected | primary-colour outline + handles |

Labels (name, and computed area for plots/zones) render at polygon
centroids, scale-aware: below a zoom threshold labels hide rather than
collide — at farm scale (< 100 features) this is the only "performance"
consideration the module has, and plain SVG handles the rest without
virtualisation.

Kind-visibility toggles (five checkboxes in the toolbar) declutter the view
and are also the answer to "a zone covers the thing I want to click":
topmost-by-zIndex wins hits; hide the zone layer to reach beneath. No
click-cycling mechanism.

## 7. Concurrency, offline, and loss protection

- **Last-write-wins.** One manager edits on one Mac (interview + existing
  single-editor reality); optimistic-lock ceremony would be dead weight. The
  audit log's before/after snapshots are the recovery path if two people
  ever do collide. Revisit only if editing becomes multi-user.
- **Online-only editing.** The service worker never caches `/api/` (house
  rule 14) and the map is live-or-fail like all livestock data. Edit mode
  reuses the app's existing online-status hook: going offline disables the
  save bar with a clear message; the in-progress buffer survives in memory
  so nothing is lost when the connection returns.
- **Unsaved-changes guard**: navigating away (route change or tab close)
  with a dirty buffer prompts — standard `beforeunload` + router blocker.

## 8. Keyboard summary

| Key | Action |
|---|---|
| Enter | close polygon / finish line |
| Esc | cancel drawing; deselect |
| Delete | delete selected vertex, else selected feature (confirmed) |
| Alt (held) | suppress snapping |
| Cmd+Z / Shift+Cmd+Z | undo / redo in editing buffer |
| Arrow keys | nudge selected vertex 1 px (Shift: 10 px) |
