use rand::{distributions::Alphanumeric, Rng};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    path::PathBuf,
    process::Command,
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, WebviewWindow};

const IMAGE: &str = "mb-optica-local:pilot";
const PROJECT: &str = "mb-gestao-optica-piloto";
const HEALTH: &str = "127.0.0.1:3000";

fn secret() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect()
}

fn run_docker(args: &[&str]) -> Result<(), String> {
    let output = Command::new("docker")
        .args(args)
        .output()
        .map_err(|e| format!("Não foi possível executar Docker: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "Docker {} falhou: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        ));
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
                        && (response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
                    {
                        return true;
                    }
                }
            }
        }
        thread::sleep(Duration::from_secs(2));
    }
    false
}

fn prepare_instance(resource_dir: PathBuf, data_dir: PathBuf) -> Result<(), String> {
    fs::create_dir_all(&data_dir).map_err(|e| format!("Falha ao criar dados locais: {e}"))?;
    let env_path = data_dir.join(".env");
    if !env_path.exists() {
        let env = format!(
            "COMPOSE_PROJECT_NAME={PROJECT}\nSTORE_TRADE_NAME=Optica\nSTORE_STATE=SC\nDB_PASSWORD={}\nAUTH_SECRET={}\nBOOTSTRAP_TOKEN={}\n",
            secret(), secret(), secret()
        );
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&env_path)
            .map_err(|e| format!("Falha ao criar configuração local: {e}"))?;
        file.write_all(env.as_bytes())
            .map_err(|e| format!("Falha ao gravar configuração local: {e}"))?;
    }

    let info = Command::new("docker").arg("info").output()
        .map_err(|e| format!("Docker Desktop não está disponível: {e}"))?;
    if !info.status.success() {
        return Err("Inicie o Docker Desktop e aguarde ficar pronto. Depois abra o MB Gestão novamente.".into());
    }

    let inspect = Command::new("docker").args(["image", "inspect", IMAGE]).output()
        .map_err(|e| format!("Falha ao verificar imagem do servidor: {e}"))?;
    if !inspect.status.success() {
        let archive = resource_dir.join("mb-optica-image.tar");
        if !archive.exists() {
            return Err("O pacote não contém a imagem local do servidor MB Gestão.".into());
        }
        let archive_text = archive.to_string_lossy().to_string();
        run_docker(&["load", "-i", &archive_text])?;
    }

    let compose = resource_dir.join("compose.yaml");
    let env_text = env_path.to_string_lossy().to_string();
    let compose_text = compose.to_string_lossy().to_string();
    let mut command = Command::new("docker");
    command.args(["compose", "--env-file", &env_text, "-p", PROJECT, "-f", &compose_text, "up", "-d"]);
    let output = command.output().map_err(|e| format!("Falha ao iniciar MB Gestão: {e}"))?;
    if !output.status.success() {
        return Err(format!("Docker Compose não iniciou a aplicação: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window: WebviewWindow = app.get_webview_window("main")
                .ok_or("Janela principal não encontrada")?;
            window.hide()?;
            let handle = app.handle().clone();
            thread::spawn(move || {
                let result = (|| -> Result<(), String> {
                    let resource_dir = handle.path().resource_dir()
                        .map_err(|e| format!("Diretório de recursos indisponível: {e}"))?;
                    let data_dir = handle.path().app_data_dir()
                        .map_err(|e| format!("Diretório de dados indisponível: {e}"))?;
                    prepare_instance(resource_dir, data_dir)?;
                    if !wait_for_server() {
                        return Err("O servidor MB Gestão não respondeu após 4 minutos. Verifique o Docker Desktop.".into());
                    }
                    Ok(())
                })();
                if let Some(window) = handle.get_webview_window("main") {
                    if let Err(error) = result {
                        eprintln!("Falha ao iniciar MB Gestão: {error}");
                        let _ = window.set_title("MB Gestão — verifique o Docker Desktop");
                    } else {
                        let _ = window.set_title("MB Gestão - Óptica Piloto");
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
