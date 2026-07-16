# Pandora IoT Pilot — Device Registration Runbook

Companion to `PILOT-EXECUTION-PLAN.md` §4 steps 3 and 6. Copy-paste commands
for registering physical devices as they're mounted/applied during the
pilot, against the backend already built and tested.

## Before you start

- [ ] The API is running and reachable at `http://localhost:3300` (or the
      farm LAN address, if registering from a different machine)
- [ ] You have a `farm_manager` or `owner` login (phone + password)
- [ ] You have somewhere to record each device's serial number → API key as
      you go — a spreadsheet or notebook kept **off git**. The key is shown
      only once, at registration. Lose it and the device has to be
      re-registered with a new one.

## Log in (once per session)

```bash
curl -s -c cookies.txt -X POST http://localhost:3300/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"YOUR_PHONE","password":"YOUR_PASSWORD"}'
```

Saves a session cookie to `cookies.txt` — reuse it (`-b cookies.txt`) for
every command below during this session.

## Register a fixed device (gateway, RFID reader, or env sensor)

Do this once per physical unit, right after mounting it (Wave 1, step 3 of
the "after buying" sequence).

```bash
curl -s -b cookies.txt -X POST http://localhost:3300/api/v1/iot/devices \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "deviceType": "ble_gateway",
    "serialNumber": "GW-BARN-01",
    "installLocation": "Barn Pen A, north wall"
  }'
```

- `deviceType`: `ble_gateway`, `rfid_reader`, or `env_sensor` (use `ear_tag`
  only for animals, below)
- `serialNumber`: whatever's printed on the physical unit — keep it
  consistent with your mounting notes
- `installLocation`: free text, useful for anyone troubleshooting later

**The response includes `"apiKey": "..."` — copy it into your device-key
record immediately.** It's never shown again; the server only stores a hash.
This key goes into that device's own configuration, wherever its firmware
sends the `x-device-key` header from.

## Register an ear tag (Wave 2, step 6)

Requires the animal to already exist in the herd module. Look up its ID if
you don't have it:

```bash
curl -s -b cookies.txt "http://localhost:3300/api/v1/animals?q=PGF-0042"
```

Then register the tag:

```bash
curl -s -b cookies.txt -X POST http://localhost:3300/api/v1/iot/devices \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "deviceType": "ear_tag",
    "serialNumber": "TAG-0007",
    "animalId": "PASTE_THE_ANIMAL_ID_HERE"
  }'
```

Ear tags never get an `apiKey` (by design, Section 2 §2.8) — an empty/absent
`apiKey` in the response is expected, not an error.

## Verify a device is registered

```bash
curl -s -b cookies.txt http://localhost:3300/api/v1/iot/devices
```

Check the new device appears with `"status": "active"`.

## Confirm a gateway's key actually works

Once a gateway is configured with its key, sanity-check it can post before
trusting the device's own firmware:

```bash
curl -s -X POST http://localhost:3300/api/v1/iot/readings \
  -H "Content-Type: application/json" \
  -H "x-device-key: PASTE_THE_GATEWAYS_KEY_HERE" \
  -d '{
    "readings": [{
      "deviceId": "PASTE_THE_GATEWAY_OR_TAG_DEVICE_ID",
      "readingType": "battery_pct",
      "capturedAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
      "value": 100
    }]
  }'
```

Success looks like `{"data":{"accepted":1}}`. A 401 means the key or device
ID is wrong; a 409 means the device exists but isn't `active`.

## If something goes wrong

- **Lost an API key**: no recovery path exists yet — register the device
  again under a new serial (e.g. `GW-BARN-01-v2`) for a fresh key, and mark
  the old serial unused in your notes. (Reassign/retire endpoints aren't
  built for the pilot scaffold — that's Foundation-stage, Section 13 §2.6.)
- **`SERIAL_TAKEN`**: that serial is already registered — check
  `GET /iot/devices` first if unsure whether a device was already added.
- **`DEVICE_KEY_INVALID`**: check the key was copied exactly (no stray
  whitespace) and that it's the *gateway's* key, not another device's — a
  reading's `gatewayId` (or its own `deviceId` if it has none) is what gets
  checked against the presented key, not every device mentioned in the batch.
