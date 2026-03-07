// Browser proxy client — calls gemini-browser-proxy for AI image generation.
// Enabled via BROWSER_PROXY_URL env var (default: http://localhost:3001).
// The proxy runs 4 parallel Playwright workers with human-like delays/jitter.
// Jaskier Shared Pattern -- browser_proxy

use std::time::Duration;

use serde_json::json;

/// Check if the browser proxy is enabled via env var.
pub fn is_enabled() -> bool {
    std::env::var("BROWSER_PROXY_URL").is_ok()
        || std::env::var("BROWSER_PROXY")
            .ok()
            .is_some_and(|v| v == "1" || v == "true")
}

fn proxy_base_url() -> String {
    std::env::var("BROWSER_PROXY_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string())
}

/// Call the browser proxy to generate/edit an image.
/// Sends one image + prompt, receives back a generated image as base64.
/// Retries once on transient failures (502, 503, timeout) with 5s backoff.
pub async fn generate_image(
    client: &reqwest::Client,
    image_base64: &str,
    mime_type: &str,
    prompt: &str,
    context: &str,
) -> Result<String, String> {
    let url = format!("{}/api/generate-image", proxy_base_url());

    tracing::info!(
        "browser_proxy[{}]: sending request (image ~{}KB, prompt {}chars)",
        context,
        image_base64.len() * 3 / 4 / 1024,
        prompt.len()
    );

    let body = json!({
        "image_base64": image_base64,
        "mime_type": mime_type,
        "prompt": prompt,
    });

    // Attempt with one retry on transient failures
    for attempt in 1..=2u8 {
        let start = std::time::Instant::now();

        let resp = client
            .post(&url)
            .json(&body)
            .timeout(Duration::from_secs(360))
            .send()
            .await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                if attempt < 2 {
                    tracing::warn!(
                        "browser_proxy[{}]: attempt {} failed ({}), retrying in 5s",
                        context, attempt, e
                    );
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                }
                return Err(format!("Browser proxy unavailable ({}): {}", url, e));
            }
        };

        let status = resp.status();
        let resp_text = resp
            .text()
            .await
            .map_err(|e| format!("Browser proxy response read error: {}", e))?;

        // Retry on 502/503
        if (status.as_u16() == 502 || status.as_u16() == 503) && attempt < 2 {
            tracing::warn!(
                "browser_proxy[{}]: HTTP {} on attempt {}, retrying in 5s",
                context, status.as_u16(), attempt
            );
            tokio::time::sleep(Duration::from_secs(5)).await;
            continue;
        }

        if !status.is_success() {
            let preview_len = resp_text.len().min(300);
            let preview = &resp_text[..preview_len];
            return Err(format!(
                "Browser proxy returned {}: {}",
                status.as_u16(),
                preview
            ));
        }

        let resp_json: serde_json::Value = serde_json::from_str(&resp_text)
            .map_err(|e| format!("Browser proxy invalid JSON: {}", e))?;

        let image_b64 = resp_json["image_base64"]
            .as_str()
            .ok_or_else(|| "Browser proxy response missing image_base64".to_string())?
            .to_string();

        let processing_ms = resp_json["processing_time_ms"].as_u64().unwrap_or(0);
        let total_ms = start.elapsed().as_millis();
        tracing::info!(
            "browser_proxy[{}]: success in {}ms (proxy: {}ms, result ~{}KB)",
            context,
            total_ms,
            processing_ms,
            image_b64.len() * 3 / 4 / 1024
        );

        return Ok(image_b64);
    }

    unreachable!()
}

/// Check if the browser proxy is healthy and ready.
pub async fn health_check(client: &reqwest::Client) -> bool {
    let url = format!("{}/health", proxy_base_url());
    match client.get(&url).timeout(Duration::from_secs(5)).send().await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                json["ready"].as_bool().unwrap_or(false)
            } else {
                false
            }
        }
        Err(_) => false,
    }
}

/// Return the configured proxy directory for auto-restart.
pub fn proxy_dir() -> Option<String> {
    std::env::var("BROWSER_PROXY_DIR").ok().filter(|s| !s.is_empty())
}

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct BrowserProxyStatus {
    pub configured: bool,
    pub reachable: bool,
    pub ready: bool,
    pub workers_ready: u32,
    pub workers_busy: u32,
    pub pool_size: u32,
    pub queue_length: u32,
    pub total_requests: u64,
    pub total_errors: u64,
    pub proxy_uptime_seconds: u64,
    pub last_check_epoch: u64,
    pub last_error: Option<String>,
    pub consecutive_failures: u32,
    pub last_restart_epoch: u64,
    pub total_restarts: u32,
    #[serde(default)]
    pub backoff_level: u32,
    #[serde(default)]
    pub consecutive_successes: u32,
    #[serde(skip)]
    pub last_pid: Option<u32>,
}

#[derive(Clone, serde::Serialize)]
pub struct ProxyHealthEvent {
    pub timestamp: String,
    pub event_type: String,
    pub workers_ready: u32,
    pub pool_size: u32,
    pub error: Option<String>,
    pub consecutive_failures: u32,
    pub total_restarts: u32,
}

pub struct ProxyHealthHistory {
    events: std::sync::Mutex<std::collections::VecDeque<ProxyHealthEvent>>,
    capacity: usize,
}

impl ProxyHealthHistory {
    pub fn new(capacity: usize) -> Self {
        Self {
            events: std::sync::Mutex::new(std::collections::VecDeque::with_capacity(capacity)),
            capacity,
        }
    }

    pub fn push(&self, event: ProxyHealthEvent) {
        let mut buf = self.events.lock().unwrap_or_else(|p| p.into_inner());
        if buf.len() >= self.capacity {
            buf.pop_front();
        }
        buf.push_back(event);
    }

    pub fn recent(&self, limit: usize) -> Vec<ProxyHealthEvent> {
        let buf = self.events.lock().unwrap_or_else(|p| p.into_inner());
        buf.iter().rev().take(limit).cloned().collect()
    }

    pub fn len(&self) -> usize {
        self.events.lock().unwrap_or_else(|p| p.into_inner()).len()
    }
}

/// Detailed health check — returns full status from proxy `/health` endpoint.
/// Called by watchdog every 30s to keep `AppState::browser_proxy_status` current.
pub(crate) async fn detailed_health_check(client: &reqwest::Client) -> BrowserProxyStatus {
    if !is_enabled() {
        return BrowserProxyStatus::default();
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let url = format!("{}/health", proxy_base_url());
    match client.get(&url).timeout(Duration::from_secs(5)).send().await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                BrowserProxyStatus {
                    configured: true,
                    reachable: true,
                    ready: json["ready"].as_bool().unwrap_or(false),
                    workers_ready: json["workers_ready"].as_u64().unwrap_or(0) as u32,
                    workers_busy: json["workers_busy"].as_u64().unwrap_or(0) as u32,
                    pool_size: json["pool_size"].as_u64().unwrap_or(0) as u32,
                    queue_length: json["queue_length"].as_u64().unwrap_or(0) as u32,
                    total_requests: json["total_requests"].as_u64().unwrap_or(0),
                    total_errors: json["total_errors"].as_u64().unwrap_or(0),
                    proxy_uptime_seconds: json["uptime_seconds"].as_u64().unwrap_or(0),
                    last_check_epoch: now,
                    last_error: None,
                    ..Default::default()
                }
            } else {
                BrowserProxyStatus {
                    configured: true,
                    reachable: true,
                    ready: false,
                    last_check_epoch: now,
                    last_error: Some("Invalid JSON from proxy /health".to_string()),
                    ..Default::default()
                }
            }
        }
        Err(e) => BrowserProxyStatus {
            configured: true,
            reachable: false,
            ready: false,
            last_check_epoch: now,
            last_error: Some(format!("{}", e)),
            ..Default::default()
        },
    }
}

// ── HTTP handlers for browser proxy management ───────────────────────────

use axum::extract::State;
use axum::Json;
use axum::http::StatusCode;

/// GET /api/browser-proxy/status — combined health + login status
pub async fn proxy_status(
    State(state): State<crate::state::AppState>,
) -> Json<serde_json::Value> {
    if !is_enabled() {
        return Json(json!({
            "configured": false,
            "error": "BROWSER_PROXY_URL not set"
        }));
    }

    let client = &state.http_client;
    let base = proxy_base_url();

    // Fetch health
    let health_resp = client
        .get(format!("{}/health", base))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok();
    let health = match health_resp {
        Some(r) => r.json::<serde_json::Value>().await.ok(),
        None => None,
    };

    // Fetch login status
    let login_resp = client
        .get(format!("{}/api/login/status", base))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok();
    let login = match login_resp {
        Some(r) => r.json::<serde_json::Value>().await.ok(),
        None => None,
    };

    let mut result = json!({ "configured": true, "proxy_url": base });

    if let Ok(cached) = state.browser_proxy_status.try_read() {
        result["watchdog"] = json!({
            "consecutive_failures": cached.consecutive_failures,
            "total_restarts": cached.total_restarts,
            "backoff_level": cached.backoff_level,
        });
    }

    if let Some(h) = health {
        result["health"] = h;
        result["reachable"] = json!(true);
    } else {
        result["reachable"] = json!(false);
    }

    if let Some(l) = login {
        result["login"] = l;
    }

    Json(result)
}

/// POST /api/browser-proxy/login — trigger login on proxy
pub async fn proxy_login(
    State(state): State<crate::state::AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_enabled() {
        return Err(StatusCode::NOT_FOUND);
    }

    let url = format!("{}/api/login", proxy_base_url());
    let resp = state
        .http_client
        .post(&url)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("browser_proxy login request failed: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

    let body: serde_json::Value = resp.json().await.unwrap_or(json!({"error": "invalid response"}));
    Ok(Json(body))
}

/// GET /api/browser-proxy/login/status — check login progress
pub async fn proxy_login_status(
    State(state): State<crate::state::AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_enabled() {
        return Err(StatusCode::NOT_FOUND);
    }

    let url = format!("{}/api/login/status", proxy_base_url());
    let resp = state
        .http_client
        .get(&url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("browser_proxy login status failed: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

    let body: serde_json::Value = resp.json().await.unwrap_or(json!({"error": "invalid response"}));
    Ok(Json(body))
}

/// POST /api/browser-proxy/reinit — reinitialize proxy workers
pub async fn proxy_reinit(
    State(state): State<crate::state::AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_enabled() {
        return Err(StatusCode::NOT_FOUND);
    }

    let url = format!("{}/api/reinit", proxy_base_url());
    let resp = state
        .http_client
        .post(&url)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("browser_proxy reinit failed: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

    let body: serde_json::Value = resp.json().await.unwrap_or(json!({"error": "invalid response"}));
    Ok(Json(body))
}

/// DELETE /api/browser-proxy/login — logout from proxy
pub async fn proxy_logout(
    State(state): State<crate::state::AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_enabled() {
        return Err(StatusCode::NOT_FOUND);
    }

    let url = format!("{}/api/login", proxy_base_url());
    let resp = state
        .http_client
        .delete(&url)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("browser_proxy logout failed: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

    let body: serde_json::Value = resp.json().await.unwrap_or(json!({"error": "invalid response"}));
    Ok(Json(body))
}
