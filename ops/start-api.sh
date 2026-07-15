#!/bin/zsh
# launchd entry point for the Pandora ERP API (launchd does not read .env).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
exec /usr/local/bin/node apps/api/dist/main.js
