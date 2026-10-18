# MB Cloud — pgBackRest isolated lab

This lab validates the pgBackRest workflow with **synthetic data only**. It does not use production credentials, connect to Neon, or touch the Render contingency database.

## Requirements

- Docker Desktop with Docker Compose v2.
- Free local disk space for two disposable Docker volumes.
- No cloud account or paid service is required for this local test.

## Run on Windows PowerShell

From the repository root, set a temporary local-only password in the current PowerShell session:

```powershell
$env:MB_CLOUD_LAB_PASSWORD = "replace-with-a-long-local-only-password"
bash mb-cloud/lab/backup-restore-smoke.sh
```

If Bash is not available in PowerShell, run the script from WSL or Git Bash. The PostgreSQL port is bound only to `127.0.0.1:55432`; it is not exposed to the public internet.

The smoke test starts an isolated PostgreSQL 16 container, configures WAL archiving, creates a pgBackRest stanza, writes a synthetic marker, creates a full backup, restores into a **separate temporary data directory** in a no-network container, starts the restored database on an isolated port, and checks the marker.

## Cleanup

After the smoke test finishes:

```powershell
docker compose -f mb-cloud/lab/compose.yaml down -v --remove-orphans
```

This removes only the lab's named volumes and container. Do not use this cleanup command with any production compose file.

## Automated verification

The GitHub Actions workflow `.github/workflows/mb-cloud-backup-lab.yml` runs this synthetic backup/restore test for relevant pull requests and pushes to `main`. It uses only disposable test data and removes the lab volumes at the end.

## What a PASS proves — and what it does not

A PASS proves the basic local pgBackRest backup/restore cycle with synthetic data. It does **not** prove remote object-storage upload, credentials, retention in a cloud bucket, a scheduled job, production database access, or financial-data completeness. Those require separate non-production tests and independent evidence.

Do not connect this lab to production or place production credentials in its environment.
