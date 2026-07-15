# Pandora Goat Farm ERP — Phase 3: Database Design

| | |
|---|---|
| **Document** | Phase 3 — Database Design |
| **Version** | 1.0 (Draft for approval) |
| **Date** | 2026-07-15 |
| **Status** | ⏳ Awaiting owner approval |
| **Engine** | PostgreSQL 16 (per approved Phase 2) |
| **Migrations** | Prisma Migrate (versioned, replayable) |
| **Next phase** | Phase 4 — UI Wireframes |

---

## 1. Design Principles (applied to every table)

1. **Keys:** every PK is a **ULID** (`char(26)`) — sortable by creation time, generatable offline (R3), no sequence contention at any scale. Human-facing identifiers (goat tag `PGF-0001`, invoice numbers) are *separate*, farm-configurable, never used as join keys.
2. **Standard columns** on every business table (written once here, implied everywhere):
   `farm_id` (FK → farms — single farm today, multi-farm never needs redesign), `created_at timestamptz`, `created_by` (FK → users), `updated_at`, `updated_by`, `deleted_at`, `deleted_by`.
3. **Soft delete:** `deleted_at IS NULL` = live row. All unique constraints are **partial unique indexes** `WHERE deleted_at IS NULL` (so a deleted tag number can be reissued without violating uniqueness). Only Owner role can see/restore deleted rows (RBAC-03).
4. **No destructive cascades:** all FKs are `ON DELETE RESTRICT`. History is never silently destroyed by deleting a parent.
5. **Closed sets are Postgres `ENUM`s** (sex, statuses); **farm-extensible sets are lookup tables** (breeds, feed items, finance categories) with bilingual `name` / `name_bn` columns.
6. **Money** is `numeric(12,2)` (₹, no floats ever). **Weights** are `numeric(6,3)` kg. **Dates of biology** (birth, service, kidding) are `date`; **operational moments** are `timestamptz`.
7. **CHECK constraints encode biology** — the database itself refuses impossible data (a 300 kg goat, a BCS of 9, a temperature of 60 °C), because bad data here mis-doses animals.
8. **Audit & versioning:** every mutation appends to `audit_log`; master-record edits also snapshot into `record_versions` (§8).
9. **Timeline is derived, never hand-entered:** `animal_events` is written by domain-event consumers only (NFR-11).

---

## 2. ER Overview (R1 core — crow's-foot, ASCII)

```
                    breeds ──< animals >── pens >── sheds
                                │  │ │ └────────< pen_movements
              (dam_id/sire_id) ─┘  │ └──────────< weight_records
        self-referencing lineage   ├────────────< animal_events (timeline)
                                   ├────────────< animal_exits (sale/death/disposal)
                                   ├──────────── kid_records (1:1, kids only)
                                   │
   heat_records >──┐               │
                   ├──< services >─┤ (doe_id, buck_id)
   pregnancy_diagnoses >── services│
        pregnancies >── services   │
             │                     │
        kiddings ──< kid_records ──┘ (kid = a new animals row)
                                   │
      health_cases >───────────────┤        health_protocols
        │  ├──< health_case_vitals │              │
        │  └──< lab_reports        │        protocol_dues >── protocol_administrations
        └──< treatments >──────────┤              │                │
                  │                └──────────────┴────────────────┘
                  ▼
   items ──< item_batches ──< stock_movements (purchase/consume/adjust/waste)
     │            └── suppliers
     └──< feed_logs >── pens
                  │
   finance_categories ──< ledger_entries (ref → animal/exit/batch/feed_log)
   users ──< tasks (ref → protocol_dues/animals)   users ──< sessions
   roles ──< role_permissions        user_roles >── users
   audit_log (append-only)   record_versions   attachments   alerts   settings
```

Full per-context definitions follow. Types shown compactly; standard columns (§1.2) omitted for brevity but present on every table.

---

## 3. Platform Context (auth, RBAC, audit, files, settings)

### 3.1 `farms`
| Column | Type | Constraints |
|---|---|---|
| id | char(26) | PK |
| name | text | NOT NULL — "Pandora Goat Farm" |
| address, district, state, pin | text | Birbhum, West Bengal (from land record) |
| plot_details | jsonb | mouza/JL/plot numbers, blocks A/B |
| tag_prefix | text | default `'PGF'` |
| default_locale | text | CHECK IN ('en','bn') |
| timezone | text | default `'Asia/Kolkata'` |

### 3.2 `users`
| Column | Type | Constraints |
|---|---|---|
| id | char(26) | PK |
| full_name | text | NOT NULL |
| phone | text | UNIQUE (partial), NOT NULL — login identifier (rural reality: phone > email) |
| email | text | UNIQUE (partial), nullable |
| password_hash | text | NOT NULL (Argon2id) |
| locale | text | CHECK IN ('en','bn'), default 'bn' |
| is_active | boolean | default true |
| failed_login_count / locked_until | int / timestamptz | brute-force lockout |

### 3.3 `roles`, `role_permissions`, `user_roles`
- `roles`: 9 seeded rows (owner, farm_manager, veterinarian, supervisor, worker, sales, purchase_manager, accountant, visitor) + `is_system boolean` (seeded roles not deletable).
- `role_permissions(role_id, module text, level)` — `level` ENUM `perm_level` (`none`,`view`,`edit`,`approve`); UNIQUE(role_id, module). This *is* the RBAC matrix, editable from Settings by Owner.
- `user_roles(user_id, role_id)` — UNIQUE pair; a user may hold multiple roles (owner is also manager today).

### 3.4 `sessions`
`id (PK, random token hash)`, `user_id FK`, `created_at`, `expires_at`, `ip`, `user_agent`. Cookie stores the token; server stores only its hash.

### 3.5 `audit_log` (append-only — no UPDATE/DELETE granted to the app role)
| Column | Type | Notes |
|---|---|---|
| id | bigint identity | PK (insert-ordered; ULID unnecessary here) |
| at | timestamptz | NOT NULL default now() |
| actor_id | char(26) | FK users, nullable for system jobs |
| action | text | CHECK IN ('create','update','soft_delete','restore','login','logout','approve','export','backup') |
| entity_type / entity_id | text / char(26) | what was touched |
| before / after | jsonb | row images (nulls for create/delete respectively) |
| request_id | uuid | correlates with pino logs |

**Index:** `(entity_type, entity_id, at desc)`, `(actor_id, at desc)`. Table is partition-ready by month (`at`) — activated only if it ever grows past ~10 M rows.

### 3.6 `record_versions`
`(id PK, entity_type, entity_id, version_no int, snapshot jsonb, changed_by, changed_at)` — UNIQUE(entity_type, entity_id, version_no). Written for **master records only** (animals, items, protocols, users, roles) on every update: full version history per the brief, without bloating high-volume event tables.

### 3.7 `attachments`
`(id PK, entity_type, entity_id, kind ENUM attachment_kind ('photo','document','invoice','lab_report','certificate','insurance','other'), file_path text, content_hash char(64) UNIQUE-per-farm, mime text, size_bytes int CHECK (size_bytes <= 26214400), caption, caption_bn)`. Content-hash addressing = automatic dedupe; 25 MB cap protects the 35 GB disk.

### 3.8 `alerts`, `settings`, `idempotency_keys`
- `alerts(id, type text, severity ENUM ('info','warning','critical'), title_code text, params jsonb, entity_type, entity_id, user_id nullable = broadcast, created_at, read_at, resolved_at)` — the dashboard alert center; `title_code` + params render in the viewer's language (i18n rule §4.3 of Phase 2).
- `settings(key text PK, value jsonb, updated_by, updated_at)` — gestation days override, min-stock defaults, backup config, tag sequence counters.
- `idempotency_keys(key uuid PK, user_id, request_hash, response jsonb, created_at)` — double-tap/offline-replay protection; rows expire after 48 h (pg-boss cleanup job).

---

## 4. Herd Context

### 4.1 `breeds` (lookup, seeded)
`(id PK, name, name_bn, gestation_days int NOT NULL DEFAULT 150 CHECK BETWEEN 140 AND 160, adult_weight_kg numeric(6,3), puberty_age_days int, kidding_interval_target_days int DEFAULT 240, notes)`. Seeded: **Black Bengal** (default), Sirohi, Jamunapari, Barbari, Beetal, Osmanabadi, Boer, Boer-cross, Local/Nondescript. Per-breed gestation drives expected-kidding computation.

### 4.2 `sheds` and `pens`
- `sheds(id, name, name_bn, notes)`
- `pens(id, shed_id FK, name, purpose ENUM pen_purpose ('general','kidding','buck','kid','isolation','hospital','quarantine','fattening'), capacity int CHECK > 0, notes)` — UNIQUE(shed_id, name). Isolation/hospital pens are first-class (Phase 1 health requirement).

### 4.3 `animals` — the heart of the system
| Column | Type | Constraints / meaning |
|---|---|---|
| id | char(26) | PK — QR code encodes this |
| tag_number | text | NOT NULL, **UNIQUE(farm_id, tag_number) WHERE deleted_at IS NULL** — e.g. `PGF-0001` |
| rfid_tag | text | UNIQUE partial, nullable (RFID-ready, hardware in R3) |
| name | text | optional pet name |
| breed_id | FK breeds | NOT NULL |
| cross_percent | smallint | CHECK 1–99, nullable (crossbreds) |
| sex | ENUM `animal_sex` ('female','male','wether') | NOT NULL |
| birth_date | date | NOT NULL, CHECK ≤ CURRENT_DATE |
| birth_date_estimated | boolean | true for digitized existing herd (age by dentition) |
| dam_id / sire_id | FK animals | self-referencing lineage; **trigger `trg_check_parent_sex`** enforces dam is female, sire is male, and parent ≠ self |
| source | ENUM `animal_source` ('born_on_farm','purchased','gift','exchange','other') | NOT NULL |
| purchase_price | numeric(12,2) | CHECK ≥ 0; NOT NULL when source='purchased' (CHECK) |
| purchase_date / supplier_id | date / FK suppliers | nullable |
| status | ENUM `animal_status` ('active','sold','died','disposed','culled','lost') | NOT NULL default 'active' |
| status_date | date | when status last changed |
| current_pen_id | FK pens | nullable until housed |
| group_label | text | free batch label (formal groups table if R2 needs it) |
| color_markings | text | |
| current_weight_kg | numeric(6,3) | CHECK 0.4–150 — **denormalized cache** of latest `weight_records` row, maintained by trigger; the log is the source of truth |
| current_bcs | numeric(2,1) | CHECK 1.0–5.0, denormalized likewise |
| kidding_id | FK kiddings | set for farm-born kids — links kid → its birth event |
| insurance | jsonb | {policy_no, insurer, sum_insured, valid_till} — jsonb because structure varies by insurer; promoted to a table if claims tracking is ever needed |
| dna_notes, bloodline, medical_notes, notes | text | |

**Indexes:** partial unique on tag/rfid; `(status) WHERE deleted_at IS NULL`; `(breed_id)`, `(current_pen_id)`, `(dam_id)`, `(sire_id)`; **FTS**: generated `tsvector` over (tag_number, name, notes) + `pg_trgm` GIN on tag_number & name → universal search & typo tolerance.

### 4.4 `weight_records`
`(id, animal_id FK NOT NULL, weighed_on date NOT NULL, weight_kg numeric(6,3) NOT NULL CHECK 0.4–150, bcs numeric(2,1) CHECK 1.0–5.0 nullable, method ENUM ('scale','tape','visual'), notes)` — UNIQUE(animal_id, weighed_on) (one official weight per day; corrections are updates, versioned). Index `(animal_id, weighed_on desc)`. Trigger refreshes `animals.current_weight_kg/current_bcs`. **ADG** (average daily gain) is computed from this table — never stored.

### 4.5 `animal_events` — the timeline (highest-volume table)
| Column | Type | Notes |
|---|---|---|
| id | char(26) | PK |
| animal_id | FK | NOT NULL |
| event_type | ENUM `animal_event_type` | 'registered','weighed','moved','heat','served','pregnancy_diagnosed','kidded','kid_born','treated','vaccinated','dewormed','case_opened','case_closed','isolated','released','sold','died','disposed','status_changed','photo_added','note_added','insured' |
| occurred_at | timestamptz | NOT NULL |
| ref_type / ref_id | text / char(26) | the source row (treatment, service…) — click-through from timeline |
| summary_code / summary_params | text / jsonb | i18n-rendered line, e.g. `weighed` + {kg: 18.5} |

**Written only by the domain-event bus.** Index `(animal_id, occurred_at desc)`; `(event_type, occurred_at)`. At 5000 goats × ~150 events/yr ≈ 750 k rows/yr — comfortable unpartitioned for ~10 years; declared with a `occurred_at` BRIN index and partition-ready layout (NFR-01).

### 4.6 `pen_movements`
`(id, animal_id, from_pen_id nullable, to_pen_id NOT NULL, moved_at, reason ENUM ('routine','isolation','kidding','weaning','sale_prep','treatment','other'), notes)` — trigger updates `animals.current_pen_id`.

### 4.7 `animal_exits` (sale / death / disposal — one row, closes the animal)
| Column | Type | Constraints |
|---|---|---|
| id / animal_id | | UNIQUE(animal_id) WHERE deleted_at IS NULL — an animal exits once |
| exit_type | ENUM `exit_type` ('sale','death','disposal','cull_sale','lost') | NOT NULL |
| exit_date | date | NOT NULL, CHECK ≥ animals.birth_date (trigger) |
| — sale fields | buyer_name/`customer_id` (FK, R2), live_weight_kg, price numeric(12,2), payment ref | CHECK: price NOT NULL when sale |
| — death fields | cause_category ENUM ('disease','accident','predator','poisoning','birth_complication','unknown'), cause_detail, post_mortem_done bool, health_case_id FK nullable | links terminal illness to its case |
| — disposal fields | method ENUM ('burial','rendering','other'), certificate attachment | |

Trigger sets `animals.status` + `status_date`, emits domain event → timeline + **ledger entry** (sale income or booked loss of accumulated cost — Phase 1 §5.4).

### 4.8 `kid_records` (1:1 extension of animals for farm-born kids)
`(animal_id PK/FK, kidding_id FK NOT NULL, birth_order smallint CHECK 1–6, birth_weight_kg numeric(5,3) CHECK 0.4–7.0, colostrum_within_1h boolean, colostrum_notes, weaned_on date nullable, weaning_weight_kg, mortality — via animal_exits)`. Litter size = COUNT over kidding_id (never stored).

---

## 5. Breeding Context

### 5.1 `heat_records`
`(id, doe_id FK animals, detected_on date NOT NULL, signs text[], detected_by FK users, notes)` — trigger/app rule: doe must be female & active. Index `(doe_id, detected_on desc)`. Feeds the estrus calendar (+19-day recheck task if not served).

### 5.2 `services` (natural mating & AI)
| Column | Type | Constraints |
|---|---|---|
| id, doe_id | FK animals | doe female, active, **age ≥ breed puberty & weight ≥ 60 % adult weight — warning, overridable with reason** (business rule, not DB CHECK: vets override) |
| service_type | ENUM ('natural','ai') | NOT NULL |
| buck_id | FK animals | NOT NULL when natural (CHECK); must be male |
| semen_batch / semen_source / technician | text | AI fields; semen_batch NOT NULL when ai (CHECK) |
| service_date | date | NOT NULL |
| heat_record_id | FK | nullable back-link |
| inbreeding_flag / inbreeding_ack_by | boolean / FK users | set when doe & buck share a parent/grandparent (computed in app from lineage); ack required to proceed |

Index `(doe_id, service_date desc)`, `(buck_id, service_date desc)` → buck performance reports.

### 5.3 `pregnancy_diagnoses`
`(id, service_id FK NOT NULL, diagnosed_on date CHECK ≥ service_date + 18, method ENUM ('ultrasound','palpation','non_return','ballottement','other'), result ENUM ('pregnant','open','inconclusive'), diagnosed_by, notes)`.

### 5.4 `pregnancies`
| Column | Type | Notes |
|---|---|---|
| id, doe_id, service_id | | UNIQUE(service_id) — one pregnancy per service |
| confirmed_on | date | |
| expected_kidding_date | date | **generated:** service_date + breeds.gestation_days; watch window ±5 days drives tasks & dashboard due list |
| status | ENUM ('ongoing','kidded','aborted','false_pregnancy') | |
| abortion_date / abortion_reason | date / text | CHECK: NOT NULL when status='aborted' |

Rule (app layer): a doe has at most one `ongoing` pregnancy — partial unique index `(doe_id) WHERE status='ongoing' AND deleted_at IS NULL`.

### 5.5 `kiddings`
`(id, pregnancy_id FK UNIQUE, kidding_date date NOT NULL, assisted boolean, complication ENUM ('none','dystocia','retained_placenta','prolapse','other') default 'none', complication_notes, total_born smallint CHECK 1–6, born_alive smallint CHECK ≤ total_born, attended_by)`. On save, the application creates one `animals` + `kid_records` row per live kid (dam/sire auto-filled from the pregnancy's service) and fires `KiddingOccurred` → colostrum task, dam-check task, kid vaccination dues. Stillbirths are counted here, not created as animals.

**Fertility analytics** (doe/buck success rates, repeat-breeder flag after 3 consecutive 'open' diagnoses, kidding interval) are **views over these five tables** — computed, never stored.

---

## 6. Health Context

### 6.1 `health_cases`
`(id, animal_id, opened_at, reported_by, symptoms text NOT NULL, provisional_diagnosis, final_diagnosis, severity ENUM ('mild','moderate','severe','critical'), vet_name/vet_user_id, is_isolated boolean, isolation_pen_id FK pens (CHECK: required when is_isolated), status ENUM ('open','monitoring','recovered','died','referred') default 'open', closed_at, outcome_notes)`. Index `(animal_id, opened_at desc)`, partial `(status) WHERE status IN ('open','monitoring')`. Closing as 'died' requires an `animal_exits` row (app rule).

### 6.2 `health_case_vitals`
`(id, case_id, recorded_at, temperature_c numeric(4,2) CHECK 35.0–43.0, pulse_bpm smallint CHECK 40–200, respiration_rpm smallint CHECK 10–90, rumen_motility, notes, recorded_by)` — normal goat ranges annotated in UI (temp 38.5–39.7 °C).

### 6.3 `treatments`
| Column | Type | Constraints |
|---|---|---|
| id, animal_id | | NOT NULL |
| case_id | FK health_cases | nullable — preventive treatments exist outside cases |
| treated_at | timestamptz | NOT NULL |
| item_id / batch_id | FK items / item_batches | medicine used; **stock auto-deducted** via `stock_movements(ref_type='treatment')` in the same transaction |
| dose_amount / dose_unit | numeric(8,3) / ENUM ('ml','mg','g','tablet','bolus','sachet') | CHECK dose_amount > 0 |
| route | ENUM ('oral','sc','im','iv','topical','intranasal','other') | |
| weight_at_treatment_kg | numeric(6,3) | snapshot for dose audit |
| withdrawal_until | date | computed: treated_at + items.withdrawal_days — **blocks sale** of the animal before this date (app rule + dashboard flag) |
| given_by / prescribed_by | FK users / text | |

### 6.4 `lab_reports`
`(id, case_id FK, animal_id FK, report_date, lab_name, test_type, findings text, attachment_id FK)`.

### 6.5 `health_protocols` (vaccination + deworming, one engine)
| Column | Type | Notes |
|---|---|---|
| id, type | ENUM ('vaccination','deworming','dipping','other') | |
| name / name_bn | text | PPR, ET, HS, FMD, Goat Pox, CCPP, quarterly deworm — **seeded per Phase 1 §5.3**, farm-editable |
| default_item_id | FK items | usual vaccine/drug |
| first_dose_age_days | int | e.g. PPR 120 |
| booster_after_days | int nullable | primary→booster gap |
| repeat_interval_days | int nullable | e.g. deworm 90, ET 365 |
| season_months | smallint[] | pre-monsoon anchoring (e.g. {5,6}) |
| dose_per_kg / dose_fixed / dose_unit | numeric | **weight-based dose calculation** inputs |
| applies_to | ENUM ('all','female','male','kid','adult','pregnant') | |
| is_active | boolean | |

### 6.6 `protocol_dues` (the reminder engine's working set)
`(id, protocol_id, animal_id, due_date NOT NULL, status ENUM ('pending','done','skipped','missed') default 'pending', fulfilled_by_administration_id FK nullable, skip_reason)`. UNIQUE(protocol_id, animal_id, due_date). Nightly pg-boss job generates/refreshes dues from protocols × herd; overdue > 7 days flips to 'missed' + alert. Index `(status, due_date)`, `(animal_id, due_date)`.

### 6.7 `protocol_administrations`
`(id, protocol_id, animal_id, given_on date, item_id, batch_id — batch_no & expiry come from the batch row (CHECK via trigger: batch not expired on given_on), dose_amount, dose_unit, weight_at_admin_kg, anthelmintic_class_snapshot text — for **rotation tracking**, given_by, vet_name, next_due_date, notes)`. Saving one: marks the due 'done', deducts stock, computes next due, emits timeline event — one transaction. Batch entry (vaccinate a whole pen) inserts many rows atomically.

---

## 7. Inventory, Feed & Finance Contexts

### 7.1 `suppliers` (R1-minimal; full procurement in R2)
`(id, name, name_bn, phone, address, gstin, supplier_type ENUM ('medicine','feed','equipment','animal','general'), notes)` — trigram index on name.

### 7.2 `items` (one catalog: medicines, feeds, supplements, consumables)
| Column | Type | Notes |
|---|---|---|
| id, item_type | ENUM ('medicine','vaccine','dewormer','feed','mineral','supplement','consumable','equipment') | |
| name / name_bn | text | UNIQUE(farm_id, name, item_type) partial |
| unit | ENUM ('kg','g','l','ml','piece','dose','vial','bag','bottle','packet') | stock-keeping unit |
| category | text | e.g. antibiotic, concentrate, dry fodder |
| anthelmintic_class | ENUM ('benzimidazole','imidazothiazole','macrocyclic_lactone','salicylanilide','other') nullable | **deworming rotation** logic reads this |
| default_dose_per_kg / dose_unit / withdrawal_days | numeric / enum / int | medicines |
| min_stock_level / reorder_qty | numeric(10,3) | low-stock alert threshold |
| cost_price_latest | numeric(12,2) | cache from last batch |
| is_active | boolean | |

### 7.3 `item_batches`
`(id, item_id, batch_no text, expiry_date date nullable but NOT NULL for medicines/vaccines (CHECK by item_type via trigger), supplier_id, received_on, qty_received numeric(10,3) CHECK > 0, qty_remaining numeric(10,3) CHECK ≥ 0 AND ≤ qty_received, unit_cost numeric(12,2), mrp)`. Partial index `(item_id, expiry_date) WHERE qty_remaining > 0` → expiry alerts (30/7-day warnings) & FEFO (first-expiry-first-out) picking.

### 7.4 `stock_movements` (append-only ledger of quantity truth)
| Column | Type | Notes |
|---|---|---|
| id, item_id, batch_id | | batch nullable for non-batched consumables |
| movement_type | ENUM ('opening','purchase','consumption','adjustment','wastage','expiry_writeoff','return','transfer') | |
| qty | numeric(10,3) | signed: + in, − out; CHECK ≠ 0 |
| ref_type / ref_id | text / char(26) | treatment, protocol_administration, feed_log, ledger_entry |
| moved_at, moved_by, reason | | reason NOT NULL for adjustment/wastage |

Trigger maintains `item_batches.qty_remaining`; the CHECK ≥ 0 makes **negative stock impossible at the database level**. Current stock = Σ per item (fast at this scale; materialized view if ever needed).

### 7.5 `feed_logs` (daily feed register)
`(id, fed_on date, pen_id FK (herd-level feeding; per-animal feeding is rare in meat goats), item_id, qty numeric(10,3) CHECK > 0, wastage_qty numeric(10,3) CHECK ≥ 0 AND ≤ qty, fed_by, notes)` — UNIQUE(fed_on, pen_id, item_id) partial. Each row auto-writes a `stock_movements` consumption. Feed cost/day, cost per goat, and (with weights) **FCR** are views. `feed_rations` (name + component list) reserved for R2 formulation.

### 7.6 `finance_categories` (seeded, extensible, hierarchical)
`(id, kind ENUM ('income','expense'), name, name_bn, parent_id FK self, is_system boolean)`. Seeded expenses: feed, medicine, vaccine, labour, electricity, fuel, transport, vet fees, equipment, construction, insurance, misc. Seeded income: goat sale, cull sale, manure, other.

### 7.7 `ledger_entries` (R1 income/expense book; full double-entry deferred to R2 without redesign — these become the cash-book leg)
| Column | Type | Notes |
|---|---|---|
| id, entry_date, kind | ENUM income/expense | |
| category_id | FK | NOT NULL |
| amount | numeric(12,2) | CHECK > 0 |
| payment_method | ENUM ('cash','bank','upi','cheque','credit') | |
| counterparty_type / counterparty_id / counterparty_name | text/char(26)/text | supplier, customer(R2), employee(R2), or free text |
| animal_id | FK nullable | direct per-animal costing when known |
| ref_type / ref_id | | auto-entries: animal purchase, exit sale/loss, batch purchase |
| description, attachment_id | | bill photo |

Index `(entry_date)`, `(kind, category_id, entry_date)`, `(animal_id)`. **Cost-per-goat** = direct animal costs + allocated share of herd-level costs (allocation rule lives in application layer, documented in the Finance module phase).

### 7.8 `tasks`
`(id, title / title_code+params (auto tasks are i18n codes; manual tasks free text), task_type ENUM ('vaccination','deworming','kidding_watch','colostrum','health_followup','feeding','cleaning','inspection','custom'), due_on date, due_time time nullable, animal_id nullable, pen_id nullable, protocol_due_id FK nullable, assigned_to FK users nullable, status ENUM ('pending','done','skipped') default 'pending', recurrence jsonb nullable (RRULE-style), completed_at/by, completion_notes)`. Partial index `(status, due_on) WHERE status='pending'`. Overdue = pending with due_on < today (computed, never stored — no state to drift).

---

## 8. Audit, Versioning & Integrity Mechanics (how the brief's hard rules are implemented)

| Requirement | Mechanism |
|---|---|
| Audit tables | `audit_log` append-only; app DB role has INSERT-only on it; Prisma middleware writes before/after images in the same transaction as the change |
| Soft delete | `deleted_at/by` everywhere + partial unique indexes; Prisma middleware rewrites `delete` → `update` and auto-filters `deleted_at IS NULL` on reads |
| Version history | `record_versions` snapshots on master-record updates (animals, items, protocols, users, roles, settings) |
| Cross-row biology rules | Triggers: parent sex check; exit-date ≥ birth-date; batch-not-expired-at-administration; stock `qty_remaining` maintenance; `current_weight/pen` denormalization refresh |
| Referential integrity | FKs `ON DELETE RESTRICT` throughout; no orphan events possible |
| Idempotency | `idempotency_keys` (§3.8) |
| Sequences for human IDs | `settings`-held counters incremented in-transaction (`PGF-0001`, `TASK-…`), gap-tolerant |

## 9. Index & Performance Summary (NFR-01: < 1 s at 5000 animals + 5 years)

- Partial indexes on the hot predicates: active animals, pending dues/tasks, open cases, in-stock batches.
- Timeline/audit: `(entity, time desc)` B-trees + BRIN on time — the two big tables stay cheap.
- Search: one `tsvector` GIN per searchable entity + `pg_trgm` GIN for fuzzy tag/name/medicine/supplier lookups — universal search is a UNION of six indexed queries.
- Projected 5-year volume at 5000 goats: animals ≈ 30 k rows, events ≈ 4 M, movements ≈ 1 M, audit ≈ 6 M — all trivial for Postgres on this Mac, with partition plans pre-declared for the three big tables if the farm outgrows projections.

## 10. R2/R3 Reserved Extensions (named now so nothing redesigns later)

`customers`, `sale_invoices`/`invoice_lines`, `purchase_orders`/`po_lines`/`grns`, `payments`, `employees`/`attendance`/`leaves`/`payroll_runs`, `fodder_plots`/`fodder_crops`/`fodder_harvests` (plots map Blocks A/B of Plot 2308), `assets`/`maintenance_logs`, `notification_outbox`, `report_schedules`, `milk_records` (future flag from the brief), `sync_change_log` (R3 offline multi-device — ULIDs + idempotency keys already make rows sync-safe). `ledger_entries.counterparty_type/id` and `animal_exits.customer_id` are the pre-built joints these bolt onto.

## 11. Approval Gate

- [ ] Modeling decisions: kids as full `animals` rows + `kid_records` extension; one `items` catalog for medicine+feed; unified protocol engine for vaccination & deworming; exits in one `animal_exits` table
- [ ] Biology CHECK ranges (§4–6) — e.g. weight 0.4–150 kg, temp 35–43 °C, gestation 140–160 d (all farm-tunable where marked)
- [ ] R1 finance as a single categorized ledger (full cash/bank books in R2)
- [ ] Human ID format `PGF-0001` with prefix configurable

**On approval → Phase 4: UI Wireframes** — screen-by-screen layouts for the R1 modules (desktop + phone), EN/বাংলা, light/dark.
