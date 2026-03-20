// types.rs — OAuth types, enums, and configuration structs.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ═══════════════════════════════════════════════════════════════════════════════
//  Types & Enums
// ═══════════════════════════════════════════════════════════════════════════════

/// OAuth provider — covers both AI providers (Anthropic, Google) and service
/// integrations (GitHub, Vercel) that use OAuth PKCE flows.
///
/// This is deliberately separate from `super::AiProvider` which enumerates
/// AI model providers. GitHub and Vercel are not AI providers — they are
/// service OAuth integrations for repo/deploy access.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OAuthProvider {
    Anthropic,
    Google,
    GitHub,
    Vercel,
}

impl std::fmt::Display for OAuthProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Anthropic => write!(f, "anthropic"),
            Self::Google => write!(f, "google"),
            Self::GitHub => write!(f, "github"),
            Self::Vercel => write!(f, "vercel"),
        }
    }
}

/// PKCE challenge method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PkceMethod {
    /// SHA-256 challenge (recommended).
    S256,
    /// Plain challenge (code_challenge == code_verifier). Less secure — use only
    /// when the provider does not support S256.
    Plain,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/// Per-provider OAuth configuration. Immutable after construction — providers
/// whose client_id/secret come from Vault supply them at `new()` time.
#[derive(Debug, Clone)]
pub struct OAuthProviderConfig {
    pub provider: OAuthProvider,
    pub authorize_url: String,
    pub token_url: String,
    pub redirect_uri: String,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub scopes: Vec<String>,
    pub pkce_method: PkceMethod,
    /// Extra query parameters appended to the authorize URL (e.g. `access_type=offline`).
    pub extra_params: HashMap<String, String>,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Token types
// ═══════════════════════════════════════════════════════════════════════════════

/// Tokens returned by a successful OAuth code exchange or refresh.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokens {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default = "default_token_type")]
    pub token_type: String,
    /// Provider-specific extra fields returned alongside the token (e.g.
    /// `id_token` for Google, `team_id` for Vercel).
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub extra: HashMap<String, Value>,
}

pub(crate) fn default_token_type() -> String {
    "Bearer".to_string()
}

/// Response returned to the frontend after initiating a login flow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub authorize_url: String,
    pub state: String,
    pub provider: OAuthProvider,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  In-memory PKCE state
// ═══════════════════════════════════════════════════════════════════════════════

/// Ephemeral PKCE state kept between `initiate_login` and `handle_callback`.
/// Automatically purged after `PKCE_STATE_TTL`.
#[derive(Debug, Clone)]
pub struct PkceState {
    pub code_verifier: String,
    pub provider: OAuthProvider,
    pub created_at: std::time::Instant,
}

/// Maximum lifetime of a pending PKCE state entry (10 minutes).
pub const PKCE_STATE_TTL: std::time::Duration = std::time::Duration::from_secs(600);
