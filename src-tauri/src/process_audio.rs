use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use sysinfo::{ProcessRefreshKind, RefreshKind, System};
use tokio::sync::broadcast;
use wasapi::{initialize_mta, AudioClient, Direction, SampleType, StreamMode, WaveFormat};
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindow, GetWindowLongW, GetWindowTextLengthW, GetWindowThreadProcessId,
    IsWindowVisible, GWL_EXSTYLE, GW_OWNER, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

/// Enumerates top-level, visible, titled windows (the same "alt-tab" heuristic Windows
/// itself uses) and returns the set of process IDs that own at least one of them. This
/// is what separates real user-facing apps/games from background services.
fn get_pids_with_visible_windows() -> HashSet<u32> {
    let mut pids: HashSet<u32> = HashSet::new();
    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut pids as *mut HashSet<u32> as isize),
        );
    }
    pids
}

unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let pids = &mut *(lparam.0 as *mut HashSet<u32>);

    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }
    if GetWindowTextLengthW(hwnd) == 0 {
        return BOOL(1);
    }

    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let is_app_window = (ex_style & WS_EX_APPWINDOW.0) != 0;
    let is_tool_window = (ex_style & WS_EX_TOOLWINDOW.0) != 0;
    if is_tool_window && !is_app_window {
        return BOOL(1);
    }

    // Skip windows owned by another window (tooltips, dialogs) unless explicitly an app window.
    let has_owner = GetWindow(hwnd, GW_OWNER).map(|owner| owner.0 != std::ptr::null_mut()).unwrap_or(false);
    if has_owner && !is_app_window {
        return BOOL(1);
    }

    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid != 0 {
        pids.insert(pid);
    }

    BOOL(1)
}

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

    let visible_pids = get_pids_with_visible_windows();

    let mut seen_names = HashSet::new();
    let mut processes = Vec::new();

    for (pid, process) in sys.processes() {
        // Only list processes that own at least one visible, titled window (the same
        // heuristic the Windows taskbar/Alt+Tab use) — filters out background services.
        if !visible_pids.contains(&pid.as_u32()) {
            continue;
        }

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
/// captured via the Windows Process Loopback API (WASAPI) for a specific target process.
#[derive(Clone)]
pub struct AudioLoopbackManager {
    pub sender: broadcast::Sender<Vec<u8>>,
    is_running: Arc<AtomicBool>,
    thread_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
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
            thread_handle: Arc::new(Mutex::new(None)),
        }
    }

    /// Starts capturing audio from `target_pid` (and its process tree). When `target_pid`
    /// is `None`, the caller should fall back to the browser's own system-audio loopback
    /// instead of calling this at all. Returns an error immediately if Process Loopback
    /// Capture isn't available (e.g. Windows version older than Windows 10 2004).
    pub fn start_capture(&self, target_pid: Option<u32>) -> Result<(), String> {
        self.stop_capture();

        let Some(target_pid) = target_pid else {
            return Err("Nenhum processo alvo selecionado".to_string());
        };

        let is_running = Arc::clone(&self.is_running);
        is_running.store(true, Ordering::SeqCst);

        let sender = self.sender.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();

        let handle = std::thread::Builder::new()
            .name("harmony-audio-capture".to_string())
            .spawn(move || {
                run_capture_loop(target_pid, is_running, sender, ready_tx);
            })
            .map_err(|e| format!("Falha ao iniciar thread de captura de áudio: {}", e))?;

        {
            let mut guard = self.thread_handle.lock().unwrap();
            *guard = Some(handle);
        }

        match ready_rx.recv_timeout(std::time::Duration::from_secs(3)) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => {
                self.stop_capture();
                Err(e)
            }
            Err(_) => {
                self.stop_capture();
                Err("Tempo esgotado ao iniciar a captura de áudio do processo".to_string())
            }
        }
    }

    pub fn stop_capture(&self) {
        self.is_running.store(false, Ordering::SeqCst);

        let handle = {
            let mut guard = self.thread_handle.lock().unwrap();
            guard.take()
        };

        if let Some(handle) = handle {
            let _ = handle.join();
        }
    }
}

/// Runs entirely on a dedicated OS thread: WASAPI's Process Loopback API relies on COM
/// objects created and driven from a single apartment-threaded context.
fn run_capture_loop(
    target_pid: u32,
    is_running: Arc<AtomicBool>,
    sender: broadcast::Sender<Vec<u8>>,
    ready_tx: std::sync::mpsc::Sender<Result<(), String>>,
) {
    if let Err(e) = initialize_mta().ok() {
        let _ = ready_tx.send(Err(format!(
            "Falha ao inicializar COM (MTA): {:?}. Verifique se o Windows é compatível.",
            e
        )));
        return;
    }

    let desired_format = WaveFormat::new(32, 32, &SampleType::Float, 48000, 2, None);
    let block_align = desired_format.get_blockalign() as usize;
    let include_process_tree = true;

    let mut audio_client =
        match AudioClient::new_application_loopback_client(target_pid, include_process_tree) {
            Ok(client) => client,
            Err(e) => {
                let _ = ready_tx.send(Err(format!(
                    "Captura de áudio por processo indisponível: {}. Requer Windows 10 2004+ ou Windows 11.",
                    e
                )));
                return;
            }
        };

    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: 0,
    };

    if let Err(e) = audio_client.initialize_client(&desired_format, &Direction::Capture, &mode) {
        let _ = ready_tx.send(Err(format!(
            "Falha ao inicializar cliente de áudio para o processo {}: {}",
            target_pid, e
        )));
        return;
    }

    let h_event = match audio_client.set_get_eventhandle() {
        Ok(ev) => ev,
        Err(e) => {
            let _ = ready_tx.send(Err(format!("Falha ao criar evento de captura: {}", e)));
            return;
        }
    };

    let capture_client = match audio_client.get_audiocaptureclient() {
        Ok(c) => c,
        Err(e) => {
            let _ = ready_tx.send(Err(format!(
                "Falha ao obter cliente de captura de áudio: {}",
                e
            )));
            return;
        }
    };

    if let Err(e) = audio_client.start_stream() {
        let _ = ready_tx.send(Err(format!("Falha ao iniciar fluxo de áudio: {}", e)));
        return;
    }

    let _ = ready_tx.send(Ok(()));

    // 20ms frames (960 samples per channel) to match the WebRTC audio pipeline cadence.
    const FRAMES_PER_CHUNK: usize = 960;
    let chunk_byte_size = block_align * FRAMES_PER_CHUNK;
    let mut sample_queue: VecDeque<u8> = VecDeque::with_capacity(chunk_byte_size * 4);

    while is_running.load(Ordering::Relaxed) {
        match capture_client.get_next_packet_size() {
            Ok(Some(frames)) if frames > 0 => {
                if capture_client
                    .read_from_device_to_deque(&mut sample_queue)
                    .is_err()
                {
                    break;
                }
            }
            Ok(_) => {}
            Err(_) => break,
        }

        while sample_queue.len() >= chunk_byte_size {
            let chunk: Vec<u8> = sample_queue.drain(..chunk_byte_size).collect();
            let _ = sender.send(chunk);
        }

        if h_event.wait_for_event(200).is_err() {
            // Timeout is expected while idle; keep polling as long as we're told to run.
            continue;
        }
    }

    let _ = audio_client.stop_stream();
}
