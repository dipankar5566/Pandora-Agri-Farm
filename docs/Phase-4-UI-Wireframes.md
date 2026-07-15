# Pandora Goat Farm ERP — Phase 4: UI Wireframes

| | |
|---|---|
| **Document** | Phase 4 — UI Wireframes (R1 screens) |
| **Version** | 1.0 (Draft for approval) |
| **Date** | 2026-07-15 |
| **Status** | ⏳ Awaiting owner approval |
| **Companion** | `docs/wireframes/r1-mockups.html` — visual mockup of key screens (also published as a Claude Artifact) |
| **Next phase** | Phase 5 — API Design |

---

## 1. Design System

### 1.1 Foundations
- **Material Design 3** (per brief) via MUI, with a farm-specific token set — not stock MUI blue.
- **Palette:** primary **leaf green `#2E6B34`** (dark theme: `#7FD48A`); support **hay ochre `#B8862B`**; grounds warm off-white `#FAFAF7` / green-biased near-black `#131712`. Semantic colors are separate from the accent: success `#2E7D46`, warning `#C77E1F`, critical `#B3402F`, info `#3A6EA5` — status never borrows the brand color.
- **Typography:** system stack + **Noto Sans Bengali** for `bn` (bundled locally — no CDN dependency on farm Wi-Fi). Numerals always tabular in tables (`font-variant-numeric: tabular-nums`); currency always `₹1,23,456` (Indian grouping) in both locales.
- **Density:** desktop = comfortable data-grid density; phone = large touch targets (min 48 px) — the manager may be operating with one hand in a barn.
- **Dark + light** from day one, token-level; per-user preference stored on the `users` row.
- **Language switch** is one tap in the top bar (EN ⇄ বাংলা), never buried in settings; per-user preference persisted.

### 1.2 Signature UX patterns (used across every module)
| Pattern | Behavior |
|---|---|
| **Status pills** | Animal status, task status, stock level, case severity are colored pills with icons — scannable from 2 m away |
| **Quick-Add FAB** | Global “+” opens the 6 most frequent actions: Weigh, Treat, Heat, Service, Expense, Task |
| **QR-first lookup** | Every animal picker has a camera button — scan the pen card/ear tag QR instead of typing |
| **Batch mode** | Weigh/vaccinate/deworm screens accept many animals in one session: pick pen → checklist of animals → one shared form + per-animal overrides |
| **Back-dated entry** | Every event form has an editable date defaulting to today (workers report verbally, entry happens later) |
| **Offline banner** | Amber strip “Offline — 3 entries queued” when the outbox is non-empty; entries replay automatically |
| **Empty states** | Every list’s empty state teaches the next action (“No heat records this week — record one from the herd list”) |
| **Destructive actions** | Soft-delete only, always behind a typed-confirmation dialog, always reversible by Owner |

### 1.3 Navigation map
```
Desktop (≥1024px): permanent left sidebar          Phone: bottom nav + FAB
┌──────────────┐                                   ┌─────────────────────┐
│ ⌂ Dashboard  │  Top bar (all sizes):             │       content       │
│ ── HERD ──   │  [☰] [🔍 universal search…]       │                     │
│ 🐐 Animals   │        [＋FAB] [🔔3] [EN|বাং] [👤] │                     │
│ 🍼 Kids      │                                   ├─────────────────────┤
│ ── CYCLE ──  │  Search matches goats, tags,      │ ⌂    🐐   ＋   ☑   ≡ │
│ ♥ Breeding   │  medicines, suppliers, invoices;  │Home Herd Add Tasks More
│ 🤰 Pregnancy │  grouped results, keyboard nav.   └─────────────────────┘
│ ── CARE ──   │                                   “More” sheet → Breeding,
│ ✚ Health     │                                   Health, Inventory, Feed,
│ 💉 Protocols │                                   Finance, Reports, Settings
│ ── SUPPLY ── │
│ 📦 Inventory │
│ 🌾 Feed      │
│ ── MONEY ──  │
│ ₹ Finance    │
│ ☑ Tasks      │
│ ⚙ Settings   │
└──────────────┘
```

---

## 2. Screen Wireframes

### S1 · Login
```
┌────────────────────────────────────┐   Phone number + password (phone is
│        🐐 Pandora Goat Farm        │   the login ID — rural reality).
│      পান্ডোরা গোট ফার্ম             │   Language toggle ON the login page.
│  ┌──────────────────────────────┐  │   Lockout after 5 failures.
│  │ Phone number                 │  │   No self-registration — Owner
│  ├──────────────────────────────┤  │   creates users in Settings.
│  │ Password              [👁]   │  │
│  └──────────────────────────────┘  │
│  [        Sign in / সাইন ইন      ] │
│              EN | বাংলা            │
└────────────────────────────────────┘
```

### S2 · Dashboard (desktop)
```
┌ Top bar ──────────────────────────────────────────────────────────┐
│ 🔍 Search goats, medicines, anything…        ＋  🔔3  EN|বাং  👤  │
├────────┬──────────────────────────────────────────────────────────┤
│sidebar │  KPI STRIP (live)                                        │
│        │ ┌───────┬───────┬───────┬───────┬───────┬───────┐        │
│        │ │ 🐐 87 │ 🤰 12 │ 🍼 23 │ ⚰ 2.1%│ ₹ +/− │ ⚖ 46g │        │
│        │ │Active │Pregnant│ Kids │Mort.90d│This mo│ADG avg│       │
│        │ └───────┴───────┴───────┴───────┴───────┴───────┘        │
│        │  NEEDS ATTENTION (the farm’s to-do, auto-generated)      │
│        │ ┌ Due & Overdue ───────────────┐ ┌ Alerts ─────────────┐ │
│        │ │ 🔴 PPR vaccine — 14 kids     │ │ 🔴 Backup failed    │ │
│        │ │    overdue 3d      [Do now]  │ │ 🟠 Ivermectin low   │ │
│        │ │ 🟠 Kidding watch — PGF-0041  │ │    stock (2 doses)  │ │
│        │ │    due 17 Jul ±5d  [View]    │ │ 🟠 B.no 8821 expires│ │
│        │ │ 🟡 Deworm — Pen B (18)       │ │    in 12 days       │ │
│        │ │    due 20 Jul      [Batch…]  │ │ 🔵 3 heat rechecks  │ │
│        │ └──────────────────────────────┘ └─────────────────────┘ │
│        │ ┌ Upcoming kiddings (60d) ─────┐ ┌ This month ₹ ──────┐  │
│        │ │ PGF-0041  17 Jul  (2nd kid.) │ │ Income   ▇▇▇ 42,500│  │
│        │ │ PGF-0007  29 Jul  (Black B.) │ │ Expense  ▇▇▇▇▇71,200│ │
│        │ │ PGF-0058  04 Aug             │ │ Feed 48% Med 22% …  │  │
│        │ └──────────────────────────────┘ └─────────────────────┘ │
└────────┴──────────────────────────────────────────────────────────┘
Phone: same blocks stacked; KPI strip becomes 2×3 grid of stat tiles.
```

### S3 · Herd list (Animals)
```
┌ Animals (87)                    [⌸ scan QR] [＋ Register] [⇩ CSV] ┐
│ [Search tag/name…] [Status ▾ Active] [Breed ▾] [Pen ▾] [Sex ▾]    │
│ ☐ │Tag      │Photo│Breed        │Sex│Age   │Wt kg │Status │Pen   │
│ ☐ │PGF-0041 │ ◙  │Black Bengal │♀ │2y 3m │ 22.4 │🟢Active│A-2   │
│ ☐ │PGF-0042 │ ◙  │Black Bengal │♂ │1y 8m │ 25.1 │🟢Active│Buck-1│
│ ☐ │PGF-0043 │ ◙  │Sirohi cross │♀ │0y 4m │  9.8 │🟣Kid   │Kid-1 │
│ …                                                                 │
│ 2 selected: [Move pen] [Weigh session] [Administer protocol]      │
└───────────────────────────────────────────────────────────────────┘
Row tap → S4. Column sort persisted. Filters map to indexed queries.
```

### S4 · Animal profile — the single most important screen
```
┌ ← PGF-0041 “Lakshmi”                                  [✎ Edit] [⋮] ┐
│ ┌────┐ Black Bengal ♀ · 2y 3m · 🟢 Active · Pen A-2               │
│ │ ◙  │ ⚖ 22.4 kg (↑ 300g/wk sparkline) · BCS 3.5                 │
│ │photo│ 🤰 Pregnant — due 17 Jul (±5d)  🔶 Withdrawal until 19 Jul│
│ └────┘ Dam PGF-0012 · Sire PGF-0003        [⌸ Show QR] [📷 Photo] │
├────────────────────────────────────────────────────────────────────┤
│ [Timeline] [Health] [Breeding] [Weights] [Kids] [Money] [Docs]     │
│ ── TIMELINE (auto-generated, newest first) ──────────────────────  │
│ 14 Jul  💉 Vaccinated — ET booster, batch 8821        → details   │
│ 10 Jul  ⚖ Weighed — 22.4 kg (+0.6)                                │
│ 02 Jul  🚚 Moved — Pen A-1 → A-2 (kidding prep)                   │
│ 19 Feb  ♥ Served — natural, buck PGF-0003                         │
│ 12 Feb  🔥 Heat detected                                          │
│  …every event, clickable through to its source record             │
└────────────────────────────────────────────────────────────────────┘
Header chips are computed live (pregnancy, withdrawal block, open case).
Phone: header collapses to a compact card; tabs become swipeable.
```

### S5 · Register animal + Bulk intake (digitizing the existing herd)
```
Single: one form, photo capture, tag auto-suggested (next PGF-####),
        dam/sire pickers with QR scan, “birth date estimated” toggle
        with age-by-dentition helper (0-2-4-6-8 teeth → age band).

Bulk intake wizard (one-time, for the existing <100 herd):
 Step 1  Shared defaults: breed, source, pen
 Step 2  Rapid rows: tag │ sex │ est. age band │ weight │ 📷
         — one row per goat, keyboard-first, ~20 sec/animal
 Step 3  Review table → [Create 34 animals]
```

### S6 · Batch weigh session (pattern reused for all batch work)
```
┌ Weigh session — Pen A-2 (12 animals)          date [10 Jul ▾]     ┐
│ PGF-0041  last 21.8 ▸ [22.4] kg  BCS [3.5]  ✔ saved               │
│ PGF-0044  last 18.2 ▸ [____] kg  BCS [___]  ← cursor here         │
│ PGF-0051  last 19.0 ▸ [____] kg                                   │
│ Progress 1/12 · anomaly guard: >15% change vs last → confirm chip │
└───────────────────────────────────────────────────────────────────┘
```

### S7 · Breeding board
```
Tabs: [Heat & Service] [Pregnancies] [Performance]
Heat & Service: recent heats (with +19d recheck badge), open “serve”
  action → service form (type natural/AI; buck picker filtered to
  active males; ⚠ inbreeding banner if shared ancestry — needs
  typed acknowledgment; AI fields appear when type=AI).
Pregnancies: table of ongoing — doe, service date, days pregnant,
  expected date, stage chip (early/mid/late/due), [Record kidding].
Performance: doe & buck success-rate views (from §5 analytics views).
```

### S8 · Kidding entry (high-stakes form — extra care)
```
┌ Record kidding — PGF-0041 (due 17 Jul)                            ┐
│ Date [17 Jul ▾]   Assisted? (○ No ● Yes)  Complication [None ▾]   │
│ Total born [3]   Born alive [2]   (stillborn = 1, computed)       │
│ ── Kid 1 ──  Sex [♀▾]  Weight [1.2] kg  Tag [PGF-0088 auto] 📷    │
│ ── Kid 2 ──  Sex [♂▾]  Weight [1.4] kg  Tag [PGF-0089 auto] 📷    │
│ Colostrum given within 1 hour?  (● Yes ○ No ○ Later)              │
│ [Save — creates 2 kids + care tasks]                              │
│ On save: kids appear in herd with lineage filled; colostrum task, │
│ dam-check task, and kid vaccination dues auto-generated.          │
└───────────────────────────────────────────────────────────────────┘
```

### S9 · Health — case detail + treatment
```
Case header: animal chip, opened date, severity pill, status,
  [🚩 Isolate → pick isolation pen] (moves animal, badge on profile).
Sections: Symptoms/diagnosis · Vitals log (temp with normal-range
  band 38.5–39.7°C shaded) · Treatments (medicine picker shows LIVE
  STOCK + suggested dose = dose/kg × current weight, editable;
  saving deducts stock & stamps withdrawal date) · Lab reports
  (attachment) · Outcome (Recovered / Died → forces exit record).
```

### S10 · Protocol dues (vaccination & deworming worklist)
```
┌ Due protocols        [This week ▾] [Type ▾] [Pen ▾]  [Batch mode] ┐
│ 🔴 PPR — 14 animals overdue (Kid pen)            [Administer…]    │
│ 🟠 Deworm Q3 — Pen B, 18 animals, due 20 Jul     [Administer…]    │
│ Administer sheet: shared fields (date, medicine→batch FEFO-       │
│ suggested, batch # & expiry shown, given by) + per-animal rows    │
│ with weight-based dose pre-computed; ⚠ if batch expires < dose    │
│ date or anthelmintic class = same as last time (rotation nudge).  │
└───────────────────────────────────────────────────────────────────┘
```

### S11 · Inventory
```
Items list: name (bn/en), type chip, on-hand, min-level gauge,
  🔴 below-min / 🟠 expiring badges. Item detail: batches table
  (batch, expiry, remaining, cost), movement history (append-only),
  [＋ Stock in] [− Adjust/Waste (reason required)].
```

### S12 · Feed register (a 30-second daily job)
```
┌ Feed register — [Today ▾]                                          ┐
│ Pen A (32 goats):  [Concentrate ▾] [4.5] kg   [Green fodder] [28] kg│
│ Pen B (18 goats):  yesterday’s entries pre-filled as defaults → ✎  │
│ Wastage (optional per row) · [Save day] → stock deducted           │
└────────────────────────────────────────────────────────────────────┘
```

### S13 · Finance (R1 ledger)
```
Ledger list: date, category chip, description, counterparty, ₹ in/out,
  running month totals pinned. Quick expense (from FAB): amount →
  category grid (icon tiles: Feed 🌾 Medicine 💊 Labour 👷 …) → optional
  photo of bill → save (3 taps for the common case).
Auto-entries (animal purchase/sale, stock purchase) appear with a
  🔗 link chip to their source record; editable only via source.
```

### S14 · Tasks — Today
```
┌ Today · Tue 15 Jul                       [＋ Task] [Calendar]      ┐
│ ☐ 🔴 Kidding watch — PGF-0041 (due window)          [Open animal] │
│ ☐ 💉 PPR — 14 kids                                   [Administer] │
│ ☑ 🌾 Morning feed — done 07:40 by Manager                         │
│ ☐ 🧹 Clean Pen B (recurring · Tue/Fri)                            │
│ Done with note / skip with reason; auto-tasks deep-link to the    │
│ exact screen that completes them (completing there ticks the task)│
└───────────────────────────────────────────────────────────────────┘
```

### S15 · Universal search results — grouped: Animals · Medicines ·
Suppliers · Tasks · Ledger; typo-tolerant; recent scans/searches first;
`⌸` scan button inside the search field.

### S16 · Settings — Farm profile · Users & roles (RBAC matrix grid,
per-module None/View/Edit/Approve) · Protocols editor (the §6.5 seeds)
· Categories · Tag prefix & counters · **Backup card** (last backup
age, destinations, [Back up now], restore instructions) · Audit log
viewer (filter by user/entity/date) · Language & theme.

---

## 3. States & Edge Handling (every screen must define these — done per-module in Phase 6)
- **Loading:** skeletons, never spinners-on-white.
- **Empty:** teach the next action.
- **Error:** what failed + how to fix; queued-offline is *not* an error state (amber, not red).
- **Permissions:** elements a role can’t use are hidden (not disabled), per RBAC-01.
- **Print:** animal profile and QR pen-cards have print stylesheets (A4) — physical QR cards for pens/animals come from here.

## 4. Approval Gate
- [ ] Navigation model (desktop sidebar / phone bottom-nav + global FAB)
- [ ] Dashboard composition (S2) — the right KPIs and attention lists?
- [ ] Animal profile layout (S4) as the system’s centerpiece
- [ ] Batch-mode pattern (S6/S10) and 3-tap quick expense (S13)
- [ ] Visual identity in the mockup (leaf green + hay ochre, both themes)

**On approval → Phase 5: API Design.**
