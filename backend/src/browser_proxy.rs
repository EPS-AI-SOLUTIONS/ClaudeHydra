// Browser proxy client — thin re-exports from jaskier-browser shared crate.
// Jaskier Shared Pattern -- browser_proxy
//
// All types, functions, and HTTP handlers are defined in jaskier_browser::browser_proxy.
// This module re-exports them so existing `crate::browser_proxy::*` paths continue to work.

// ── Types ────────────────────────────────────────────────────────────────────
pub use jaskier_browser::browser_proxy::{
    BrowserProxyStatus, HasBrowserProxyState, ProxyHealthEvent, ProxyHealthHistory,
};

// ── Functions ────────────────────────────────────────────────────────────────
pub use jaskier_browser::browser_proxy::{
    detailed_health_check, generate_image, is_enabled, proxy_dir,
};

// ── HTTP handlers (generic over HasBrowserProxyState) ────────────────────────
pub use jaskier_browser::browser_proxy::{
    proxy_login, proxy_login_status, proxy_logout, proxy_reinit, proxy_status,
};
