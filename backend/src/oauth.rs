// Jaskier Shared Pattern — Anthropic OAuth PKCE
// Identical logic in ClaudeHydra & GeminiHydra. Only OAUTH_TABLE differs.
// Keep in sync when editing.
//
// #10 OAuth tokens are encrypted with AES-256-GCM before DB storage.
// Key sourced from OAUTH_ENCRYPTION_KEY or AUTH_SECRET env var.
// Graceful degradation: plaintext if no key is configured.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

// Re-export PKCE helpers from the shared crate so callers can use `crate::oauth::random_base64url`, etc.
pub(crate) use jaskier_oauth::pkce::{random_base64url, sha256_base64url};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::state::AppState;

// ── Project-specific DB table ───────────────────────────────────────────
// Table name: "ch_oauth_tokens" — hardcoded in SQL via concat!() for compile-time safety.
// GeminiHydra uses "gh_oauth_tokens" — keep in sync when porting.

// ── OAuth constants (from anthropic-max-router) ────────────────────────

const CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL: &str = "https://claude.ai/oauth/authorize";
const TOKEN_URL: &str = "https://console.anthropic.com/v1/oauth/token";
const REDIRECT_URI: &str = "https://console.anthropic.com/oauth/code/callback";
const SCOPE: &str = "org:create_api_key user:profile user:inference";
const TOKEN_EXPIRY_BUFFER_SECS: i64 = 300; // 5 minutes

/// Prefix for encrypted values stored in DB — used to detect encrypted vs plaintext.
const ENCRYPTED_PREFIX: &str = "enc:";

/// Beta features header required for OAuth MAX Plan requests.
pub const ANTHROPIC_BETA: &str = "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14";

/// Required system prompt for MAX Plan (must be first element).
pub const REQUIRED_SYSTEM_PROMPT: &str =
    "You are Claude Code, Anthropic's official CLI for Claude.";

// ── DB row ─────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct OAuthTokenRow {
    access_token: String,
    refresh_token: String,
    expires_at: i64,
    scope: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

// ═══════════════════════════════════════════════════════════════════════
//  #10 AES-256-GCM token encryption
// ═══════════════════════════════════════════════════════════════════════

/// Derive a 256-bit encryption key from the env var.
/// Returns `None` if no key is configured (graceful degradation to plaintext).
fn get_encryption_key() -> Option<[u8; 32]> {
    let raw = std::env::var("OAUTH_ENCRYPTION_KEY")
        .or_else(|_| std::env::var("AUTH_SECRET"))
        .ok()
        .filter(|s| !s.is_empty())?;

    // Derive a fixed-length key via SHA-256 (handles any-length input)
    let hash = Sha256::digest(raw.as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash);
    Some(key)
}

/// Encrypt a plaintext string with AES-256-GCM.
/// Returns "enc:<base64(nonce || ciphertext)>" or the original string if no key.
pub(crate) fn encrypt_token(plaintext: &str) -> String {
    let Some(key_bytes) = get_encryption_key() else {
        return plaintext.to_string();
    };

    use aes_gcm::aead::{Aead, KeyInit, OsRng};
    use aes_gcm::{AeadCore, Aes256Gcm};

    let cipher =
        Aes256Gcm::new_from_slice(&key_bytes).expect("AES-256-GCM key is exactly 32 bytes");
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    match cipher.encrypt(&nonce, plaintext.as_bytes()) {
        Ok(ciphertext) => {
            // Concatenate nonce (12 bytes) + ciphertext, then base64
            let mut combined = nonce.to_vec();
            combined.extend_from_slice(&ciphertext);
            format!("{}{}", ENCRYPTED_PREFIX, STANDARD.encode(&combined))
        }
        Err(e) => {
            tracing::error!("OAuth token encryption failed: {} — storing plaintext", e);
            plaintext.to_string()
        }
    }
}

/// Decrypt a token string. Handles both encrypted ("enc:...") and legacy plaintext.
pub(crate) fn decrypt_token(stored: &str) -> Option<String> {
    if !stored.starts_with(ENCRYPTED_PREFIX) {
        // Legacy plaintext — return as-is
        return Some(stored.to_string());
    }

    let key_bytes = get_encryption_key()?;
    let encoded = &stored[ENCRYPTED_PREFIX.len()..];
    let combined = STANDARD.decode(encoded).ok()?;

    if combined.len() < 12 {
        tracing::error!("OAuth decryption: data too short (expected nonce + ciphertext)");
        return None;
    }

    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher =
        Aes256Gcm::new_from_slice(&key_bytes).expect("AES-256-GCM key is exactly 32 bytes");

    match cipher.decrypt(nonce, ciphertext) {
        Ok(plaintext) => String::from_utf8(plaintext).ok(),
        Err(e) => {
            tracing::error!("OAuth token decryption failed: {}", e);
            None
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Handlers
// ═══════════════════════════════════════════════════════════════════════

/// GET /api/auth/status
pub async fn auth_status(State(state): State<AppState>) -> Json<Value> {
    match get_token_row(&state).await {
        Some(row) => {
            let now = chrono::Utc::now().timestamp();
            let expired = now >= row.expires_at - TOKEN_EXPIRY_BUFFER_SECS;
            Json(json!({
                "authenticated": true,
                "expired": expired,
                "expires_at": row.expires_at,
                "scope": row.scope,
            }))
        }
        None => Json(json!({ "authenticated": false })),
    }
}

/// POST /api/auth/login — generate PKCE params + authorization URL
pub async fn auth_login(State(state): State<AppState>) -> Json<Value> {
    let code_verifier = random_base64url(32);
    let code_challenge = sha256_base64url(&code_verifier);
    let oauth_state = random_base64url(32);

    {
        let mut states = state.oauth_pkce.write().await;
        // Prune expired entries (>10 min old)
        states.retain(|_, pkce| pkce.created_at.elapsed() < crate::state::OAUTH_STATE_TTL);
        states.insert(
            oauth_state.clone(),
            crate::state::OAuthPkceState {
                code_verifier,
                created_at: tokio::time::Instant::now(),
            },
        );
    }

    let mut auth_url =
        url::Url::parse(AUTHORIZE_URL).expect("AUTHORIZE_URL is a valid hardcoded URL");
    auth_url
        .query_pairs_mut()
        .append_pair("code", "true")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &oauth_state);

    Json(json!({
        "auth_url": auth_url.to_string(),
        "state": oauth_state,
    }))
}

#[derive(Deserialize)]
pub struct AuthCallbackRequest {
    pub code: String,
    pub state: String,
}

/// POST /api/auth/callback — exchange code#state for OAuth tokens
pub async fn auth_callback(
    State(state): State<AppState>,
    Json(req): Json<AuthCallbackRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Verify PKCE state — remove() validates AND consumes atomically
    let code_verifier = {
        let mut states = state.oauth_pkce.write().await;
        match states.remove(&req.state) {
            Some(pkce) if pkce.created_at.elapsed() < crate::state::OAUTH_STATE_TTL => {
                pkce.code_verifier
            }
            Some(_) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "OAuth state expired" })),
                ));
            }
            None => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "Invalid or expired OAuth state" })),
                ));
            }
        }
    };

    // Exchange authorization code for tokens
    let token_body = json!({
        "code": req.code,
        "state": req.state,
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier,
    });

    let resp = state
        .http_client
        .post(TOKEN_URL)
        .header("content-type", "application/json")
        .json(&token_body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Token exchange request failed: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Token exchange failed" })),
            )
        })?;

    if !resp.status().is_success() {
        let err = resp.text().await.unwrap_or_default();
        tracing::error!("Anthropic rejected token exchange: {}", err);
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": "Token exchange failed" })),
        ));
    }

    let token_resp: TokenResponse = resp.json().await.map_err(|e| {
        tracing::error!("Invalid token response from Anthropic: {}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": "Token exchange failed" })),
        )
    })?;

    let now = chrono::Utc::now().timestamp();
    let expires_at = now + token_resp.expires_in;

    // #10 Encrypt tokens before DB storage
    let encrypted_access = encrypt_token(&token_resp.access_token);
    let encrypted_refresh = encrypt_token(token_resp.refresh_token.as_deref().unwrap_or(""));

    // Upsert tokens in DB
    sqlx::query(concat!(
        "INSERT INTO ",
        "ch_oauth_tokens",
        " (id, access_token, refresh_token, expires_at, scope, updated_at) ",
        "VALUES (1, $1, $2, $3, $4, NOW()) ",
        "ON CONFLICT (id) DO UPDATE SET ",
        "access_token = $1, refresh_token = $2, expires_at = $3, scope = $4, updated_at = NOW()",
    ))
    .bind(&encrypted_access)
    .bind(&encrypted_refresh)
    .bind(expires_at)
    .bind(SCOPE)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("oauth: failed to store tokens: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Authentication failed" })),
        )
    })?;

    // PKCE state already consumed by remove() above

    tracing::info!("OAuth login successful, token expires at {}", expires_at);

    Ok(Json(json!({
        "status": "ok",
        "authenticated": true,
        "expires_at": expires_at,
    })))
}

/// POST /api/auth/logout — delete stored OAuth tokens
pub async fn auth_logout(State(state): State<AppState>) -> Json<Value> {
    sqlx::query(concat!("DELETE FROM ", "ch_oauth_tokens", " WHERE id = 1"))
        .execute(&state.db)
        .await
        .ok();
    tracing::info!("OAuth tokens deleted");
    Json(json!({ "status": "ok" }))
}

// ═══════════════════════════════════════════════════════════════════════
//  Token management (used by handlers)
// ═══════════════════════════════════════════════════════════════════════

/// Get a valid OAuth access token, auto-refreshing if expired.
/// Returns `None` if no tokens are stored or refresh fails.
/// #10 Decrypts tokens from DB automatically.
pub async fn get_valid_access_token(state: &AppState) -> Option<String> {
    let row = get_token_row(state).await?;

    // Decrypt tokens from DB
    let access_token = decrypt_token(&row.access_token)?;
    let refresh_token = decrypt_token(&row.refresh_token)?;

    let now = chrono::Utc::now().timestamp();

    // Token still valid
    if now < row.expires_at - TOKEN_EXPIRY_BUFFER_SECS {
        return Some(access_token);
    }

    // Need to refresh
    tracing::info!("OAuth token expired, refreshing...");

    let resp = state
        .http_client
        .post(TOKEN_URL)
        .header("content-type", "application/json")
        .json(&json!({
            "grant_type": "refresh_token",
            "client_id": CLIENT_ID,
            "refresh_token": refresh_token,
        }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        tracing::error!("OAuth token refresh failed: {}", resp.status());
        return None;
    }

    let token_resp: TokenResponse = resp.json().await.ok()?;
    let expires_at = now + token_resp.expires_in;
    let new_refresh = token_resp.refresh_token.unwrap_or(refresh_token);

    // Encrypt before storing
    let encrypted_access = encrypt_token(&token_resp.access_token);
    let encrypted_refresh = encrypt_token(&new_refresh);

    sqlx::query(concat!(
        "UPDATE ",
        "ch_oauth_tokens",
        " SET access_token = $1, refresh_token = $2, ",
        "expires_at = $3, updated_at = NOW() WHERE id = 1",
    ))
    .bind(&encrypted_access)
    .bind(&encrypted_refresh)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .ok()?;

    tracing::info!("OAuth token refreshed successfully");
    Some(token_resp.access_token)
}

/// Check if OAuth tokens exist (for health check).
pub async fn has_oauth_tokens(state: &AppState) -> bool {
    get_token_row(state).await.is_some()
}

/// Inject the required system prompt for MAX Plan requests.
pub fn ensure_system_prompt(body: &mut Value) {
    let required_block = json!({
        "type": "text",
        "text": REQUIRED_SYSTEM_PROMPT
    });

    match body.get("system") {
        Some(Value::Array(arr)) => {
            // Check if already first element
            if let Some(first) = arr.first()
                && first.get("text").and_then(|t| t.as_str()) == Some(REQUIRED_SYSTEM_PROMPT)
            {
                return;
            }
            let mut new_arr = vec![required_block];
            new_arr.extend(arr.iter().cloned());
            body["system"] = Value::Array(new_arr);
        }
        Some(Value::String(s)) => {
            if s.starts_with(REQUIRED_SYSTEM_PROMPT) {
                return;
            }
            body["system"] = json!([
                required_block,
                { "type": "text", "text": s }
            ]);
        }
        _ => {
            body["system"] = json!([required_block]);
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────────

async fn get_token_row(state: &AppState) -> Option<OAuthTokenRow> {
    sqlx::query_as::<_, OAuthTokenRow>(concat!(
        "SELECT access_token, refresh_token, expires_at, scope FROM ",
        "ch_oauth_tokens",
        " WHERE id = 1"
    ))
    .fetch_optional(&state.db)
    .await
    .ok()?
}

