//! Health, readiness, system stats, and admin endpoints.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::models::*;
use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/health
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(
    get,
    path = "/api/health",
    tag = "health",
    responses((status = 200, description = "Service healthy", body = HealthResponse))
)]
pub async fn health_check(State(state): State<AppState>) -> Json<Value> {
    let uptime = state.start_time.elapsed().as_secs();

    // Check which providers are available
    let rt = state.runtime.read().await;
    let anthropic_available =
        rt.api_keys.contains_key("ANTHROPIC_API_KEY") || std::env::var("ANTHROPIC_API_KEY").is_ok();
    let google_available = rt.api_keys.contains_key("GOOGLE_API_KEY")
        || std::env::var("GOOGLE_API_KEY").is_ok()
        || std::env::var("GEMINI_API_KEY").is_ok();

    // Check DB connectivity
    let db_ok = sqlx::query("SELECT 1").fetch_one(&state.db).await.is_ok();

    // Browser proxy cached status (if enabled)
    let browser_proxy = if crate::browser_proxy::is_enabled() {
        state
            .browser_proxy_status
            .try_read()
            .ok()
            .map(|s| s.clone())
    } else {
        None
    };

    let resp = HealthResponse {
        status: if db_ok {
            "healthy".to_string()
        } else {
            "degraded".to_string()
        },
        version: env!("CARGO_PKG_VERSION").to_string(),
        app: "ClaudeHydra v4".to_string(),
        uptime_seconds: uptime,
        providers: vec![
            ProviderInfo {
                name: "anthropic".to_string(),
                available: anthropic_available,
            },
            ProviderInfo {
                name: "google".to_string(),
                available: google_available,
            },
            ProviderInfo {
                name: "database".to_string(),
                available: db_ok,
            },
        ],
        browser_proxy,
    };

    Json(serde_json::to_value(resp).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/health/ready
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(
    get,
    path = "/api/health/ready",
    tag = "health",
    responses(
        (status = 200, description = "Service is ready"),
        (status = 503, description = "Service not yet ready")
    )
)]
pub async fn readiness(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    if state.is_ready() {
        Ok(Json(json!({ "ready": true })))
    } else {
        Err(StatusCode::SERVICE_UNAVAILABLE)
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/auth/mode
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(
    get,
    path = "/api/auth/mode",
    tag = "auth",
    responses((status = 200, description = "Authentication mode"))
)]
pub async fn auth_mode(State(state): State<AppState>) -> Json<Value> {
    let mode = if state.auth_secret.is_some() {
        "protected"
    } else {
        "open"
    };
    Json(json!({ "mode": mode }))
}

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/system/stats
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(
    get,
    path = "/api/system/stats",
    tag = "system",
    responses((status = 200, description = "System statistics", body = SystemStats))
)]
pub async fn system_stats(State(state): State<AppState>) -> Json<Value> {
    let snapshot = state.system_monitor.read().await;
    let stats = SystemStats {
        cpu_usage_percent: snapshot.cpu_usage_percent,
        memory_used_mb: snapshot.memory_used_mb,
        memory_total_mb: snapshot.memory_total_mb,
        platform: snapshot.platform.clone(),
    };
    Json(serde_json::to_value(stats).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/system/metrics
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(
    get,
    path = "/api/system/metrics",
    tag = "system",
    responses((status = 200, description = "System metrics for dashboard", body = SystemMetricsResponse))
)]
pub async fn system_metrics(State(state): State<AppState>) -> Json<Value> {
    let snapshot = state.system_monitor.read().await;

    // Status can be determined based on connection or simple mock, here we use online
    // and network I/O to show activity.
    let status = "online".to_string();
    let rx_mb = snapshot.network_rx_bytes as f64 / 1_048_576.0;
    let tx_mb = snapshot.network_tx_bytes as f64 / 1_048_576.0;

    let metrics = SystemMetricsResponse {
        cpu: MetricItem {
            label: "CPU".to_string(),
            value: (snapshot.cpu_usage_percent * 10.0).round() as f64 / 10.0,
            max: Some(100.0),
            unit: Some("%".to_string()),
        },
        ram: MetricItem {
            label: "RAM".to_string(),
            value: (snapshot.memory_used_mb * 10.0).round() / 10.0,
            max: Some((snapshot.memory_total_mb * 10.0).round() / 10.0),
            unit: Some("MB".to_string()),
        },
        network: NetworkMetric {
            label: Some(format!("Rx: {:.1} MB | Tx: {:.1} MB", rx_mb, tx_mb)),
            status,
            // Derive ping estimate from system load: under low load ~1ms, scales with CPU usage
            ping: Some(1 + (snapshot.cpu_usage_percent * 0.5) as u64),
        },
    };
    Json(serde_json::to_value(metrics).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

// ═══════════════════════════════════════════════════════════════════════
//  POST /api/admin/rotate-key — hot-reload API key
// ═══════════════════════════════════════════════════════════════════════

pub async fn rotate_key(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let provider = body
        .get("provider")
        .and_then(|p| p.as_str())
        .ok_or(StatusCode::BAD_REQUEST)?;
    let key = body
        .get("key")
        .and_then(|k| k.as_str())
        .ok_or(StatusCode::BAD_REQUEST)?;

    if key.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let mut rt = state.runtime.write().await;
    rt.api_keys.insert(provider.to_uppercase(), key.to_string());

    tracing::info!("API key rotated for provider: {}", provider);

    crate::audit::log_audit(
        &state.db,
        "rotate_key",
        json!({ "provider": provider }),
        None,
    )
    .await;

    Ok(Json(json!({ "status": "ok", "provider": provider })))
}

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/browser-proxy/history
// ═══════════════════════════════════════════════════════════════════════

#[derive(serde::Deserialize)]
pub struct ProxyHistoryParams {
    pub limit: Option<usize>,
}

#[derive(serde::Serialize)]
pub struct ProxyHistoryResponse {
    pub events: Vec<crate::browser_proxy::ProxyHealthEvent>,
    pub total: usize,
}

pub async fn browser_proxy_history(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<ProxyHistoryParams>,
) -> Json<ProxyHistoryResponse> {
    let limit = params.limit.unwrap_or(50).min(50);
    let events = state.browser_proxy_history.recent(limit);
    let total = state.browser_proxy_history.len();
    Json(ProxyHistoryResponse { events, total })
}

// =======================================================================
//  GET /api/system/audit
// =======================================================================

#[utoipa::path(
    get,
    path = "/api/system/audit",
    tag = "system",
    responses((status = 200, description = "Cargo audit results"))
)]
pub async fn system_audit() -> Result<Json<Value>, StatusCode> {
    let output = std::process::Command::new("cargo")
        .arg("audit")
        .arg("--json")
        .output()
        .map_err(|e| {
            tracing::error!("cargo audit failed to spawn: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let result: Value = serde_json::from_slice(&output.stdout).map_err(|e| {
        tracing::error!("failed to parse cargo audit json: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(result))
}
