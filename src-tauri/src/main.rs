// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;
mod tunnel;

use local_ip_address::local_ip;
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
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_local_ip,
            start_stream_server,
            stop_stream_server,
            start_cloudflare_tunnel,
            stop_cloudflare_tunnel
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao executar aplicação Harmony Tauri");
}
