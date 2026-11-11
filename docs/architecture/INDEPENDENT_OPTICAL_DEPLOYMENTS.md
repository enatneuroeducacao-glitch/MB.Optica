# Independent optical deployments

## Decision

The distribution model for MB Gestão is **one independent local application server and one independent PostgreSQL database per optical store**, hosted on that store's own server computer. Each store may allow access from its private LAN after firewall configuration.

This is not a shared-database multi-tenant SaaS rollout. Each customer receives an isolated deployment, its own database, its own credentials/secrets, its own backups and its own desktop installer profile.

## Important current-state finding

`desktop/` is currently a Tauri WebView shell. The existing Windows installer opens the fixed URL `https://gestao.mboptica.com.br/`; it does not contain the application server or a local database. Therefore, copying the current installer alone would only create another shortcut to the same online system.

The existing production Render service and its database belong to the current MB Óptica operation and must remain untouched.

## Target architecture

For each optical store:

- one application service (for example, one dedicated Render web service);
- one dedicated PostgreSQL database (for example, one dedicated Neon project/database);
- unique `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, bootstrap credentials and backup destination;
- one unique HTTPS application URL;
- one Windows Tauri installer configured at build time to open only that URL;
- independent backup, restore, update and support lifecycle.

No customer database URL, password, signing secret, bootstrap token or certificate may be embedded in the installer or committed to Git.

## Empty installation rules

A new optical installation must start from Prisma migrations and explicitly approved reference data only. It must not copy:

- MB Óptica customers, users, sales, accounts or payments;
- products, stock balances, stock lots or movements;
- prescriptions, orders, service orders or appointments;
- fiscal documents, certificates, credentials or historical reports;
- any production backup or production database snapshot.

Create only the first installation administrator through a one-time bootstrap process. Force password change and disable/invalidate the bootstrap credential immediately after use.

Reference data (such as product categories, payment methods, system settings and default permissions) must be classified and seeded explicitly. Never seed customer-specific tax identity, certificates, fiscal numbers, credentials or inventory.

## Installer profile

The desktop package needs a build-time deployment profile containing only non-secret values:

- display name / product name;
- unique Tauri application identifier;
- exact HTTPS base URL for that optical's application;
- installer artifact name and version.

The build must fail if the deployment URL is missing, not HTTPS, or points to the MB Óptica production URL when building a new customer profile. The generic homologation installer must not silently default to the production URL.

Each customer installer must be tested to verify that it opens its assigned URL and cannot be redirected to another tenant by an untrusted local configuration.

## Provisioning lifecycle

1. Approve the customer and assign an internal installation identifier.
2. Provision a new PostgreSQL database and separate application service.
3. Generate independent secrets outside GitHub source code and outside the installer.
4. Deploy the application and run migrations against only the new empty database.
5. Create the initial administrator with a one-time bootstrap token.
6. Verify that the database contains no MB Óptica operational records.
7. Build the Windows installer with the customer's exact URL and unique Tauri identifier.
8. Test login, logout, permissions, sales, order service, inventory, payments, printing, fiscal configuration, backup and restore.
9. Record the service, database, backup and installer version in an installation register.
10. Release only after a human acceptance checklist is signed off.

## Backup and recovery requirements

Every deployment needs its own backup destination and retention policy. A restore test must restore into a separate temporary database and verify record counts and application startup. A backup from one optical must never be restored over another optical's database.

## Update strategy

Application code may be released from a common source repository, but deployments remain independent. Updates should be staged and promoted per installation, with a tested rollback path. Database migrations must be backward-compatible where possible and run only against the target installation.

## Rollout stages

### Stage A — Safe template
- Preserve current MB Óptica production service and database.
- Create a clean deployment branch from the current stable `main`.
- Parameterize the Tauri installer profile.
- Document and automate empty database provisioning without customer data.

### Stage B — Isolated pilot
- Provision one separate test app service and one separate test PostgreSQL database.
- Build one installer configured only for that test URL.
- Validate isolation, backup/restore and full operational workflows.

### Stage C — First customer-ready package
- Complete a clean Windows installation test.
- Complete application, database, printing, fiscal and recovery acceptance.
- Produce a versioned installer and release notes.

### Stage D — Repeatable customer provisioning
- Automate one-service/one-database creation per optical.
- Add a protected installation registry and per-installation update/backup operations.
- Never turn on shared-database multi-tenancy as a prerequisite for this distribution model.

## Explicit safety gates

- Do not change the existing Render service, production database, production secrets or production domain as part of this work.
- Do not merge to `main`, deploy, run migrations against production or copy production data.
- Do not reuse `MB_OPTICA_OWNER_INSTANCE=true` as a customer licensing mechanism. It is a global owner-instance bypass and is not a per-customer isolation boundary.
- Do not advertise the existing Tauri installer as a standalone/local system: it is currently only a WebView client for the online service.
- Do not claim a customer installation is isolated until its application service, database, credentials, backups and installer URL have all been verified independently.
\n\n## Local-server pilot implementation status\n\nThe branch `feature/independent-optical-deployments` now includes a Docker Compose local stack, a first-run Node provisioner that generates per-installation secrets, a minimal database readiness endpoint, an explicit one-time bootstrap finalizer, and a Tauri profile targeting loopback. The current desktop installer still does not install Docker Desktop or automatically manage the local server lifecycle. Those remain release blockers.\n