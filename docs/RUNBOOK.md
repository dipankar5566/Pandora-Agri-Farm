# Operations Runbook — Pandora Goat Farm ERP

This is the practical, do-this-when-that-happens document. For *why* things are built this way, see `docs/Phase-2-Architecture.md` §5 (backup design) and §9 (approval gate risks). This runbook assumes the host is the farm's Mac, as decided in Phase 1.

---

## 1. First-time setup on a Mac

### 1.1 Install PostgreSQL 16

**Do not** `brew install postgresql@16` on an unsupported macOS version (Monterey and earlier lack bottles — it triggers an hours-long source build). Use **Postgres.app** instead:

1. Download `Postgres-2.9.5-16.dmg` from https://postgresapp.com/downloads.html (or the "all versions" bundle).
2. Mount it and drag `Postgres.app` into `/Applications`.
3. Initialize and start the cluster:
   ```bash
   PGBIN=/Applications/Postgres.app/Contents/Versions/16/bin
   DATADIR="$HOME/Library/Application Support/Postgres/var-16"
   mkdir -p "$DATADIR"
   "$PGBIN/initdb" --locale=en_US.UTF-8 -E UTF8 -D "$DATADIR"
   "$PGBIN/pg_ctl" -D "$DATADIR" -l "$HOME/Library/Application Support/Postgres/pg16.log" start
   "$PGBIN/createdb" pandora_erp
   ```
4. Set `DATABASE_URL` in `.env` to `postgresql://<your-mac-username>@localhost:5432/pandora_erp` (no password needed with the default `trust` auth on localhost).

### 1.2 Application setup

Follow the Quick Start in the root `README.md`: `npm install`, build contracts, `.env`, `prisma migrate deploy`, `npm run seed`.

**Change the seeded owner password immediately** (Settings → your profile, or `PATCH /api/v1/auth/me`) — the seed password lives in `.env` in plaintext for bootstrap convenience only.

---

## 2. Running the app permanently (launchd)

The farm needs the app running continuously, surviving reboots, without anyone remembering to open a terminal. Three launchd agents handle this, defined in `ops/`:

| Agent | Does |
|---|---|
| `com.pandora.postgres` | Starts Postgres at login if not already running |
| `com.pandora.api` | Builds nothing itself — runs `apps/api/dist/main.js`; restarts automatically if it crashes (`KeepAlive`) |
| `com.pandora.backup` | Fires `pg_dump` once a night at 01:00 via the scheduled backup endpoint |

### Install

```bash
cd "Pandora Agri Farm"
npm run build -w apps/api          # make sure dist/ is current
chmod +x ops/install-launchd.sh
./ops/install-launchd.sh
```

This copies the plists into `~/Library/LaunchAgents` (substituting the real project path for `__ROOT__`) and loads them. The API becomes reachable at `http://localhost:$PORT` (from `.env`) and, on the farm's Wi-Fi, at `http://<this-Mac's-LAN-IP>:$PORT` from any phone or laptop on the same network.

### Everyday commands

```bash
# Check whether the agents are loaded
launchctl list | grep pandora

# Restart the API after a code change (rebuild first!)
npm run build -w apps/api
launchctl kickstart -k gui/$(id -u)/com.pandora.api

# Stop everything
launchctl unload ~/Library/LaunchAgents/com.pandora.*.plist

# View logs
tail -f /tmp/pandora-api.log /tmp/pandora-api.err
tail -f /tmp/pandora-backup.log
```

### Finding the Mac's LAN address (for phone access)

```bash
ipconfig getifaddr en0   # or en1 depending on Wi-Fi adapter
```

---

## 3. Backups

### 3.1 How it works

Every night at 01:00, launchd calls `POST /api/v1/ops/backup/scheduled` with the `X-Ops-Token` header (value from `.env`'s `OPS_TOKEN`). This runs `pg_dump -Fc` into `BACKUP_DIR` (default `~/PandoraBackups`), keeps the newest 30 dumps, and records success in the `settings` table — which is what makes the dashboard's backup-age tile turn red if a night is missed.

### 3.2 Manual backup

From the app: **Settings → Backup → Back up now** (Owner role only). Or directly:

```bash
curl -X POST http://localhost:3300/api/v1/ops/backup \
  -H "Cookie: pandora_sid=<your session cookie>"
```

### 3.3 Off-machine copy (do this — a laptop is not a data center)

The backup lands on the same disk as the database. Copy `BACKUP_DIR` somewhere else regularly:

- **Simplest**: plug in a USB drive, `cp -R ~/PandoraBackups /Volumes/YourDrive/`
- **Better**: install `rclone`, configure a Google Drive remote, and add a `launchd` agent (or a line in `com.pandora.backup`'s script) that runs `rclone sync ~/PandoraBackups gdrive:PandoraBackups --crypt` after each backup. This was the Phase 2 plan; wire it in when convenient — it's additive, not required for R1 to function.

### 3.4 Restore on a fresh machine

Rehearse this once now, so it's proven before you ever need it under pressure.

```bash
# 1. Install Postgres.app and Node as in §1.1/README prerequisites
# 2. Clone/copy the repo, npm install, build contracts
# 3. Create an empty database
createdb pandora_erp

# 4. Restore the dump (pick the newest file in your backup copy)
pg_restore -d pandora_erp --clean --if-exists /path/to/pandora-<timestamp>.dump

# 5. Copy the uploaded photos/attachments directory
cp -R /path/to/backup/data/uploads apps/api/data/uploads   # if you separately synced this directory

# 6. Point .env at the restored database, then:
npx prisma migrate deploy   # confirms schema matches — should be a no-op if the dump is current
npm run build -w apps/api && node apps/api/dist/main.js
```

If this whole sequence takes more than an hour, something is wrong with the backup — investigate before trusting it again.

---

## 4. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Dashboard shows red "backup" tile | Nightly job didn't run or failed | `tail /tmp/pandora-backup.log`; check `launchctl list \| grep backup`; try a manual backup from Settings |
| API unreachable from a phone | Mac firewall blocking, or wrong IP | Confirm `ipconfig getifaddr en0`; check macOS Firewall allows incoming connections for `node`; confirm phone is on the same Wi-Fi (not guest network) |
| `EADDRINUSE` on startup | Something else is using the configured port | Check `lsof -nP -iTCP:<port> -sTCP:LISTEN`; change `PORT` in `.env` if it's a genuinely different app (this happened once in development — port 3300 was chosen specifically to avoid a conflict with another local Node app) |
| Prisma migration refuses with "modified after it was applied" | A migration `.sql` file was hand-edited after `migrate deploy` already ran it | Never edit an applied migration. If you must (e.g. to add a trigger you forgot), fix the stored checksum: `UPDATE _prisma_migrations SET checksum='<shasum -a 256 of the file>' WHERE migration_name='<name>';` for every row with that name (including rolled-back ones) |
| Disk filling up | Photos not being compressed, or backups not rotating | Photos should auto-compress to ~200 KB JPEGs on upload (`sharp`, Module 1) — check `apps/api/data/uploads` isn't unexpectedly large; backups keep only `BACKUP_KEEP` (default 30) — check the rotation logic ran |
| Owner locked out after failed logins | 5 wrong passwords locks the account for 15 minutes (`apps/api/src/modules/auth/auth.service.ts`) | Wait 15 minutes, or as a last resort reset via `psql`: `UPDATE users SET failed_login_count=0, locked_until=NULL WHERE phone='<phone>';` |

---

## 5. Mac-specific caveats (Phase 2 §8 risks, operationalized)

- **Sleep**: if the Mac sleeps, the API stops responding until it wakes. Set Energy Saver / Battery preferences to prevent sleep while on power, or run `caffeinate -s` in a login item.
- **8 GB RAM budget**: Postgres + API + OS should stay well under budget at this herd size. If the Mac becomes sluggish, check `top` for anything unexpected — nothing in this stack should be RAM-hungry by design (see Phase 2 §3 for why each technology was chosen with this ceiling in mind).
- **No Docker**: intentional — Docker Desktop dropped Monterey support. Everything here runs natively.
