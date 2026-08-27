// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod process_audio;
mod server;
mod tunnel;

use local_ip_address::local_ip;
use process_audio::{get_running_app_processes, AppProcess};
use server::ServerManager;
use std::sync::Arc;
use tauri::State;
use tunnel::TunnelManager;

struct AppStateWrapper {
    server: Arc<ServerManager>,
    tunnel: Arc<TunnelManager>,
}

#[tauri::command]
async fn get_local_ip() -> Result<String, String> {
    match local_ip() {
        Ok(ip) => Ok(ip.to_string()),
        Err(e) => Ok(format!("localhost ({})", e)),
    }
}

#[tauri::command]
async fn get_running_processes() -> Result<Vec<AppProcess>, String> {
    Ok(get_running_app_processes())
}

#[tauri::command]
async fn start_native_audio_capture(
    target_pid: Option<u32>,
    state: State<'_, AppStateWrapper>,
) -> Result<(), String> {
    let loopback = Arc::clone(&state.server.audio_loopback);
    tokio::task::spawn_blocking(move || loopback.start_capture(target_pid))
        .await
        .map_err(|e| format!("Falha ao iniciar captura de áudio: {}", e))?
}

#[tauri::command]
async fn stop_native_audio_capture(state: State<'_, AppStateWrapper>) -> Result<(), String> {
    let loopback = Arc::clone(&state.server.audio_loopback);
    tokio::task::spawn_blocking(move || loopback.stop_capture())
        .await
        .map_err(|e| format!("Falha ao parar captura de áudio: {}", e))
}

#[tauri::command]
async fn start_stream_server(
    port: u16,
    pin: Option<String>,
    state: State<'_, AppStateWrapper>,
) -> Result<(), String> {
    state.server.start(port, pin).await
}

#[tauri::command]
async fn stop_stream_server(state: State<'_, AppStateWrapper>) -> Result<(), String> {
    state.server.stop().await;
    Ok(())
}

#[tauri::command]
async fn start_cloudflare_tunnel(
    port: u16,
    state: State<'_, AppStateWrapper>,
) -> Result<String, String> {
    state.tunnel.start(port).await
}

#[tauri::command]
async fn get_cloudflare_url(state: State<'_, AppStateWrapper>) -> Result<Option<String>, String> {
    let guard = state.tunnel.current_url.lock().await;
    Ok(guard.clone())
}

#[tauri::command]
async fn stop_cloudflare_tunnel(state: State<'_, AppStateWrapper>) -> Result<(), String> {
    state.tunnel.stop().await;
    Ok(())
}

fn main() {
    let app_state = AppStateWrapper {
        server: Arc::new(ServerManager::new()),
        tunnel: Arc::new(TunnelManager::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_local_ip,
            get_running_processes,
            start_native_audio_capture,
            stop_native_audio_capture,
            start_stream_server,
            stop_stream_server,
            start_cloudflare_tunnel,
            get_cloudflare_url,
            stop_cloudflare_tunnel
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao executar aplicação Harmony Tauri");
}
