mod updater;
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

const IMAGE: &str = "mb-optica-local:pilot";
const PROJECT: &str = "mb-gestao-optica-piloto";
const HEALTH: &str = "127.0.0.1:3000";
const PILOT_MODE: &str = match option_env!("MB_GESTAO_PILOT_MODE") { Some(value) => value, None => "" };
const CUSTOMER_NAME: &str = match option_env!("MB_GESTAO_CUSTOMER_NAME") { Some(value) => value, None => "Optica" };
const NATIVE_MODE: bool = option_env!("MB_GESTAO_NATIVE_MODE").is_some();
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

fn wait_for_server() -> bool {
    let deadline = Instant::now() + Duration::from_secs(240);
    while Instant::now() < deadline {
        if let Ok(addresses) = HEALTH.to_socket_addrs() {
            for address in addresses {
                if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_secs(2)) {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
                    let _ = stream.write_all(b"GET /api/health/ready HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
                    let mut response = String::new();
                    if stream.read_to_string(&mut response).is_ok()
                        && (response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")) {
                        return true;
                    }
                }
            }
        }
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
        .env("PGCLIENTENCODING", "UTF8")
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

fn native_prepare(resource_dir: &Path, data_dir: &Path) -> Result<(), String> {
    let resource_dir = windows_compatible_path(resource_dir);
    let data_dir = windows_compatible_path(data_dir);
    let root = resource_dir.join("native");
    let app_dir = root.join("app");
    let node = root.join("node.exe");
    let pg_bin = root.join("postgres").join("bin");
    let initdb = pg_bin.join("initdb.exe");
    let pg_ctl = pg_bin.join("pg_ctl.exe");
    let postgres = pg_bin.join("postgres.exe");
    let server_js = app_dir.join("server.js");
    let prisma_cli = app_dir.join("node_modules").join("prisma").join("build").join("index.js");
    for required in [&node, &initdb, &pg_ctl, &postgres, &server_js, &prisma_cli] {
        if !required.is_file() {
            return Err(format!("Componente nativo ausente: {}", required.display()));
        }
    }
    fs::create_dir_all(&data_dir).map_err(|e| format!("Falha ao criar dados locais: {e}"))?;
    let pg_data = data_dir.join("postgres-data");
    let env_path = data_dir.join(".env");
    if !env_path.exists() {
        let env = format!("STORE_TRADE_NAME={CUSTOMER_NAME}\nSTORE_STATE=SC\nDB_PASSWORD={}\nAUTH_SECRET={}\nBOOTSTRAP_TOKEN={}\n", secret(), secret(), secret());
        fs::write(&env_path, env).map_err(|e| format!("Falha ao criar configuração local: {e}"))?;
    }
    let env_text = fs::read_to_string(&env_path).map_err(|e| e.to_string())?;
    let value = |key: &str| -> Result<String, String> {
        env_text.lines().find_map(|line| line.strip_prefix(&format!("{key}=")).map(str::to_string))
            .ok_or_else(|| format!("Configuração {key} ausente"))
    };
    let db_password = value("DB_PASSWORD")?;
    let auth_secret = value("AUTH_SECRET")?;
    let bootstrap_token = value("BOOTSTRAP_TOKEN")?;

    if !pg_data.join("PG_VERSION").exists() {
        fs::create_dir_all(&pg_data).map_err(|e| e.to_string())?;
        let pwfile = data_dir.join("postgres-init-password.tmp");
        fs::write(&pwfile, &db_password).map_err(|e| e.to_string())?;
        let pw = pwfile.to_string_lossy().to_string();
        let data = pg_data.to_string_lossy().to_string();
        let result = native_run(&initdb, &["-D", &data, "-U", "mb_optica", "--pwfile", &pw, "--auth-host", "scram-sha-256", "--auth-local", "scram-sha-256", "--locale", "C", "--encoding", "UTF8"]);
        let _ = fs::remove_file(&pwfile);
        result?;
    }

    let pgdata_text = pg_data.to_string_lossy().to_string();
    let status = Command::new(&pg_ctl)
        .args(["-D", &pgdata_text, "status"])
        .env("LANG", "C")
        .env("LC_ALL", "C")
        .env("PGCLIENTENCODING", "UTF8")
        .output()
        .map_err(|e| format!("Não foi possível verificar PostgreSQL: {e}"))?;
    if !status.status.success() {
        let log = data_dir.join("postgres.log").to_string_lossy().to_string();
        let options = format!("-h 127.0.0.1 -p {NATIVE_DB_PORT}");
        native_run(&pg_ctl, &["-D", &pgdata_text, "-l", &log, "-o", &options, "-w", "start"])?;
    }

    let database_url = format!("postgresql://mb_optica:{db_password}@127.0.0.1:{NATIVE_DB_PORT}/mb_optica?schema=public");
    let mut migration = Command::new(&node);
    migration.arg(&prisma_cli).args(["migrate", "deploy"])
        .current_dir(&app_dir)
        .env("NODE_ENV", "production")
        .env("DATABASE_URL", &database_url)
        .env("DIRECT_URL", &database_url)
        .env("AUTH_SECRET", &auth_secret)
        .env("BOOTSTRAP_TOKEN", &bootstrap_token)
        .env("STORE_TRADE_NAME", CUSTOMER_NAME)
        .env("STORE_STATE", "SC");
    let migration_output = migration.output().map_err(|e| format!("Falha ao executar migrações: {e}"))?;
    if !migration_output.status.success() {
        return Err(format!("Migrações do banco falharam: {}", String::from_utf8_lossy(&migration_output.stderr)));
    }

    let mut slot = NATIVE_SERVER_PROCESS.get_or_init(|| Mutex::new(None)).lock()
        .map_err(|_| "Controle do servidor local indisponível".to_string())?;
    if slot.as_mut().and_then(|child| child.try_wait().ok().flatten()).is_some() {
        *slot = None;
    }
    if slot.is_none() {
        let mut server = Command::new(&node);
        server.arg("server.js").current_dir(&app_dir)
            .env("NODE_ENV", "production")
            .env("PORT", "3000")
            .env("HOSTNAME", "127.0.0.1")
            .env("DATABASE_URL", &database_url)
            .env("DIRECT_URL", &database_url)
            .env("AUTH_SECRET", &auth_secret)
            .env("BOOTSTRAP_TOKEN", &bootstrap_token)
            .env("STORE_TRADE_NAME", CUSTOMER_NAME)
            .env("STORE_STATE", "SC")
            .env("MB_OPTICA_OWNER_INSTANCE", if PILOT_MODE == "true" { "true" } else { "false" })
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        *slot = Some(server.spawn().map_err(|e| format!("Não foi possível iniciar o servidor MB Gestão: {e}"))?);
    }
    Ok(())
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
    let html = format!(
        "<html><head><meta charset='utf-8'><title>MB Gestão - Inicialização</title></head><body style='font:16px Segoe UI,Arial;background:#f5f7fa;color:#172033;padding:48px;max-width:850px;margin:auto'><h1>Não foi possível iniciar o MB Gestão</h1><p>O servidor local não iniciou. Confira a mensagem abaixo:</p><pre style='white-space:pre-wrap;background:white;border:1px solid #ddd;border-radius:8px;padding:20px'>{}</pre><p>Depois de corrigir, feche e abra novamente o MB Gestão. Seus dados locais foram preservados.</p></body></html>",
        message.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;")
    );
    let script = format!("document.open();document.write({:?});document.close();", html);
    let _ = window.eval(&script);
    let _ = window.set_title("MB Gestão — falha ao iniciar servidor local");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![updater::check_for_update, updater::apply_update])
        .setup(|app| {
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
                        return Err("O servidor MB Gestão não respondeu após 4 minutos. Verifique os contêineres no Docker Desktop.".into());
                    }
                    Ok(())
                })();
                if let Some(window) = handle.get_webview_window("main") {
                    match result {
                        Ok(()) => { let _ = window.set_title("MB Gestão - Óptica Piloto"); }
                        Err(error) => { show_error(&window, &error); }
                    }
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o MB Gestão Inteligente");
}
