$ErrorActionPreference = "Stop"

Write-Host "MB Cloud pgBackRest lab - non-production smoke test" -ForegroundColor Cyan
Write-Host "This script only builds/starts the isolated lab and creates a test row."
Write-Host "It does not connect to Render, Neon, Supabase, or production."

if (-not $env:LAB_POSTGRES_PASSWORD) {
  $secure = Read-Host "Enter a temporary password for this local lab" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:LAB_POSTGRES_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

docker compose build
if ($LASTEXITCODE -ne 0) { throw "Docker image build failed." }

docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Docker Compose startup failed." }

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker compose exec -T pgbackrest-lab pg_isready -U mbcloud_lab -d mbcloud_lab *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw "PostgreSQL did not become ready. Inspect: docker compose logs pgbackrest-lab" }

docker compose exec -T -u postgres pgbackrest-lab pgbackrest --stanza=mbcloud stanza-create
if ($LASTEXITCODE -ne 0) { throw "pgBackRest stanza-create failed." }

docker compose exec -T pgbackrest-lab psql -U mbcloud_lab -d mbcloud_lab -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS restore_probe(id integer PRIMARY KEY, marker text NOT NULL); INSERT INTO restore_probe VALUES (1, 'pgbackrest-lab-ok') ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker;"
if ($LASTEXITCODE -ne 0) { throw "Could not create the test record." }

docker compose exec -T -u postgres pgbackrest-lab pgbackrest --stanza=mbcloud --type=full backup
if ($LASTEXITCODE -ne 0) { throw "Full backup failed." }

docker compose exec -T -u postgres pgbackrest-lab pgbackrest info
if ($LASTEXITCODE -ne 0) { throw "pgBackRest info failed." }

docker compose exec -T pgbackrest-lab psql -U mbcloud_lab -d mbcloud_lab -v ON_ERROR_STOP=1 -c "SELECT id, marker FROM restore_probe WHERE id = 1;"
if ($LASTEXITCODE -ne 0) { throw "Could not verify the test record." }

Write-Host "PASS: lab build, database startup, stanza creation, full backup and probe query completed." -ForegroundColor Green
Write-Host "IMPORTANT: this is not yet a restore test or an off-site backup."
Write-Host "Keep the Docker volumes. Do not run 'docker compose down -v'."
