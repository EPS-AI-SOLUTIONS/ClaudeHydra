// ClaudeHydra v4 -- Background watchdog
// Core watchdog logic (DB ping, model cache refresh, browser proxy monitoring)
// is provided by the shared `jaskier-browser` crate.
// This module adds a ClaudeHydra-specific Anthropic API reachability check.

pub use jaskier_browser::watchdog::HasWatchdogState;

use std::time::Duration;

use crate::state::AppState;

const CHECK_INTERVAL: Duration = Duration::from_secs(60);

/// Spawn the shared watchdog + an additional Anthropic API health check task.
pub fn spawn(state: AppState) -> tokio::task::JoinHandle<()> {
    // Spawn shared watchdog (DB ping, model cache refresh, browser proxy monitoring)
    let shared_handle = jaskier_browser::watchdog::spawn(state.clone());

    // Spawn ClaudeHydra-specific Anthropic API check on the same interval
    tokio::spawn(async move {
        tracing::info!("watchdog: Anthropic API health check started (interval={}s)", CHECK_INTERVAL.as_secs());

        loop {
            tokio::time::sleep(CHECK_INTERVAL).await;
            let api_ok = check_anthropic_api(&state).await;
            if !api_ok {
                tracing::warn!("watchdog: Anthropic API check failed");
            }
        }
    });

    shared_handle
}

/// Check Anthropic API reachability.
/// Uses a lightweight HEAD request to api.anthropic.com (no tokens consumed).
/// Skips if no credential is available (OAuth token or API key).
async fn check_anthropic_api(state: &AppState) -> bool {
    // Only check if we have a credential configured
    let has_oauth = crate::oauth::get_valid_access_token(state).await.is_some();
    let has_key = {
        let rt = state.runtime.read().await;
        rt.api_keys.contains_key("ANTHROPIC_API_KEY")
    };

    if !has_oauth && !has_key {
        // No credential -- skip check (not an error)
        return true;
    }

    let result = tokio::time::timeout(
        Duration::from_secs(5),
        state
            .http_client
            .head("https://api.anthropic.com/v1/messages")
            .header("anthropic-version", "2023-06-01")
            .send(),
    )
    .await;

    match result {
        Ok(Ok(resp)) => {
            // Any HTTP response (even 401/405) means the host is reachable
            let status = resp.status().as_u16();
            if status >= 500 {
                tracing::warn!("watchdog: Anthropic API returned server error {}", status);
                false
            } else {
                true
            }
        }
        Ok(Err(e)) => {
            tracing::error!("watchdog: Anthropic API unreachable: {}", e);
            false
        }
        Err(_) => {
            tracing::error!("watchdog: Anthropic API check timed out after 5s");
            false
        }
    }
}
