// Jaskier Shared Pattern — watchdog
// ClaudeHydra v4 — Background watchdog
//
// Periodically checks backend health and performs auto-recovery:
// - DB connectivity ping (SELECT 1)
// - Model cache staleness check + auto-refresh
// - Browser proxy monitoring with exponential backoff restarts
// - Logs health status for external monitoring

use std::time::Duration;

use crate::model_registry;
use crate::state::AppState;

const CHECK_INTERVAL: Duration = Duration::from_secs(60);
const PROXY_CHECK_INTERVAL: Duration = Duration::from_secs(30);
const DB_PING_TIMEOUT: Duration = Duration::from_secs(5);

/// Base cooldown seconds for proxy restart (doubles each level).
const PROXY_RESTART_BASE_COOLDOWN: u64 = 120;
/// Maximum cooldown seconds (15 min cap).
const PROXY_RESTART_MAX_COOLDOWN: u64 = 900;
/// Consecutive successes required to reset backoff to 0.
const PROXY_BACKOFF_RESET_THRESHOLD: u32 = 5;
/// Auth-state cookie max age in days before considered expired.
const AUTH_STATE_MAX_AGE_DAYS: u64 = 7;
/// Post-restart health poll interval.
const PROXY_POLL_INTERVAL: Duration = Duration::from_secs(3);
/// Post-restart health poll total timeout.
const PROXY_POLL_TIMEOUT: Duration = Duration::from_secs(30);

/// Consecutive failures before auto-restart attempt.
const PROXY_RESTART_THRESHOLD: u32 = 2;

pub fn spawn(state: AppState) -> tokio::task::JoinHandle<()> {
    // Spawn browser proxy watchdog on separate interval (30s)
    if crate::browser_proxy::is_enabled() {
        let proxy_state = state.clone();
        tokio::spawn(async move {
            tracing::info!("watchdog: browser proxy monitor started (interval={}s)", PROXY_CHECK_INTERVAL.as_secs());

            // Initial check immediately
            check_browser_proxy(&proxy_state).await;

            loop {
                tokio::time::sleep(PROXY_CHECK_INTERVAL).await;
                check_browser_proxy(&proxy_state).await;
            }
        });
    }

    tokio::spawn(async move {
        tracing::info!("watchdog: started (interval={}s)", CHECK_INTERVAL.as_secs());

        loop {
            tokio::time::sleep(CHECK_INTERVAL).await;

            let db_ok = check_db(&state).await;
            let cache_ok = check_and_refresh_cache(&state).await;
            let api_ok = check_anthropic_api(&state).await;

            if db_ok && cache_ok && api_ok {
                tracing::debug!("watchdog: all checks passed");
            } else {
                tracing::warn!(
                    "watchdog: db={} cache={} api={}",
                    if db_ok { "ok" } else { "FAIL" },
                    if cache_ok { "ok" } else { "REFRESHED" },
                    if api_ok { "ok" } else { "UNREACHABLE" },
                );
            }
        }
    })
}

async fn check_db(state: &AppState) -> bool {
    let result = tokio::time::timeout(
        DB_PING_TIMEOUT,
        sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&state.db),
    )
    .await;

    match result {
        Ok(Ok(_)) => true,
        Ok(Err(e)) => {
            tracing::error!("watchdog: DB ping failed: {}", e);
            false
        }
        Err(_) => {
            tracing::error!("watchdog: DB ping timed out after {}s", DB_PING_TIMEOUT.as_secs());
            false
        }
    }
}

async fn check_and_refresh_cache(state: &AppState) -> bool {
    let is_stale = {
        let lock_result = tokio::time::timeout(
            Duration::from_secs(5),
            state.model_cache.read(),
        )
        .await;

        match lock_result {
            Ok(cache) => cache.is_stale(),
            Err(_) => {
                tracing::error!("watchdog: model_cache read lock timed out — possible deadlock");
                return false;
            }
        }
    };

    if is_stale {
        tracing::info!("watchdog: model cache stale, triggering refresh");
        let refresh_result = tokio::time::timeout(
            Duration::from_secs(30),
            model_registry::refresh_cache(state),
        )
        .await;

        match refresh_result {
            Ok((models, errors)) => {
                let total: usize = models.values().map(|v| v.len()).sum();
                tracing::info!("watchdog: cache refreshed — {} models from {} providers", total, models.len());
                for err in &errors {
                    tracing::warn!("watchdog: provider fetch error: {}", err);
                }
            }
            Err(_) => {
                tracing::error!("watchdog: cache refresh timed out after 30s");
            }
        }
        false
    } else {
        true
    }
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
        // No credential — skip check (not an error)
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

// ── Browser Proxy Watchdog ──────────────────────────────────────────────────

async fn check_browser_proxy(state: &AppState) {
    let mut status = crate::browser_proxy::detailed_health_check(&state.http_client).await;

    // Carry over restart tracking from previous state
    let (was_ready, prev_failures, prev_restart_epoch, prev_total_restarts,
         prev_backoff, prev_successes, prev_pid) = {
        let prev = state.browser_proxy_status.read().await;
        (prev.ready, prev.consecutive_failures, prev.last_restart_epoch,
         prev.total_restarts, prev.backoff_level, prev.consecutive_successes, prev.last_pid)
    };

    // Preserve restart history in new status
    status.last_restart_epoch = prev_restart_epoch;
    status.total_restarts = prev_total_restarts;
    status.backoff_level = prev_backoff;
    status.last_pid = prev_pid;

    let now_ready = status.ready;
    let now_reachable = status.reachable;

    if now_ready {
        // Reset failure counter on success
        status.consecutive_failures = 0;
        status.consecutive_successes = prev_successes + 1;

        // Reset backoff after sustained health
        if status.consecutive_successes >= PROXY_BACKOFF_RESET_THRESHOLD && status.backoff_level > 0 {
            tracing::info!(
                "watchdog: browser proxy healthy for {} consecutive checks — resetting backoff from level {}",
                status.consecutive_successes, status.backoff_level
            );
            status.backoff_level = 0;
        }

        if !was_ready {
            tracing::info!(
                "watchdog: browser proxy ONLINE — {}/{} workers ready, {} total requests",
                status.workers_ready, status.pool_size, status.total_requests
            );
            push_history_event(state, "online", &status, None);
        } else {
            tracing::debug!(
                "watchdog: browser proxy ok — {}/{} workers ready, {} busy, queue={}",
                status.workers_ready, status.pool_size, status.workers_busy, status.queue_length
            );
        }
    } else {
        // Increment failure counter, reset success counter
        status.consecutive_failures = prev_failures + 1;
        status.consecutive_successes = 0;

        if !now_reachable {
            tracing::error!(
                "watchdog: browser proxy UNREACHABLE ({} consecutive failures) — {}",
                status.consecutive_failures,
                status.last_error.as_deref().unwrap_or("connection refused")
            );
            if was_ready || status.consecutive_failures == 1 {
                push_history_event(state, "unreachable", &status, status.last_error.clone());
            }
        } else {
            tracing::warn!(
                "watchdog: browser proxy reachable but NOT READY (workers_ready={}/{}, failures={})",
                status.workers_ready, status.pool_size, status.consecutive_failures
            );
            if was_ready || status.consecutive_failures == 1 {
                push_history_event(state, "not_ready", &status, None);
            }
        }

        // Auto-restart after threshold consecutive failures
        if status.consecutive_failures >= PROXY_RESTART_THRESHOLD {
            let restarted = try_restart_proxy(&mut status, &state.http_client).await;
            if restarted {
                push_history_event(state, "restart_initiated", &status, None);
            }
        }
    }

    *state.browser_proxy_status.write().await = status;
}

/// Compute the current cooldown based on exponential backoff level.
/// 120s -> 240s -> 480s -> capped at 900s (15 min).
fn compute_cooldown(backoff_level: u32) -> u64 {
    let cooldown = PROXY_RESTART_BASE_COOLDOWN.saturating_mul(1u64 << backoff_level);
    cooldown.min(PROXY_RESTART_MAX_COOLDOWN)
}

/// Validate that `auth-state.json` exists and is fresh (< 7 days old).
/// Returns `true` if valid, `false` if missing/expired (restart should be skipped).
fn validate_auth_state(proxy_dir: &str) -> bool {
    let auth_path = std::path::Path::new(proxy_dir).join("auth-state.json");

    let metadata = match std::fs::metadata(&auth_path) {
        Ok(m) => m,
        Err(_) => {
            tracing::error!(
                "watchdog: auth-state.json not found in {} — cookies expired, run `npm run login` in gemini-browser-proxy",
                proxy_dir
            );
            return false;
        }
    };

    if let Ok(modified) = metadata.modified() {
        let age = std::time::SystemTime::now()
            .duration_since(modified)
            .unwrap_or_default();
        let max_age = Duration::from_secs(AUTH_STATE_MAX_AGE_DAYS * 24 * 60 * 60);
        if age > max_age {
            tracing::error!(
                "watchdog: auth-state.json is {} days old (max {}) — cookies expired, run `npm run login` in gemini-browser-proxy",
                age.as_secs() / 86400,
                AUTH_STATE_MAX_AGE_DAYS
            );
            return false;
        }
    }

    true
}

/// Kill a previous proxy process by PID if still running (zombie cleanup).
async fn kill_previous_proxy(pid: u32) {
    tracing::info!("watchdog: killing previous proxy process PID={}", pid);

    #[cfg(windows)]
    let result = tokio::process::Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await;

    #[cfg(not(windows))]
    let result = tokio::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await;

    match result {
        Ok(exit) => {
            if exit.success() {
                tracing::info!("watchdog: killed previous proxy PID={}", pid);
            } else {
                tracing::debug!("watchdog: PID={} already exited (kill returned {})", pid, exit);
            }
        }
        Err(e) => {
            tracing::warn!("watchdog: failed to kill PID={}: {}", pid, e);
        }
    }

    // Brief pause to let the OS clean up
    tokio::time::sleep(Duration::from_millis(500)).await;
}

/// Actively poll proxy `/health` after restart to detect early recovery.
async fn poll_after_restart(client: &reqwest::Client) -> bool {
    let deadline = tokio::time::Instant::now() + PROXY_POLL_TIMEOUT;

    while tokio::time::Instant::now() < deadline {
        tokio::time::sleep(PROXY_POLL_INTERVAL).await;

        let check = crate::browser_proxy::detailed_health_check(client).await;
        if check.ready {
            tracing::info!(
                "watchdog: browser proxy came up during post-restart polling — {}/{} workers ready",
                check.workers_ready, check.pool_size
            );
            return true;
        }
        tracing::debug!("watchdog: post-restart poll — proxy not ready yet");
    }

    tracing::info!(
        "watchdog: post-restart polling finished after {}s — proxy not yet ready, will check on next cycle",
        PROXY_POLL_TIMEOUT.as_secs()
    );
    false
}

/// Push a status change event to the proxy health history ring buffer.
fn push_history_event(
    state: &AppState,
    event_type: &str,
    status: &crate::browser_proxy::BrowserProxyStatus,
    error: Option<String>,
) {
    state.browser_proxy_history.push(crate::browser_proxy::ProxyHealthEvent {
        timestamp: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        event_type: event_type.to_string(),
        workers_ready: status.workers_ready,
        pool_size: status.pool_size,
        error,
        consecutive_failures: status.consecutive_failures,
        total_restarts: status.total_restarts,
    });
}

/// Attempt to auto-restart the browser proxy process.
/// Returns `true` if a restart was initiated, `false` if skipped.
async fn try_restart_proxy(
    status: &mut crate::browser_proxy::BrowserProxyStatus,
    client: &reqwest::Client,
) -> bool {
    let proxy_dir = match crate::browser_proxy::proxy_dir() {
        Some(dir) => dir,
        None => {
            tracing::warn!(
                "watchdog: proxy down but BROWSER_PROXY_DIR not set — cannot auto-restart"
            );
            return false;
        }
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Exponential backoff cooldown check
    let cooldown = compute_cooldown(status.backoff_level);
    let elapsed = now.saturating_sub(status.last_restart_epoch);
    if status.last_restart_epoch > 0 && elapsed < cooldown {
        tracing::debug!(
            "watchdog: proxy restart cooldown (level={}, {}s) — {}s remaining",
            status.backoff_level, cooldown, cooldown - elapsed
        );
        return false;
    }

    // Auth-state validation — skip restart if cookies are missing/expired
    if !validate_auth_state(&proxy_dir) {
        return false;
    }

    // Kill previous zombie process if PID is tracked
    if let Some(prev_pid) = status.last_pid {
        kill_previous_proxy(prev_pid).await;
    }

    tracing::warn!(
        "watchdog: attempting browser proxy auto-restart #{} from {} (backoff level={})",
        status.total_restarts + 1,
        proxy_dir,
        status.backoff_level
    );

    // Prepare log file: redirect stdout/stderr to logs/browser-proxy.log
    let logs_dir = std::path::Path::new(&proxy_dir).join("logs");
    let log_file_result = std::fs::create_dir_all(&logs_dir)
        .and_then(|_| {
            // Truncate (create/overwrite) on each restart
            std::fs::File::create(logs_dir.join("browser-proxy.log"))
        });

    let (stdout_cfg, stderr_cfg) = match log_file_result {
        Ok(log_file) => {
            match log_file.try_clone() {
                Ok(log_file_clone) => {
                    tracing::info!(
                        "watchdog: proxy output → {}",
                        logs_dir.join("browser-proxy.log").display()
                    );
                    (
                        std::process::Stdio::from(log_file),
                        std::process::Stdio::from(log_file_clone),
                    )
                }
                Err(e) => {
                    tracing::warn!("watchdog: failed to clone log file handle: {} — stdout only", e);
                    (
                        std::process::Stdio::from(log_file),
                        std::process::Stdio::null(),
                    )
                }
            }
        }
        Err(e) => {
            tracing::warn!(
                "watchdog: cannot create proxy log file ({}), output will be discarded: {}",
                logs_dir.display(), e
            );
            (std::process::Stdio::null(), std::process::Stdio::null())
        }
    };

    // Spawn detached process: `cmd /C npm start` in proxy directory
    let spawn_result = {
        let mut cmd = tokio::process::Command::new("cmd");
        cmd.args(["/C", "npm", "start"])
            .current_dir(&proxy_dir)
            .stdout(stdout_cfg)
            .stderr(stderr_cfg)
            .stdin(std::process::Stdio::null());

        // Detach on Windows so proxy survives if backend restarts
        #[cfg(windows)]
        {
            cmd.creation_flags(0x00000208u32); // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        }

        cmd.spawn()
    };

    match spawn_result {
        Ok(child) => {
            // Track PID for zombie cleanup on next restart
            status.last_pid = child.id();

            status.last_restart_epoch = now;
            status.total_restarts += 1;
            // Increase backoff level for next restart attempt
            status.backoff_level = status.backoff_level.saturating_add(1);
            // Reset failure counter so we give the new process time to start
            status.consecutive_failures = 0;

            let next_cooldown = compute_cooldown(status.backoff_level);
            tracing::info!(
                "watchdog: browser proxy restart #{} initiated (PID={:?}) — polling health for {}s, next cooldown={}s",
                status.total_restarts,
                status.last_pid,
                PROXY_POLL_TIMEOUT.as_secs(),
                next_cooldown
            );

            // Actively poll for proxy readiness instead of waiting for next watchdog cycle
            poll_after_restart(client).await;
            return true;
        }
        Err(e) => {
            tracing::error!("watchdog: failed to restart browser proxy: {}", e);
        }
    }
    false
}
