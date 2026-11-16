# MB Optica temporary recovery console

Temporary isolated PostgreSQL restore helper. It accepts a pg_dump directory-format archive (.tar.gz), validates the archive listing, and restores only when DATABASE_URL contains the exact RESTORE_TARGET_NAME.

Required Render environment variables:
- RESTORE_TOKEN: long random access token.
- RESTORE_TARGET_NAME: mb_optica_recuperacao_temporaria
- DATABASE_URL: INTERNAL database URL copied from the temporary Render Postgres instance.

Never configure this service with production Neon or the suspended contingency database credentials. Do not commit backup files or database credentials. Remove this temporary service after recovery and audit.
