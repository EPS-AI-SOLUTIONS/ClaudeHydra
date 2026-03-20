// router.rs — AI Gateway sub-router builder and shared error helpers.

use axum::extract::Json;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::Router;
use serde_json::{json, Value};

use crate::ai_gateway::{
    AiProvider, HasAiGateway,
    vault_bridge::{HasVaultBridge, VaultError},
};

use super::providers::*;
use super::proxy::*;

// ── Router builder ──────────────────────────────────────────────────────────

/// Build the AI Gateway sub-router with all endpoints.
///
/// Routes:
/// ```text
/// POST /api/ai/{provider}/chat           — proxied chat (non-streaming)
/// POST /api/ai/{provider}/stream         — proxied streaming (SSE)
/// GET  /api/ai/providers                 — list all providers + auth status
/// GET  /api/ai/providers/{provider}/status   — single provider status
/// POST /api/ai/providers/{provider}/connect  — initiate OAuth/login
/// POST /api/ai/providers/{provider}/callback — OAuth callback
/// POST /api/ai/providers/{provider}/disconnect — revoke + delete
/// POST /api/ai/providers/{provider}/refresh  — force token refresh
/// POST /api/ai/providers/{provider}/test     — test connection
/// ```
pub fn ai_gateway_router<S>() -> Router<S>
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    Router::new()
        // ── Chat proxy endpoints ────────────────────────────────────────
        .route("/api/ai/{provider}/chat", post(proxy_chat::<S>))
        .route("/api/ai/{provider}/stream", post(proxy_stream::<S>))
        // ── Provider management endpoints ───────────────────────────────
        .route("/api/ai/providers", get(list_providers::<S>))
        .route(
            "/api/ai/providers/{provider}/status",
            get(provider_status::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/connect",
            post(connect_provider::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/callback",
            post(provider_callback::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/disconnect",
            post(disconnect_provider::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/refresh",
            post(refresh_provider::<S>),
        )
        .route(
            "/api/ai/providers/{provider}/test",
            post(test_provider::<S>),
        )
}

// ── Helper: parse provider from path ────────────────────────────────────────

/// Parse an `AiProvider` from a URL path segment, returning a proper HTTP error
/// if the provider name is unrecognized.
pub(crate) fn parse_provider(provider: &str) -> Result<AiProvider, (StatusCode, Json<Value>)> {
    use std::str::FromStr;
    AiProvider::from_str(provider).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "unknown_provider",
                "message": e,
                "valid_providers": AiProvider::ALL.iter().map(|p| p.to_string()).collect::<Vec<_>>(),
            })),
        )
    })
}

/// Map a `VaultError` to an HTTP status code + JSON error body.
pub(crate) fn vault_error_response(provider: &AiProvider, err: VaultError) -> (StatusCode, Json<Value>) {
    match &err {
        VaultError::AnomalyDetected(msg) => {
            tracing::error!(
                provider = %provider,
                "VAULT ANOMALY DETECTED: {} — stopping all operations",
                msg,
            );
            (
                StatusCode::FORBIDDEN,
                Json(json!({
                    "error": "anomaly_detected",
                    "message": format!("ANOMALY DETECTED: {}. All operations halted.", msg),
                    "action_required": "Contact admin immediately. Run vault_panic if compromise confirmed.",
                })),
            )
        }
        VaultError::NotFound => (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "provider_not_connected",
                "provider": provider.to_string(),
                "message": format!("No credentials found for {}. Connect the provider first.", provider),
            })),
        ),
        VaultError::Unauthorized => (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "vault_unauthorized",
                "message": "Vault rejected the credential request",
            })),
        ),
        VaultError::Timeout | VaultError::ConnectionFailed(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "vault_unavailable",
                "message": format!("Jaskier Vault is unreachable: {}", err),
            })),
        ),
        VaultError::InvalidResponse(msg) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "error": "vault_invalid_response",
                "message": msg,
            })),
        ),
    }
}
