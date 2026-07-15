# Pandora Goat Farm ERP — Phase 1: Requirement Analysis

| | |
|---|---|
| **Document** | Phase 1 — Requirement Analysis |
| **Project** | Pandora Goat Farm Livestock Management ERP |
| **Version** | 1.0 (Draft for approval) |
| **Date** | 2026-07-13 |
| **Status** | ⏳ Awaiting owner approval |
| **Next phase** | Phase 2 — Software Architecture (starts only after approval) |

---

## 1. Executive Summary

Pandora Goat Farm is a commercial goat farm on ~2.7 acres (Plot No. 2308, Mouza Tantipara, J.L. No. 51, P.S. Raj Nagar, District Birbhum, West Bengal — per the notarized survey map, Blocks A + B of 133 decimals each). The farm currently runs a herd of **fewer than 100 goats** and intends to scale to **5000+** without redesigning its systems.

This project delivers an enterprise-grade Livestock Management ERP that becomes the farm's **single source of truth**: every animal, every treatment, every rupee, every kilogram of feed is recorded once, in one system, and never on paper again.

**Vision statement:** *Make Pandora Goat Farm one of India's most technologically advanced goat farms through complete digital livestock management.*

### 1.1 What "success" means (acceptance at the business level)

1. Every goat on the farm has a permanent digital identity within 30 days of go-live.
2. No health, breeding, or financial event occurs on the farm without a corresponding record.
3. The owner can answer "what is my cost per goat?" and "which does are due to kid this month?" in under 10 seconds.
4. The same database schema serves 100 goats today and 5000+ goats later — verified by design, not by promise.

---

## 2. Current-State Assessment (as elicited from the owner, 2026-07-13)

| Fact | Value | Requirement impact |
|---|---|---|
| Herd size today | < 100 goats | R1 must include a fast **herd digitization / bulk intake** flow for existing animals with unknown exact birth dates (age estimation by dentition) |
| Location | Rural Birbhum, West Bengal | Intermittent internet must be assumed; Bengali is the working language of farm staff |
| UI languages | **English + Bengali (বাংলা)** | Full i18n from day one; every label, alert, and report header translatable; Bengali numerals optional, Indian digit grouping (₹1,00,000) mandatory |
| Hosting | **Self-hosted on the owner's Mac** (macOS Monterey) for now | Architecture must run on a single machine (low memory, no managed cloud services) yet remain portable to a cloud VM with zero code change. Backup discipline becomes critical — the Mac is a single point of failure |
| Daily data entry | **Manager/owner only (1–2 users)**; workers report verbally | UI optimized for one power user doing rapid batch entry (e.g., "weigh 40 goats in one session"). Full RBAC still designed in for later roles. Multi-device offline sync can be deferred to R3, but **offline tolerance on the entry device cannot** |
| Records today | Assumed paper registers / memory | Data migration = guided digitization, not file import |

### 2.1 Deployment constraint — explicitly acknowledged

Hosting on a single Mac is acceptable for R1 with these mandatory mitigations, which are treated as requirements (see NFR-07, NFR-08):

- Automated daily backups to at least one off-machine destination (external disk and/or free-tier cloud storage).
- The application must be reachable from phones on the farm's local network (responsive web app), and optionally remotely via a secure tunnel (e.g., Tailscale) — decided in Phase 2.
- A documented, tested "restore on a new machine in under 1 hour" procedure.

---

## 3. Stakeholders and User Roles (RBAC)

Nine roles are defined now; only **Owner** and **Farm Manager** will be active at go-live. Permissions are per-module with four levels: **None / View / Edit / Approve**.

| # | Role | Primary responsibilities in the system | Active at go-live |
|---|---|---|---|
| 1 | Owner | Everything; only role that can approve finances, delete records (soft), manage users, restore backups | ✅ |
| 2 | Farm Manager | Daily operations: livestock, breeding, health, feed, tasks, purchases | ✅ (may be same person as Owner initially) |
| 3 | Veterinarian | Health, vaccination, deworming, prescriptions; view livestock | Later |
| 4 | Farm Supervisor | Task execution, feed register, attendance | Later |
| 5 | Worker | View assigned tasks, mark done (via supervisor/manager initially) | Later |
| 6 | Sales Team | Customers, quotations, sales, invoices | Later |
| 7 | Purchase Manager | Suppliers, POs, GRN, bills | Later |
| 8 | Accountant | Finance module, payments, reports | Later |
| 9 | Visitor (Read-only) | Dashboards and reports only, no PII, no finance | Later |

RBAC rules that are requirements, not implementation details:

- **RBAC-01** Every API action and every UI element is permission-gated; there is no "admin-only page" reachable by URL guessing.
- **RBAC-02** Every create/update/delete is written to an immutable audit log (who, what, when, before/after values).
- **RBAC-03** Deletion is always soft delete; only the Owner can view/restore soft-deleted records.
- **RBAC-04** Financial approval (payments above a configurable limit, write-offs, animal disposal) requires Owner role.

---

## 4. Scope — Module Inventory, Priorities, and Release Plan

All 22 modules from the brief are in scope. They are prioritized MoSCoW-style and mapped to three releases. **Nothing is dropped — later ≠ never.** Detailed functional requirements, user stories, schemas, and APIs for each module will be produced module-by-module in later phases, per the agreed workflow.

### Release 1 — "Digital Herd Book" (MVP: the farm runs on it)

| # | Module | Priority | Scope in R1 |
|---|---|---|---|
| 2 | **Livestock Management** | Must | Full digital identity: ID scheme + QR code, ear tag, photo, breed, sex, DOB/estimated age, weight log, BCS, source, price, status, location/pen, dam/sire, timeline. Bulk intake wizard for the existing herd |
| 6 | **Health Management** | Must | Case records: symptoms, diagnosis, treatment, medicines used, vitals, isolation flag, recovery/follow-up |
| 7 | **Vaccination Management** | Must | India-standard goat schedule (PPR, ET, HS, FMD, goat pox, CCPP — configurable), per-animal + batch entry, due-date engine, batch no./expiry |
| 8 | **Deworming Management** | Must | Quarterly schedule, weight-based dose calculation, rotation of anthelmintic class, history, reminders |
| 3 | **Breeding Management** | Must | Heat log, service records (natural/AI), buck assignment, pregnancy diagnosis, expected kidding date (service + ~150 days), success rates |
| 4 | **Pregnancy Management** | Must | Stage tracking, due list, complications, abortion recording |
| 5 | **Kid Management** | Must | Birth registration (single/twin/triplet+), birth weight, colostrum flag, growth curve, weaning, kid mortality |
| 9 | **Medicine Inventory** | Must | Stock in/out, batch + expiry, minimum-stock and expiry alerts, consumption auto-deducted from treatments |
| 10 | **Feed Management** | Must (lite) | Daily feed register by group/pen, feed items and cost, consumption totals; formulation & FCR analytics in R2 |
| 15 | **Finance** | Must (lite) | Income/expense book with categories, cost-per-goat rollup; full cash/bank/budget in R2 |
| 17 | **Task Management** | Must (lite) | Auto-generated due tasks (vaccination, deworming, kidding checks) + manual daily checklist |
| 1 | **Dashboard** | Must | Herd KPIs, due lists (kidding, vaccines, deworming), stock alerts, mortality, simple income vs expense |
| — | **Universal Search** | Must | Goat ID / ear tag / medicine / any entity, from one search box |
| 22 | **Settings** | Must (core) | Farm profile, users, roles, backup/restore, audit log viewer, language switch (EN/বাংলা) |

### Release 2 — "Full ERP" (commerce, people, crops)

| # | Module | Scope in R2 |
|---|---|---|
| 13 | Purchase Management | Suppliers, POs, GRN, bills, payments, outstanding |
| 14 | Sales Management | Customers, goat/meat/manure/vermicompost/feed sales, invoices (GST-ready), payments, outstanding |
| 15 | Finance (full) | Cash book, bank book, budgets, P&L, cost per kg weight gain, ROI |
| 16 | Employee Management | Attendance, leave, salary/payroll, task performance |
| 11 | Fodder Management | Plots (mapped to Blocks A/B), crops, sowing/harvest, yield, silage/hay stock, dry-matter accounting |
| 12 | Farm Inventory | Equipment, assets, maintenance/AMC, repair history |
| 18 | Notification Engine | WhatsApp/SMS/email/push for due alerts (needs internet/provider — hence R2) |
| 19 | Reports | Scheduled daily/weekly/monthly/annual packs; PDF/Excel/CSV export |
| 21 | Document Management | Central store for invoices, certificates, insurance, lab reports, photos |

### Release 3 — "Intelligence & Scale"

| # | Module | Scope in R3 |
|---|---|---|
| 20 | Analytics | Mortality trends, FCR, breeding efficiency, disease trends, profitability drill-downs |
| — | AI Features | Weight prediction, mortality-risk scoring, disease early warning, feed & breeding recommendations, inventory/revenue forecasting — only once ≥ 12 months of clean data exists (an AI model on 3 months of data from 100 goats would be decoration, not intelligence) |
| — | Mobile offline-first multi-user | True offline sync across many devices, per-worker logins, voice notes, GPS — when workers get devices |
| — | RFID integration | Reader hardware integration; schema is RFID-ready from R1 |
| — | Milk module | Placeholder in schema (the brief marks milk "future") |

---

## 5. Domain Requirements (Veterinary / Goat-Husbandry Ground Truth)

These are the biological and commercial rules of Indian goat farming that the software must encode. They are requirements because getting them wrong makes the system unusable.

### 5.1 Breeds
- Region default: **Black Bengal** (the dominant Birbhum breed — small body, exceptional prolificacy and meat quality, ~60%+ multiple births). Also supported out of the box: Sirohi, Jamunapari, Barbari, Beetal, Osmanabadi, Boer and crosses. Breed list is user-extensible; crossbreed percentage recordable.

### 5.2 Reproduction constants (configurable defaults, never hard-coded)
- Estrus cycle **18–21 days**; standing heat **24–36 h** → heat-recheck reminder at +19 days after service.
- Gestation **145–155 days** (default 150) → expected kidding = last service date + 150, with a ±5-day watch window.
- Puberty: Black Bengal does ~6–8 months; breeding eligibility gate = age **and** minimum weight (target ~60–70% of adult weight), both configurable.
- Target kidding interval ≈ 8 months (3 kiddings / 2 years); the system flags does exceeding it.
- Repeat-breeder flag after 3 failed services.
- **Inbreeding guard:** the system must warn when a proposed service pairs animals sharing a sire/dam within 2 generations.

### 5.3 Health calendar (India-standard, editable by the vet)
- **PPR** (most critical goat disease in West Bengal): first dose at ~4 months, protection ~3 years.
- **ET (Enterotoxaemia):** ~4 months, annual booster pre-monsoon.
- **HS:** ~6 months, annual pre-monsoon. **FMD:** ~4 months, six-monthly. **Goat Pox:** ~3 months, annual. **CCPP:** where advised.
- **Deworming:** default every 3 months, dose = f(weight, drug), with anthelmintic-class rotation tracked to manage resistance.
- Kid protocol: colostrum within 30 minutes (recorded), navel care, kid mortality is the #1 economic risk — the system must make kid health checks a recurring task automatically on every birth.

### 5.4 Commercial rules
- Sales are predominantly **live-weight based**; price/kg varies by market and festival (Eid demand spike is a planning event the system should surface).
- Mortality/disposal must close the animal's financial ledger (accumulated cost becomes a booked loss).
- Farm KPIs the dashboard must compute from day one: kid mortality % (< 10% target), adult mortality % (< 5%), average daily gain (Black Bengal ~40–60 g/day reference band), kidding rate, cost per goat.

---

## 6. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | **Scale without redesign:** schema and IDs must be valid from 100 to 5000+ animals (UUID/ULID keys, no per-farm assumptions baked into columns, partition-friendly event tables). Target: all list/search screens < 1 s at 5000 animals + 5 years of events |
| NFR-02 | **Bilingual UI (EN/bn)** — every user-facing string externalized; per-user language preference; dates in local format; Indian currency formatting |
| NFR-03 | **Responsive** — one web app usable on desktop, tablet, and phone; light + dark mode; touch-friendly targets for barn use |
| NFR-04 | **Offline tolerance (R1)** — the primary entry device must tolerate network blips (PWA with queued writes); full multi-device sync is R3 |
| NFR-05 | **Security** — hashed passwords, session expiry, role-gated APIs, input validation everywhere, no secrets in code, HTTPS on any non-localhost exposure |
| NFR-06 | **Auditability** — immutable audit trail; soft delete everywhere; version history on animal master records |
| NFR-07 | **Backup** — automated daily backup, retained 30 days, at least one copy off the hosting Mac; backup failure raises a dashboard alert |
| NFR-08 | **Restore** — documented and rehearsed restore to a fresh machine in < 1 hour |
| NFR-09 | **Portability** — runs on the Mac today and on a Linux cloud VM later with configuration changes only |
| NFR-10 | **Data ownership/export** — full export of all data to CSV/Excel at any time; no lock-in even against ourselves |
| NFR-11 | **Timeline completeness** — every event touching an animal (weight, treatment, service, move, sale…) automatically appears on that animal's timeline; no separate data entry for the timeline |
| NFR-12 | **Quality** — Clean Architecture, DDD, repository pattern, SOLID; automated tests for every business rule; no placeholder implementations |

---

## 7. Assumptions

1. One farm, one legal entity — multi-tenancy is not required (schema will still carry a `farm_id` so it's never a redesign).
2. The Mac stays powered and on the network during working hours; brief downtime is acceptable in R1.
3. Ear tags (or tag numbers) either exist or will be applied during herd digitization; QR codes are printed from the system.
4. GST invoicing is needed only from R2 (first sales through the system).
5. The owner supplies breed/vaccination practices actually followed on the farm during module deep-dives; defaults above are the starting point.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Single-Mac hosting: disk failure / theft / OS crash | Total data loss | NFR-07/08 backups are non-negotiable and built in R1, not "later" |
| Single data-entry user: entry stops when the manager is away | Data gaps | Batch/rapid entry UX, back-dated entry supported everywhere, voice-note capture in R3 |
| Old macOS (Monterey) limits tooling versions | Build friction | Phase 2 tech selection will verify every component runs on Darwin 21.6 before it is chosen |
| Scope of 22 modules overwhelms delivery | Nothing ships | Strict R1/R2/R3 gating; R1 is the farm's daily driver within weeks, not months |
| AI features promised before data exists | Wasted effort, mistrust | AI gated on ≥ 12 months of clean operational data (R3) |

## 9. Explicitly Out of Scope (for now)

- Milk production module (schema placeholder only, per brief).
- Multi-farm / multi-tenant SaaS operation.
- Hardware procurement (RFID readers, weighing-scale integration) — schema is ready, integration is R3.
- Accounting statutory filings (GST returns, TDS) — the system produces exportable data for the accountant instead.

---

## 10. Approval Gate

Phase 1 is complete when the owner confirms:

- [ ] The R1 module list is right (anything to pull forward or push back?)
- [ ] The role list and go-live roles (Owner + Farm Manager) are right
- [ ] Domain defaults in §5 broadly match farm practice (fine-tuned per module later)
- [ ] The single-Mac hosting mitigations (§2.1) are accepted

**On approval → Phase 2: Software Architecture** — full technology recommendation (frontend, backend, database, auth, storage, notifications, offline strategy, caching, queue, deployment on the Mac, CI/CD, monitoring, logging, testing), each choice justified against these requirements.
