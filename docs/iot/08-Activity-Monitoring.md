# Pandora IoT Platform — Section 8: Activity Monitoring

## 1. Executive Summary

Sections 5 and 7 have already been consuming this section's outputs —
`activityIndex`, `ruminationMinutes`, `restlessnessIndex` — before this
document defined how they're actually produced. That's this section's job:
the behavior-classification pipeline that turns raw accelerometer signal (plus
BLE zone context from Section 6) into the ten named states the brief asks
for, and the daily activity score that summarizes them. Two things are stated
plainly rather than oversold: walking/standing/lying/running classification
from a single 3-axis accelerometer is a **proven, industry-standard**
technique (the same approach commercial rumination/activity collars use) —
but sleeping-vs-resting, jumping, and social interaction are genuinely harder
problems for this sensor placement, and this section says exactly where
confidence drops and why, consistent with every prior section's discipline.

## 2. Engineering Decisions

### 2.1 Feature extraction on-tag, full behavior classification backend-side
- **Why**: the tag's MCU (Section 4 §2.4's nRF52810-class SoC) is already
  computing a lightweight per-interval activity magnitude/variance summary to
  drive its adaptive advertising rate (Section 2 §2.4's power design) — that
  work isn't wasted, it's reused as the input feature stream, not raw
  waveform data, which keeps BLE payload and tag-side compute inside the
  power budget. Full behavior classification (walk vs. graze vs. eat vs.
  rumination) happens backend-side, in the same `src/modules/iot/` boundary
  already established for stateful computation (Section 5 §7, Section 6 §6)
  — because several of these behaviors need context the tag doesn't have:
  zone presence (Section 6) for eating/drinking, and cross-animal proximity
  (Section 7 §2.2) for social interaction.
- **Rejected**: full classification on the tag or gateway — neither has
  access to the zone/multi-animal context several behaviors genuinely need,
  and pushing more compute onto the coin-cell MCU works against the power
  budget for no benefit.

### 2.2 Walking/standing/lying/running: proven signal-feature classification, high confidence
- **Why**: magnitude, variance, dominant periodicity (gait cadence), and the
  static gravity-vector orientation component of a 3-axis accelerometer are
  the established feature set published livestock-wearable research and
  commercial collars use to separate these four states — this isn't a novel
  technique invented for this document, it's the proven baseline. Threshold/
  decision-rule classification (not ML) is appropriate here for the same
  reason Section 5 §2.1 chose rule-based scoring generally — explainable and
  workable without a training dataset this farm doesn't have yet.

### 2.3 Eating and drinking require accelerometer pattern **and** BLE zone context — accelerometer alone is ambiguous
- **Why**: a repetitive head-down motion signature looks similar whether a
  goat is grazing pasture, standing at the trough, or just idling with its
  head down — accelerometer data alone can't reliably tell these apart. BLE
  zone presence at a feed or water station (Section 6's zone-labeled
  gateways) resolves the ambiguity: the same head-down accelerometer pattern
  is classified as "eating" or "drinking" specifically when it co-occurs with
  presence in a feed/water zone, and as "grazing" (a distinct pasture
  behavior, not tracked as a separate top-level state here since it's
  behaviorally similar to eating) when it occurs in a pasture zone away from
  a fixed station. This is a genuine cross-section integration, not a
  standalone accelerometer trick.

### 2.4 Jumping, tamper, shock-injury, and mortality-trigger share one raw signal type — disambiguated by surrounding context, not separate sensors
- **Why**: all four are, at the hardware level, the same high-g accelerometer
  interrupt already established in Section 2 §2.5/Section 4's shock-detection
  discussion. What differs is the activity *around* the event: a jump shows
  normal ambulatory activity immediately before and after (a controlled,
  self-initiated event); a shock/injury event shows abnormal activity
  *after* but not necessarily before; a tamper event is corroborated by the
  mechanical pull-switch at the ear/pin interface specifically (Section 2
  §2.6), not just the accelerometer; and a mortality-relevant event is
  followed by *sustained* zero activity (Section 5 §2.5). This is a
  deliberate unifying principle — one raw signal, classified by context, not
  four separate detection paths bolted together.

### 2.5 "Sleeping" is not attempted as a distinct state — folded into a broader Resting/Lying state
- **Why**: goats, like most prey animals, have short, interspersed true-sleep
  bouts within longer periods of drowsing/resting rather than one long
  continuous sleep block — reliably distinguishing true sleep from restful
  lying needs sensing (e.g. EEG-class) this platform doesn't have and has no
  reason to add. Claiming a "sleeping" classification from accelerometer
  data alone would be a confidence this section isn't willing to assert.
  **Rejected**: a fine-grained sleep-stage classifier — Resting/Lying is
  reported as one state, honestly.

### 2.6 Social interaction reuses Section 7 §2.2's cross-animal technique, at even lower/coarser confidence
- **Why**: the same sustained-BLE-proximity + correlated-accelerometer-motion
  method that flags mounting-behavior candidates (Section 7 §2.2) applies
  here too, but social interaction (grooming, play, mild agonistic contact)
  is a broader, less specific category than mounting's brief high-magnitude
  signature — so this section reports it as a **coarse herd-engagement
  indicator** (how socially engaged an animal appears relative to its own
  baseline), not a labeled interaction-type classifier. Reusing the existing
  cross-animal correlation method rather than inventing a second one keeps
  this consistent with Section 7 rather than a parallel, subtly different
  technique.

### 2.7 The Daily Activity Score is baseline-relative, not a raw movement-volume score — and shares its feature computation with Section 5's illness score
- **Why**: more movement isn't better — adequate rest and adequate rumination
  time matter as much as ambulatory activity, so a score that just rewards
  "more motion" would misrepresent wellness. The daily activity score is
  computed the same way Section 5 §2.2 computes illness deviation — relative
  to the animal's own rolling baseline — but exposed as a standalone,
  farm-manager-facing wellness metric (0–100, "how normal does today look for
  this animal") rather than an alerting output. **This is the same
  underlying feature vector Section 5's illness composite consumes** — the
  two aren't redundant systems, they're the same computation serving two
  audiences: a dashboard metric here, a triage signal there. Stating this
  explicitly avoids the reader wondering why two "activity scores" seem to
  exist.

## 3. Behavior States — Coverage and Confidence

| State | Signal(s) | Confidence | Notes |
|---|---|---|---|
| Walking | Accel magnitude/variance/periodicity | High — proven technique (§2.2) | |
| Running | Same features, higher magnitude/cadence threshold | High | |
| Standing | Low motion variance, upright gravity vector | High | |
| Lying/Resting | Low motion variance, lying gravity vector | High | "Sleeping" folded in, not distinguished (§2.5) |
| Eating | Head-down repetitive motion + feed-zone BLE presence | Moderate-high — needs zone corroboration (§2.3) | |
| Drinking | Head-down repetitive motion + water-zone BLE presence | Moderate-high — same corroboration need | |
| Grazing | Head-down repetitive motion, pasture zone (no fixed station) | Moderate — same base signature as eating, distinguished by zone (§2.3) | |
| Rumination | Rhythmic jaw-adjacent motion signature (Section 4) | Moderate, field-validation pending | Same caveat carried from Section 4/5/7 |
| Jumping | High-g interrupt + normal activity before/after | Moderate | Disambiguated from shock/tamper/mortality by context (§2.4) |
| Social Interaction | Cross-animal BLE proximity + correlated motion (Section 7 §2.2 method) | Low-moderate, coarse indicator only | §2.6 |
| Restlessness | Frequency of short-duration posture transitions beyond baseline | Moderate | Formally defined here; reused by Section 5 (stress) and Section 7 (heat) |

## 4. Architecture Diagram

```mermaid
flowchart TB
    TAG["Ear tag: on-device\nmagnitude/variance summary\nper interval (power-driven, Section 2)"] -->|"batched"| SR[("SensorReading\naccelerometer_activity")]
    ZONE[("Zone attribution\nSection 6")] --> CLASSIFY
    SR --> CLASSIFY["Backend classification\n(rule-based feature thresholds, §2.2)"]
    PROX["Cross-animal proximity\nSection 7 §2.2 method"] --> CLASSIFY
    CLASSIFY --> STATES["Per-interval behavior state\n(walk/stand/lie/eat/drink/graze/\nrumination/jump/social/restless)"]
    STATES -->|"nightly aggregation,\ninterval labels discarded after use"| ADS[("AnimalDailySummary\n(minute totals per state,\ndailyActivityScore)"]
    ADS --> S5["Section 5 illness composite\n(same feature vector)"]
    ADS --> S7["Section 7 heat/restlessness\n(restlessnessIndex)"]
    ADS --> DASH["Farm manager dashboard\ndaily activity score (§2.7)"]
```

## 5. Hardware Components

None new — this section is entirely a classification pipeline over Section
4's already-approved sensors and Section 6's zone infrastructure.

## 6. Software Components

The classification stage runs inside the existing `health-signals`/
`fertility-signals` compute boundary (`src/modules/iot/`) rather than a new
module — it's the shared feature layer those two sections already draw on,
formalized here rather than treated as separate infrastructure.

## 7. Database Design

Extends **`AnimalDailySummary`** (originated Section 5 §8, extended Section 7
§7) with the fields this section actually produces: `walkingMinutes`,
`standingMinutes`, `lyingMinutes`, `grazingMinutes`, `eatingMinutes`,
`drinkingMinutes`, `jumpCount`, `socialInteractionScore`, and
`dailyActivityScore`. Section 5's original `activityIndex` field is clarified
here as a **derived roll-up** of this section's finer-grained states (walking
+ running + grazing minutes — total ambulatory time), not a separately
computed number — no contradiction with Section 5, just the detail Section 5
deferred to this section. Per-interval classification results are **not**
persisted as their own table — only the nightly-aggregated daily totals are
kept, consistent with Section 1 §2.4's telemetry-volume discipline; nothing
downstream needs interval-level labels once the daily rollup exists.

## 8. Firmware Design

No change beyond what Section 2/20 already specify — the on-tag magnitude/
variance summary this section consumes is the same computation already
required for adaptive advertising, not new firmware work.

## 9. Communication Flow

1. Tag computes and transmits compact per-interval activity summaries
   (already flowing per Section 2's adaptive-advertising design) via the
   normal batched ingestion path.
2. Backend classification runs continuously against incoming readings,
   cross-referencing zone attribution (Section 6) and proximity data
   (Section 7 §2.2) as each interval is classified.
3. A nightly job aggregates classified intervals into `AnimalDailySummary`
   minute totals and computes `dailyActivityScore` against the animal's
   rolling baseline — the same job Section 5 §10 already runs, extended with
   this section's outputs, not a second job.

## 10. Security Considerations

No new considerations — same `iot` permission boundary as every other section
built on this data.

## 11. Scalability Plan

Classification cost scales linearly with reading volume and animal count,
consistent with every other section's federated, per-farm scaling model
(Section 1 §11). Discarding interval-level labels after nightly aggregation
(§7) keeps this section's storage footprint from growing with retention
period the way a raw-label-history table would.

## 12. Cost Estimate

No new hardware. Marginal backend compute only, folded into the same nightly
job already budgeted in Section 5 §13.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Eating/drinking/grazing misclassified without reliable zone attribution | Directly depends on Section 6's zone-attribution accuracy — validated together in the same field pilot, not treated as independent risks |
| Jump/shock/tamper/mortality context-disambiguation misfires (e.g., a jump followed by an unrelated inactivity period read as mortality) | Accepted consistent with Section 5 §2.5's sensitivity bias — an unnecessary mortality-check trip is a cheaper error than a missed one |
| Daily Activity Score misread as "higher is healthier" | Explicitly defined and documented as baseline-relative, not volume-based (§2.7) — a UI/dashboard design note for Section 18 |
| Social interaction score over-interpreted as a specific behavior label | Reported as a coarse engagement indicator only, never a labeled interaction type (§2.6) |

## 14. Testing Strategy

- The field pilot validates the well-established states (walk/stand/lie/run)
  against direct staff observation as a baseline confidence check, then
  extends to the harder cases (eating/drinking zone-corroboration accuracy,
  jump-context disambiguation, social-interaction proxy usefulness) as
  secondary validation targets.
- Rumination and restlessness validation piggybacks on the same pilot
  evidence-gathering already planned in Sections 4/5/7 — not a separate test
  track.

## 15. Future Improvements

- Sleep-stage differentiation only if a future sensor/placement change
  (outside this ear tag's scope) makes it feasible — not pursued
  speculatively (§2.5).
- Higher-confidence social-interaction/mounting classification if field
  evidence justifies additional sensing (Section 7 §16) — same
  evidence-gated posture as other future items in this series.

## 16. Approval Gate

- [ ] Feature extraction on-tag (already required for power management),
      full behavior classification backend-side
- [ ] Walking/standing/lying/running via proven signal-feature thresholds
      (rule-based, high confidence); eating/drinking/grazing require BLE zone
      corroboration, not accelerometer alone
- [ ] Jumping/tamper/shock/mortality share one raw high-g signal,
      disambiguated by surrounding activity context, not four separate paths
- [ ] "Sleeping" not attempted as a distinct state — folded into Resting/Lying
- [ ] Daily Activity Score is baseline-relative, explicitly the same feature
      computation Section 5's illness score uses, exposed for a different
      audience — not a second parallel system
- [ ] `AnimalDailySummary` extended with per-behavior minute totals and
      `dailyActivityScore`; no new table, interval-level labels not persisted

**On approval → Section 9: Feed Management** — feed/water visit detection,
duration, intake estimation, feed efficiency, and nutritional alerts, building
directly on this section's eating/drinking classification and Section 6's
zone infrastructure.
