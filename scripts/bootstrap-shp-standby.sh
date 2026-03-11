#!/usr/bin/env bash
set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-10.89.0.1}"
PRIMARY_PORT="${PRIMARY_PORT:-5433}"
REPLICATION_USER="${REPLICATION_USER:-replicator}"
REPLICATION_PASSWORD="${REPLICATION_PASSWORD:-__REPLICATION_PASSWORD__}"
REPLICATION_SLOT="${REPLICATION_SLOT:-postgresql_shp_secondary_slot}"
DATA_DIR="${DATA_DIR:-/var/lib/pgsql/shp/data}"
PG_BASEBACKUP_BIN="${PG_BASEBACKUP_BIN:-/usr/bin/pg_basebackup}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

if [ -d "$DATA_DIR" ] && [ -n "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
    echo "Refusing to bootstrap standby into non-empty DATA_DIR: $DATA_DIR" >&2
    exit 1
fi

if [ "${EUID}" -eq 0 ]; then
    install -d -o "$POSTGRES_USER" -g "$POSTGRES_USER" -m 700 "$DATA_DIR"
    exec runuser -u "$POSTGRES_USER" -- env PGPASSWORD="$REPLICATION_PASSWORD" \
        "$PG_BASEBACKUP_BIN" \
            -h "$PRIMARY_HOST" \
            -p "$PRIMARY_PORT" \
            -U "$REPLICATION_USER" \
            -D "$DATA_DIR" \
            -R \
            -X stream \
            -C \
            -S "$REPLICATION_SLOT"
fi

mkdir -p "$DATA_DIR"
chmod 700 "$DATA_DIR"

exec env PGPASSWORD="$REPLICATION_PASSWORD" \
    "$PG_BASEBACKUP_BIN" \
        -h "$PRIMARY_HOST" \
        -p "$PRIMARY_PORT" \
        -U "$REPLICATION_USER" \
        -D "$DATA_DIR" \
        -R \
        -X stream \
        -C \
        -S "$REPLICATION_SLOT"
