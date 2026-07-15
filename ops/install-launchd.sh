#!/bin/zsh
# Install/refresh the three launchd agents (postgres, api, nightly backup).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS"
chmod +x "$ROOT/ops/start-api.sh" "$ROOT/ops/start-postgres.sh"
for name in com.pandora.postgres com.pandora.api com.pandora.backup; do
  sed "s|__ROOT__|$ROOT|g" "$ROOT/ops/$name.plist" > "$AGENTS/$name.plist"
  launchctl unload "$AGENTS/$name.plist" 2>/dev/null || true
  launchctl load "$AGENTS/$name.plist"
  echo "loaded $name"
done
echo "Done. API: http://localhost:$(grep '^PORT=' "$ROOT/.env" | cut -d= -f2)"
