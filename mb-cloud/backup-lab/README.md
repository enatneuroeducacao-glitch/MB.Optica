# MB Cloud — pgBackRest isolated lab

This lab is intentionally separate from every production database. It creates a local PostgreSQL 16 container and stores backups in a Docker volume on the same machine. It is for validating pgBackRest commands and restore mechanics only; it is **not** an off-site backup and does not protect against loss of the computer or its disk.

## Safety rules

- Never put production URLs, passwords, tokens, or connection strings in this directory or Git.
- Do not point this lab at Render, Neon, Supabase, or any production database.
- The port is bound to `127.0.0.1`, not exposed to the network.
- Use a disposable lab password. It is supplied through the shell environment and is not stored in the repository.
- A successful lab restore does not prove that a managed production database supports pgBackRest.

## Run the smoke test (PowerShell)

Open PowerShell in this directory and run:

```powershell
.\test-lab.ps1
```

The script builds the image, starts the isolated database, creates the pgBackRest stanza, inserts a harmless test row, takes a full backup, and displays backup metadata. It is safe to rerun and does not delete Docker volumes. If it fails, capture the error and inspect:

```powershell
docker compose logs --tail 100 pgbackrest-lab
docker compose ps
```

The script requires Docker Desktop with Docker Compose available and a local Docker engine running.

## What the smoke test does NOT prove

- It does not perform a full restore into a fresh data volume.
- It does not copy backups to an off-site destination.
- It does not connect to or back up Render, Neon, Supabase, or any production database.
- A local Docker volume is not a safe sole copy of business data.

## Next gates

1. Run the smoke test locally and confirm it exits successfully.
2. Demonstrate restore into a fresh disposable volume and verify `restore_probe`.
3. Choose an external destination without enabling paid billing, then encrypt, checksum, upload, download and verify a backup.
4. Check whether the managed PostgreSQL provider supports the WAL/archive capabilities needed by pgBackRest. If not, use a logical `pg_dump` backup for that managed database rather than forcing pgBackRest onto it.

No production database is configured here, no backup schedule is active, and no recovery claim should be made until all gates pass. Never run `docker compose down -v` while the lab backups are needed.
