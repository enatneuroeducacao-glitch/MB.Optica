# MB Gestão Inteligente — Windows desktop shell

This package creates a Windows NSIS installer for the existing online MB Gestão application. It does not embed the database, credentials, or customer records.

## Architecture

- The app opens `https://gestao.mboptica.com.br/` in a Tauri WebView.
- Authentication and operational data remain on the existing online service.
- No local database is created and no offline writes are supported.
- No production API secrets are embedded in the executable.
- The Tauri window receives no privileged IPC capabilities by default.

## Local build (Windows)

Requirements: Node.js 22, Rust stable, Microsoft C++ Build Tools, WebView2 runtime, and NSIS.

From this directory:

```powershell
npm install --no-audit --no-fund
npm run tauri:build
```

The installer is emitted under `src-tauri/target/release/bundle/nsis/`.

## CI artifact

The GitHub Actions workflow `.github/workflows/mb-gestao-windows.yml` builds the installer on Windows for pull requests and uploads a short-lived artifact for homologation. It is not a public release and is not signed.

## Release and safety gates

Do not publish this installer as an approved production release until:
1. The online target URL is verified.
2. Login, logout, navigation, file downloads/printing, and window sizing are tested on a clean Windows machine.
3. The independent cloud backup job is operational.
4. A backup has been downloaded and checksum-verified, then restored into an isolated PostgreSQL instance.
5. The operational-data reconciliation gates are passed.

The desktop wrapper itself does not implement backup operations. Manual and scheduled cloud backup must be implemented and validated in the online service before this phase can be considered complete. Keep financial writes blocked until the backup and restore evidence is accepted.
## Independent customer installations

The current installer is a WebView client pinned to the MB Óptica production URL. It is **not** an independent installation and must not be copied or distributed to another optical store as-is.

The approved target model is one application service, one PostgreSQL database, independent secrets/backups and one URL-specific installer profile per optical store. See [Independent optical deployments](../docs/architecture/INDEPENDENT_OPTICAL_DEPLOYMENTS.md).

A customer-specific installer must be built only after its dedicated application URL exists and has passed the isolation and acceptance checks. Never embed database credentials, API secrets or bootstrap tokens in the installer.

## Customer-specific installer build

A customer-specific build requires all of the following non-secret environment variables:

- `MB_GESTAO_TARGET_URL`: the exact HTTPS URL of that customer's dedicated application service.
- `MB_GESTAO_PRODUCT_NAME`: the display name shown by Windows.
- `MB_GESTAO_APP_IDENTIFIER`: a unique reverse-domain Tauri identifier for that installation.
- `MB_GESTAO_INSTALLER_SLUG`: a unique lowercase installation slug.

Validate the profile without compiling:

```bash
MB_GESTAO_TARGET_URL=https://pilot.example.com MB_GESTAO_PRODUCT_NAME="MB Gestão - Óptica Piloto" MB_GESTAO_APP_IDENTIFIER=br.com.mboptica.piloto MB_GESTAO_INSTALLER_SLUG=optica-piloto npm run tauri:validate:customer
```

Build the NSIS installer after the dedicated service has been provisioned and verified:

```bash
MB_GESTAO_TARGET_URL=https://pilot.example.com MB_GESTAO_PRODUCT_NAME="MB Gestão - Óptica Piloto" MB_GESTAO_APP_IDENTIFIER=br.com.mboptica.piloto MB_GESTAO_INSTALLER_SLUG=optica-piloto npm run tauri:build:customer
```

The customer build rejects the MB Óptica production host and requires a unique application identifier. It does not provision a server or database; those must exist independently before the installer is built. The variables above are configuration, not secrets.

## Local-server edition (one optical per computer/server)

The local edition opens only `http://127.0.0.1:3000/`. It does not point to the MB Óptica production URL. Provision the local application and PostgreSQL first using the instructions in `deploy/local-optical/README.md`; Docker Desktop is required for this pilot.

Build the local Windows installer from this directory:

```bash
MB_GESTAO_PRODUCT_NAME="MB Gestão - Óptica Piloto" MB_GESTAO_APP_IDENTIFIER=br.com.mboptica.piloto MB_GESTAO_INSTALLER_SLUG=optica-piloto npm run tauri:build:local
```

The local Tauri installer is currently a desktop client for the already-running local service. It does not yet install Docker Desktop, provision PostgreSQL, or automatically start/stop the local server. Those are explicit remaining installer-integration tasks; do not distribute this artifact as a one-click all-in-one installer until those tasks and clean-machine acceptance tests are complete.
