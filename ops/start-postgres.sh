#!/bin/zsh
# Start PostgreSQL 16 (Postgres.app binaries) if not already running.
PGBIN=/Applications/Postgres.app/Contents/Versions/16/bin
DATADIR="$HOME/Library/Application Support/Postgres/var-16"
"$PGBIN/pg_ctl" -D "$DATADIR" status >/dev/null 2>&1 && exit 0
exec "$PGBIN/pg_ctl" -D "$DATADIR" -l "$HOME/Library/Application Support/Postgres/pg16.log" start
