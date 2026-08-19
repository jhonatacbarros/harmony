use regex::Regex;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[derive(Default, Clone)]
pub struct TunnelManager {
    child: Arc<Mutex<Option<Child>>>,
    pub current_url: Arc<Mutex<Option<String>>>,
}

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            current_url: Arc::new(Mutex::new(None)),
        }
    }

    /// Spawns `cloudflared` and listens for the generated trycloudflare URL
    pub async fn start(&self, port: u16) -> Result<String, String> {
        self.stop().await;

        let target_url = format!("http://localhost:{}", port);

        // Attempt to find cloudflared binary
        let mut cmd = Command::new("cloudflared");
        cmd.args(["tunnel", "--url", &target_url, "--no-autoupdate"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            // CREATE_NO_WINDOW flag for background execution on Windows
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child_proc = match cmd.spawn() {
            Ok(child) => child,
            Err(err) => {
                return Err(format!(
                    "Não foi possível iniciar o cloudflared: {}. Certifique-se de que o executável 'cloudflared' está instalado ou na pasta do app.",
                    err
                ));
            }
        };

        let stderr = child_proc
            .stderr
            .take()
            .ok_or_else(|| "Falha ao capturar saída do cloudflared".to_string())?;

        let url_mutex = Arc::clone(&self.current_url);
        let (url_tx, mut url_rx) = tokio::sync::mpsc::channel::<String>(1);

        // Background task to read stderr for the generated trycloudflare URL
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            let re = Regex::new(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com").unwrap();

            let mut found_url: Option<String> = None;

            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(mat) = re.find(&line) {
                    let url = mat.as_str().to_string();
                    let mut current = url_mutex.lock().await;
                    *current = Some(url.clone());
                    let _ = url_tx.send(url.clone()).await;
                    found_url = Some(url);
                    break;
                }
            }

            // Keep consuming lines so the buffer doesn't block
            while let Ok(Some(_)) = lines.next_line().await {}
        });

        // Save child process
        {
            let mut guard = self.child.lock().await;
            *guard = Some(child_proc);
        }

        // Wait up to 15 seconds for URL generation
        match tokio::time::timeout(std::time::Duration::from_secs(15), url_rx.recv()).await {
            Ok(Some(url)) => Ok(url),
            _ => Err("Tempo limite excedido ao aguardar link do Cloudflare Tunnel.".to_string()),
        }
    }

    /// Terminates the running tunnel process
    pub async fn stop(&self) {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            let _ = child.kill().await;
        }

        let mut url_guard = self.current_url.lock().await;
        *url_guard = None;
    }
}
