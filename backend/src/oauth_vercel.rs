// DEPRECATED — Skarbiec Krasnali migration
// This module is superseded by ai_gateway/. Credentials now managed by Jaskier Vault.
// TODO: Remove this file after full migration to ai_gateway (Phase 4, P4-001)
// New auth: /api/ai/providers/* endpoints in ai_gateway/handlers.rs
//
// Re-export stub — Vercel OAuth is now provided by the shared `jaskier-oauth` crate.
#[allow(deprecated)]
pub use jaskier_oauth::vercel::{
    VercelCallbackRequest, get_vercel_access_token, vercel_auth_callback, vercel_auth_login,
    vercel_auth_logout, vercel_auth_status,
};
