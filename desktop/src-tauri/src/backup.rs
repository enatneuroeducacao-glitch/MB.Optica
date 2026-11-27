use rusqlite::{backup::Backup, Connection};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

fn paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    if !crate::NATIVE_MODE {
        return Err("Backup SQLite só está disponível no perfil nativo offline.".into());
    }
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let database = data.join("mb-gestao.db");
    let backups = data.join("backups");
    fs::create_dir_all(&backups).map_err(|e| format!("Não foi possível criar pasta de backups: {e}"))?;
    Ok((database, backups))
}

fn timestamp() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn remove_sqlite_sidecars(database: &Path) -> Result<(), String> {
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{}", database.to_string_lossy(), suffix));
        if sidecar.exists() {
            fs::remove_file(&sidecar).map_err(|e| format!("Não foi possível remover arquivo temporário SQLite {}: {e}", sidecar.display()))?;
        }
    }
    Ok(())
}

fn integrity(path: &Path) -> Result<(), String> {
    let connection = Connection::open(path).map_err(|e| format!("Não foi possível abrir SQLite para validação: {e}"))?;
    let result: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("Falha no integrity_check: {e}"))?;
    if result != "ok" {
        return Err(format!("SQLite reprovou no integrity_check: {result}"));
    }
    Ok(())
}

fn create_backup(database: &Path, backups: &Path, prefix: &str) -> Result<PathBuf, String> {
    if !database.is_file() {
        return Err("Banco SQLite ainda não existe; não há dados para copiar.".into());
    }
    let destination = backups.join(format!("{prefix}-{}.sqlite", timestamp()));
    let source = Connection::open(database).map_err(|e| format!("Não foi possível abrir banco de origem: {e}"))?;
    let mut target = Connection::open(&destination).map_err(|e| format!("Não foi possível criar backup: {e}"))?;
    {
        // O objeto Backup mantém um empréstimo mutável da conexão de destino.
        // Encerrá-lo neste escopo libera a conexão antes de validarmos o arquivo.
        let backup = Backup::new(&source, &mut target)
            .map_err(|e| format!("Não foi possível iniciar backup SQLite: {e}"))?;
        backup.run_to_completion(5, Duration::from_millis(250), None)
            .map_err(|e| format!("Backup SQLite não foi concluído: {e}"))?;
    }
    drop(target);
    integrity(&destination)?;
    Ok(destination)
}

#[tauri::command]
pub fn backup_database(app: AppHandle) -> Result<String, String> {
    let (database, backups) = paths(&app)?;
    let backup = create_backup(&database, &backups, "mb-gestao-backup")?;
    Ok(backup.to_string_lossy().to_string())
}

fn restart_server(app: &AppHandle) -> Result<(), String> {
    let resources = app.path().resource_dir().map_err(|e| format!("Diretório de recursos indisponível: {e}"))?;
    let data = app.path().app_data_dir().map_err(|e| format!("Diretório de dados indisponível: {e}"))?;
    crate::native_prepare(&resources, &data)?;
    if crate::wait_for_server() {
        Ok(())
    } else {
        crate::stop_native_server();
        Err("Banco restaurado, mas o servidor local não voltou a responder. Consulte server.log.".into())
    }
}

#[tauri::command]
pub fn restore_database(app: AppHandle, backup_name: String) -> Result<String, String> {
    let (database, backups) = paths(&app)?;
    let requested = Path::new(&backup_name);
    let name = requested.file_name().ok_or("Nome de backup inválido")?;
    if requested.components().count() != 1 || name.to_string_lossy() != backup_name {
        return Err("Informe somente o nome do arquivo de backup, sem caminhos.".into());
    }
    let source = backups.join(name);
    if !source.is_file() {
        return Err("Backup solicitado não foi encontrado na pasta local de backups.".into());
    }
    integrity(&source)?;

    // O servidor Node precisa estar parado para impedir gravações concorrentes
    // durante a substituição do arquivo SQLite.
    crate::stop_native_server();
    let rollback = match create_backup(&database, &backups, "mb-gestao-pre-restore") {
        Ok(path) => path,
        Err(error) => {
            let _ = restart_server(&app);
            return Err(format!("Restauração cancelada; não foi possível criar backup prévio: {error}"));
        }
    };

    let operation = (|| -> Result<(), String> {
        remove_sqlite_sidecars(&database)?;
        fs::copy(&source, &database).map_err(|e| format!("Falha ao copiar backup: {e}"))?;
        integrity(&database)?;
        Ok(())
    })();

    if let Err(error) = operation {
        let _ = remove_sqlite_sidecars(&database);
        let rollback_result = fs::copy(&rollback, &database);
        let restart_result = restart_server(&app);
        return Err(format!(
            "Restauração não validada. Rollback do banco: {}. Reinício do servidor: {}. Backup de segurança: {}. Erro: {}",
            if rollback_result.is_ok() { "concluído" } else { "FALHOU" },
            if restart_result.is_ok() { "concluído" } else { "FALHOU" },
            rollback.display(),
            error
        ));
    }

    restart_server(&app)?;
    Ok(format!("Banco restaurado e validado. Cópia anterior preservada em {}.", rollback.display()))
}


/// Explicitly adopts an existing SQLite database only when its schema exactly
/// matches the preserved pre-outbox baseline. Always creates and verifies a
/// consistent backup before invoking Prisma migration metadata commands.
#[tauri::command]
pub fn adopt_existing_database(app: AppHandle) -> Result<String, String> {
    if !crate::NATIVE_MODE {
        return Err("A adoção de schema só está disponível no instalador SQLite nativo.".into());
    }
    let (database, backups) = paths(&app)?;
    if !database.is_file() {
        return Err("Banco local não encontrado. A adoção é destinada somente a instalações existentes.".into());
    }
    integrity(&database)?;

    let connection = Connection::open(&database).map_err(|e| e.to_string())?;
    let has_tables: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations')",
        [], |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    let has_history: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations')",
        [], |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    drop(connection);

    if !has_tables {
        return Err("O banco não contém tabelas da aplicação; não é um banco legado elegível para adoção.".into());
    }
    if has_history {
        return Err("Este banco já possui histórico Prisma. Use a atualização normal; a adoção não deve ser repetida.".into());
    }

    let backup = create_backup(&database, &backups, "mb-gestao-pre-adoption")?;
    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    let native_root = resources.join("native");
    let app_dir = native_root.join("app");
    let node = native_root.join("node.exe");
    let prisma_cli = native_root.join("prisma-cli").join("node_modules").join("prisma").join("build").join("index.js");
    let baseline_schema = app_dir.join("prisma").join("sqlite").join("schema.baseline.prisma");
    if !node.is_file() || !prisma_cli.is_file() || !baseline_schema.is_file() {
        return Err(format!("Pacote incompleto para adoção segura. Backup preservado em {}.", backup.display()));
    }

    let database_url = format!("file:{}", database.to_string_lossy().replace('\\\\', "/"));
    let diff = Command::new(&node)
        .arg(&prisma_cli)
        .args(["migrate", "diff", "--from-url", &database_url, "--to-schema-datamodel"])
        .arg(&baseline_schema)
        .arg("--exit-code")
        .current_dir(&app_dir)
        .env("NODE_ENV", "production")
        .env("DATABASE_URL", &database_url)
        .output()
        .map_err(|e| format!("Não foi possível comparar o schema. Backup preservado em {}. Erro: {e}", backup.display()))?;

    if !diff.status.success() {
        let detail = String::from_utf8_lossy(&diff.stdout).to_string() + &String::from_utf8_lossy(&diff.stderr);
        return Err(format!(
            "Adoção cancelada: o banco existente não corresponde exatamente ao schema-base desta versão. Nenhuma migração foi marcada e os dados não foram alterados. Revise a diferença e planeje uma migração específica. Backup validado: {}. Detalhes: {}",
            backup.display(), detail
        ));
    }

    let resolve = Command::new(&node)
        .arg(&prisma_cli)
        .args(["migrate", "resolve", "--applied", "20261127100000_initial_sqlite", "--schema"])
        .arg(app_dir.join("prisma").join("sqlite").join("schema.prisma"))
        .current_dir(&app_dir)
        .env("NODE_ENV", "production")
        .env("DATABASE_URL", &database_url)
        .output()
        .map_err(|e| format!("Falha ao registrar baseline. Backup preservado em {}. Erro: {e}", backup.display()))?;
    if !resolve.status.success() {
        return Err(format!(
            "Não foi possível registrar a baseline. O backup permanece preservado em {}. Detalhes: {}",
            backup.display(), String::from_utf8_lossy(&resolve.stderr)
        ));
    }

    let deploy = Command::new(&node)
        .arg(&prisma_cli)
        .args(["migrate", "deploy", "--schema"])
        .arg(app_dir.join("prisma").join("sqlite").join("schema.prisma"))
        .current_dir(&app_dir)
        .env("NODE_ENV", "production")
        .env("DATABASE_URL", &database_url)
        .output()
        .map_err(|e| format!("Baseline registrada, mas não foi possível aplicar migrações posteriores. Backup preservado em {}. Erro: {e}", backup.display()))?;
    if !deploy.status.success() {
        return Err(format!(
            "Baseline registrada, mas uma migração posterior falhou. O banco e o backup foram preservados; reabra o aplicativo para retomar o deploy da migração pendente. Backup: {}. Detalhes: {}",
            backup.display(), String::from_utf8_lossy(&deploy.stderr)
        ));
    }

    integrity(&database)?;
    Ok(format!(
        "Adoção concluída. Schema legado comparado sem diferenças; baseline registrada e migrações posteriores aplicadas. Backup validado: {}. Feche e abra novamente o MB Gestão.",
        backup.display()
    ))
}
