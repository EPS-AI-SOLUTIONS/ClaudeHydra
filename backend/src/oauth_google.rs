// DEPRECATED — Skarbiec Krasnali migration
// This module is superseded by ai_gateway/. Credentials now managed by Jaskier Vault.
// TODO: Remove this file after full migration to ai_gateway (Phase 4, P4-001)
// New auth: /api/ai/providers/* endpoints in ai_gateway/handlers.rs
//
// Re-export stub — Google OAuth is now provided by the shared `jaskier-oauth` crate.
#[allow(deprecated)]
pub use jaskier_oauth::google::{
    GoogleRedirectParams, SaveApiKeyRequest,
    apply_google_auth, auth_login as google_auth_login, auth_logout as google_auth_logout,
    auth_status as google_auth_status, delete_api_key as google_delete_api_key,
    get_google_api_key_credential, get_google_credential, google_redirect,
    mark_oauth_gemini_invalid, mark_oauth_gemini_valid, save_api_key as google_save_api_key,
};
