// Re-export stub — GitHub OAuth is now provided by the shared `jaskier-oauth` crate.
pub use jaskier_oauth::github::{
    GitHubCallbackRequest, get_github_access_token, github_auth_callback, github_auth_login,
    github_auth_logout, github_auth_status,
};
