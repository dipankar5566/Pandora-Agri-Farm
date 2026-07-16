# Pandora IoT Platform — Pilot Execution Plan

Operational companion to `22-Roadmap.md` §2.3. This is not a design section —
it's the checklist for actually running the Pilot stage: procurement, field
procedure, validation targets, and the go/no-go gate before committing to
full ~100-tag procurement (Section 21).

## 1. A real constraint the roadmap didn't spell out: the tag doesn't exist yet

Sections 2/4 designed a **custom** device — a specific SoC, accelerometer,
skin-temp sensor, passive LF RFID inlay, printed QR code, tamper switch, all
in one off-the-shelf-shell enclosure. This isn't something you order from a
catalog in 5–10 units overnight; even a small prototype run has real lead
time (component sourcing, small-batch PCB fab, assembly — Section 21 §3's
BOM assumed ~100-unit batch pricing, not a 5–10 unit prototype run, which
will cost more per unit and take longer). Two tracks run in parallel rather
than waiting on one before starting the other:

- **Track A — Infrastructure & RF validation (can start now, no custom tag needed)**: RF site survey, gateway/RFID-reader placement, farm LAN setup — this validates Sections 3 §14 and 6 §14's requirements using the *actual* gateway/reader hardware (which is COTS-sourceable — off-the-shelf BLE receiver/SBC hardware and LF RFID reader modules, not custom silicon) and generic COTS BLE beacons as range-testing stand-ins for the real tag's radio behavior.
- **Track B — Custom tag prototype (has real lead time, commission this immediately)**: order a small prototype batch (5–10 units, Section 2/4's BOM) from a contract manufacturer capable of small-batch runs. This is the long pole — start sourcing/commissioning it in parallel with Track A, not after it.

## 2. Timing: mid-July is monsoon season in Birbhum — use it

Today is mid-July — squarely within West Bengal's monsoon window
(roughly June–September). Section 3 §14 and Section 6 §14 both required RF
validation in **both** dry and monsoon conditions before finalizing gateway
placement. Starting now means the harder condition (monsoon attenuation,
heavier RF signal loss) gets tested first, not last — plan a follow-up dry-
season survey (roughly November onward) to complete the comparison, rather
than assuming this timing is a scheduling inconvenience.

## 3. Procurement checklist (pilot-scaled, not the full Section 11 estimate)

A 5–10 goat pilot doesn't need full-farm coverage. Scaled down from Section
11 §3:

| Item | Pilot qty | Note |
|---|---|---|
| Custom ear tag prototype | 5–10 | Track B — commission now (§1) |
| BLE gateway (indoor) | 1 | Enough to validate barn coverage/range |
| BLE gateway (outdoor, IP65+) | 1 | Enough to validate one pasture zone + boundary-adjacent placement (Section 6 §2.4) |
| LF RFID reader | 1 | Whichever chokepoint (chute) the pilot goats will actually pass through regularly — the second (gate) reader can wait for Foundation unless the pilot specifically needs to validate the barn↔pasture crossing |
| Environmental sensor node | 1 | Co-located with the indoor gateway (Section 10 §2.5) — cheap to include now since it rides the same enclosure |
| COTS BLE beacons | 5–10 | Track A stand-ins for range testing before the custom tag arrives |
| Network switch / UPS | As needed | Only if not already reachable from existing farm LAN infrastructure |

Rough pilot hardware cost: a fraction of Section 21's ~$1,100–3,200 full-R1
figure — dominated by the prototype tag run's small-batch premium (Track B),
not by infrastructure (which is close to its full-deployment unit cost
regardless of quantity).

## 4. Field procedure

1. **RF site survey** (Track A, start immediately): walk the property with
   COTS BLE beacons and the actual gateway hardware, map real coverage
   against the estimated ~4–5-gateway layout in Section 11 §3, and confirm
   boundary-adjacent coverage specifically supports the escape-detection
   proxy (Section 6 §2.4). Record signal strength/dropout patterns now
   (monsoon) for later comparison against a dry-season repeat (§2).
2. **Select 5–10 pilot animals**: a mix of does at different life stages if
   possible — the pilot needs to observe at least one heat cycle (Section 7
   §2.1's ~18–24 day interval) and ideally a kidding if timing allows
   (validating Section 7 §2.4's parturition-signature hypothesis), so
   including breeding-age does specifically matters, not just a random
   sample.
3. **Apply custom tag prototypes** (Track B, once they arrive) following
   Section 2's attachment mechanism; log tag serial number ↔ animal
   assignment manually if the pilot runs before any provisioning software
   exists yet (§ below).
4. **Parallel manual observation**: staff directly observe and timestamp-log
   behavior (walking/standing/lying/eating/ruminating) for the tagged
   animals during defined observation windows — this is Section 15 §2.1's
   "observation-driven labeling" for validating Section 8's behavior
   classifier, and it needs to happen deliberately, not incidentally.
5. **Run for a minimum of 4–6 weeks**, extending through at least one full
   heat cycle per doe; extending toward the dry-season transition (October–
   November) if practical, to capture both RF conditions in one continuous
   pilot rather than two disconnected ones.

## 5. Validation targets — tied to specific evidence gates already named in the design

| Target | What "pass" looks like | Source section |
|---|---|---|
| BLE range/coverage, wet vs. dry | Gateway placement from §4.1 gives usable coverage in both conditions | Section 3 §14, Section 6 §14 |
| Rumination proxy accuracy | Sensor-detected rumination bouts correlate reasonably with staff-observed bouts | Section 4 §16, Section 5 §15 |
| Lameness proxy usefulness | Sensor flag correlates with a real, staff-confirmed gait issue when one occurs | Section 5 §3 |
| Tamper switch false-positive rate | Debounce tuning (Section 2 §2.6) doesn't fire on ordinary fence-scratching/nipping | Section 2 §14 |
| Zone-attribution hysteresis | No excessive zone-flapping at gateway boundary overlap | Section 6 §14 |
| Heat-cycle detection pattern | Activity/restlessness composite flags align with staff-confirmed heat signs | Section 7 §14 |
| Parturition signature (if a kidding occurs) | Compare against Section 7 §2.4's hypothesis-tier motion signature | Section 7 §15 |
| Battery current draw | Bench + field current draw consistent with Section 20 §2.3's ~15–20µA design target | Section 20 §13 |
| RFID inlay + antenna coexistence | No BLE/RFID antenna interference inside the shared enclosure | Section 4 §14 |

## 6. Go/No-Go gate before Foundation (full ~100-tag procurement)

Proceed to Foundation (Section 22 §3) when:
- Gateway placement from the RF survey is confirmed usable in at least one
  season (ideally both, if timing allows waiting for the dry-season repeat)
- Tamper debounce tuning shows an acceptably low false-positive rate
- No fundamental hardware defect found in the prototype run (enclosure
  seal, battery life in the observed range, antenna coexistence)
- At least directional evidence exists on rumination/lameness proxy
  usefulness — doesn't need to be perfect, needs to be enough to decide
  whether the confidence tiers in Sections 4/5 hold up or need revision

If a validation target fails outright (e.g., BLE range far short of
estimate, or the RFID inlay meaningfully degrades BLE performance), revise
the relevant design section before committing to full procurement — this
plan exists specifically so that failure is cheap (5–10 units) rather than
expensive (~100 units).

## 7. Minimal software needed to run the pilot

The pilot does not need Section 13/14's full production backend — that's
scoped to Foundation. What it does need, at minimum, is somewhere to land
readings for later analysis (validating §5's targets against real data, not
just field notes). Scoped and planned separately as an implementation task.
