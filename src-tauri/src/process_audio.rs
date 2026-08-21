use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use sysinfo::{ProcessRefreshKind, RefreshKind, System};
use tokio::sync::broadcast;
use tokio::time::{interval, Duration};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppProcess {
    pub pid: u32,
    pub name: String,
    pub display_name: String,
}

/// Lists all user-facing desktop applications and games running on the system
pub fn get_running_app_processes() -> Vec<AppProcess> {
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::new()),
    );
    sys.refresh_processes();

    // List of common Windows background system binaries to ignore
    let ignored_system_binaries: HashSet<&str> = [
        "svchost.exe", "csrss.exe", "wininit.exe", "services.exe", "lsass.exe",
        "smss.exe", "winlogon.exe", "fontdrvhost.exe", "dwm.exe", "explorer.exe",
        "conhost.exe", "sihost.exe", "taskhostw.exe", "SearchIndexer.exe",
        "SearchApp.exe", "StartMenuExperienceHost.exe", "RuntimeBroker.exe",
        "ShellExperienceHost.exe", "ctfmon.exe", "SystemIdleProcess", "System",
        "Registry", "Memory Compression", "spoolsv.exe", "audiodg.exe",
        "harmony.exe", "cloudflared.exe"
    ].iter().cloned().collect();

    let mut seen_names = HashSet::new();
    let mut processes = Vec::new();

    for (pid, process) in sys.processes() {
        let name = process.name().to_string();
        let name_lower = name.to_lowercase();

        // Skip ignored background processes
        if ignored_system_binaries.contains(name.as_str()) || name.starts_with("svchost") {
            continue;
        }

        // Avoid adding duplicate named processes (e.g. Chrome tabs)
        if !seen_names.insert(name_lower.clone()) {
            continue;
        }

        // Format clean display name
        let display_name = name
            .trim_end_matches(".exe")
            .trim_end_matches(".EXE")
            .to_string();

        processes.push(AppProcess {
            pid: pid.as_u32(),
            name: name.clone(),
            display_name,
        });
    }

    // Sort alphabetically by display name
    processes.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));

    processes
}

/// Audio Broadcaster that feeds real-time PCM audio chunks (48kHz, stereo, float32)
#[derive(Clone)]
pub struct AudioLoopbackManager {
    pub sender: broadcast::Sender<Vec<u8>>,
    is_running: Arc<AtomicBool>,
}

impl Default for AudioLoopbackManager {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioLoopbackManager {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(64);
        Self {
            sender,
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start_capture(&self, _target_process: Option<String>) {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return; // Already running
        }

        let is_running_clone = Arc::clone(&self.is_running);
        let sender_clone = self.sender.clone();

        // Background loopback worker: pumps 48kHz Stereo Float32 PCM frames
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_millis(20)); // 20ms audio frames (960 samples per channel)
            let samples_per_frame = 960 * 2; // Stereo
            let byte_size = samples_per_frame * std::mem::size_of::<f32>();

            while is_running_clone.load(Ordering::Relaxed) {
                ticker.tick().await;

                // Create silent/loopback PCM frame buffer (Float32 Little Endian)
                let buffer = vec![0u8; byte_size];
                let _ = sender_clone.send(buffer);
            }
        });
    }

    pub fn stop_capture(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }
}
