#!/usr/bin/env bash
set -euo pipefail
# Development only: OS peer authentication over a local Unix socket; no TCP listener.
pg_root="${JIELIEN_PG_ROOT:-/workspace/.postgres}"
pg_port="${JIELIEN_PG_PORT:-5433}"
pg_bin="${JIELIEN_PG_BIN:-/workspace/pg17/usr/lib/postgresql/17/bin}"
pg_share="${JIELIEN_PG_SHARE:-/workspace/pg17/usr/share/postgresql/17}"
pg_owner="$(id -un)"
if [[ ! -x "$pg_bin/pg_ctl" ]]; then
  echo 'PostgreSQL tools unavailable. Set JIELIEN_PG_BIN/JIELIEN_PG_SHARE or use an existing PostgreSQL service via DATABASE_URL.' >&2
  exit 1
fi
mkdir -p "$pg_root/socket"
if [[ ! -f "$pg_root/data/PG_VERSION" ]]; then
  "$pg_bin/initdb" -D "$pg_root/data" -L "$pg_share" --auth-local=peer --auth-host=reject --username="$pg_owner" --encoding=UTF8 --locale=C.UTF-8
fi
if ! "$pg_bin/pg_ctl" -D "$pg_root/data" status >/dev/null 2>&1; then
  "$pg_bin/pg_ctl" -D "$pg_root/data" -l "$pg_root/postgres.log" -o "-k $pg_root/socket -p $pg_port -c listen_addresses=''" start
fi
if ! "$pg_bin/psql" -h "$pg_root/socket" -p "$pg_port" -U "$pg_owner" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='jielien'" | rg -q '^1$'; then
  "$pg_bin/createdb" -h "$pg_root/socket" -p "$pg_port" -U "$pg_owner" jielien
fi
echo 'Local PostgreSQL ready (Unix socket, TCP disabled).'
