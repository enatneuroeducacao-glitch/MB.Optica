# MB Gestão Inteligente — Windows desktop shell

This package creates a Windows NSIS installer for the existing online MB Gestão application. It does not embed the database, credentials, or customer records.

## Architecture

- The local-server edition opens `http://127.0.0.1:3000/` in a Tauri WebView. The application and PostgreSQL run separately on the optical store's local server.
- Authentication and operational data remain on the dedicated local application and PostgreSQL instance for that optical store.
- The desktop shell does not itself embed PostgreSQL; the local server stack provides the database and application. Internet is required for the first image/dependency download during provisioning.
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

## MB Gestão Inteligente — instalador autônomo SQLite (sem Docker)

O instalador nativo é a edição destinada ao uso diário no computador da ótica. Ele inclui Node.js para Windows, aplicação Next.js standalone, Prisma CLI e banco SQLite local. O servidor escuta somente em `127.0.0.1`. Docker Desktop, PostgreSQL e conexão com a internet não são requisitos para abrir e operar o sistema.

O banco e os arquivos operacionais ficam no diretório persistente de dados do usuário, fora da pasta de instalação. A sincronização com serviços externos é opcional e deve ocorrer em segundo plano.

No GitHub Actions, execute o workflow **MB Gestão Inteligente — Instalador Windows SQLite (sem Docker)**. Ele deve compilar com `MB_GESTAO_NATIVE_MODE=true`, sem modo piloto e sem qualquer etapa Docker. O artefato é publicado como `mb-gestao-inteligente-native-sqlite`.

Para compilação local em Windows, use Node.js 22, Rust stable, WebView2 e NSIS; prepare o bundle nativo conforme o workflow e execute `npm run tauri:build:native` com:

- `MB_GESTAO_NATIVE_MODE=true`
- `MB_GESTAO_PRODUCT_NAME=MB Gestão Inteligente`
- `MB_GESTAO_APP_IDENTIFIER=br.com.mboptica.gestao`
- `MB_GESTAO_INSTALLER_SLUG=mb-gestao-inteligente-sqlite`

Não use `MB_GESTAO_PILOT_MODE` no instalador geral. O build script rejeita explicitamente esse modo e também rejeita a ausência do modo nativo.

### Docker e edição PostgreSQL legada

Os workflows e instaladores antigos baseados em Docker/PostgreSQL permanecem separados para desenvolvimento ou instalações legadas. Eles não são o instalador autônomo SQLite e não devem ser usados para distribuir o MB Gestão Inteligente offline.
