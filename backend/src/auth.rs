// Jaskier Shared Pattern -- auth
// Optional Bearer token authentication middleware.
// If AUTH_SECRET env is set, all protected routes require
// `Authorization: Bearer <secret>`. If not set, auth is disabled (dev mode).

use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use subtle::ConstantTimeEq;

use crate::state::AppState;

/// Middleware that enforces Bearer token auth when AUTH_SECRET is configured.
/// Public routes (health, readiness, auth/*) should NOT use this middleware.
pub async fn require_auth(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let secret = match state.auth_secret.as_deref() {
        Some(s) => s,
        None => return Ok(next.run(request).await), // Dev mode — no auth required
    };

    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let token = header.strip_prefix("Bearer ").unwrap_or_default();
            if bool::from(token.as_bytes().ct_eq(secret.as_bytes())) {
                Ok(next.run(request).await)
            } else {
                tracing::warn!("Auth failed: invalid token");
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        _ => {
            tracing::warn!("Auth failed: missing or malformed Authorization header");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

/// Validate auth for WebSocket upgrade requests.
/// Checks `?token=<secret>` query parameter since WebSocket doesn't support
/// custom headers during the upgrade handshake.
pub fn validate_ws_token(query: &str, auth_secret: Option<&str>) -> bool {
    let secret = match auth_secret {
        Some(s) => s,
        None => return true, // Dev mode — no auth
    };

    // Parse ?token=xxx from query string
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .any(|(key, value)| key == "token" && bool::from(value.as_bytes().ct_eq(secret.as_bytes())))
}

/// Pure function: extract and validate a Bearer token from an Authorization header value.
/// Returns true if the token matches the expected secret.
/// Used internally by `require_auth` middleware.
pub fn check_bearer_token(header_value: Option<&str>, expected_secret: &str) -> bool {
    match header_value {
        Some(header) => header
            .strip_prefix("Bearer ")
            .map_or(false, |token| bool::from(token.as_bytes().ct_eq(expected_secret.as_bytes()))),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── check_bearer_token ───────────────────────────────────────────────

    #[test]
    fn bearer_valid_token() {
        assert!(check_bearer_token(Some("Bearer mysecret"), "mysecret"));
    }

    #[test]
    fn bearer_wrong_token() {
        assert!(!check_bearer_token(Some("Bearer wrong"), "mysecret"));
    }

    #[test]
    fn bearer_missing_header() {
        assert!(!check_bearer_token(None, "mysecret"));
    }

    #[test]
    fn bearer_malformed_no_prefix() {
        assert!(!check_bearer_token(Some("mysecret"), "mysecret"));
    }

    #[test]
    fn bearer_basic_auth_rejected() {
        assert!(!check_bearer_token(Some("Basic not-a-bearer-token"), "mysecret"));
    }

    #[test]
    fn bearer_empty_token() {
        assert!(!check_bearer_token(Some("Bearer "), "mysecret"));
    }

    #[test]
    fn bearer_extra_spaces_rejected() {
        assert!(!check_bearer_token(Some("Bearer  mysecret"), "mysecret"));
    }

    #[test]
    fn bearer_case_sensitive() {
        assert!(!check_bearer_token(Some("bearer mysecret"), "mysecret"));
    }

    #[test]
    fn bearer_non_ascii() {
        // Non-ASCII chars in the token must not panic (old code used `header.as_bytes()[7..]`
        // which panics on multi-byte UTF-8 boundaries; `strip_prefix` is safe).
        let non_ascii_header = "Bearer tökèn_ünïcödé";
        assert!(!check_bearer_token(Some(non_ascii_header), "mysecret"));

        // Also verify a correct token still matches when the secret itself is ASCII
        assert!(check_bearer_token(Some("Bearer mysecret"), "mysecret"));
    }
}

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

            // Verify against api_keys table
            let is_valid = match sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM api_keys WHERE token = $1"
            )
            .bind(token)
            .fetch_one(&state.db)
            .await
            {
                Ok(count) => count > 0,
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
            tracing::warn!("API Key Auth failed: missing or malformed Authorization header for path {}", path);
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}
