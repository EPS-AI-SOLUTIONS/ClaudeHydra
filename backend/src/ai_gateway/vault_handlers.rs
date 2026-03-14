// vault_handlers.rs — HTTP proxy handlers for Jaskier Vault frontend integration
// Frontend calls these endpoints; backend forwards to Vault MCP

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::vault_bridge::HasVaultBridge;

// ── Response Types ──────────────────────────────────────────────────────────

/// Audit log entry returned by the Vault audit endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub timestamp: String,
    pub action: String,
    pub namespace: Option<String>,
    pub service: Option<String>,
    pub agent: Option<String>,
    pub result: Option<String>,
}

/// Namespace listing with nested services.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultNamespace {
    pub namespace: String,
    pub services: Vec<String>,
    pub count: u32,
}

// ── Router builder ──────────────────────────────────────────────────────────

/// Build the Vault proxy sub-router.
///
/// Routes:
/// ```text
/// GET  /api/vault/health      — vault health status
/// GET  /api/vault/audit       — recent audit log entries
/// GET  /api/vault/namespaces  — list namespaces with services
/// POST /api/vault/panic       — emergency vault destroy (DANGEROUS)
/// POST /api/vault/rotate      — rotate all credentials
/// ```
pub fn vault_proxy_router<S>() -> Router<S>
where
    S: HasVaultBridge + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/api/vault/health", get(vault_health::<S>))
        .route("/api/vault/audit", get(vault_audit::<S>))
        .route("/api/vault/namespaces", get(vault_namespaces::<S>))
        .route("/api/vault/panic", post(vault_panic::<S>))
        .route("/api/vault/rotate", post(vault_rotate::<S>))
}

// ── Handlers ────────────────────────────────────────────────────────────────

/// GET /api/vault/health — check Vault health status.
///
/// Always returns 200 with an online/offline indicator (never errors out).
async fn vault_health<S>(State(state): State<S>) -> impl IntoResponse
where
    S: HasVaultBridge + Clone + Send + Sync + 'static,
{
    let status = state.vault_client().health().await;
    (StatusCode::OK, axum::Json(json!(status)))
}

/// GET /api/vault/audit — retrieve recent audit log entries.
///
/// Forwards to `GET {vault_url}/api/audit?limit=20`.
async fn vault_audit<S>(State(state): State<S>) -> impl IntoResponse
where
    S: HasVaultBridge + Clone + Send + Sync + 'static,
{
    let client = state.vault_client();
    let url = format!("{}/api/audit?limit=20", client.vault_url());

    match reqwest::get(&url).await {
        Ok(resp) if resp.status().is_success() => {
            let body: Value = resp.json().await.unwrap_or(json!([]));
            (StatusCode::OK, axum::Json(json!({ "entries": body })))
        }
        Ok(resp) => {
            tracing::warn!("Vault audit endpoint returned {}", resp.status());
            (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({ "error": format!("vault returned {}", resp.status()) })),
            )
        }
        Err(e) => {
            tracing::debug!("Vault audit request failed: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({ "error": "vault unreachable", "detail": e.to_string() })),
            )
        }
    }
}

/// GET /api/vault/namespaces — list all namespaces with their services.
///
/// Forwards to `GET {vault_url}/api/namespaces`.
async fn vault_namespaces<S>(State(state): State<S>) -> impl IntoResponse
where
    S: HasVaultBridge + Clone + Send + Sync + 'static,
{
    let client = state.vault_client();
    let url = format!("{}/api/namespaces", client.vault_url());

    match reqwest::get(&url).await {
        Ok(resp) if resp.status().is_success() => {
            let body: Value = resp.json().await.unwrap_or(json!([]));
            (StatusCode::OK, axum::Json(json!({ "namespaces": body })))
        }
        Ok(resp) => {
            tracing::warn!("Vault namespaces endpoint returned {}", resp.status());
            (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({ "error": format!("vault returned {}", resp.status()) })),
            )
        }
        Err(e) => {
            tracing::debug!("Vault namespaces request failed: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({ "error": "vault unreachable", "detail": e.to_string() })),
            )
        }
    }
}

/// POST /api/vault/panic — emergency vault destroy.
///
/// DANGEROUS: This permanently destroys all credentials stored in the Vault.
/// Forwards to `POST {vault_url}/api/vault/panic`.
async fn vault_panic<S>(State(state): State<S>) -> impl IntoResponse
where
    S: HasVaultBridge + Clone + Send + Sync + 'static,
{
    tracing::error!("VAULT PANIC initiated from frontend — destroying all credentials");

    let client = state.vault_client();
    let url = format!("{}/api/vault/panic", client.vault_url());

    let http = reqwest::Client::new();
    match http.post(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            // Clear local cache since all credentials are gone
            client.clear_cache().await;
            tracing::error!("VAULT PANIC completed — all credentials destroyed");
            (
                StatusCode::OK,
                axum::Json(json!({ "status": "destroyed", "message": "All credentials permanently deleted" })),
            )
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            tracing::error!("Vault panic returned {}: {}", status, body);
            (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({ "error": format!("vault returned {}", status) })),
            )
        }
        Err(e) => {
            tracing::error!("Vault panic request failed: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({ "error": "vault unreachable", "detail": e.to_string() })),
            )
        }
    }
}

/// POST /api/vault/rotate — rotate all stored credentials.
///
/// Forwards to `POST {vault_url}/api/vault/rotate` and clears the local cache
/// so stale tokens are not served after rotation.
async fn vault_rotate<S>(State(state): State<S>) -> impl IntoResponse
where
    S: HasVaultBridge + Clone + Send + Sync + 'static,
{
    tracing::info!("Vault credential rotation initiated from frontend");

    let client = state.vault_client();
    let url = format!("{}/api/vault/rotate", client.vault_url());

    let http = reqwest::Client::new();
    match http.post(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let body: Value = resp.json().await.unwrap_or(json!({}));
            // Clear local cache — rotated credentials have new values
            client.clear_cache().await;
            tracing::info!("Vault credential rotation completed");
            (StatusCode::OK, axum::Json(json!({ "status": "rotated", "result": body })))
        }
        Ok(resp) => {
            let status = resp.status();
            tracing::warn!("Vault rotate returned {}", status);
            (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({ "error": format!("vault returned {}", status) })),
            )
        }
        Err(e) => {
            tracing::debug!("Vault rotate request failed: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({ "error": "vault unreachable", "detail": e.to_string() })),
            )
        }
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audit_entry_serialization() {
        let entry = AuditEntry {
            timestamp: "2026-03-14T12:00:00Z".into(),
            action: "vault_get".into(),
            namespace: Some("ai_providers".into()),
            service: Some("anthropic_max".into()),
            agent: Some("ClaudeHydra".into()),
            result: Some("ok".into()),
        };

        let json = serde_json::to_value(&entry).unwrap();
        assert_eq!(json["action"], "vault_get");
        assert_eq!(json["namespace"], "ai_providers");
    }

    #[test]
    fn test_vault_namespace_serialization() {
        let ns = VaultNamespace {
            namespace: "ai_providers".into(),
            services: vec!["anthropic_max".into(), "google_gemini".into()],
            count: 2,
        };

        let json = serde_json::to_value(&ns).unwrap();
        assert_eq!(json["namespace"], "ai_providers");
        assert_eq!(json["count"], 2);
        assert_eq!(json["services"].as_array().unwrap().len(), 2);
    }
}
