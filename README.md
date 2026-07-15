# Pandora Goat Farm ERP

A livestock management ERP built specifically for Pandora Goat Farm (Birbhum, West Bengal) — the farm's single source of truth for its herd, health, breeding, inventory, finance, and daily operations.

This is **Release 1 (R1)**: the "Digital Herd Book" — everything needed to run the farm day to day. See `docs/Phase-1-Requirements.md` for the full release plan (R1/R2/R3).

## What's built

| Module | Covers |
|---|---|
| **Herd** | Animal registry with QR-tagged digital identity, lineage, weights, pen moves, sale/death/disposal, auto-generated timeline |
| **Breeding** | Heat detection, natural/AI service, inbreeding + underage guards, pregnancy tracking, kidding (auto-creates kids with full lineage), performance analytics |
| **Health & Protocols** | Clinical cases, vitals, isolation, treatments (stock-consuming, withdrawal-tracked), India-standard vaccination/deworming schedule with weight-based dosing |
| **Inventory** | Medicines/vaccines/feed catalog, batch + expiry tracking, FEFO consumption, append-only stock ledger |
| **Feed / Finance / Tasks** | Daily feed register, income/expense ledger with auto-booked sales, task list with recurrence |
| **Dashboard** | One-screen view of herd KPIs, what needs attention, upcoming kiddings, and this month's money |

Full design rationale for every decision lives in `docs/Phase-1-Requirements.md` through `docs/Phase-8-Documentation.md`.

## Stack

Node 24 · NestJS 10 · PostgreSQL 16 (via Prisma) · React 18 + Vite + MUI · TypeScript everywhere. Chosen and justified in `docs/Phase-2-Architecture.md`. Runs as a single process — the API serves the built web app — on the farm's own Mac; no cloud dependency required.

## Prerequisites

- macOS (developed and tested on Monterey 12.7.6, Intel)
- Node.js ≥ 20 (developed on v24)
- PostgreSQL 16 via **[Postgres.app](https://postgresapp.com)** — Homebrew's `postgresql@16` requires a slow source build on unsupported macOS versions; Postgres.app ships precompiled binaries and is the recommended path (see `docs/RUNBOOK.md` §1)

## Quick start (development)

```bash
# 1. Install dependencies (monorepo — npm workspaces)
npm install

# 2. Build the shared contracts package (must happen before the API can import it)
npm run build -w packages/contracts

# 3. Configure environment
cp .env.example .env
# edit .env: DATABASE_URL, PORT, SEED_OWNER_PHONE, SEED_OWNER_PASSWORD, OPS_TOKEN

# 4. Set up the database
npx prisma migrate deploy
npm run seed          # creates the farm profile, 9 roles, protocols, finance categories, and the owner user

# 5. Run it
npm run build -w apps/api && node apps/api/dist/main.js   # API on :3300 (serves the API only until the web app is built)
npm run dev -w apps/web                                    # Vite dev server on :5180, proxies /api to :3300, hot-reloads
```

Open `http://localhost:5180` (dev, hot-reload) or, after `npm run build -w apps/web`, `http://localhost:3300` (single process, what the farm actually runs).

## Running for real (the farm's daily driver)

See **`docs/RUNBOOK.md`** for: launchd auto-start on boot, nightly backups, restoring on a fresh machine, and troubleshooting.

## Using the app

See **`docs/USER-GUIDE.md`** (English + বাংলা) for a walkthrough of every screen, written for the farm owner/manager rather than a developer.

## Repository layout

```
apps/
  api/          NestJS backend — src/modules/{platform bits, herd, breeding, inventory, health, ops}/
  web/          React PWA — src/pages/*, src/locales/{en,bn}.json
packages/
  contracts/    Shared Zod schemas — the single source of validation truth for browser + server
prisma/
  schema.prisma  migrations/   seed.ts
ops/            launchd plists + install script, start scripts
docs/           Phase 1–8 documents (requirements → architecture → …→ testing → documentation)
```

## Testing

```bash
cd apps/api && npx vitest run
```

64 tests (14 unit, 50 integration against a real Postgres instance) covering every business rule and override path. Details and known gaps: `docs/Phase-7-Testing.md`.

## A note on scale

The database is designed to serve 100 goats today and 5000+ later **without a redesign** — see `docs/Phase-3-Database-Design.md` §9–10. Nothing about going from R1 to a larger herd or to Releases 2/3 (sales, purchases, employees, fodder, analytics, AI) requires touching this schema's foundations.
