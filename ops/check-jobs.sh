#!/bin/zsh
# Verifies last night's backup (01:00) and this morning's digest (06:00)
# actually fired and succeeded — run daily by com.pandora.healthcheck at
# 06:15, after both have had a chance to run. Appends a PASS/FAIL line to
# a persistent log and fires a best-effort native notification either way.
set -uo pipefail
SUMMARY="/tmp/pandora-daily-check.log"
MAX_AGE_HOURS=25

check_job() {
  local label="$1" file="$2" errfile="$3"
  if [[ ! -s "$file" ]]; then
    echo "FAIL — $label: no output in $file (job never ran or failed before producing output)"
    return
  fi
  local mtime now age_hours
  mtime=$(stat -f %m "$file")
  now=$(date +%s)
  age_hours=$(( (now - mtime) / 3600 ))
  if [[ $age_hours -gt $MAX_AGE_HOURS ]]; then
    echo "STALE — $label: last output is ${age_hours}h old (expected a fresh run within the last day)"
  elif [[ -s "$errfile" ]]; then
    echo "FAIL — $label: stderr is non-empty ($errfile)"
  elif ! tail -1 "$file" | grep -q '"data"'; then
    echo "FAIL — $label: last line doesn't look like a successful response: $(tail -1 "$file")"
  else
    echo "OK — $label: ran ${age_hours}h ago, output looks healthy"
  fi
}

BACKUP_RESULT=$(check_job "backup" /tmp/pandora-backup.log /tmp/pandora-backup.err)
DIGEST_RESULT=$(check_job "digest" /tmp/pandora-digest.log /tmp/pandora-digest.err)

{
  echo "=== $(date "+%Y-%m-%d %H:%M:%S") ==="
  echo "$BACKUP_RESULT"
  echo "$DIGEST_RESULT"
} >> "$SUMMARY"

if [[ "$BACKUP_RESULT" == OK* && "$DIGEST_RESULT" == OK* ]]; then
  /usr/bin/osascript -e 'display notification "Backup and digest both ran fine overnight." with title "Pandora Farm — daily check"' 2>/dev/null || true
else
  /usr/bin/osascript -e 'display notification "Backup or digest may have failed — check /tmp/pandora-daily-check.log" with title "Pandora Farm — daily check" sound name "Basso"' 2>/dev/null || true
fi
