// Browser proxy client — calls gemini-browser-proxy for AI image generation.
// Enabled via BROWSER_PROXY_URL env var (default: http://localhost:3001).
// The proxy runs 4 parallel Playwright workers with human-like delays/jitter.
// Jaskier Shared Pattern -- browser_proxy

use std::time::Duration;

use serde_json::json;

/// Check if the browser proxy is enabled via env var.
pub fn is_enabled() -> bool {
    std::env::var("BROWSER_PROXY_URL").is_ok()
        || std::env::var("BROWSER_PROXY")
            .ok()
            .is_some_and(|v| v == "1" || v == "true")
}

fn proxy_base_url() -> String {
    std::env::var("BROWSER_PROXY_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string())
}

/// Call the browser proxy to generate/edit an image.
/// Sends one image + prompt, receives back a generated image as base64.
/// Retries once on transient failures (502, 503, timeout) with 5s backoff.
pub async fn generate_image(
    client: &reqwest::Client,
    image_base64: &str,
    mime_type: &str,
    prompt: &str,
    context: &str,
) -> Result<String, String> {
    let url = format!("{}/api/generate-image", proxy_base_url());

    tracing::info!(
        "browser_proxy[{}]: sending request (image ~{}KB, prompt {}chars)",
        context,
        image_base64.len() * 3 / 4 / 1024,
        prompt.len()
    );

    let body = json!({
        "image_base64": image_base64,
        "mime_type": mime_type,
        "prompt": prompt,
    });

    // Attempt with one retry on transient failures
    for attempt in 1..=2u8 {
        let start = std::time::Instant::now();

        let resp = client
            .post(&url)
            .json(&body)
            .timeout(Duration::from_secs(360))
            .send()
            .await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                if attempt < 2 {
                    tracing::warn!(
                        "browser_proxy[{}]: attempt {} failed ({}), retrying in 5s",
                        context, attempt, e
                    );
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                }
                return Err(format!("Browser proxy unavailable ({}): {}", url, e));
            }
        };

        let status = resp.status();
        let resp_text = resp
            .text()
            .await
            .map_err(|e| format!("Browser proxy response read error: {}", e))?;

        // Retry on 502/503
        if (status.as_u16() == 502 || status.as_u16() == 503) && attempt < 2 {
            tracing::warn!(
                "browser_proxy[{}]: HTTP {} on attempt {}, retrying in 5s",
                context, status.as_u16(), attempt
            );
            tokio::time::sleep(Duration::from_secs(5)).await;
            continue;
        }

        if !status.is_success() {
            let preview_len = resp_text.len().min(300);
            let preview = &resp_text[..preview_len];
            return Err(format!(
                "Browser proxy returned {}: {}",
                status.as_u16(),
                preview
            ));
        }

        let resp_json: serde_json::Value = serde_json::from_str(&resp_text)
            .map_err(|e| format!("Browser proxy invalid JSON: {}", e))?;

        let image_b64 = resp_json["image_base64"]
            .as_str()
            .ok_or_else(|| "Browser proxy response missing image_base64".to_string())?
            .to_string();

        let processing_ms = resp_json["processing_time_ms"].as_u64().unwrap_or(0);
        let total_ms = start.elapsed().as_millis();
        tracing::info!(
            "browser_proxy[{}]: success in {}ms (proxy: {}ms, result ~{}KB)",
            context,
            total_ms,
            processing_ms,
            image_b64.len() * 3 / 4 / 1024
        );

        return Ok(image_b64);
    }

    unreachable!()
}

/// Check if the browser proxy is healthy and ready.
pub async fn health_check(client: &reqwest::Client) -> bool {
    let url = format!("{}/health", proxy_base_url());
    match client.get(&url).timeout(Duration::from_secs(5)).send().await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                json["ready"].as_bool().unwrap_or(false)
            } else {
                false
            }
        }
        Err(_) => false,
    }
}

// ── HTTP handlers for browser proxy management ───────────────────────────

use axum::extract::State;
use axum::Json;
use axum::http::StatusCode;

/// GET /api/browser-proxy/status — combined health + login status
pub async fn proxy_status(
    State(state): State<crate::state::AppState>,
) -> Json<serde_json::Value> {
    if !is_enabled() {
        return Json(json!({
            "configured": false,
            "error": "BROWSER_PROXY_URL not set"
        }));
    }

    let client = &state.http_client;
    let base = proxy_base_url();

    // Fetch health
    let health_resp = client
        .get(format!("{}/health", base))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok();
    let health = match health_resp {
        Some(r) => r.json::<serde_json::Value>().await.ok(),
        None => None,
    };

    // Fetch login status
    let login_resp = client
        .get(format!("{}/api/login/status", base))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok();
    let login = match login_resp {
        Some(r) => r.json::<serde_json::Value>().await.ok(),
        None => None,
    };

    let mut result = json!({ "configured": true, "proxy_url": base });

    if let Some(h) = health {
        result["health"] = h;
        result["reachable"] = json!(true);
    } else {
        result["reachable"] = json!(false);
    }

    if let Some(l) = login {
        result["login"] = l;
    }

    Json(result)
}

/// POST /api/browser-proxy/login — trigger login on proxy
pub async fn proxy_login(
    State(state): State<crate::state::AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_enabled() {
        return Err(StatusCode::NOT_FOUND);
    }

    let url = format!("{}/api/login", proxy_base_url());
    let resp = state
        .http_client
        .post(&url)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("browser_proxy login request failed: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

    let body: serde_json::Value = resp.json().await.unwrap_or(json!({"error": "invalid response"}));
    Ok(Json(body))
}

/// GET /api/browser-proxy/login/status — check login progress
pub async fn proxy_login_status(
    State(state): State<crate::state::AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_enabled() {
        return Err(StatusCode::NOT_FOUND);
    }

    let url = format!("{}/api/login/status", proxy_base_url());
    let resp = state
        .http_client
        .get(&url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("browser_proxy login status failed: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

    let body: serde_json::Value = resp.json().await.unwrap_or(json!({"error": "invalid response"}));
    Ok(Json(body))
}

/// POST /api/browser-proxy/reinit — reinitialize proxy workers
pub async fn proxy_reinit(
    State(state): State<crate::state::AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_enabled() {
        return Err(StatusCode::NOT_FOUND);
    }

    let url = format!("{}/api/reinit", proxy_base_url());
    let resp = state
        .http_client
        .post(&url)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("browser_proxy reinit failed: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

    let body: serde_json::Value = resp.json().await.unwrap_or(json!({"error": "invalid response"}));
    Ok(Json(body))
}

/// DELETE /api/browser-proxy/login — logout from proxy
pub async fn proxy_logout(
    State(state): State<crate::state::AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_enabled() {
        return Err(StatusCode::NOT_FOUND);
    }

    let url = format!("{}/api/login", proxy_base_url());
    let resp = state
        .http_client
        .delete(&url)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("browser_proxy logout failed: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

    let body: serde_json::Value = resp.json().await.unwrap_or(json!({"error": "invalid response"}));
    Ok(Json(body))
}
