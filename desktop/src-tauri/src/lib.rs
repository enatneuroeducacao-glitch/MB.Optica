mod updater;
mod backup;
use rand::{distributions::Alphanumeric, Rng};
use std::{
    env,
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Child, Command, Output},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, WebviewWindow};
use rusqlite::Connection;

const IMAGE: &str = "mb-optica-local:pilot";
const PROJECT: &str = "mb-gestao-optica-piloto";
const HEALTH: &str = "127.0.0.1:3000";
const PILOT_MODE: &str = match option_env!("MB_GESTAO_PILOT_MODE") { Some(value) => value, None => "" };
const CUSTOMER_NAME: &str = match option_env!("MB_GESTAO_CUSTOMER_NAME") { Some(value) => value, None => "Optica" };
pub(crate) const NATIVE_MODE: bool = match option_env!("MB_GESTAO_NATIVE_MODE") { Some("true") => true, _ => false };
const NATIVE_DB_PORT: &str = "55432";
static NATIVE_SERVER_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

fn secret() -> String {
    rand::thread_rng().sample_iter(&Alphanumeric).take(64).map(char::from).collect()
}

fn docker_executable() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("MB_GESTAO_DOCKER_EXE") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() { return Ok(candidate); }
    }
    if let Ok(path) = env::var("PATH") {
        for folder in env::split_paths(&path) {
            let candidate = folder.join(if cfg!(windows) { "docker.exe" } else { "docker" });
            if candidate.is_file() { return Ok(candidate); }
        }
    }
    if cfg!(windows) {
        let mut candidates = Vec::new();
        if let Ok(program_files) = env::var("ProgramFiles") {
            candidates.push(PathBuf::from(&program_files).join("Docker/Docker/resources/bin/docker.exe"));
        }
        if let Ok(local) = env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(local).join("Programs/Docker/Docker/resources/bin/docker.exe"));
        }
        candidates.push(PathBuf::from(r"C:\Program Files\Docker\Docker\resources\bin\docker.exe"));
        if let Some(path) = candidates.into_iter().find(|p| p.is_file()) { return Ok(path); }
    }
    Err("Não encontrei o docker.exe. Confirme se o Docker Desktop está instalado e reinicie o Windows para atualizar o PATH.".into())
}

fn docker(exe: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new(exe).args(args).output()
        .map_err(|e| format!("Não foi possível executar {}: {e}", exe.display()))
}

fn docker_checked(exe: &Path, args: &[&str]) -> Result<(), String> {
    let output = docker(exe, args)?;
    if !output.status.success() {
        return Err(format!("Docker {} falhou: {}", args.join(" "), String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

fn server_ready_once() -> bool {
    if let Ok(addresses) = HEALTH.to_socket_addrs() {
        for address in addresses {
            if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_secs(1)) {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let _ = stream.write_all(b"GET /api/health/ready HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && (response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")) {
                    return true;
                }
            }
        }
    }
    false
}

pub(crate) fn wait_for_server() -> bool {
    let deadline = Instant::now() + Duration::from_secs(240);
    while Instant::now() < deadline {
        if server_ready_once() { return true; }
        thread::sleep(Duration::from_secs(2));
    }
    false
}


fn set_env_value(path: &Path, key: &str, value: &str) -> Result<(), String> {
    let current = fs::read_to_string(path).map_err(|e| format!("Falha ao ler configuração local: {e}"))?;
    let mut found = false;
    let mut lines = Vec::new();
    for line in current.lines() {
        if line.split_once('=').map(|(k, _)| k.trim() == key).unwrap_or(false) {
            if !found { lines.push(format!("{key}={value}")); found = true; }
        } else { lines.push(line.to_string()); }
    }
    if !found { lines.push(format!("{key}={value}")); }
    fs::write(path, format!("{}\n", lines.join("\n"))).map_err(|e| format!("Falha ao atualizar configuração local: {e}"))
}


fn native_run(exe: &Path, args: &[&str]) -> Result<Output, String> {
    // Keep PostgreSQL utilities and their child postgres.exe process on a
    // deterministic UTF-8/C locale instead of inheriting Windows ACP messages.
    let output = Command::new(exe)
        .args(args)
        .env("LANG", "C")
        .env("LC_ALL", "C")
        // Do not inherit a machine-wide PostgreSQL client encoding override.
        // On Windows pt-BR this can pass ACP bytes (for example 0xE3) into
        // PostgreSQL's UTF-8 initialization path.
        .env_remove("PGCLIENTENCODING")
        .output()
        .map_err(|e| format!("Falha ao executar {}: {e}", exe.display()))?;
    if !output.status.success() {
        return Err(format!("{} falhou: {}", exe.file_name().unwrap_or_default().to_string_lossy(), String::from_utf8_lossy(&output.stderr)));
    }
    Ok(output)
}

// PostgreSQL's Windows utilities do not reliably handle the Win32 extended
// length prefix (\\\\?\\) when initdb locates the sibling postgres.exe.
fn windows_compatible_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let value = path.as_os_str().to_string_lossy();
        if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{}", rest));
        }
        if let Some(rest) = value.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path.to_path_buf()
}

fn wait_for_tcp(address: &str, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(addresses) = address.to_socket_addrs() {
            for socket in addresses {
                if TcpStream::connect_timeout(&socket, Duration::from_millis(700)).is_ok() {
                    return true;
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    false
}

pub(crate) fn native_prepare(resource_dir: &Path, data_dir: &Path) -> Result<(), String> {
    let resource_dir = windows_compatible_path(resource_dir);
    let data_dir = windows_compatible_path(data_dir);
    let root = resource_dir.join("native");
    let app_dir = root.join("app");
    let node = root.join("node.exe");
    let server_js = app_dir.join("server.js");
    let prisma_cli = root.join("prisma-cli").join("node_modules").join("prisma").join("build").join("index.js");

    for required in [&node, &server_js, &prisma_cli] {
        if !required.is_file() {
            return Err(format!("Componente nativo ausente: {}", required.display()));
        }
    }

    fs::create_dir_all(&data_dir).map_err(|e| format!("Falha ao criar dados locais: {e}"))?;
    let env_path = data_dir.join(".env");
    if !env_path.exists() {
        let env = format!(
            "STORE_TRADE_NAME={CUSTOMER_NAME}\nSTORE_STATE=SC\nAUTH_SECRET={}\nBOOTSTRAP_TOKEN={}\n",
            secret(), secret()
        );
        fs::write(&env_path, env).map_err(|e| format!("Falha ao criar configuração local: {e}"))?;
    }

    let env_text = fs::read_to_string(&env_path).map_err(|e| e.to_string())?;
    let value = |key: &str| -> Result<String, String> {
        env_text.lines().find_map(|line| line.strip_prefix(&format!("{key}=")).map(str::to_string))
            .ok_or_else(|| format!("Configuração {key} ausente"))
    };
    let auth_secret = value("AUTH_SECRET")?;
    let bootstrap_token = value("BOOTSTRAP_TOKEN")?;

    // SQLite fica na pasta de dados do usuário, fora da pasta de instalação.
    // Isso preserva os dados em atualizações e permite instalações independentes.
    let database_file = data_dir.join("mb-gestao.db");
    let database_path = database_file.to_string_lossy().replace('\\', "/");
    let database_url = format!("file:{database_path}");

    // Nunca altere silenciosamente um banco preexistente sem histórico de migrações.
    // Instalações novas recebem a baseline versionada; bancos antigos exigem adoção
    // explícita após backup, comparação de schema e reconciliação.
    let migration_dir = app_dir.join("prisma").join("sqlite").join("migrations");
    let baseline = migration_dir.join("20261127100000_initial_sqlite").join("migration.sql");
    if !baseline.is_file() {
        return Err(format!("Migração SQLite versionada ausente: {}. Reinstale um pacote íntegro.", baseline.display()));
    }
    let database = Connection::open(&database_file)
        .map_err(|e| format!("Não foi possível inspecionar o banco SQLite local: {e}"))?;
    let has_application_tables: bool = database.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations')",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Não foi possível verificar as tabelas SQLite: {e}"))?;
    let has_migration_history: bool = database.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations')",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Não foi possível verificar o histórico de migrações SQLite: {e}"))?;
    drop(database);

    if has_application_tables && !has_migration_history {
        return Err(
            "O banco SQLite contém tabelas, mas não possui histórico de migrações.             Por segurança, a inicialização foi interrompida sem modificar os dados.             Faça backup e execute o procedimento de adoção de schema antes de atualizar.".into()
        );
    }

    let mut migration = Command::new(&node);
    migration.arg(&prisma_cli).args(["migrate", "deploy", "--schema", "prisma/sqlite/schema.prisma"])
        .current_dir(&app_dir)
        .env("NODE_ENV", "production")
        .env("DATABASE_URL", &database_url)
        .env("AUTH_SECRET", &auth_secret)
        .env("BOOTSTRAP_TOKEN", &bootstrap_token)
        .env("STORE_TRADE_NAME", CUSTOMER_NAME)
        .env("STORE_STATE", "SC");
    let migration_output = migration.output().map_err(|e| format!("Falha ao executar migrações SQLite: {e}"))?;
    if !migration_output.status.success() {
        return Err(format!("Migração SQLite falhou. O banco foi preservado: {}", String::from_utf8_lossy(&migration_output.stderr)));
    }

    let mut slot = NATIVE_SERVER_PROCESS.get_or_init(|| Mutex::new(None)).lock()
        .map_err(|_| "Controle do servidor local indisponível".to_string())?;
    if slot.as_mut().and_then(|child| child.try_wait().ok().flatten()).is_some() {
        *slot = None;
    }
    if slot.is_none() && server_ready_once() {
        // Another MB Gestão process already owns the local server. Do not
        // spawn a second Node process or claim ownership of the existing one.
        return Ok(());
    }
    if slot.is_none() {
        let log_path = data_dir.join("server.log");
        let stdout = OpenOptions::new().create(true).append(true).open(&log_path)
            .map_err(|e| format!("Não foi possível abrir log do servidor: {e}"))?;
        let stderr = stdout.try_clone().map_err(|e| format!("Não foi possível duplicar log do servidor: {e}"))?;
        let mut server = Command::new(&node);
        server.arg("server.js").current_dir(&app_dir)
            .env("NODE_ENV", "production")
            .env("PORT", "3000")
            .env("HOSTNAME", "127.0.0.1")
            .env("DATABASE_URL", &database_url)
            .env("AUTH_SECRET", &auth_secret)
            .env("BOOTSTRAP_TOKEN", &bootstrap_token)
            .env("STORE_TRADE_NAME", CUSTOMER_NAME)
            .env("STORE_STATE", "SC")
            .env("MB_OPTICA_OWNER_INSTANCE", if PILOT_MODE == "true" { "true" } else { "false" })
            .stdin(std::process::Stdio::null())
            .stdout(stdout)
            .stderr(stderr);
        *slot = Some(server.spawn().map_err(|e| format!("Não foi possível iniciar o servidor MB Gestão: {e}"))?);
    }
    Ok(())
}

pub(crate) fn stop_native_server() {
    if let Some(slot) = NATIVE_SERVER_PROCESS.get() {
        if let Ok(mut guard) = slot.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn prepare_instance(resource_dir: PathBuf, data_dir: PathBuf) -> Result<(), String> {
    if NATIVE_MODE { return native_prepare(&resource_dir, &data_dir); }
    fs::create_dir_all(&data_dir).map_err(|e| format!("Falha ao criar dados locais: {e}"))?;
    let env_path = data_dir.join(".env");
    if !env_path.exists() {
        let env = format!(
            "COMPOSE_PROJECT_NAME={PROJECT}\nSTORE_TRADE_NAME={CUSTOMER_NAME}\nSTORE_STATE=SC\nDB_PASSWORD={}\nAUTH_SECRET={}\nBOOTSTRAP_TOKEN={}\n",
            secret(), secret(), secret()
        );
        let mut file = OpenOptions::new().write(true).create_new(true).open(&env_path)
            .map_err(|e| format!("Falha ao criar configuração local: {e}"))?;
        file.write_all(env.as_bytes()).map_err(|e| format!("Falha ao gravar configuração local: {e}"))?;
    }

    if PILOT_MODE == "true" {
        set_env_value(&env_path, "STORE_TRADE_NAME", CUSTOMER_NAME)?;
        set_env_value(&env_path, "MB_OPTICA_OWNER_INSTANCE", "true")?;
    }

    let docker_exe = docker_executable()?;
    let info = docker(&docker_exe, &["info"])?;
    if !info.status.success() {
        return Err(format!("Docker Desktop foi encontrado, mas não está pronto. Abra o Docker Desktop, aguarde 'Engine running' e tente novamente. Detalhe: {}",
            String::from_utf8_lossy(&info.stderr).trim()));
    }

    let inspect = docker(&docker_exe, &["image", "inspect", IMAGE])?;
    if !inspect.status.success() {
        let archive = resource_dir.join("mb-optica-image.tar");
        if !archive.exists() {
            return Err(format!("A imagem do servidor não foi encontrada em {}. O instalador pode ter sido extraído incorretamente.", archive.display()));
        }
        let archive_text = archive.to_string_lossy().to_string();
        docker_checked(&docker_exe, &["load", "-i", &archive_text])?;
    }

    let compose = resource_dir.join("compose.yaml");
    if !compose.exists() {
        return Err(format!("O arquivo compose.yaml não foi encontrado em {}.", compose.display()));
    }
    let env_text = env_path.to_string_lossy().to_string();
    let compose_text = compose.to_string_lossy().to_string();
    docker_checked(&docker_exe, &["compose", "--env-file", &env_text, "-p", PROJECT, "-f", &compose_text, "up", "-d"])?;
    Ok(())
}

fn show_error(window: &WebviewWindow, message: &str) {
    let adoption_action = if message.contains("contém tabelas") && message.contains("histórico de migrações") {
        "<section style='margin-top:24px;padding:20px;background:#fff;border:1px solid #d8dee8;border-radius:10px'><h2>Adoção segura do banco existente</h2><p>O procedimento fará um backup validado, comparará o schema atual com a baseline anterior e só registrará a migração se não houver diferenças. Se houver divergência, cancelará sem alterar os dados.</p><button id='adopt' style='padding:12px 18px;background:#1457c5;color:white;border:0;border-radius:8px;font-size:16px;cursor:pointer' onclick='adoptSchema()'>Fazer backup e verificar adoção</button><p id='adopt-result' style='white-space:pre-wrap'></p></section><script>async function adoptSchema(){const b=document.getElementById('adopt');const r=document.getElementById('adopt-result');b.disabled=true;b.textContent='Verificando...';try{r.textContent=await window.__TAURI__.core.invoke('adopt_existing_database');}catch(e){r.textContent=String(e);b.disabled=false;b.textContent='Tentar novamente';}}</script>"
    } else { "" };
    let html = format!(
        "<html><head><meta charset='utf-8'><title>MB Gestão - Inicialização</title></head><body style='font:16px Segoe UI,Arial;background:#f5f7fa;color:#172033;padding:48px;max-width:850px;margin:auto'><h1>Não foi possível iniciar o MB Gestão</h1><p>O servidor local não iniciou. Confira a mensagem abaixo:</p><pre style='white-space:pre-wrap;background:white;border:1px solid #ddd;border-radius:8px;padding:20px'>{}</pre>{}<p>Depois de corrigir, feche e abra novamente o MB Gestão. Seus dados locais foram preservados.</p></body></html>",
        message.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;"),
        adoption_action
    );
    let script = format!("document.open();document.write({:?});document.close();", html);
    let _ = window.eval(&script);
    let _ = window.set_title("MB Gestão — falha ao iniciar servidor local");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            backup::backup_database,
            backup::restore_database,
            backup::adopt_existing_database,
            updater::check_for_update,
            updater::apply_update
        ]);
    let builder = builder.setup(|app| {
            let window: WebviewWindow = app.get_webview_window("main")
                .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Janela principal não encontrada"))?;
            window.hide()?;
            let handle = app.handle().clone();
            thread::spawn(move || {
                let result = (|| -> Result<(), String> {
                    let resource_dir = handle.path().resource_dir().map_err(|e| format!("Diretório de recursos indisponível: {e}"))?;
                    let data_dir = handle.path().app_data_dir().map_err(|e| format!("Diretório de dados indisponível: {e}"))?;
                    prepare_instance(resource_dir, data_dir)?;
                    if !wait_for_server() {
                        stop_native_server();
                        return Err(if NATIVE_MODE {
                            "O servidor local MB Gestão não respondeu após 4 minutos. Consulte o arquivo server.log na pasta de dados do aplicativo.".into()
                        } else {
                            "O servidor MB Gestão não respondeu após 4 minutos. Verifique os contêineres no Docker Desktop.".into()
                        });
                    }
                    Ok(())
                })();
                if let Some(window) = handle.get_webview_window("main") {
                    match result {
                        Ok(()) => { let _ = window.set_title("MB Gestão Inteligente"); }
                        Err(error) => { show_error(&window, &error); }
                    }
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });
            Ok(())
        });
    let mut app = builder
        .build(tauri::generate_context!())
        .expect("erro ao construir o MB Gestão Inteligente");
    app.run(|_handle, event| {
        if matches!(event, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
            stop_native_server();
        }
    });
}
