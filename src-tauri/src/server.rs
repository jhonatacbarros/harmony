use crate::process_audio::AudioLoopbackManager;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex};
use tower_http::cors::CorsLayer;

const VIEWER_HTML: &str = include_str!("../../public-viewer/index.html");

#[derive(Clone)]
pub struct AppState {
    pub pin: Arc<Mutex<Option<String>>>,
    // Secret only the local host UI knows. The tunnel exposes every route, so
    // host-only endpoints must not trust the caller (cloudflared connects from localhost).
    pub host_token: Arc<String>,
    pub http: reqwest::Client,
    pub host_tx: Arc<Mutex<Option<mpsc::UnboundedSender<String>>>>,
    pub viewers: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<String>>>>,
    pub audio_loopback: Arc<AudioLoopbackManager>,
}

#[derive(Deserialize)]
pub struct HostParams {
    pub token: Option<String>,
    pub pin: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub token: String,
}

fn stun_only_ice_servers() -> serde_json::Value {
    serde_json::json!([
        { "urls": ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }
    ])
}

// Credentials are minted per viewer connection (after the PIN check) and shared
// by both ends of that viewer's peer connection, so a leaked set only lives this long.
// ponytail: a relayed session longer than this may drop if the TURN server rejects
// refreshes with expired credentials; reconnecting mints fresh ones.
const TURN_TTL_SECS: u64 = 4 * 3600;
const TURN_API_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

// Cloudflare TURN (optional): HARMONY_TURN_KEY_ID + HARMONY_TURN_API_TOKEN.
// Falls back to STUN-only (P2P) when unset or on any error.
async fn fetch_ice_servers(http: &reqwest::Client) -> serde_json::Value {
    let (Ok(key_id), Ok(api_token)) = (
        std::env::var("HARMONY_TURN_KEY_ID"),
        std::env::var("HARMONY_TURN_API_TOKEN"),
    ) else {
        return stun_only_ice_servers();
    };

    let url = format!(
        "https://rtc.live.cloudflare.com/v1/turn/keys/{}/credentials/generate-ice-servers",
        key_id
    );
    let resp = http
        .post(url)
        .bearer_auth(api_token)
        .json(&serde_json::json!({ "ttl": TURN_TTL_SECS }))
        .send()
        .await
        .and_then(|r| r.error_for_status());

    let body: serde_json::Value = match resp {
        Ok(r) => match r.json().await {
            Ok(b) => b,
            Err(_) => return stun_only_ice_servers(),
        },
        Err(e) => {
            eprintln!("Cloudflare TURN indisponível, usando só STUN: {}", e);
            return stun_only_ice_servers();
        }
    };

    let servers = match body.get("iceServers") {
        Some(serde_json::Value::Array(a)) => a.clone(),
        Some(obj @ serde_json::Value::Object(_)) => vec![obj.clone()],
        _ => return stun_only_ice_servers(),
    };

    // Cloudflare recommends dropping port 53 URLs: browsers block/timeout on them.
    let servers: Vec<serde_json::Value> = servers
        .into_iter()
        .map(|mut s| {
            if let Some(serde_json::Value::Array(urls)) = s.get_mut("urls") {
                urls.retain(|u| u.as_str().map_or(false, |u| !is_port_53(u)));
            }
            s
        })
        .collect();

    serde_json::Value::Array(servers)
}

fn is_port_53(url: &str) -> bool {
    url.ends_with(":53") || url.contains(":53?")
}

#[derive(Deserialize)]
pub struct ViewerParams {
    pub pin: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SignalingPacket {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(rename = "senderId", default)]
    pub sender_id: Option<String>,
    #[serde(rename = "targetId", default)]
    pub target_id: Option<String>,
    pub payload: Option<serde_json::Value>,
    pub pin: Option<String>,
}

pub struct ServerManager {
    pub audio_loopback: Arc<AudioLoopbackManager>,
    shutdown_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl Default for ServerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ServerManager {
    pub fn new() -> Self {
        Self {
            audio_loopback: Arc::new(AudioLoopbackManager::new()),
            shutdown_tx: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start(&self, port: u16, pin: Option<String>) -> Result<SessionInfo, String> {
        self.stop().await;

        let host_token = uuid::Uuid::new_v4().to_string();
        let http = reqwest::Client::builder()
            .timeout(TURN_API_TIMEOUT)
            .build()
            .map_err(|e| format!("Falha ao criar cliente HTTP: {}", e))?;

        let state = AppState {
            pin: Arc::new(Mutex::new(pin)),
            host_token: Arc::new(host_token.clone()),
            http,
            host_tx: Arc::new(Mutex::new(None)),
            viewers: Arc::new(Mutex::new(HashMap::new())),
            audio_loopback: Arc::clone(&self.audio_loopback),
        };

        let app = Router::new()
            .route("/", get(serve_viewer_html))
            .route("/ws/host", get(ws_host_handler))
            .route("/ws/viewer", get(ws_viewer_handler))
            .route("/ws/audio_loopback", get(ws_audio_loopback_handler))
            .layer(CorsLayer::permissive())
            .with_state(state);

        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => return Err(format!("Falha ao abrir porta {}: {}", port, e)),
        };

        let (tx, rx) = tokio::sync::oneshot::channel();
        {
            let mut guard = self.shutdown_tx.lock().await;
            *guard = Some(tx);
        }

        tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    rx.await.ok();
                })
                .await;
        });

        Ok(SessionInfo { token: host_token })
    }

    pub async fn stop(&self) {
        let mut guard = self.shutdown_tx.lock().await;
        if let Some(tx) = guard.take() {
            let _ = tx.send(());
        }
    }
}

async fn serve_viewer_html() -> impl IntoResponse {
    Html(VIEWER_HTML)
}

fn is_host(state: &AppState, token: &Option<String>) -> bool {
    token.as_deref() == Some(state.host_token.as_str())
}

async fn ws_audio_loopback_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HostParams>,
    State(state): State<AppState>,
) -> Response {
    if !is_host(&state, &params.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    ws.on_upgrade(|socket| handle_audio_loopback_socket(socket, state))
}

async fn handle_audio_loopback_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.audio_loopback.sender.subscribe();

    loop {
        let buffer = match rx.recv().await {
            Ok(buffer) => buffer,
            // A stall dropped some chunks; the player re-buffers, keep streaming.
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => break,
        };
        if socket.send(Message::Binary(buffer)).await.is_err() {
            break;
        }
    }
}

async fn ws_host_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HostParams>,
    State(state): State<AppState>,
) -> Response {
    if !is_host(&state, &params.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if let Some(p) = params.pin {
        let mut pin_guard = state.pin.lock().await;
        *pin_guard = if p.is_empty() { None } else { Some(p) };
    }

    ws.on_upgrade(|socket| handle_host_socket(socket, state))
        .into_response()
}

async fn handle_host_socket(socket: WebSocket, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    {
        let mut host_tx = state.host_tx.lock().await;
        *host_tx = Some(tx);
    }

    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    let state_clone = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
            if let Ok(packet) = serde_json::from_str::<SignalingPacket>(&text) {
                if let Some(target_id) = packet.target_id {
                    let viewers = state_clone.viewers.lock().await;
                    if let Some(viewer_tx) = viewers.get(&target_id) {
                        let _ = viewer_tx.send(text);
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    let mut host_tx = state.host_tx.lock().await;
    *host_tx = None;
}

async fn ws_viewer_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<ViewerParams>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    // Server-assigned: a client-chosen id would let a viewer take over another's slot.
    let viewer_id = uuid::Uuid::new_v4().to_string();
    let provided_pin = params.pin;

    ws.on_upgrade(move |socket| handle_viewer_socket(socket, state, viewer_id, provided_pin))
}

async fn handle_viewer_socket(
    socket: WebSocket,
    state: AppState,
    viewer_id: String,
    provided_pin: Option<String>,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let current_pin = state.pin.lock().await.clone();
    if let Some(required_pin) = current_pin {
        let is_valid = provided_pin.as_ref() == Some(&required_pin);
        if !is_valid {
            let error_msg = serde_json::json!({
                "type": "pin_required",
                "error": provided_pin.is_some()
            })
            .to_string();
            let _ = ws_sender.send(Message::Text(error_msg)).await;
            return;
        }
    }

    let ice_servers = fetch_ice_servers(&state.http).await;
    let config_msg = serde_json::json!({
        "type": "config",
        "iceServers": ice_servers,
    })
    .to_string();
    if ws_sender.send(Message::Text(config_msg)).await.is_err() {
        return;
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    {
        let mut viewers = state.viewers.lock().await;
        viewers.insert(viewer_id.clone(), tx);
    }

    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    let state_clone = state.clone();
    let viewer_id_clone = viewer_id.clone();
    let viewer_id_for_recv = viewer_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
            // Stamp the real viewer id so a viewer can't impersonate another one.
            let Ok(mut msg) = serde_json::from_str::<serde_json::Value>(&text) else {
                continue;
            };
            let Some(obj) = msg.as_object_mut() else {
                continue;
            };
            obj.insert("senderId".into(), viewer_id_for_recv.clone().into());
            // The host's side of this peer connection uses the same credentials
            if obj.get("type").and_then(|t| t.as_str()) == Some("offer") {
                obj.insert("iceServers".into(), ice_servers.clone());
            }

            let host_guard = state_clone.host_tx.lock().await;
            if let Some(ref host_tx) = *host_guard {
                let _ = host_tx.send(msg.to_string());
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    {
        let mut viewers = state.viewers.lock().await;
        viewers.remove(&viewer_id_clone);
    }

    let host_guard = state.host_tx.lock().await;
    if let Some(ref host_tx) = *host_guard {
        let left_msg = serde_json::json!({
            "type": "viewer_left",
            "senderId": viewer_id_clone
        })
        .to_string();
        let _ = host_tx.send(left_msg);
    }
}
