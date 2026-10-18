# MB Cloud — readiness gates for operational writes

Do not declare the system safe for operational sales, cash, or finance writes until every required gate below has objective evidence.

## Gate A — source preservation
- [ ] Neon main branch and emergency snapshot remain preserved.
- [ ] Source exports are copied to independent object storage and checksums are recorded.
- [ ] Render contingency database remains preserved until comparison and reconciliation are complete.
- [ ] No migration/import is run against the production database during recovery analysis.

## Gate B — durable infrastructure
- [ ] PostgreSQL is on a durable plan with no imminent expiry and documented recovery options.
- [ ] Database is private; no public 0.0.0.0/0 allowlist.
- [ ] Independent private object storage is enabled and reachable from the backup worker.
- [ ] Secrets are stored only in the host secret manager, not in Git or logs.
- [ ] Provider costs and retention limits are documented before activating paid resources.

## Gate C — backup and restore
- [ ] Automated backup job creates a complete PostgreSQL custom-format dump.
- [ ] SHA-256 manifest and object metadata are stored beside each backup.
- [ ] Backup upload is downloaded again and checksum verified.
- [ ] Restore into a new isolated database completes successfully.
- [ ] Restored schema, row counts, constraints, indexes, sequences and representative financial totals are verified.
- [ ] Recovery Point Objective and Recovery Time Objective are documented.
- [ ] At least one scheduled backup and one independent restore drill are observed.

## Gate D — operational data reconciliation
- [ ] Identify which database is the authoritative source before enabling writes.
- [ ] Compare customer, product, sale, sale-item, payment, cash, payable, receivable, settlement and audit data across sources.
- [ ] Reconcile counts, identifiers, date ranges, totals, payment methods, cancellations/refunds and balances.
- [ ] Investigate duplicate IDs, orphan references, missing products and duplicate categories.
- [ ] Reconcile October transactions from 1–17 October using a source that actually contains those dates.
- [ ] No blind import, destructive overwrite, or automatic merge of uncertain financial records.

## Gate E — application and transactions
- [ ] Authentication and authorization pass for each role.
- [ ] Test sale/payment/cash/finance cycle in staging with synthetic records.
- [ ] Verify rollback and idempotency after failed/retried transactions.
- [ ] Verify audit log and that financial totals remain consistent after cancellation/refund.
- [ ] Production write test is small, identified, reversible where possible, and approved after backup proof.

## Current observed blockers (2026-10-18)
- Cloudflare R2 API reports R2 must first be enabled in the Cloudflare Dashboard; no bucket was created.
- Render contingency PostgreSQL is on the free plan and expires 2026-11-16; it is not a durable long-term database.
- Render's database query tool cannot connect while its external IP allowlist is empty. Do not open it to the public internet to work around this.
- Neon access is blocked by the transfer quota; an emergency snapshot exists, but no portable dump or verified restore has been produced from it.
- The BeepStart export from 2026-10-05 has sales only through 2026-09-26 and therefore cannot prove completeness for October 1–17.
- Consequently, the MB Cloud dashboard being live does not mean data protection, backup automation, or financial-data reconciliation is ready.

## Decision rule
If any gate above is incomplete, do not treat the system as proven safe for new operational financial records. If urgent business operations require data entry, first make a separately verified export of the active database and record the exact database endpoint used; do not switch endpoints or run migrations during the test.
