use regex::Regex;
use std::env;
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

    /// Spawns `cloudflared` with multiple fallback paths and monitors both stdout and stderr
    pub async fn start(&self, port: u16) -> Result<String, String> {
        self.stop().await;

        let target_url = format!("http://localhost:{}", port);

        // Collect all possible candidate paths for cloudflared
        let mut candidates: Vec<String> = vec![
            "cloudflared".to_string(),
            "cloudflared.exe".to_string(),
            "./cloudflared.exe".to_string(),
            "./cloudflared".to_string(),
        ];

        // Add standard Windows system and program directories
        if cfg!(target_os = "windows") {
            candidates.push("C:\\Windows\\System32\\cloudflared.exe".to_string());
            candidates.push("C:\\Program Files\\cloudflared\\cloudflared.exe".to_string());
            candidates.push("C:\\Program Files (x86)\\cloudflared\\cloudflared.exe".to_string());
            candidates.push("C:\\ProgramData\\chocolatey\\bin\\cloudflared.exe".to_string());

            if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
                candidates.push(format!("{}\\Microsoft\\WinGet\\Links\\cloudflared.exe", local_app_data));
                candidates.push(format!("{}\\Programs\\cloudflared\\cloudflared.exe", local_app_data));
            }
            if let Ok(user_profile) = env::var("USERPROFILE") {
                candidates.push(format!("{}\\scoop\\shims\\cloudflared.exe", user_profile));
                candidates.push(format!("{}\\AppData\\Local\\Microsoft\\WinGet\\Links\\cloudflared.exe", user_profile));
            }
        } else {
            // macOS / Linux common paths
            candidates.push("/usr/local/bin/cloudflared".to_string());
            candidates.push("/opt/homebrew/bin/cloudflared".to_string());
            candidates.push("/usr/bin/cloudflared".to_string());
        }

        // Also check same directory as current executable
        if let Ok(exe_path) = env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let neighbor = exe_dir.join(if cfg!(target_os = "windows") { "cloudflared.exe" } else { "cloudflared" });
                candidates.push(neighbor.to_string_lossy().to_string());
            }
        }

        let mut child_proc: Option<Child> = None;
        let mut last_err = String::new();

        // 1. Try launching direct candidates
        for bin in &candidates {
            let mut cmd = Command::new(bin);
            cmd.args(["tunnel", "--url", &target_url, "--no-autoupdate"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            #[cfg(target_os = "windows")]
            {
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            match cmd.spawn() {
                Ok(child) => {
                    child_proc = Some(child);
                    break;
                }
                Err(err) => {
                    last_err = err.to_string();
                }
            }
        }

        // 2. Fallback on Windows via cmd.exe /C (which inherits dynamic environment PATH)
        if child_proc.is_none() && cfg!(target_os = "windows") {
            let mut cmd = Command::new("cmd.exe");
            cmd.args(["/C", "cloudflared", "tunnel", "--url", &target_url, "--no-autoupdate"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            #[cfg(target_os = "windows")]
            {
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            if let Ok(child) = cmd.spawn() {
                child_proc = Some(child);
            }
        }

        let mut child = match child_proc {
            Some(c) => c,
            None => {
                return Err(format!(
                    "cloudflared não encontrado no sistema. Verifique se o executável 'cloudflared.exe' está no PATH ou em C:\\Windows\\System32 ({})",
                    last_err
                ));
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let (url_tx, mut url_rx) = tokio::sync::mpsc::channel::<String>(1);
        let url_mutex = Arc::clone(&self.current_url);

        let re = Regex::new(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com").unwrap();

        // Task to read stdout
        if let Some(out) = stdout {
            let url_tx_clone = url_tx.clone();
            let url_mutex_clone = Arc::clone(&url_mutex);
            let re_clone = re.clone();

            tokio::spawn(async move {
                let reader = BufReader::new(out);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some(mat) = re_clone.find(&line) {
                        let url = mat.as_str().to_string();
                        let mut current = url_mutex_clone.lock().await;
                        *current = Some(url.clone());
                        let _ = url_tx_clone.send(url).await;
                        break;
                    }
                }
                while let Ok(Some(_)) = lines.next_line().await {}
            });
        }

        // Task to read stderr
        if let Some(err) = stderr {
            let url_tx_clone = url_tx;
            let url_mutex_clone = Arc::clone(&url_mutex);
            let re_clone = re;

            tokio::spawn(async move {
                let reader = BufReader::new(err);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some(mat) = re_clone.find(&line) {
                        let url = mat.as_str().to_string();
                        let mut current = url_mutex_clone.lock().await;
                        *current = Some(url.clone());
                        let _ = url_tx_clone.send(url).await;
                        break;
                    }
                }
                while let Ok(Some(_)) = lines.next_line().await {}
            });
        }

        // Save process handle
        {
            let mut guard = self.child.lock().await;
            *guard = Some(child);
        }

        // Wait up to 20 seconds for Cloudflare to assign the tunnel URL
        match tokio::time::timeout(std::time::Duration::from_secs(20), url_rx.recv()).await {
            Ok(Some(url)) => Ok(url),
            _ => {
                // If timed out, check if URL was set in mutex anyway
                let current = url_mutex.lock().await;
                if let Some(ref url) = *current {
                    Ok(url.clone())
                } else {
                    Err("O Cloudflare iniciou mas demorou para responder a URL. Verifique sua conexão com a internet.".to_string())
                }
            }
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
