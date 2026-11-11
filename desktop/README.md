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
