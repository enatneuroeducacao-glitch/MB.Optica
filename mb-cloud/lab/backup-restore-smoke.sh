#!/usr/bin/env bash
set -euo pipefail

COMPOSE=(docker compose -f mb-cloud/lab/compose.yaml)

echo "[1/5] Waiting for isolated lab PostgreSQL"
"${COMPOSE[@]}" up -d --build db
ready=0
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T db pg_isready -U mbcloud -d mbcloud_lab >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" != "1" ]]; then
  echo "PostgreSQL did not become ready; inspect: docker compose -f mb-cloud/lab/compose.yaml logs db" >&2
  exit 1
fi

echo "[2/5] Creating pgBackRest stanza"
"${COMPOSE[@]}" exec -T db pgbackrest --stanza=mbcloud-lab stanza-create
"${COMPOSE[@]}" exec -T db pgbackrest --stanza=mbcloud-lab check

echo "[3/5] Writing synthetic marker and taking full backup"
"${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U mbcloud -d mbcloud_lab -c \
  "CREATE TABLE IF NOT EXISTS backup_smoke_marker (id integer PRIMARY KEY, marker text NOT NULL);"
"${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U mbcloud -d mbcloud_lab -c \
  "INSERT INTO backup_smoke_marker (id, marker) VALUES (1, 'MB_CLOUD_PGBACKREST_RESTORE_OK') ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker;"
"${COMPOSE[@]}" exec -T db pgbackrest --stanza=mbcloud-lab --type=full backup
"${COMPOSE[@]}" exec -T db pgbackrest --stanza=mbcloud-lab info

echo "[4/5] Restoring into a separate isolated data directory"
"${COMPOSE[@]}" --profile restore run --rm --no-deps --entrypoint /bin/bash restore-check -lc \
  'pgbackrest --stanza=mbcloud-lab --pg1-path=/var/lib/postgresql/restore restore && pg_ctl -D /var/lib/postgresql/restore -o "-p 55433 -c listen_addresses=127.0.0.1 -c archive_mode=off" -w start && psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55433 -U mbcloud -d mbcloud_lab -Atc "SELECT marker FROM backup_smoke_marker WHERE id=1" | grep -Fx "MB_CLOUD_PGBACKREST_RESTORE_OK" && pg_ctl -D /var/lib/postgresql/restore -m fast -w stop'

echo "[5/5] PASS — backup created and restored marker verified in isolated database"
echo "This is a local synthetic-data lab only. It does not connect to Render, Neon, or production."
