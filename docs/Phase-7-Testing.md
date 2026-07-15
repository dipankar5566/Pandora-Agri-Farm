# Pandora Goat Farm ERP — Phase 7: Testing

| | |
|---|---|
| **Document** | Phase 7 — Testing (R1) |
| **Version** | 1.0 |
| **Date** | 2026-07-15 |
| **Status** | ✅ Complete — 64/64 tests passing |
| **Scope** | All R1 modules (0–5): Platform, Herd, Breeding, Inventory, Health & Protocols, Feed/Finance/Tasks/Dashboard/Ops |

---

## 1. Testing Strategy (as designed in Phase 2 §3.15)

Tests follow the pyramid the architecture document committed to:

| Layer | What it tests | Tooling | Speed |
|---|---|---|---|
| **Unit** | Business rules expressed as pure functions/schemas — no DB, no HTTP | Vitest | ~20 ms for the whole suite |
| **Integration (e2e)** | Real NestJS app + real PostgreSQL, through HTTP via supertest | Vitest + supertest | ~6 s for the whole suite |

No mocking of the database in integration tests — Phase 2's constraint-heavy schema (CHECKs, triggers, partial unique indexes) is part of correctness, so tests run against the genuine constraint set, not a stand-in. This is the same principle recorded in memory as a standing rule: mocked persistence would let a passing test hide a real migration/constraint break.

Every test file cleans up its own fixtures in `afterAll` (soft-delete-aware deletes, or `session_replication_role = replica` where a table is intentionally append-only, e.g. `stock_movements`). No test leaves orphaned rows in the shared dev database.

## 2. Coverage by Module

### 2.1 Unit — `test/unit/`

| File | What's verified |
|---|---|
| `rbac.spec.ts` (4 tests) | RBAC level aggregation across multiple roles; `none` never satisfies `view`; higher levels satisfy lower requirements |
| `contracts.spec.ts` (14 tests, added this phase) | The Zod schemas that are the single source of validation truth (shared browser+server, Phase 5 §1.4): purchase-price-required-on-purchase, tag format, 0.4–150 kg weight bounds, batch-size caps, natural-service-needs-buck / AI-needs-semen-batch, override-reason minimum length, kidding's `kids[].length === bornAlive` exact-match rule, litter-size ceiling, sale/death exit field requirements, withdrawal-override reason requirement |

### 2.2 Integration (e2e) — `test/e2e/`

| File | Tests | Business rules proven end-to-end |
|---|---|---|
| `platform.e2e.spec.ts` | 8 | Login rejects bad credentials without enumerating users; RBAC denies a worker from user management; idempotency key required + replay returns the original response + payload mismatch is a 409; 5 failed logins lock the account; farm PATCH writes an audit trail and a version snapshot; `/ops/health` reports DB + disk |
| `herd.e2e.spec.ts` | 8 | Auto tag generation (`PGF-####`); duplicate tag rejected; a female cannot be recorded as a sire (DB trigger); a >15% weight jump is blocked unless confirmed; pen moves update the animal's current pen; bulk intake creates estimated-age animals; an animal cannot be exited twice; herd stats aggregate correctly |
| `breeding.e2e.spec.ts` | 9 | Heat → 19-day recheck date computed; service requires buck/semen appropriately; **inbreeding risk (shared ancestor ≤2 gen) blocks without a reason, allows with one**; diagnosis blocked before day 18; **one ongoing pregnancy per doe enforced by the database**; kidding creates kids with full lineage in one transaction, computes stillborn count, cannot be recorded twice; abortion requires a reason; buck/doe performance views compute correctly from raw records |
| `inventory.e2e.spec.ts` | 9 | Expiry mandatory for medicine-class stock-in (DB trigger); FEFO batch ordering; **negative stock is impossible** (DB CHECK via trigger-maintained `qty_remaining`); wastage requires a reason; `consume()` FEFO-picks and records a reference; expiring-batch and below-minimum-stock alert queries |
| `health.e2e.spec.ts` | 6 | Protocol due generation is idempotent and eligibility-filtered; **batch administration computes weight-based doses, consumes stock, marks dues done, schedules next dues, in one transaction**; same-anthelmintic-class rotation nudge (422, overridable); vitals rejected outside goat-plausible ranges; isolation only accepts isolation/hospital/quarantine pens; treatments stamp withdrawal dates and FEFO-consume stock; closing a case as "died" performs the animal's exit |
| `ops.e2e.spec.ts` | 6 | Feed register consumes stock **by delta** on re-save (no double-counting a correction); ledger entry kind/category mismatch rejected; **animal sale auto-books ledger income in the same transaction as the exit**; auto entries are read-only in the ledger; task recurrence schedules the next occurrence on completion; skip requires a reason; the aggregated `/dashboard` call returns all sections; a real `pg_dump` backup runs, is recorded, and the scheduled endpoint requires the ops token |

**Total: 64 tests, 100% passing**, covering every hard business rule and every soft-override path identified in Phases 1, 3, and 5.

## 3. What Is Deliberately Not Yet Automated

Recorded here rather than silently skipped, per the "no placeholder, be honest about gaps" quality rule:

| Gap | Why it's acceptable for R1 | Plan |
|---|---|---|
| **Frontend (React) has no automated tests** | UI is thin — it calls the same validated API and renders server responses; the risk surface is concentrated in the backend, which is fully tested | Add component/interaction tests (Vitest + Testing Library) if the UI grows past its current CRUD-plus-dialog shape |
| **No browser-driven E2E (Playwright)** | Phase 2 §3.15 flagged that recent Playwright versions dropped macOS 12 support; a pinned local version was never installed because manual verification (this session's live curl/browser checks after every module) covered the golden paths | Add Playwright in CI (Linux runner, latest version) once GitHub Actions is wired up |
| **No load/performance testing** | R1 runs a single farm with <100 animals; Phase 3 §9 projected 5-year volumes at 5000 animals are still trivial for Postgres on this hardware | Revisit if/when the farm approaches the thousands-of-animals range |
| **No mutation testing / coverage percentage tooling** | Kept out to honor the "keep the codebase lean" instruction — a coverage tool is a dependency with no business-rule payoff; the coverage matrix in §2 is a manual, rule-by-rule audit instead | Add `@vitest/coverage-v8` only if a future reviewer needs a numeric coverage gate |
| **`ProtocolsService.refreshDues()` runs on-demand, not on a schedule** | Documented as a known deferral back in Module 4 — the pg-boss nightly scheduler arrives with the ops/ deployment hardening work | Wire into the same job runner as the nightly backup |

## 4. How to Run the Suite

```bash
cd "Pandora Agri Farm"
npm run build -w packages/contracts        # contracts must be built first — apps/api imports the compiled dist
set -a && source .env && set +a
cd apps/api
npx vitest run                              # full suite: unit + e2e against the real dev database
npx vitest run test/unit                    # unit only, no DB required, <50ms
npx vitest run test/e2e/breeding.e2e.spec.ts  # a single module
```

E2E tests run against the **real development database** (`pandora_erp`) — there is no separate ephemeral test database in R1 (a deliberate lean simplification given the single-developer, single-Mac context). Every e2e file is responsible for cleaning up its own fixtures; running the suite twice in a row produces identical results.

## 5. Approval Gate

- [ ] Test strategy (unit + real-DB integration, no mocks) accepted
- [ ] The documented gaps (§3) are acceptable trade-offs for R1
- [ ] 64/64 passing is sufficient evidence to proceed to Phase 8

**On approval → Phase 8: Documentation** — README, operations runbook, and a bilingual user guide.
