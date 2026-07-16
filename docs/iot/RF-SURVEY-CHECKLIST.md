# Pandora IoT Pilot — RF Site Survey Checklist

Companion to `PILOT-EXECUTION-PLAN.md` §4 step 1. This validates Section 3
§14 and Section 6 §14's requirement: gateway placement confirmed usable in
**both** monsoon and dry-season conditions, with explicit boundary-adjacent
coverage for Section 6 §2.4's escape-detection proxy. Do the monsoon run
first — it's currently monsoon season, and it's the harder condition.

## Before you go

- [ ] All COTS beacons (from the shopping list) charged
- [ ] Phone charged, with **nRF Connect** or **BLE Scanner** installed
- [ ] Rough sketch of the property — barn/sheds, pens, pasture zones,
      property boundary/fence line (hand-drawn is fine)
- [ ] Marking flags/stakes for candidate gateway positions
- [ ] Notebook or phone notes app for logging readings
- [ ] Check the weather — this is meant to be a wet-condition run; don't
      reschedule for a dry spell, that defeats the point

## Candidate positions to test

Starting point: Section 11 §3's estimate of ~4–5 gateways. Test all of
these; the survey's job is to confirm or revise this count, not just
validate it blindly.

- [ ] Barn/pen position 1 (indoor)
- [ ] Barn/pen position 2 (indoor)
- [ ] Barn/pen position 3, if the shed layout needs it (indoor)
- [ ] Pasture zone 1 — include a position near the property boundary
- [ ] Pasture zone 2, if pasture is subdivided — also boundary-adjacent
      if it borders the fence line

## At each candidate position

- [ ] Place a beacon at the candidate spot
- [ ] Walk the area the gateway is meant to cover, logging BLE RSSI at
      regular intervals (every ~10m is a reasonable default)
- [ ] Note any dead zones or signal drop — and *why*: a wall, dense
      foliage, a metal structure, distance
- [ ] Mark the position on the sketch with its actual observed coverage
      radius, not the assumed one

## Boundary-specific checks (Section 6 §2.4's escape-detection proxy)

- [ ] For each pasture-boundary-adjacent candidate: confirm the signal
      genuinely drops off **just past** the property line, not well before
      it (undermines coverage) or well beyond it (undermines the "signal
      lost = possibly escaped" proxy's usefulness)
- [ ] Walk *past* the boundary a short distance with a beacon and confirm
      it actually goes quiet on the scanner

## Gate/chute-specific checks (Section 3 §2.1 / Section 6 §2.3)

- [ ] Confirm line-of-sight / reasonable coverage between the barn and the
      planned barn↔pasture RFID gate reader location
- [ ] Note the exact planned mounting spot for both RFID readers (chute +
      gate) on the sketch — these are separate from the BLE gateway
      candidates above

## Interference check

- [ ] Note any existing 2.4 GHz sources nearby (household WiFi APs,
      neighboring BLE devices) that might affect gateway channel planning
      later — doesn't block anything now, just worth recording

## After the survey

- [ ] Consolidate RSSI notes into one coverage map against the sketch
- [ ] Compare actual coverage against Section 11 §3's ~4–5 gateway estimate
      — confirm the count, or note what needs to change (add/move/remove
      a position) before ordering final infrastructure quantities
- [ ] Schedule the **dry-season repeat** (roughly November onward, per
      `PILOT-EXECUTION-PLAN.md` §2) to complete the wet/dry comparison —
      this survey alone isn't the finish line, it's half of it
- [ ] Log findings back into `PILOT-EXECUTION-PLAN.md` §4 step 1, or a new
      dated findings note, so the comparison against the dry-season run
      later is actually possible
