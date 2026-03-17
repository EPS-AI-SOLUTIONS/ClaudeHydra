// Jaskier Shared Pattern — rate_limits (re-export from jaskier_core)
// Delegates to jaskier_core::rate_limiter with app-specific table name.

pub use jaskier_core::rate_limiter::{
    HasEndpointRateLimits, RateLimitConfig, RateLimitEntry, RateLimitParams,
    UpdateRateLimitRequest, list_rate_limits, update_rate_limit,
};

use crate::state::AppState;

/// Load rate limit configuration from CH's `ch_rate_limits` table.
pub async fn load_from_db(db: &sqlx::PgPool) -> RateLimitConfig {
    jaskier_core::rate_limiter::load_from_db(db, "ch_rate_limits").await
}

/// Implement `HasEndpointRateLimits` for CH's AppState.
impl HasEndpointRateLimits for AppState {
    fn rate_limits_db(&self) -> &sqlx::PgPool {
        &self.base.db
    }
    fn rate_limits_table(&self) -> &'static str {
        "ch_rate_limits"
    }
    fn audit_log_table(&self) -> &'static str {
        "ch_audit_log"
    }
}
