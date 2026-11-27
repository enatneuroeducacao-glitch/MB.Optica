use rusqlite::{backup::Backup, Connection};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

fn paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    if !cfg!(windows) && !cfg!(target_os = "windows") {
        return Err("Backup SQLite está disponível no perfil Windows.".into());
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
    let rollback = create_backup(&database, &backups, "mb-gestao-pre-restore")?;
    fs::copy(&source, &database).map_err(|e| format!("Falha ao aplicar backup. Cópia de segurança anterior: {}. Erro: {e}", rollback.display()))?;
    if let Err(error) = integrity(&database) {
        let rollback_result = fs::copy(&rollback, &database);
        return Err(format!(
            "Backup restaurado foi reprovado na validação. Retorno ao banco anterior: {}. Backup de segurança: {}. Erro: {}",
            if rollback_result.is_ok() { "executado" } else { "FALHOU" },
            rollback.display(),
            error
        ));
    }
    Ok(format!("Banco restaurado e validado. Cópia anterior preservada em {}.", rollback.display()))
}
