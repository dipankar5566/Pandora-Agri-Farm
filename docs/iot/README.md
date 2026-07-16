# Pandora IoT Livestock Platform — Design Documents

Full architecture for the smart ear tag / livestock monitoring IoT platform,
designed section-by-section with an approval gate between each. Lives inside
the existing `apps/api` monolith (new `src/modules/iot/`) rather than as a
separate system — see `01-System-Architecture.md` §2.1 for why.

| # | Document | Summary |
|---|---|---|
| 01 | [System Architecture](01-System-Architecture.md) | BLE tags + fixed gateways + LF RFID; single-process, no-cloud, no-microservices boundary |
| 02 | [Ear Tag Design](02-Ear-Tag-Design.md) | Enclosure, battery, weight budget, tamper/serviceability, sized for Black Bengal goats |
| 03 | [Communication Technologies](03-Communication-Technologies.md) | Full radio comparison; LF RFID and WiFi/Ethernet backhaul chosen |
| 04 | [Sensors](04-Sensors.md) | Final sensor suite (accel, temp, passive RFID inlay, battery); several candidates explicitly excluded |
| 05 | [Health Monitoring](05-Health-Monitoring.md) | Rule-based composite scoring for illness/fever/stress/isolation/mortality, with confidence framework |
| 06 | [Location Tracking](06-Location-Tracking.md) | Zone-level BLE presence + authoritative RFID gate reads; honest "not real geofencing" framing |
| 07 | [Fertility Tracking](07-Fertility-Tracking.md) | Heat-cycle cyclical prior, pregnancy/kidding detection, breeding recommendations |
| 08 | [Activity Monitoring](08-Activity-Monitoring.md) | Behavior classification pipeline and the daily activity score |
| 09 | [Feed Management](09-Feed-Management.md) | Visit-pattern proxy (not intake volume); pen-level feed efficiency from existing data |
| 10 | [Environmental Monitoring](10-Environmental-Monitoring.md) | One barn sensor node; weather API as the system's one WAN dependency |
| 11 | [Farm Infrastructure](11-Farm-Infrastructure.md) | Gateway/reader inventory, power backup, estimated placement pending RF site survey |
| 12 | [Edge Computing](12-Edge-Computing.md) | Gateway as stateless relay; "Local AI" reframed around this system's no-cloud architecture |
| 13 | [Backend](13-Backend.md) | REST/MQTT shapes, device auth, and the device-provisioning design no prior section had |
| 14 | [Database](14-Database.md) | Consolidated schema, partitioning + retention policy, `readingType` typing rationale |
| 15 | [AI Features](15-AI-Features.md) | Ten AI features sorted by real data-availability timeline, not treated uniformly |
| 16 | [Alert Engine](16-Alert-Engine.md) | Unified alert taxonomy; gateway-offline/sensor-failure newly designed; dedup rule |
| 17 | [Mobile App](17-Mobile-App.md) | Existing PWA extended; QR scan (not BLE/NFC); offline mode scoped to respect rule 14 |
| 18 | [Dashboard](18-Dashboard.md) | Herd-aggregate/management screen; device management UI; honest "AI Insights" framing |
| 19 | [Security](19-Security.md) | Secure boot, OTA signing, key rotation — all sized to ~8 devices, not enterprise-max |
| 20 | [Power Management](20-Power-Management.md) | Full tag state machine; the arithmetic behind the 2.5–3.5 year battery-life claim |
| 21 | [Manufacturing](21-Manufacturing.md) | Itemized BOM, ~$1,100–3,200 total R1 hardware cost, injection-mold breakeven math |
| 22 | [Roadmap](22-Roadmap.md) | Reconciles the brief's 5 phases against actual dependencies; Pilot → Foundation → conditional LoRaWAN → staged AI → federated future |

## Status

All 22 sections drafted and pending approval (see each document's own
"Approval Gate" checklist). Once approved, implementation begins with the
Pilot stage (Section 22 §2.3) — a separate scope of work from this design
series.
