// session_manager.rs — Re-export from shared crate jaskier-session-auth

// Re-export public types (avoid glob to prevent ambiguity with other submodules)
pub use jaskier_session_auth::{
    SessionConfig, SessionManager, SessionProvider, SessionStatus,
    build_validation_string, extract_cookie_value, extract_jwt_expiry,
    base64_url_decode, fetch_vault_credentials, store_vault_credentials,
    spawn_refresh_task,
};
