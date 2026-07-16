# Pandora IoT Pilot — Shopping List

Companion to `PILOT-EXECUTION-PLAN.md` §1/§3. Prices below are **current
India-market reference points found by live search (July 2026)**, not the
rough ranges estimated in the design docs — a few came out meaningfully
different from those estimates, flagged inline. Confirm at order time;
prices move.

## Track A — order now (no custom tag needed)

These validate infrastructure/RF coverage using COTS gear while Track B's
custom tag prototype is being commissioned in parallel.

### Gateway hardware

| Item | Qty | Spec | Reference price | Source |
|---|---|---|---|---|
| Indoor BLE gateway board | 2 | ESP32/ESP32-S3, BLE5, WiFi | ₹280–800/unit ([Robokits ESP32](https://robokits.co.in/wireless-solutions/iot-esp-module/esp32-development-board-wifi-bluetooth) ₹284; ESP32-S3 variants pricier — [Robu.in](https://robu.in/product-category/iot-and-wireless/espressif-wi-fi-modules/), [Evelta](https://evelta.com/esp32-s3-smart-86-box-dev-board-wi-fi-ble-5-4inch-480x480-touch-display/)) | Robu.in / Robokits / Evelta |
| Outdoor BLE gateway board | 1 | Same board + IP65 enclosure | Board ₹500–800 + enclosure below | Same, + enclosure line below |
| IP65 enclosure | 1–2 | For outdoor gateway (and RFID gate reader if that's also outdoor) | ₹150–950 depending on grade ([Amazon.in](https://www.amazon.in/ip65-enclosure-box/s?k=ip65+enclosure+box) from ~₹175; heavy-duty up to [₹950](https://www.tradeindia.com/products/waterproof-electrical-junction-box-ip-65-7744664.html)) | Amazon.in / Probots / IndiaMART |

### Identity hardware

| Item | Qty | Spec | Reference price | Source | Note |
|---|---|---|---|---|---|
| LF RFID reader | 1 | 134.2 kHz, ISO 11784/11785, TTL interface (Section 3 §2.1's chosen frequency) | ~$36 / ~₹3,000 ([AliExpress listing](https://www.aliexpress.com/item/32847058721.html)) | AliExpress / [GAO RFID](https://gaorfid.com/devices/rfid-readers-frequency/low-frequency-134-khz-rfid-readers/) for a more finished industrial unit | **Weakest India-local sourcing of anything on this list** — international order = customs/duty lead time; worth extra diligence before committing, and check GAO RFID / local industrial automation suppliers as an India-side alternative. [Open-Tag-Reader](https://github.com/Minorplanets76/Open-Tag-Reader) (GitHub, animal RFID EID reading) is an unverified open-source build option worth a look before buying |
| COTS BLE beacons | 5–10 | Any iBeacon/Eddystone-compatible tag — these are stand-ins for RF range testing, **not** the final custom tag | ₹250–1,000/unit ([IndiaMART from ₹250](https://www.indiamart.com/proddetail/ble-beacons-20136631455.html); [DNA Tech ₹999](https://www.dnatechindia.com/ibeacon-module-bluetooth-4-ble.html)) | Amazon.in / IndiaMART / Robocraze / DNA Tech India | Buy the cheap end — these get walked around a farm and don't need to be the final product |

### Environmental sensor set (Section 10 — co-located with the indoor gateway)

| Item | Qty | Reference price | Source | Note |
|---|---|---|---|---|
| Temp/humidity (SHT31-class) | 1 | ~₹850 ([IndiaMART](https://www.indiamart.com/proddetail/sht31-d-temperature-humidity-sensor-module-2849545356348.html)) | DNA Tech India / IndiaMART | Matches design doc's low-cost expectation — **or see the BME680 consolidation option below** |
| Ammonia (MQ137-class) | 1 | **~₹3,500 + GST** ([DNA Tech](https://www.dnatechindia.com/mq-137-ammonia-NH3-gas-sensor-module.html)) | DNA Tech India | ⚠️ **Meaningfully pricier than Section 10's "low single-to-double-digit dollars" estimate** — this alone is ~$40, not ~$5–10. Worth revisiting that cost line before Foundation-stage bulk ordering. Ammonia-specific — a general VOC sensor (BME680, below) is not a substitute for this one |
| Dust/PM (PMS5003-class) | 1 | ~₹1,500–1,800 ([DNA Tech](https://www.dnatechindia.com/pms5003-pm2.5-air-quality-sensor-buy-in-india.html), [IndiaMART](https://www.indiamart.com/proddetail/pms5003-5th-generation-sensor-monitors-pm1-0-pm2-5-pm10-with-cable-23275637862.html)) | DNA Tech India / IndiaMART | Also pricier than the design doc's low-end estimate — budget ~$20, not single digits |
| Basic sound-level module | 1 | Not searched — typical basic analog sound-sensor breakout, budget ₹100–300 | Robu.in / generic hobbyist supplier | Level-only, per Section 10 §2.3 — no need for anything fancy |

### Networking & power

| Item | Qty | Reference price | Note |
|---|---|---|---|
| Small unmanaged network switch | 1 | Budget ₹500–1,000 (not individually searched — generic 5–8 port switch) | Only needed if wired Ethernet backhaul is used for any device |
| UPS | 1 | Budget ₹2,500–6,000 (basic 600VA–1kVA home UPS, not individually searched) | For the Mac + switch/AP, per Section 11 §2.4 |
| Mounting hardware | — | Budget ₹500–1,000 | Cable ties, weatherproof tape, brackets/poles for gateway mounting |

### RF survey field tools (no purchase needed, or trivial cost)

- [ ] Smartphone with a free BLE scanner app installed (**nRF Connect** or **BLE Scanner** — both free, either works)
- [ ] Marking flags or stakes for candidate gateway positions — ₹200–500 for a set
- [ ] Measuring tape, or just use the phone's GPS/maps app for rough distances
- [ ] Notebook or phone notes app for logging RSSI readings (see `RF-SURVEY-CHECKLIST.md`)

**Track A rough total: ₹15,000–25,000** (~$180–300) for one full set of pilot
infrastructure, dominated by the RFID reader and the ammonia/dust sensors —
not the gateway boards themselves, which are cheap.

## Alternatives to buying/building each piece individually

Researched in response to "is there a plug-and-play option instead of buying
all these sensors / building a custom tag." Findings, so these don't need
re-researching later:

- **Environmental sensors — partial consolidation exists.** A [Bosch BME680
  breakout](https://www.adafruit.com/product/3660) (Adafruit/SparkFun/
  Pimoroni, no-solder I2C/Qwiic) combines temperature + humidity + barometric
  pressure + general VOC/gas sensing on one board. It replaces the SHT31
  temp/humidity part, **but its gas sensor is general VOC/MOX, not
  ammonia-selective** — it doesn't substitute for MQ137, and it has no
  particulate sensing, so PMS5003 stays separate. Net: saves one purchase
  (SHT31), not three. US-sourced (international shipping, same
  consideration as the RFID reader).
- **Ear tag — no direct drop-in replacement found, but one lead worth
  pursuing before committing to a from-scratch PCB (see Track B below):
  [KKM Technology](https://www.kkmcn.com/) is a Chinese IoT ODM/OEM
  manufacturer selling BLE beacon tags with an accelerometer, MOQ as low as
  2 units, $7.99–12/unit at low volume (drops to ~$1.60/unit at 1,000+).
  They explicitly offer OEM/ODM customization (private labeling, firmware,
  new product development) — meaning "commission a custom PCB from scratch"
  could potentially become "customize KKM's existing BLE+accelerometer tag
  line to add the LF RFID inlay and adjust the enclosure," which would very
  likely be faster than starting from a blank board. **Not verified beyond
  their own marketing** — a real vendor conversation is needed to confirm
  they'll do the RFID-inlay/enclosure customization and that data comes out
  as raw BLE, not locked into their own cloud platform, before treating this
  as a real Track B alternative.
- **Ear tag — commercial livestock platforms exist but carry the same
  closed-platform tradeoff already identified in the design docs.**
  [Skylab](https://www.skylabmodule.com/cattle-sheep-ear-tag-beacon-application-solution/),
  [Smart Paddock's Bluebell](https://www.smartpaddock.com/bluebell-ear-tag),
  and [Shearwell Data](https://www.shearwell.com/) all sell cattle/sheep BLE
  or GPS ear tags — none goat-specific, and all appear to be closed
  subscription/cloud platforms (their own dashboard, not raw local data this
  ERP could ingest). Not pursued further for that reason.
- **Ear tag — open-source hardware exists but doesn't fit this form
  factor.** [OpenCollar.io](https://www.smartparks.org/opencollar-io/)
  (Smart Parks) is a genuinely open-source wildlife-tracking hardware/
  firmware project (BLE+LoRa+WiFi+GPS, accelerometer, 2+ year battery, all
  design files public) — but it's built for large wildlife (elephant collar
  form factor, ~35×50mm) with GPS this farm's design deliberately excluded
  (Section 1 §2.2, Section 3 §3.3). Wrong size/power class to use directly;
  worth a look only as a firmware/design reference if the from-scratch
  build stalls, not as something to adopt as-is.
  [Open-Source-Range's OSR_GPS_Collar](https://github.com/Open-Source-Range/OSR_GPS_Collar)
  (<$40, fully open) has the same GPS mismatch problem.

## Track B — commission now, has real lead time

This is **not** a simple purchase — it's a custom small-batch build, unless
the KKM OEM/ODM lead above pans out. Hand a contract manufacturer /
small-batch PCB assembly service Section 2 §5 and Section 4 §5's BOM as the
spec for a 5–10 unit prototype run:

- BLE SoC: nRF52810-class
- Accelerometer: ADXL362-class (low-power, motion/shock interrupt capable)
- Skin-adjacent temperature sensor
- CR2450 battery + holder
- Tamper microswitch (at the pin interface)
- Reed switch (magnet-swipe diagnostic wake)
- Diagnostic LED
- Passive LF RFID inlay (134.2 kHz, matching the Track A reader above)
- 2-layer PCB sized to fit an off-the-shelf UV-stabilized IP68 button-tag
  shell (Section 2 §2.1 — do not commission custom tooling for a 5–10 unit
  prototype run)

**No specific India vendor is recommended here** — this needs actual vendor
outreach (small-batch PCB fab + assembly houses), not a marketplace search.
Start this conversation immediately given it's the pilot's long pole (Section
22 §2.3 / `PILOT-EXECUTION-PLAN.md` §1); Track A can be fully executed and
even completed before Track B parts arrive.

## Before ordering

- [ ] Email KKM Technology (or a similar BLE-tag ODM) in parallel with PCB
      assembly-house outreach — if they'll customize an existing tag with
      the RFID inlay and hand over raw BLE data, that likely beats a
      from-scratch build on lead time; don't delay the from-scratch outreach
      waiting on their answer, run both simultaneously
- [ ] Confirm the ammonia and dust sensor cost correction above doesn't
      change the Section 10 §2.2 "include only if bundled free" call for
      CO₂ — it doesn't (CO₂ was already excluded independent of these two),
      but worth a sanity check once real quotes are in hand.
- [ ] Get an actual quote/lead-time from at least one small-batch PCB
      assembly house for Track B before assuming a timeline.
- [ ] Re-check RFID reader sourcing — international shipping to West Bengal
      may take longer than everything else on this list combined.
