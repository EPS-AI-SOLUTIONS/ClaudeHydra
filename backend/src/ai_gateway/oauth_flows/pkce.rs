// pkce.rs — PKCE utilities and token response parser.
//
// Self-contained, no dependency on jaskier-oauth::pkce.

use std::collections::HashMap;

use base64::Engine;
use serde_json::Value;
use sha2::Digest;

use super::types::OAuthTokens;

/// Generate a cryptographically secure random base64url string (no padding).
/// `byte_len` is the number of random bytes; the resulting string is ~4/3 as long.
pub(crate) fn random_base64url(byte_len: usize) -> String {
    let buf: Vec<u8> = (0..byte_len).map(|_| rand::random::<u8>()).collect();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&buf)
}

/// SHA-256 hash encoded as base64url (no padding) — PKCE S256 challenge.
pub(crate) fn sha256_base64url(input: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(sha2::Sha256::digest(input.as_bytes()))
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Token response parser
// ═══════════════════════════════════════════════════════════════════════════════

/// Known top-level fields extracted into `OAuthTokens` — everything else goes
/// into `extra`.
const KNOWN_TOKEN_FIELDS: &[&str] = &[
    "access_token",
    "refresh_token",
    "expires_in",
    "scope",
    "token_type",
];

/// Parse a raw JSON token response into `OAuthTokens`, collecting unknown
/// fields into `extra`.
pub(crate) fn parse_token_response(
    raw: Value,
    configured_scopes: &[String],
) -> anyhow::Result<OAuthTokens> {
    let obj = raw
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("Token response is not a JSON object"))?;

    let access_token = obj
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Token response missing access_token"))?
        .to_string();

    let refresh_token = obj
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(String::from);

    let expires_in = obj.get("expires_in").and_then(|v| v.as_i64());

    let scope = obj
        .get("scope")
        .and_then(|v| v.as_str())
        .map(String::from)
        .or_else(|| {
            if configured_scopes.is_empty() {
                None
            } else {
                Some(configured_scopes.join(" "))
            }
        });

    let token_type = obj
        .get("token_type")
        .and_then(|v| v.as_str())
        .unwrap_or("Bearer")
        .to_string();

    // Collect extra fields.
    let extra: HashMap<String, Value> = obj
        .iter()
        .filter(|(k, _)| !KNOWN_TOKEN_FIELDS.contains(&k.as_str()))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    Ok(OAuthTokens {
        access_token,
        refresh_token,
        expires_in,
        scope,
        token_type,
        extra,
    })
}
