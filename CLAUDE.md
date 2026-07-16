# CLAUDE.md — Pandora Goat Farm ERP

Livestock ERP for a commercial goat farm in Birbhum, West Bengal. Bilingual (EN/বাংলা), self-hosted on the farm's Mac (macOS 12 Monterey, Intel). Design history lives in `docs/Phase-1…8`; operational procedures in `docs/RUNBOOK.md`. **Keep the codebase lean**: abstraction only where a real rule lives; plain service + Prisma for trivial CRUD; prefer stdlib over new dependencies.

## Repo map

```
apps/api/                NestJS 10 backend (TypeScript, CommonJS, built with tsc)
  src/common/            auth guard (@Perm), Zod pipe, error filter, idempotency, request context
  src/modules/<ctx>/     one dir per bounded context: herd, breeding, health, inventory,
                         sales, purchases, employees, fodder, ops (feed/finance/tasks/dashboard/backup),
                         notifications (+ reports), search, auth, users, roles, settings, audit
  test/unit/             DB-free rule tests        test/e2e/  real-Postgres API tests
apps/web/                React 18 + Vite + MUI PWA — src/pages/*, src/components/*, src/locales/{en,bn}.json
packages/contracts/      Zod schemas = the single validation truth (browser + server). BUILD THIS FIRST.
prisma/                  schema.prisma, migrations/, seed.ts (idempotent upserts)
ops/                     launchd plists (postgres, api, backup 01:00, digest 06:00), install script
docs/                    phase documents, RUNBOOK, USER-GUIDE
```

## Environment quirks (violating these wastes hours)

- **macOS Monterey**: no Docker; Homebrew has no bottles → **never `brew install postgresql`** — Postgres 16 runs from Postgres.app (`/Applications/Postgres.app/Contents/Versions/16/bin`). See RUNBOOK §1.
- **API port 3300** (3000 is occupied by another local app). Web dev server 5180 proxies `/api`. In production the API serves `apps/web/dist` itself — one process.
- **tsx/esbuild breaks NestJS DI** (no decorator metadata). API builds with `tsc`; vitest uses `unplugin-swc` with `module.type: 'es6'`. Rebuild (`npm run build -w apps/api`) before running `dist` — stale dist 404s new routes.
- Build order: `packages/contracts` before `apps/api` (api imports the compiled dist).
- Env loads from `.env` via `set -a && source .env` — nothing reads it automatically outside launchd wrappers.

## Architecture rules

1. **Modular monolith, flat AppModule.** New context = `src/modules/<name>/` with `<name>.service.ts` + `<name>.controller.ts`, registered in `app.module.ts`. No per-context Nest modules, no repository-interface ceremony unless the domain genuinely needs swap-ability.
2. **Validation lives in `packages/contracts`** as Zod schemas (`XxxInput` + inferred type). Controllers use `@Body(new ZodPipe(XxxInput))`. Never validate in two places.
3. **RBAC**: every route gets `@Perm('<module>', 'view'|'edit'|'approve')`. Adding a permission module = update `MODULES` in contracts **and** the `MATRIX` in `prisma/seed.ts`, then reseed (upserts add new rows without touching farm edits).
4. **Transactional side effects or nothing**: a mutation's stock movements, ledger entries, timeline events, tasks, and audit rows commit in the same `$transaction`. A 2xx means all of it happened.
5. **Money is cash-basis**: ledger entries are created only from payments (sales/purchases/payroll) or inside the exit fast path — always with `refType`/`refId`; auto entries are read-only in the ledger API (`AUTO_ENTRY_READONLY`).
6. **Append-only tables** (`stock_movements`, `audit_log`): corrections are counter-rows, never UPDATE/DELETE (DB triggers enforce it). Stock truth = movements; `qty_remaining` is trigger-maintained with a CHECK that makes negative stock impossible.
7. **Soft delete everywhere** (`deletedAt`), uniqueness via partial indexes `WHERE deleted_at IS NULL`. FKs are RESTRICT — never cascade-destroy history.
8. **IDs**: ULID `char(26)` PKs via `ulid()`. Human-facing numbers (PGF-0001, INV-0001, PUR-0001) come from `settings` counters (`tag.next`, `invoice.next`, `purchase.next`) incremented in-transaction with collision loops — never used as join keys.
9. **Timeline** (`animal_events`) is written only by services inside their transactions — never by user input. Every event carries `summaryCode` + `summaryParams` for i18n rendering.
10. **Override discipline**: soft biology/business rules → 422 `RULE_OVERRIDE_REQUIRED` with `params.warnings[]`, proceed only with `confirmOverride: true` + `overrideReason` (stored). Hard integrity rules → 409, no override path exists.
11. **Audit**: explicit `this.audit.log(action, entityType, id, before, after, tx)` in every mutating service method; master-record updates also call `audit.version(...)`. Tests assert the rows.
12. **Migrations**: `npx prisma migrate dev --create-only`, append hand-written SQL (CHECKs, triggers, partial indexes) to the draft, then `migrate deploy`. **Never edit an applied migration** (checksum drift — recovery documented in RUNBOOK §4). In trigger SQL, Prisma enum types are quoted PascalCase: `"ItemType"`, not `item_type`.
13. **i18n**: backend returns `errors.*`/`timeline.*`/`warnings.*` codes; UI translates. Every new string goes in **both** `en.json` and `bn.json` in the same change. Money renders via `inr()` (en-IN grouping).
14. **Service worker never caches `/api/`** — livestock data is live-or-fail, never silently stale.

## Naming conventions

- DB: snake_case tables/columns via `@@map`/`@map`; Prisma models/fields camelCase; enums PascalCase type, lowercase values (`AnimalStatus.active`).
- API: plural kebab-case resources (`/sale-invoices`, `/protocol-dues`); actions as sub-posts (`/:id/cancel`, `/:id/pay`); every mutation requires the `Idempotency-Key` header.
- Error codes SCREAMING_SNAKE (`STOCK_INSUFFICIENT`) with messageCode `errors.stock_insufficient`.
- Files: `<context>.service.ts` / `<context>.controller.ts`; React pages `PascalCase.tsx` in `src/pages/`.

## Test expectations

- Run: `cd apps/api && set -a && source ../../.env && set +a && npx vitest run` (Postgres must be up; contracts built). Suite is **95 tests, all green** — keep it that way; new business rules ship with tests in the same commit.
- Unit tests (`test/unit/`) are DB-free and test contracts/pure logic. E2E (`test/e2e/`) run the real Nest app + real Postgres via supertest — constraints and triggers are part of what's being tested, so no DB mocking, ever.
- Every e2e file **cleans up its own fixtures in `afterAll`** (children before parents; `SET session_replication_role = replica` to bypass append-only triggers for cleanup only). Exit-sale fixtures also need the sale-chain cleanup block (lines → payments → ledger by `refType: 'sale_payment'` → invoices).
- Specs are **self-healing**: if a spec computes from accumulated state (e.g. payroll from attendance), pre-clean stale fixtures in `beforeAll` rather than assuming a pristine DB.
- Time-sensitive fixtures use relative dates (`past(n)`/`future(n)`/last-month helpers) — never hardcoded calendar dates.

## Commands

```bash
npm run build -w packages/contracts   # always first after contract changes
npm run build -w apps/api && node apps/api/dist/main.js   # API on :3300
npm run dev -w apps/web               # Vite dev :5180 (hot reload, /api proxy)
npm run build -w apps/web             # production bundle served by the API
npm run seed                          # idempotent: roles, breeds, protocols, categories, counters
```
