use serde::{Deserialize, Serialize};
use std::collections::HashSet;
#[cfg(windows)]
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use sysinfo::{ProcessRefreshKind, RefreshKind, System};
use tokio::sync::broadcast;
#[cfg(windows)]
use wasapi::{initialize_mta, AudioClient, Direction, SampleType, StreamMode, WaveFormat};
#[cfg(windows)]
use windows::core::{w, BOOL};
#[cfg(windows)]
use windows::Win32::System::Threading::{AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW};
#[cfg(windows)]
use windows::Win32::Foundation::{HWND, LPARAM};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindow, GetWindowLongW, GetWindowTextLengthW, GetWindowThreadProcessId,
    IsWindowVisible, GWL_EXSTYLE, GW_OWNER, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

// Per-process capture is WASAPI-only: elsewhere the process list is empty and the
// UI falls back to the browser's system audio.
#[cfg(not(windows))]
fn get_pids_with_visible_windows() -> HashSet<u32> {
    HashSet::new()
}


/// Enumerates top-level, visible, titled windows (the same "alt-tab" heuristic Windows
/// itself uses) and returns the set of process IDs that own at least one of them. This
/// is what separates real user-facing apps/games from background services.
#[cfg(windows)]
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

#[cfg(windows)]
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

#[cfg(any(windows, test))]
const DISCORD_BINARIES: [&str; 3] = ["discord.exe", "discordptb.exe", "discordcanary.exe"];

/// Roots of the Discord process trees: Discord processes whose parent isn't another
/// Discord process. Excluding a root's tree removes every helper process, including the
/// one that renders voice-call audio. More than one root means several clients
/// (Stable/PTB/Canary) are open.
#[cfg(any(windows, test))]
fn discord_root_pids(procs: &[(u32, String, Option<u32>)]) -> Vec<u32> {
    let is_discord = |name: &str| DISCORD_BINARIES.contains(&name.to_lowercase().as_str());
    let discord_pids: HashSet<u32> = procs
        .iter()
        .filter(|(_, name, _)| is_discord(name))
        .map(|(pid, _, _)| *pid)
        .collect();
    procs
        .iter()
        .filter(|(pid, _, parent)| {
            discord_pids.contains(pid) && !parent.is_some_and(|p| discord_pids.contains(&p))
        })
        .map(|(pid, _, _)| *pid)
        .collect()
}

#[cfg(windows)]
fn find_discord_root_pids() -> Vec<u32> {
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::new()),
    );
    sys.refresh_processes();
    let procs: Vec<(u32, String, Option<u32>)> = sys
        .processes()
        .iter()
        .map(|(pid, p)| (pid.as_u32(), p.name().to_string(), p.parent().map(|pp| pp.as_u32())))
        .collect();
    discord_root_pids(&procs)
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

    /// With `Some(pid)`, captures only that process tree (INCLUDE mode). With `None`,
    /// captures the whole system mix minus the Discord tree (EXCLUDE mode, the same
    /// trick Discord uses), so call voices never reach the stream. Without Discord
    /// running, Harmony's own tree is excluded instead to avoid self-echo.
    /// Returns an error if Process Loopback Capture isn't available (pre Windows 10 2004),
    /// and `Ok(Some(warning))` when the exclusion can't cover every Discord client.
    pub fn start_capture(&self, target_pid: Option<u32>) -> Result<Option<String>, String> {
        self.stop_capture();

        #[cfg(not(windows))]
        {
            let _ = target_pid;
            return Err("Captura de áudio por processo requer Windows 10 2004+ ou Windows 11.".to_string());
        }

        // ponytail: the API excludes a single tree, so a second Discord client or one
        // launched after the stream started still leaks; we warn instead of fixing it.
        #[cfg(windows)]
        {
            let mut warning = None;
            let (target_pid, include) = match target_pid {
                Some(pid) => (pid, true),
                None => {
                    let roots = find_discord_root_pids();
                    match roots.as_slice() {
                        [] => {
                            warning = Some("Discord não estava aberto ao iniciar: se abrir agora, a call vai vazar na live. Abra o Discord e reinicie a transmissão.".to_string());
                            (std::process::id(), false)
                        }
                        [root] => (*root, false),
                        [root, ..] => {
                            warning = Some("Mais de um Discord aberto (Stable/PTB/Canary): só um foi excluído da live. Feche os outros.".to_string());
                            (*root, false)
                        }
                    }
                }
            };
            self.spawn_capture(target_pid, include).map(|_| warning)
        }
    }

    #[cfg(windows)]
    fn spawn_capture(&self, target_pid: u32, include: bool) -> Result<(), String> {
        let is_running = Arc::clone(&self.is_running);
        is_running.store(true, Ordering::SeqCst);

        let sender = self.sender.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();

        let handle = std::thread::Builder::new()
            .name("harmony-audio-capture".to_string())
            .spawn(move || {
                run_capture_loop(target_pid, include, is_running, sender, ready_tx);
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
#[cfg(windows)]
fn run_capture_loop(
    target_pid: u32,
    include: bool,
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

    // Games peg the CPU; MMCSS "Pro Audio" keeps this thread from being starved.
    // Best effort: without it capture still works, just at normal priority.
    let mmcss = unsafe {
        let mut task_index = 0u32;
        AvSetMmThreadCharacteristicsW(w!("Pro Audio"), &mut task_index).ok()
    };

    let mut audio_client =
        match AudioClient::new_application_loopback_client(target_pid, include) {
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
        buffer_duration_hns: 200_000,
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

    'capture: while is_running.load(Ordering::Relaxed) {
        // One event can cover several packets; drain them all or the backlog overruns.
        loop {
            match capture_client.get_next_packet_size() {
                Ok(Some(frames)) if frames > 0 => {
                    let start = sample_queue.len();
                    match capture_client.read_from_device_to_deque(&mut sample_queue) {
                        // SILENT means the bytes are garbage and must be treated as zeros.
                        Ok(info) if info.flags.silent => {
                            sample_queue.range_mut(start..).for_each(|b| *b = 0);
                        }
                        Ok(_) => {}
                        Err(_) => break 'capture,
                    }
                }
                Ok(_) => break,
                Err(_) => break 'capture,
            }
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
    if let Some(handle) = mmcss {
        let _ = unsafe { AvRevertMmThreadCharacteristics(handle) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_discord_root_and_ignores_children() {
        let procs = vec![
            (1, "explorer.exe".to_string(), None),
            (10, "Discord.exe".to_string(), Some(1)),
            (11, "Discord.exe".to_string(), Some(10)),
            (12, "Discord.exe".to_string(), Some(11)),
            (20, "game.exe".to_string(), Some(1)),
        ];
        assert_eq!(discord_root_pids(&procs), vec![10]);
        assert!(discord_root_pids(&procs[4..]).is_empty());

        let mut two = procs.clone();
        two.push((30, "DiscordCanary.exe".to_string(), Some(1)));
        let mut roots = discord_root_pids(&two);
        roots.sort();
        assert_eq!(roots, vec![10, 30]);
    }
}
