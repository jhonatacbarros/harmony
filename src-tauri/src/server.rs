use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tower_http::cors::CorsLayer;

const VIEWER_HTML: &str = include_str!("../../public-viewer/index.html");

#[derive(Clone)]
pub struct AppState {
    pub pin: Arc<Mutex<Option<String>>>,
    pub host_tx: Arc<Mutex<Option<mpsc::UnboundedSender<String>>>>,
    pub viewers: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<String>>>>,
}

#[derive(Deserialize)]
pub struct HostParams {
    pub pin: Option<String>,
}

#[derive(Deserialize)]
pub struct ViewerParams {
    pub id: Option<String>,
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
    shutdown_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl ServerManager {
    pub fn new() -> Self {
        Self {
            shutdown_tx: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start(&self, port: u16, pin: Option<String>) -> Result<(), String> {
        self.stop().await;

        let state = AppState {
            pin: Arc::new(Mutex::new(pin)),
            host_tx: Arc::new(Mutex::new(None)),
            viewers: Arc::new(Mutex::new(HashMap::new())),
        };

        let app = Router::new()
            .route("/", get(serve_viewer_html))
            .route("/ws/host", get(ws_host_handler))
            .route("/ws/viewer", get(ws_viewer_handler))
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

        Ok(())
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

async fn ws_host_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HostParams>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    // Update PIN if provided
    if let Some(p) = params.pin {
        let mut pin_guard = state.pin.lock().await;
        *pin_guard = if p.is_empty() { None } else { Some(p) };
    }

    ws.on_upgrade(move |socket| handle_host_socket(socket, state))
}

async fn handle_host_socket(socket: WebSocket, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    {
        let mut host_guard = state.host_tx.lock().await;
        *host_guard = Some(tx);
    }

    // Forward messages from channel to Host WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Forward messages from Host to appropriate Viewers
    let state_clone = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
            if let Ok(packet) = serde_json::from_str::<SignalingPacket>(&text) {
                if let Some(target_id) = packet.target_id {
                    let viewers = state_clone.viewers.lock().await;
                    if let Some(viewer_tx) = viewers.get(&target_id) {
                        let _ = viewer_tx.send(text);
                    }
                } else if packet.msg_type == "status" {
                    // Broadcast status update (e.g. paused/live) to all viewers
                    let viewers = state_clone.viewers.lock().await;
                    for viewer_tx in viewers.values() {
                        let _ = viewer_tx.send(text.clone());
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    // Clear host sender
    let mut host_guard = state.host_tx.lock().await;
    *host_guard = None;
}

async fn ws_viewer_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<ViewerParams>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let viewer_id = params.id.unwrap_or_else(|| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("v_{}", ts)
    });
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

    // Check PIN requirement
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

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    {
        let mut viewers = state.viewers.lock().await;
        viewers.insert(viewer_id.clone(), tx);
    }

    // Send messages from Host to Viewer
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Forward messages from Viewer to Host
    let state_clone = state.clone();
    let viewer_id_clone = viewer_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
            let host_guard = state_clone.host_tx.lock().await;
            if let Some(ref host_tx) = *host_guard {
                let _ = host_tx.send(text);
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    // Remove viewer and notify host
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
