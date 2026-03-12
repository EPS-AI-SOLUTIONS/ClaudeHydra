// Re-export stub — Vercel OAuth is now provided by the shared `jaskier-oauth` crate.
pub use jaskier_oauth::vercel::{
    VercelCallbackRequest, get_vercel_access_token, vercel_auth_callback, vercel_auth_login,
    vercel_auth_logout, vercel_auth_status,
};
