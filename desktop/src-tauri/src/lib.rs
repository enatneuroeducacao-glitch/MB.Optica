mod updater;
use rand::{distributions::Alphanumeric, Rng};
use std::{
    env,
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Command, Output},
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, WebviewWindow};

const IMAGE: &str = "mb-optica-local:pilot";
const PROJECT: &str = "mb-gestao-optica-piloto";
const HEALTH: &str = "127.0.0.1:3000";
const PILOT_MODE: &str = match option_env!("MB_GESTAO_PILOT_MODE") { Some(value) => value, None => "" };
const CUSTOMER_NAME: &str = match option_env!("MB_GESTAO_CUSTOMER_NAME") { Some(value) => value, None => "Optica" };

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

fn prepare_instance(resource_dir: PathBuf, data_dir: PathBuf) -> Result<(), String> {
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
