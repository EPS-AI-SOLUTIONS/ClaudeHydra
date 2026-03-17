// Jaskier Shared Pattern — audit (re-export from jaskier_core)
// Delegates to jaskier_core::audit with app-specific table name.

pub use jaskier_core::audit::extract_ip;

/// Insert an audit log entry into `ch_audit_log`.
pub async fn log_audit(
    pool: &sqlx::PgPool,
    action: &str,
    details: serde_json::Value,
    ip: Option<&str>,
) {
    jaskier_core::audit::log_audit(pool, "ch_audit_log", action, details, ip).await;
}
