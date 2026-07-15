# Pandora Goat Farm ERP — Phase 2: Software Architecture

| | |
|---|---|
| **Document** | Phase 2 — Software Architecture |
| **Version** | 1.0 (Draft for approval) |
| **Date** | 2026-07-13 |
| **Status** | ⏳ Awaiting owner approval |
| **Inputs** | Phase 1 Requirements (approved 2026-07-13) |
| **Next phase** | Phase 3 — Database Design |

---

## 1. Verified Host Environment (measured, not assumed)

The R1 production host is the owner's Mac. Audited 2026-07-13:

| Property | Value | Architectural consequence |
|---|---|---|
| CPU / RAM | Intel x86_64, 4 cores, **8 GB RAM** | The whole stack must idle under ~1.5 GB. Rules out heavyweight JVM stacks, Kubernetes, Elasticsearch, Redis-as-required |
| macOS | **12.7.6 Monterey** | Docker Desktop no longer supports Monterey → **no containers in R1; services run natively**. Some latest-version tools have dropped Monterey — every choice below is version-pinned accordingly |
| Disk | 234 GB, ~35 GB free | Animal photos must be compressed on upload; backups rotated, not hoarded locally |
| Installed | Node **v24.11.0**, npm 11, git 2.43, Homebrew, Python 3.13 | Node 24 runs here today → a Node/TypeScript stack has zero install risk |
| Not installed | Docker, PostgreSQL | Postgres will be installed natively (§9.1, with fallbacks) |

---

## 2. Architecture Style: Modular Monolith with Clean Architecture

### 2.1 The decision

One deployable backend application, internally divided into DDD bounded contexts, with strict Clean Architecture layering inside each context. **Not** microservices.

**Why (against the alternatives):**

- **Microservices — rejected.** 22 modules ≠ 22 services. One farm, 1–2 users, one 8 GB machine. Microservices would add network failure modes, distributed transactions, and operational burden with zero benefit at any scale this farm will reach (5000 goats ≈ ~1–2 M rows/year — a small database).
- **Plain CRUD monolith — rejected.** The domain is rule-heavy (gestation windows, dose calculation, anthelmintic rotation, inbreeding checks, stock deduction on treatment). Business rules must live in a domain layer that is testable without a database, or the quality rules in the brief (SOLID, DDD, testing) are just words.
- **Modular monolith — chosen.** Single process, but module boundaries are enforced (a module may only import another module's public API). If one context ever needs to scale independently, it can be extracted — the seams already exist.

### 2.2 Bounded contexts (the 22 modules grouped by domain language)

| Context | Modules it owns | Core aggregate(s) |
|---|---|---|
| **Herd** | Livestock, Kid Management | `Animal` (identity, lineage, status, timeline) |
| **Health** | Health, Vaccination, Deworming, Pregnancy monitoring | `HealthCase`, `ProtocolSchedule` |
| **Breeding** | Breeding, Pregnancy | `BreedingCycle` (heat → service → diagnosis → kidding) |
| **Nutrition** | Feed, Fodder | `FeedPlan`, `FodderPlot` |
| **Inventory** | Medicine Inventory, Farm Inventory | `StockItem`, `StockMovement` |
| **Commerce** | Purchase, Sales, Customers/Suppliers | `PurchaseOrder`, `SaleInvoice` |
| **Finance** | Finance | `LedgerEntry`, `CostCenter` |
| **Workforce** | Employee, Task Management | `Employee`, `Task` |
| **Platform** (cross-cutting) | Dashboard, Notifications, Reports, Analytics, Documents, Search, Settings, Auth/RBAC, Audit | — |

### 2.3 Layers inside every context

```
┌──────────────────────────────────────────────────────────┐
│ Interface layer      controllers, DTO validation, RBAC    │
│                      guards, i18n of messages             │
├──────────────────────────────────────────────────────────┤
│ Application layer    use-cases (commands/queries),        │
│                      transactions, domain-event dispatch  │
├──────────────────────────────────────────────────────────┤
│ Domain layer         entities, value objects, domain      │
│                      rules (NO framework, NO db imports)  │
├──────────────────────────────────────────────────────────┤
│ Infrastructure       repository implementations (Prisma), │
│                      file storage, notification adapters  │
└──────────────────────────────────────────────────────────┘
Dependency rule: arrows point inward only. Domain knows nothing above it.
```

- **Repository pattern:** domain and application layers depend on repository *interfaces*; Prisma implementations live in infrastructure. Business rules are unit-testable with in-memory fakes.
- **Domain events** are the backbone of NFR-11 (automatic animal timeline): `AnimalWeighed`, `TreatmentGiven`, `ServiceRecorded`, `KiddingOccurred`, `AnimalSold`… Every event is (a) appended to the animal's timeline, (b) written to the audit log, (c) allowed to trigger follow-ups (e.g., `KiddingOccurred` → auto-create kid records + colostrum task + dam health-check task). One mechanism powers timeline, audit, and task automation.

### 2.4 System overview

```
                     Farm Wi-Fi / LAN            (later: Tailscale for remote)
┌─────────────┐   ┌─────────────┐   ┌──────────────────────────────────────┐
│ Owner phone │   │ Manager     │   │  Mac (macOS 12, production host R1)  │
│ (PWA,       │──▶│ laptop      │──▶│  ┌────────────────────────────────┐  │
│  QR camera) │   │ (browser)   │   │  │ Caddy :443 (LAN TLS, static)   │  │
└─────────────┘   └─────────────┘   │  ├────────────────────────────────┤  │
                                    │  │ NestJS API (Node 24) :3000     │  │
        offline outbox              │  │  ├ 9 bounded-context modules   │  │
        (IndexedDB) syncs           │  │  ├ pg-boss jobs (reminders,    │  │
        when back online            │  │  │   schedules, backups)       │  │
                                    │  │  └ local file storage (photos) │  │
                                    │  ├────────────────────────────────┤  │
                                    │  │ PostgreSQL 16 :5432            │  │
                                    │  └────────────────────────────────┘  │
                                    │  nightly: pg_dump + files ─▶ external│
                                    │  disk + Google Drive (rclone)        │
                                    └──────────────────────────────────────┘
```

---

## 3. Technology Recommendations (each with WHY and rejected alternatives)

### 3.1 Language & runtime — **TypeScript everywhere on Node.js 24**

- **Why:** Node 24 is already installed and proven on this Mac (zero platform risk). One language across backend, frontend, and shared validation/domain types means one developer (you + me) maintains one mental model, and DTO types are shared — the API and UI can never drift apart silently.
- **Rejected:** Python/Django (second language for the frontend anyway, weaker end-to-end type sharing); Java/Spring (RAM footprint hostile to an 8 GB machine); PHP/Laravel (weaker typed-domain-model story for a rule-heavy domain).

### 3.2 Backend framework — **NestJS 10**

- **Why:** NestJS is architecturally opinionated in exactly the shape Phase 1 demands: modules (→ bounded contexts), dependency injection (→ repository interfaces swap cleanly), guards (→ RBAC on every route by construction), pipes (→ validation on every DTO by construction), and a built-in event bus (→ domain events). It is the mainstream way to do Clean Architecture in Node — future developers can be hired for it.
- **Rejected:** Express/Fastify bare (we'd hand-roll DI, module boundaries, guards — reinventing NestJS badly); Next.js API routes (couples backend lifecycle to the frontend, poor fit for background jobs).

### 3.3 Database — **PostgreSQL 16**

- **Why:** the Phase 1 non-negotiable is *100 → 5000+ goats with no redesign*. Postgres gives real foreign keys and CHECK constraints (data integrity is animal-welfare-critical: a dose or a due date must not be silently wrong), transactional DDL for safe migrations, JSONB for flexible attachments/attributes, full-text search for universal search (no Elasticsearch needed), and a straight lift-and-shift path to any managed cloud Postgres later. Runs comfortably in ~200 MB RAM at this scale.
- **Rejected:** SQLite (genuinely tempting for a single Mac — but multi-user R2/R3, row-level concurrency, and managed-cloud migration would eventually force a dialect migration; better to start on the destination engine); MySQL (no transactional DDL, weaker JSON/FTS); MongoDB (this is a heavily relational domain — lineage, ledgers, stock movements — document stores fight the data, and the brief demands a normalized design).

### 3.4 ORM / migrations — **Prisma**

- **Why:** declarative schema = reviewable ER model in one file; generated types keep repository implementations honest; `prisma migrate` gives versioned, replayable migrations (the schema history the brief asks for). Prisma ships pre-built engines for darwin-x64 — verified available for this Mac.
- **Guardrail:** Prisma is confined to the infrastructure layer behind repository interfaces (per §2.3), so the ORM is replaceable and domain tests never touch it.
- **Rejected:** TypeORM (weaker migration story, decorator entities leak framework into domain); raw SQL everywhere (no type safety, high defect risk across 22 modules).

### 3.5 Frontend — **React 18 + Vite + MUI (Material UI) + TanStack Query + react-i18next**, as a **PWA**

- **Why React+Vite:** largest ecosystem, fast dev loop on modest hardware, and I can maintain it efficiently. **Why MUI:** the brief explicitly requests Material Design; MUI ships accessible components, light/dark theming, and Bengali-capable typography out of the box. **Why TanStack Query:** server-state caching, optimistic updates, and retry/queue behavior that underpins offline tolerance. **Why react-i18next:** mature i18n with lazy-loaded `en`/`bn` bundles; every string externalized from day one (NFR-02).
- **PWA (vite-plugin-pwa/Workbox):** installable full-screen app on the owner's phone with camera/QR access, static assets cached for instant loads on farm Wi-Fi, and an **outbox pattern** — writes made during a network blip are queued in IndexedDB and replayed with idempotency keys when connectivity returns (NFR-04). Full multi-device sync stays in R3 as agreed.
- **Rejected:** React Native / Flutter native app (a second codebase and app-store overhead for R1's single user; PWA delivers camera + QR + offline tolerance today — native remains the R3 option if worker devices arrive); Angular/Vue (fine tools, smaller advantage; MUI+React ecosystem fit is stronger).

### 3.6 Authentication & RBAC — **self-hosted sessions: Argon2id + HTTP-only cookies; CASL for permissions**

- **Why:** the system must authenticate on the farm LAN even when the internet is down — an external IdP (Auth0/Firebase/Cognito) would make login depend on WAN connectivity and add cost. Session cookies (HTTP-only, SameSite) are simpler and safer than hand-rolled JWT refresh flows for a same-origin web app. Argon2id is the current password-hashing standard. CASL expresses the 9-role × per-module × (None/View/Edit/Approve) matrix declaratively, enforced in NestJS guards **and** reused in the UI to hide what a role can't do (RBAC-01).
- **Rejected:** external IdPs (offline requirement, cost, data-residency); JWT-in-localStorage (XSS-exposed, needless for same-origin).

### 3.7 File/photo storage — **local filesystem behind a `StorageProvider` interface; sharp for image processing**

- **Why:** photos and documents on local disk under the app's data directory, addressed by content hash; `sharp` compresses uploads (goat photos ~200 KB, not 4 MB — protects the 35 GB free disk). The interface has exactly two implementations planned: `LocalDiskStorage` (R1) and `S3CompatibleStorage` (cloud later) — NFR-09 portability by construction.
- **Rejected:** storing blobs in Postgres (bloats backups, slows dumps); MinIO on the Mac (another always-on service on 8 GB for zero R1 benefit).

### 3.8 Background jobs, scheduling & queue — **pg-boss (Postgres-backed)**

- **Why:** the reminder engine (vaccination due, deworming due, kidding watch, expiry alerts) and nightly backups need durable scheduled jobs. pg-boss stores jobs in Postgres — **no Redis, no extra service**, jobs survive restarts, and everything is captured by the same backup. At farm scale (thousands of jobs/day at 5000 goats) it is far below pg-boss limits.
- **Rejected:** BullMQ (requires Redis — a whole extra service on 8 GB to do what Postgres already can); OS cron alone (no retries, no dead-letter, invisible to the app).

### 3.9 Caching — **in-process LRU only (R1)**

- **Why:** Postgres is on localhost; queries at this scale return in single-digit milliseconds. A cache tier now is complexity without measurable benefit. Dashboard KPI queries get a short in-process TTL cache. Redis is a documented *upgrade path* if a future cloud deployment measures a need — not a default.

### 3.10 Notifications — **R1: in-app alert center + Web Push. R2: WhatsApp Cloud API + MSG91 (SMS) + Nodemailer (email), behind a `NotificationChannel` interface**

- **Why:** R1's single user sees the dashboard daily; in-app + free Web Push covers due alerts without external dependencies. In R2, WhatsApp Cloud API is the channel Indian farm suppliers/vets actually read; MSG91 is a reliable Indian SMS gateway with DLT compliance; all channels implement one interface so adding a channel never touches business logic.

### 3.11 Universal search — **Postgres full-text + trigram (`pg_trgm`) indexes**

- **Why:** one search box over goats, tags, medicines, suppliers, customers, invoices (Phase 1 requirement) is well within Postgres FTS at this data size — typo-tolerant via trigram similarity, zero extra services. Elasticsearch/Meilisearch rejected: another service, another failure mode, for < 100 ms gains we don't need.

### 3.12 Deployment & process management — **launchd (native) + Caddy reverse proxy; git-pull deploys**

- **Why:** launchd is macOS-native supervision — API and Postgres start on boot and restart on crash, no extra tooling. Caddy serves the built PWA and terminates TLS on the LAN (phones require HTTPS for camera/PWA features; Caddy's internal CA handles local certs). Deploy = `git pull && npm ci && prisma migrate deploy && launchctl kickstart` wrapped in one `deploy.sh`.
- **Cloud path (NFR-09):** the same repo deploys to a single Ubuntu VM (systemd instead of launchd, managed Postgres or native, Caddy with Let's Encrypt). Nothing in the code knows which host it's on — only `.env` changes.
- **Rejected:** Docker (unsupported on Monterey — decided by the platform, not by preference); pm2 (fine tool, but launchd already does supervision natively and survives reboots without extra setup).

### 3.13 CI/CD — **GitHub (private repo) + GitHub Actions**

- **Why:** the repo is not yet under git — Phase 6 begins with `git init`. GitHub Actions runs lint + typecheck + unit + API tests on every push (free tier is ample); a green main branch is the only thing `deploy.sh` will pull. This also makes GitHub an off-site copy of the code (not the data — data backup is §5).

### 3.14 Monitoring & logging — **pino structured logs + rotation; `/health` endpoint; job-watchdog alerts**

- **Why:** proportionate to a single-host system: pino JSON logs (fast, greppable) rotated to protect disk; `/health` checks DB + disk + last-backup age; a pg-boss watchdog turns *silent* failures (backup didn't run, reminder engine stalled) into loud dashboard alerts. Grafana/Prometheus rejected for R1 — monitoring stack heavier than the app it monitors; revisit in cloud.

### 3.15 Testing — **Vitest (domain/unit + API integration via supertest) + Playwright (pinned ≤ 1.49 for Monterey) for E2E; Testcontainers-style throwaway Postgres schema per test run**

- **Why:** the testing pyramid matches the architecture — domain rules (dose calculation, kidding dates, rotation logic, RBAC matrix) get exhaustive framework-free unit tests; each module's API gets integration tests against a real Postgres test schema (constraint behavior is part of correctness); critical flows (register goat → record service → kidding → kids created + tasks fired) get E2E tests. **Note:** recent Playwright versions dropped macOS 12 — we pin a Monterey-compatible version locally; CI runs the latest on Linux.

### 3.16 Stack summary

| Concern | Choice | Version pin (Monterey-safe) |
|---|---|---|
| Runtime | Node.js | 24.x (installed, verified) |
| Backend | NestJS + TypeScript | 10.x / TS 5.x |
| Database | PostgreSQL | 16.x |
| ORM/migrations | Prisma | 5.x/6.x (darwin-x64 engines verified available) |
| Frontend | React + Vite + MUI + TanStack Query + react-i18next | React 18, MUI 6 |
| Offline | PWA (Workbox) + IndexedDB outbox | — |
| Auth | Argon2id + cookie sessions + CASL | — |
| Files | Local disk + sharp (S3 interface for later) | — |
| Jobs/queue | pg-boss | 10.x |
| Cache | in-process LRU | — |
| Search | Postgres FTS + pg_trgm | — |
| Proxy/TLS | Caddy | 2.x |
| Supervision | launchd | native |
| CI | GitHub Actions | — |
| Logging | pino + rotation | — |
| Tests | Vitest, supertest, Playwright | Playwright pinned ≤ 1.49 locally |

---

## 4. Cross-Cutting Architectural Mechanisms

1. **Audit & soft delete (RBAC-02/03, NFR-06):** every table carries `created_at/by`, `updated_at/by`, `deleted_at/by`; a Prisma middleware converts deletes to soft deletes and appends before/after images to an append-only `audit_log`. Master-record edits (animal identity) also write `record_versions` rows — full version history.
2. **Domain-event bus (NFR-11):** in-process, transactional (events commit with the data or not at all); consumers: timeline writer, audit writer, task generator, notification dispatcher.
3. **i18n (NFR-02):** backend returns message *codes*; the UI translates. Locale files `en.json`/`bn.json` are part of the definition of done for every module. Indian number/currency formatting via `Intl` with `en-IN`/`bn-IN`.
4. **Idempotent writes:** every mutating request carries a client-generated idempotency key — the same mechanism serves double-tap protection on flaky Wi-Fi (R1) and offline replay (R3).
5. **IDs:** all primary keys are ULIDs (sortable, offline-generatable — an offline device in R3 can create records with no collision risk). Human-facing IDs (goat tag `PGF-0001`, invoice `INV-2026-0001`) are separate, farm-configurable sequences — satisfying both machines and humans.

## 5. Backup Architecture (NFR-07/08 — designed, not hoped)

- **Nightly (pg-boss, 01:00):** `pg_dump -Fc` + incremental rsync of the files directory → (a) external disk if mounted, (b) **rclone → the owner's Google Drive** (encrypted with rclone crypt). 30 daily + 12 monthly retained.
- **Backup watchdog:** if the last successful backup is > 26 h old, the dashboard shows a red banner and a Web Push fires. Silence is never assumed to be success.
- **Restore drill:** `restore.sh` rebuilds the full system (deps + DB + files) on a fresh machine; rehearsed once before go-live and quarterly after — that's what makes NFR-08's "< 1 hour" a fact.

## 6. Security Architecture Summary

LAN-first with TLS via Caddy; remote access only via Tailscale (no ports forwarded on the home router — the app is never exposed to the public internet in R1). Argon2id password hashing; HTTP-only SameSite cookies; CASL-guarded APIs (deny-by-default); class-validator DTO validation on every input; Prisma parameterization (no SQL injection surface); rate-limited login; secrets in `.env` (never committed); audit log on every mutation; macOS FileVault full-disk encryption recommended on the host (owner action).

## 7. Repository Structure (npm workspaces monorepo)

```
pandora-erp/
├─ apps/
│  ├─ api/          # NestJS — src/modules/{herd,health,breeding,nutrition,
│  │                #   inventory,commerce,finance,workforce,platform}/
│  │                #   each: domain/ application/ infrastructure/ interface/
│  └─ web/          # React PWA — src/{modules,components,i18n/{en,bn},lib}
├─ packages/
│  ├─ contracts/    # shared DTO types + validation schemas (API ⇄ UI)
│  └─ domain-core/  # shared value objects (Weight, Money, TagNumber, dates)
├─ prisma/          # schema.prisma + migrations/
├─ ops/             # deploy.sh, restore.sh, launchd plists, Caddyfile
└─ docs/            # these phase documents + per-module docs
```

## 8. Architecture Risks

| Risk | Mitigation |
|---|---|
| Homebrew has dropped Monterey to unsupported tier → `brew install postgresql@16` may build from source (slow) or fail | Three-step fallback verified in Phase 6 before anything else: brew bottle → **Postgres.app** (ships Monterey-compatible builds) → EDB installer. Installation is step 0 of implementation; we prove it before writing code |
| 8 GB RAM ceiling | Budget: Postgres ~300 MB, API ~300 MB, Caddy ~30 MB — headroom verified under load test in Phase 7 |
| Mac sleeps → app unreachable / jobs missed | `caffeinate`/Energy Saver settings documented in ops runbook; pg-boss catches up missed schedules on wake |
| 35 GB free disk | sharp compression, log rotation, backup rotation, disk gauge on dashboard with alert at 80% |

## 9. Approval Gate

- [ ] Modular monolith + Clean Architecture/DDD approach (§2)
- [ ] The stack (§3.16) — especially: PostgreSQL over SQLite, PWA over native app in R1, self-hosted auth, no Docker on Monterey
- [ ] Backup design (§5) — needs an external disk (any USB drive) and consent to use your Google Drive for encrypted off-site backups
- [ ] GitHub private repo for code + CI

**On approval → Phase 3: Database Design** — full ER model, table definitions, constraints, indexes, audit/versioning tables for all R1 modules.
