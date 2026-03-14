// DEPRECATED — Skarbiec Krasnali migration
// This module is superseded by ai_gateway/. Credentials now managed by Jaskier Vault.
// TODO: Remove this file after full migration to ai_gateway (Phase 4, P4-001)
// New auth: /api/ai/providers/* endpoints in ai_gateway/handlers.rs
//
// Re-export stub — GitHub OAuth is now provided by the shared `jaskier-oauth` crate.
#[allow(deprecated)]
pub use jaskier_oauth::github::{
    GitHubCallbackRequest, get_github_access_token, github_auth_callback, github_auth_login,
    github_auth_logout, github_auth_status,
};
