// Re-export stub — Google OAuth is now provided by the shared `jaskier-oauth` crate.
pub use jaskier_oauth::google::{
    GoogleRedirectParams, SaveApiKeyRequest,
    apply_google_auth, auth_login as google_auth_login, auth_logout as google_auth_logout,
    auth_status as google_auth_status, delete_api_key as google_delete_api_key,
    get_google_api_key_credential, get_google_credential, google_redirect,
    mark_oauth_gemini_invalid, mark_oauth_gemini_valid, save_api_key as google_save_api_key,
};
