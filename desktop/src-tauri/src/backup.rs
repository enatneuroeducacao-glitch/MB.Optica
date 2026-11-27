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
    let backup = Backup::new(&source, &mut target).map_err(|e| format!("Não foi possível iniciar backup SQLite: {e}"))?;
    backup.run_to_completion(5, Duration::from_millis(250), None)
        .map_err(|e| format!("Backup SQLite não foi concluído: {e}"))?;
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
        fs::copy(&source, &database).map_err(|e| format!("Falha ao copiar backup: {e}"))?;
        integrity(&database)?;
        Ok(())
    })();

    if let Err(error) = operation {
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
