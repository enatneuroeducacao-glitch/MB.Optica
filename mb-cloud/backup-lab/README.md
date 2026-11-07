# MB Cloud — pgBackRest isolated lab

This lab is intentionally separate from every production database. It creates a local PostgreSQL 16 container and stores backups in a Docker volume on the same machine. It is for validating pgBackRest commands and restore mechanics only; it is **not** an off-site backup and does not protect against loss of the computer or its disk.

## Safety rules

- Never put production URLs, passwords, tokens, or connection strings in this directory or Git.
- Do not point this lab at Render, Neon, Supabase, or any production database.
- The port is bound to `127.0.0.1`, not exposed to the network.
- Use a disposable lab password. It is supplied through the shell environment and is not stored in the repository.
- A successful lab restore does not prove that a managed production database supports pgBackRest.

## Start (PowerShell)

From this directory, set a temporary lab-only password and start the container:

```powershell
$env:LAB_POSTGRES_PASSWORD = Read-Host "Temporary password for the local lab"
docker compose up -d --build
docker compose ps
```

Initialize the stanza and take the first full backup:

```powershell
docker compose exec -u postgres pgbackrest-lab pgbackrest --stanza=mbcloud stanza-create
docker compose exec -u postgres pgbackrest-lab pgbackrest --stanza=mbcloud check
docker compose exec -u postgres pgbackrest-lab pgbackrest --stanza=mbcloud --type=full backup
docker compose exec -u postgres pgbackrest-lab pgbackrest info
```

## Basic integrity and recovery drill

Create a known test record:

```powershell
docker compose exec pgbackrest-lab psql -U mbcloud_lab -d mbcloud_lab -c "CREATE TABLE IF NOT EXISTS restore_probe(id integer PRIMARY KEY, marker text NOT NULL); INSERT INTO restore_probe VALUES (1, 'pgbackrest-lab-ok') ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker;"
```

Take another full backup after inserting the test record:

```powershell
docker compose exec -u postgres pgbackrest-lab pgbackrest --stanza=mbcloud --type=full backup
docker compose exec -u postgres pgbackrest-lab pgbackrest info
```

**Restore must be performed only against a disposable copy**, never the active data directory. To practice the recovery process, stop the lab, preserve its existing volumes, and use a separate disposable Compose project and fresh data volume. Do not delete volumes or run `docker compose down -v` while any backup in the lab is needed. The exact restore drill will be documented after the initial container is built and the PostgreSQL/pgBackRest version behavior is verified.

## Current limitations / next gates

1. Run the commands locally and capture their exit status.
2. Demonstrate a restore into a fresh disposable volume and verify `restore_probe`.
3. Copy an encrypted backup to a genuinely separate destination and verify its checksum and retrieval.
4. Check whether the managed PostgreSQL provider supports the WAL/archive capabilities needed by pgBackRest. If not, use a logical `pg_dump` backup for that managed database rather than forcing pgBackRest onto it.

No production database is configured here, no backup schedule is active, and no recovery claim should be made until all gates pass.
