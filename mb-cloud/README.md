# MB Cloud — foundation

## Purpose
An independent control plane for MB Gestão Inteligente: PostgreSQL portability, external backups, recovery workflows, and a future permissioned plugin registry. This component does not replace the operational database and does not read, migrate, or modify production data.

## Current status
- Initial dashboard and health endpoint.
- No database connection or credentials baked into the source.
- No scheduled backup is active yet.
- No production database has been switched.
- The dashboard deliberately does not expose operational records or secrets.

## Intended architecture
1. PostgreSQL hosted independently from Neon/Supabase.
2. Object storage compatible with S3 in a separate failure domain.
3. Daily pg_dump in custom format, plus SHA-256 manifest and upload verification.
4. Retention policy: 30 daily backups and 12 monthly recovery points, subject to storage cost.
5. Isolated restore drill before any production cutover.
6. Plugin registry with least-privilege scopes, version pinning, audit events and explicit approval for financial mutations.

## Required setup before backups can run
- Select a durable PostgreSQL host and provision it privately.
- Select independent object storage and create a private bucket.
- Configure secrets in the host's secret manager (never in Git).
- Add a scheduled backup worker with a PostgreSQL client and S3-compatible upload tool.
- Test download, checksum validation and restore into a clean database.
- Confirm the backup includes all operational tables, attachments and required roles/sequences.

## Safety
Never use the current production database as a restore target. Never open PostgreSQL to 0.0.0.0/0. Never delete the original Neon project, snapshots, branches, Render contingency, or source exports as part of this project. Do not claim recovery is ready until a full restore drill passes.

## Local run
Run npm start, then open /; health check: /health.
