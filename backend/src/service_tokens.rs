// DEPRECATED — Skarbiec Krasnali migration
// This module is superseded by ai_gateway/. Credentials now managed by Jaskier Vault.
// TODO: Remove this file after full migration to ai_gateway (Phase 4, P4-001)
// New auth: /api/ai/providers/* endpoints in ai_gateway/handlers.rs
//
// Re-export stub — service token storage is now provided by the shared `jaskier-oauth` crate.
#[allow(deprecated)]
pub use jaskier_oauth::service_tokens::{
    StoreTokenRequest, delete_token, get_service_token, list_tokens, store_token,
};
