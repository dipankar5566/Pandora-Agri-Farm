# Pandora Goat Farm ERP — Phase 5: API Design

| | |
|---|---|
| **Document** | Phase 5 — API Design (R1 surface) |
| **Version** | 1.0 (Draft for approval) |
| **Date** | 2026-07-15 |
| **Status** | ⏳ Awaiting owner approval |
| **Style** | REST/JSON over HTTPS, `/api/v1` |
| **Next phase** | Phase 6 — Implementation (module by module, with approval per module) |

---

## 1. Conventions (apply to every endpoint)

### 1.1 Transport & auth
- Base path **`/api/v1`** — versioned from day one; breaking changes require `/v2`, additive changes don't.
- Auth: **HTTP-only session cookie** (`pandora_sid`), set by `POST /auth/login`. All non-auth endpoints require it. CSRF protected via same-site cookie + custom header check.
- Every mutating request (POST/PATCH/DELETE) **must send `Idempotency-Key: <uuid>`** — replays return the cached first response (double-tap and offline-replay safety, Phase 2 §4.4).
- `Accept-Language: en | bn` selects the language for any human-readable strings; machine consumers use `code` fields.

### 1.2 RBAC
Every endpoint declares `module` + minimum `level` (`view`/`edit`/`approve`, per the `role_permissions` matrix). The guard runs before the handler — deny is `403` with code `PERM_DENIED`. Endpoints below list their guard as `[module:level]`.

### 1.3 Envelope, pagination, filtering
```jsonc
// Success (single)            // Success (list — cursor pagination)
{ "data": { … } }              { "data": [ … ],
                                 "meta": { "nextCursor": "01J…", "total": 87 } }
```
- Lists: `?limit=` (default 25, max 200), `?cursor=`, `?sort=field:asc|desc` (whitelisted fields), plus per-resource filters (indexed columns only — the API never invites an unindexed scan).
- Timestamps ISO-8601 UTC (`2026-07-15T04:30:00Z`); biology dates are plain `YYYY-MM-DD`. Money is a string decimal (`"1250.00"`), never a float.
- Soft-deleted rows are invisible except to Owner via `?includeDeleted=true` `[settings:approve]`.

### 1.4 Error model (uniform, i18n-ready)
```jsonc
{ "error": {
    "code": "STOCK_INSUFFICIENT",        // stable, machine-readable
    "messageCode": "errors.stock_insufficient", // i18n key for the UI
    "params": { "item": "Ivermectin", "available": 2, "requested": 5 },
    "field": "doses",                    // present for validation errors
    "requestId": "01J8…"                 // matches pino log + audit row
} }
```
| HTTP | Codes (examples) |
|---|---|
| 400 | `VALIDATION_FAILED` (with `fields[]`), `BIOLOGY_RANGE` (CHECK-mirrored: weight/temp/BCS/dose bounds) |
| 401 / 403 | `AUTH_REQUIRED`, `SESSION_EXPIRED`, `PERM_DENIED`, `ACCOUNT_LOCKED` |
| 404 / 409 | `NOT_FOUND`; `CONFLICT` family: `TAG_TAKEN`, `ANIMAL_ALREADY_EXITED`, `PREGNANCY_ALREADY_ONGOING`, `STOCK_INSUFFICIENT`, `BATCH_EXPIRED`, `WITHDRAWAL_ACTIVE`, `DUE_ALREADY_DONE` |
| 422 | `RULE_OVERRIDE_REQUIRED` — soft business rules (underage doe, inbreeding warning, same anthelmintic class): response includes `override.token`; resubmit with `override: { token, reason }` to proceed. Hard rules are 409 and never overridable |
| 500 | `INTERNAL` (requestId always returned; details only in logs) |

Every validation rule lives in `packages/contracts` (Zod schemas) — **the same schema validates in the browser form and in the NestJS pipe**, so client and server can never disagree.

### 1.5 Side effects are part of the contract
Endpoints that fire domain events list them under **Emits** — timeline rows, tasks, alerts, ledger entries and stock movements happen in the *same transaction* as the primary write, or not at all.

---

## 2. Endpoint Catalog

### 2.1 Auth & session
| Method & path | Purpose | Guard |
|---|---|---|
| `POST /auth/login` | phone + password → session cookie; lockout after 5 fails | public |
| `POST /auth/logout` | destroy session | any |
| `GET /auth/me` | profile + effective permission matrix (drives UI hiding) | any |
| `PATCH /auth/me` | locale, theme, password (requires current password) | any |

### 2.2 Platform (settings, users, files, alerts, search, ops)
| Method & path | Purpose | Guard |
|---|---|---|
| `GET/PATCH /farm` | farm profile, tag prefix, defaults | settings:view / approve |
| `GET/POST/PATCH /users`, `POST /users/:id/deactivate` | user management | settings:approve |
| `GET /roles`, `PATCH /roles/:id/permissions` | RBAC matrix editor | settings:approve |
| `GET/PATCH /settings/:key` | typed settings (gestation override, backup config…) | settings:approve |
| `POST /attachments` (multipart) → `GET /attachments/:id` | upload (≤ 25 MB, images auto-compressed via sharp), download | per parent module |
| `GET /alerts?unread=true`, `POST /alerts/:id/read` | alert center | dashboard:view |
| `GET /search?q=` | universal search — grouped `{animals[], items[], suppliers[], tasks[], ledger[]}`, trigram-fuzzy | per-group perms applied |
| `GET /audit-log?entity=&actor=&from=&to=` | audit viewer | settings:approve |
| `GET /ops/health` | db/disk/backup-age/job-queue status (also used by launchd watchdog) | public-local |
| `POST /ops/backup` | trigger backup now | settings:approve |
| `GET /exports/:entity.csv` | full CSV export (animals, ledger, stock…) — NFR-10 | module:view + audit `export` |

### 2.3 Herd
| Method & path | Purpose / notes | Guard |
|---|---|---|
| `GET /animals` | filters: `status,breedId,penId,sex,q,ageBand,pregnant,withdrawal` | livestock:view |
| `POST /animals` | register one (tag auto-suggest honored or overridden) — **Emits** `registered` | livestock:edit |
| `POST /animals/bulk-intake` | array ≤ 200; all-or-nothing transaction; returns created tags | livestock:edit |
| `GET /animals/:id` | full profile incl. computed chips (pregnancy, withdrawal, open case) | livestock:view |
| `PATCH /animals/:id` | master-record edit → `record_versions` snapshot | livestock:edit |
| `DELETE /animals/:id` | soft delete (mistake-entry only; real departures use /exit) | settings:approve |
| `GET /animals/:id/timeline?type=&cursor=` | the event feed | livestock:view |
| `GET /animals/:id/versions` | version history | livestock:view |
| `POST /animals/:id/photos` | attach photo (sets profile photo if first) | livestock:edit |
| `GET /animals/:id/qr?format=png|pdf` | QR card (A6 print layout) | livestock:view |
| `POST /animals/:id/move` | pen movement — **Emits** `moved`; capacity warning 422-overridable | livestock:edit |
| `POST /animals/:id/exit` | sale/death/disposal — **Emits** `sold|died|disposed` + auto ledger entry; 409 `WITHDRAWAL_ACTIVE` on sale during withdrawal (overridable only by Owner); 409 `ANIMAL_ALREADY_EXITED` | livestock:edit (sale price edits: finance:edit) |
| `POST /weights` | batch: `{date, entries:[{animalId, weightKg, bcs?}]}` — **Emits** `weighed`×n; >15 % delta returns 422 override per entry | livestock:edit |
| `GET/POST/PATCH /breeds`, `/sheds`, `/pens` | lookups; pen occupancy included | livestock:view/edit |

### 2.4 Breeding
| Method & path | Purpose / notes | Guard |
|---|---|---|
| `POST /heats` | record heat — **Emits** `heat` + 19-day recheck task | breeding:edit |
| `GET /heats?window=` | estrus calendar feed | breeding:view |
| `POST /services` | natural/AI; 422 overrides: underage/underweight doe, inbreeding (shared ancestor ≤ 2 gen — override requires reason, recorded); 409 `PREGNANCY_ALREADY_ONGOING` — **Emits** `served` | breeding:edit |
| `POST /services/:id/diagnoses` | pregnancy diagnosis ≥ day 18; `pregnant` result opens a pregnancy — **Emits** `pregnancy_diagnosed` (+ kidding-watch tasks at day 145) | breeding:edit |
| `GET /pregnancies?status=ongoing&dueWithin=60` | due board | breeding:view |
| `POST /pregnancies/:id/kidding` | see §3.2 — the richest endpoint | breeding:edit |
| `POST /pregnancies/:id/abortion` | status→aborted, reason required — **Emits** event + dam health-check task | breeding:edit |
| `GET /breeding/performance?by=doe|buck` | success-rate views | breeding:view |

### 2.5 Health & protocols
| Method & path | Purpose / notes | Guard |
|---|---|---|
| `GET/POST /health-cases`, `PATCH /health-cases/:id` | case lifecycle; `isolate:{penId}` moves the animal — **Emits** `case_opened`/`isolated` | health:edit |
| `POST /health-cases/:id/vitals` | temp/pulse/respiration (CHECK-mirrored bounds) | health:edit |
| `POST /health-cases/:id/close` | recovered/referred; `died` → requires exit payload inline (one transaction) | health:edit |
| `POST /treatments` | medicine + dose; **deducts stock (FEFO batch suggested), stamps withdrawal, Emits `treated`**; 409 `STOCK_INSUFFICIENT`/`BATCH_EXPIRED` | health:edit |
| `POST /lab-reports` | findings + attachment | health:edit |
| `GET/POST/PATCH /protocols` | vaccination/deworming protocol definitions (seeded) | health:view / settings:approve |
| `GET /protocol-dues?status=pending&type=&penId=&window=` | the due worklist | health:view |
| `POST /protocol-administrations` | **batch**: shared `{protocolId,date,itemId,batchId,givenBy}` + `entries:[{animalId,doseOverride?}]`; per-animal dose = dose/kg × current weight; marks dues done, deducts stock, computes next dues — **Emits** `vaccinated|dewormed`×n; 422 rotation nudge if same anthelmintic class as last time | health:edit |

### 2.6 Inventory, feed, suppliers
| Method & path | Purpose / notes | Guard |
|---|---|---|
| `GET/POST/PATCH /items` | catalog; `GET /items?belowMin=true` | inventory:view/edit |
| `POST /items/:id/batches` | stock-in (purchase/opening) + optional auto ledger expense | inventory:edit |
| `GET /stock/levels`, `GET /stock/expiring?days=30` | dashboards & alerts feed | inventory:view |
| `POST /stock-movements` | adjustment/wastage — reason mandatory; negative-stock impossible (409) | inventory:edit |
| `GET/POST /feed-logs?date=` | day-register upsert: `{date, rows:[{penId,itemId,qty,wastage?}]}`; yesterday pre-fill via `GET ?date=yesterday` | feed:view/edit |
| `GET/POST/PATCH /suppliers` | supplier book | purchase:view/edit |

### 2.7 Finance & tasks
| Method & path | Purpose / notes | Guard |
|---|---|---|
| `GET/POST/PATCH /ledger-entries` | manual entries; auto entries (`ref_type` set) are read-only here — edited via their source record | finance:view/edit (approve for amounts > configurable limit) |
| `GET /finance/summary?month=` | totals, category split, cost-per-goat | finance:view |
| `GET/POST /finance-categories` | seeded + custom | finance:edit |
| `GET /tasks?date=&status=&assignee=` | today view / calendar | tasks:view |
| `POST /tasks`, `PATCH /tasks/:id` | manual + recurring (RRULE) | tasks:edit |
| `POST /tasks/:id/complete` / `POST /tasks/:id/skip` | note / reason; completing a linked due-task via its module auto-completes here | tasks:edit |

### 2.8 Dashboard
`GET /dashboard` — single aggregated call (KPI strip, needs-attention list, upcoming kiddings, alerts, month money) so the home screen is **one round trip**; server-side 60 s TTL cache. `[dashboard:view]`

---

## 3. Contracts for the Two Highest-Stakes Operations

### 3.1 `POST /treatments`
```jsonc
// Request
{ "animalId": "01J8QG…", "caseId": "01J8QH…",          // caseId optional
  "treatedAt": "2026-07-15T09:30:00Z",
  "itemId": "01J8ME…",                                   // Ivermectin inj.
  "batchId": "01J8MF…",                                  // FEFO-suggested by GET /items/:id/batches
  "doseAmount": "4.5", "doseUnit": "ml", "route": "sc",
  "weightAtTreatmentKg": "22.4", "givenBy": "01J8US…", "notes": "" }
// 201 Response
{ "data": { "id": "01J8TR…", "withdrawalUntil": "2026-07-19",
    "stockAfter": { "batchId": "01J8MF…", "remaining": "7.5" },
    "emitted": ["treated"] } }
// Failure modes: 409 STOCK_INSUFFICIENT · 409 BATCH_EXPIRED ·
// 400 BIOLOGY_RANGE (dose ≤ 0 or > plausible max for item) · 404s
```

### 3.2 `POST /pregnancies/:id/kidding`
```jsonc
// Request
{ "kiddingDate": "2026-07-17", "assisted": false, "complication": "none",
  "totalBorn": 3, "bornAlive": 2, "attendedBy": "01J8US…",
  "kids": [   // length MUST equal bornAlive (400 otherwise)
    { "sex": "female", "birthWeightKg": "1.2", "tagNumber": null },  // null → auto PGF-0088
    { "sex": "male",   "birthWeightKg": "1.4", "tagNumber": null } ],
  "colostrumWithin1h": true }
// 201 Response — everything below happened in ONE transaction
{ "data": { "kiddingId": "01J8KD…",
    "kidsCreated": [ { "animalId": "01J8KA…", "tagNumber": "PGF-0088" },
                     { "animalId": "01J8KB…", "tagNumber": "PGF-0089" } ],
    "pregnancyStatus": "kidded",
    "tasksCreated": ["colostrum_check", "dam_check_24h", "kid_weight_d7"],
    "protocolDuesScheduled": ["PPR d120 ×2", "ET d120 ×2"],
    "emitted": ["kidded", "kid_born×2"] } }
// Failure: 409 DUE_ALREADY_DONE (pregnancy not ongoing) ·
// 400 VALIDATION_FAILED (bornAlive > totalBorn; kids[] length mismatch;
// kiddingDate before serviceDate+140 → 422 override for premature)
```

---

## 4. Cross-Cutting Guarantees
1. **Transactional side effects** — a 2xx means the write *and* its events/stock/ledger/tasks all committed; a non-2xx means none did. No partial states exist.
2. **Idempotency** — same `Idempotency-Key` replayed ⇒ same response, no duplicate kids/doses/expenses.
3. **Audit** — every mutation logs actor, requestId, before/after; `GET` of exports also audited.
4. **Override discipline** — soft biology rules return 422 with a one-time token; the override reason is stored on the record and shown on the timeline. Hard integrity rules (stock, expiry, double-exit) have no override path.
5. **Contract sharing** — `packages/contracts` Zod schemas are the single source of validation truth for browser + server; OpenAPI 3.1 spec generated from them at build time (`/api/docs`, dev-only).

## 5. Approval Gate
- [ ] Conventions: cookie sessions, cursor pagination, error envelope with i18n codes, mandatory Idempotency-Key
- [ ] The 422 **override-with-reason** pattern for soft biology rules (vs hard 409s for integrity)
- [ ] Batch endpoints (`/weights`, `/protocol-administrations`, `/feed-logs`, `/animals/bulk-intake`) as designed
- [ ] Kidding & treatment contracts (§3) — the transaction scope right?

**On approval → Phase 6: Implementation**, starting with **Module 0 (project scaffold + platform: auth, RBAC, audit, settings)**, then module-by-module per the Phase 1 R1 order, each with tests and docs, each awaiting your approval.
