// Jaskier Shared Pattern -- auth
// All generic auth functions live in the shared crate.
// AppState implements HasAuthSecret in state.rs.
//
// ClaudeHydra-specific: `require_api_key_auth` validates against the
// `api_keys` DB table (not present in other Hydras).

pub use jaskier_core::auth::{HasAuthSecret, check_bearer_token, require_auth, validate_ws_token};

use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use subtle::ConstantTimeEq;

use crate::state::AppState;

/// Middleware that enforces Bearer token auth against the `api_keys` table.
pub async fn require_api_key_auth(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = request.uri().path().to_string();
    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let token = header.strip_prefix("Bearer ").unwrap_or_default();

            // Verify against api_keys table using constant-time comparison
            // to prevent timing attacks that could leak token prefixes.
            let is_valid = match sqlx::query_scalar::<_, String>("SELECT token FROM api_keys")
                .fetch_all(&state.db)
                .await
            {
                Ok(keys) => keys
                    .iter()
                    .any(|k| bool::from(token.as_bytes().ct_eq(k.as_bytes()))),
                Err(e) => {
                    tracing::error!("Database error checking API key: {}", e);
                    false
                }
            };

            if is_valid {
                Ok(next.run(request).await)
            } else {
                tracing::warn!("API Key Auth failed: invalid token for path {}", path);
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        _ => {
            tracing::warn!(
                "API Key Auth failed: missing or malformed Authorization header for path {}",
                path
            );
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}
