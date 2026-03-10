// Jaskier Shared Pattern — model_registry
//
// ClaudeHydra v4 — Dynamic Model Registry
// Fetches available models from Anthropic (and optionally Google) APIs,
// caches them with a TTL, and selects the latest model for each tier.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Path, State};
use axum::http::header;
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use utoipa::ToSchema;

use crate::state::AppState;

// --- Jaskier Shared Core Types ---

// ── Cache TTL ────────────────────────────────────────────────────────────────

const CACHE_TTL: Duration = Duration::from_secs(3600); // 1 hour

// ── Model info ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ModelInfo {
    pub id: String,
    pub provider: String,
    pub display_name: Option<String>,
    pub capabilities: Vec<String>,
}

// --- Project-Specific Types ---

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ResolvedModels {
    pub commander: Option<ModelInfo>,   // opus
    pub coordinator: Option<ModelInfo>, // sonnet
    pub executor: Option<ModelInfo>,    // haiku
    pub flash: Option<ModelInfo>,       // gemini flash (fast tasks)
}

// ── Pin request ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct PinModelRequest {
    pub use_case: String,
    pub model_id: String,
}

// ── Model cache ──────────────────────────────────────────────────────────────

pub struct ModelCache {
    pub models: HashMap<String, Vec<ModelInfo>>,
    pub fetched_at: Option<Instant>,
}

impl Default for ModelCache {
    fn default() -> Self {
        Self::new()
    }
}

impl ModelCache {
    pub fn new() -> Self {
        Self {
            models: HashMap::new(),
            fetched_at: None,
        }
    }

    pub fn is_stale(&self) -> bool {
        match self.fetched_at {
            Some(t) => t.elapsed() > CACHE_TTL,
            None => true,
        }
    }
}

// ── Fetch models from providers ──────────────────────────────────────────────

async fn fetch_anthropic_models(
    client: &reqwest::Client,
    api_key: &str,
) -> Result<Vec<ModelInfo>, String> {
    let resp = client
        .get("https://api.anthropic.com/v1/models")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await
        .map_err(|e| format!("Anthropic models request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Anthropic models API returned {}", resp.status()));
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Anthropic models: {}", e))?;

    let data = body["data"].as_array().cloned().unwrap_or_default();

    let mut models = Vec::new();
    for m in data {
        let id = m["id"].as_str().unwrap_or("").to_string();
        let display_name = m["display_name"]
            .as_str()
            .or_else(|| m["name"].as_str())
            .map(|s| s.to_string());

        let mut caps = vec!["text".to_string(), "vision".to_string()];
        if id.contains("opus") {
            caps.push("advanced_reasoning".to_string());
        }

        if !id.is_empty() {
            models.push(ModelInfo {
                id,
                provider: "anthropic".to_string(),
                display_name,
                capabilities: caps,
            });
        }
    }

    Ok(models)
}

async fn fetch_google_models(
    client: &reqwest::Client,
    api_key: &str,
    is_oauth: bool,
) -> Result<Vec<ModelInfo>, String> {
    let url = "https://generativelanguage.googleapis.com/v1beta/models";

    let parsed_url = reqwest::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;

    let resp = crate::oauth_google::apply_google_auth(client.get(parsed_url), api_key, is_oauth)
        .send()
        .await
        .map_err(|e| format!("Google models request failed: {:?}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Google models API returned {}", resp.status()));
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Google models: {}", e))?;

    let models_arr = body["models"].as_array().cloned().unwrap_or_default();

    let mut models = Vec::new();
    for m in models_arr {
        let name = m["name"].as_str().unwrap_or("").to_string();
        let id = name.trim_start_matches("models/").to_string();
        let display_name = m["displayName"].as_str().map(|s| s.to_string());

        let methods: Vec<String> = m["supportedGenerationMethods"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        if methods.contains(&"generateContent".to_string()) && id.starts_with("gemini") {
            models.push(ModelInfo {
                id,
                provider: "google".to_string(),
                display_name,
                capabilities: vec!["text".to_string()],
            });
        }
    }

    Ok(models)
}

// ── Refresh cache ────────────────────────────────────────────────────────────

pub async fn refresh_cache(state: &AppState) -> (HashMap<String, Vec<ModelInfo>>, Vec<String>) {
    let mut all_models: HashMap<String, Vec<ModelInfo>> = HashMap::new();
    let mut errors: Vec<String> = Vec::new();

    // Anthropic (primary for ClaudeHydra)
    // Extract key from lock BEFORE async fetch to avoid holding read lock across HTTP call
    let anthropic_key = {
        let rt = state.runtime.read().await;
        rt.api_keys.get("ANTHROPIC_API_KEY").cloned()
    };
    if let Some(key) = anthropic_key {
        match fetch_anthropic_models(&state.http_client, &key).await {
            Ok(models) => {
                tracing::info!("model_registry: fetched {} Anthropic models", models.len());
                all_models.insert("anthropic".to_string(), models);
            }
            Err(e) => {
                tracing::warn!("model_registry: Anthropic fetch failed: {}", e);
                errors.push(format!("anthropic: {}", e));
            }
        }
    }

    // Google — use OAuth or API key credential, with automatic fallback
    if let Some((cred, is_oauth)) = crate::oauth_google::get_google_credential(state).await {
        match fetch_google_models(&state.http_client, &cred, is_oauth).await {
            Ok(models) => {
                tracing::info!("model_registry: fetched {} Google models", models.len());
                all_models.insert("google".to_string(), models);
            }
            Err(e) => {
                tracing::warn!("model_registry: Google fetch failed: {}", e);
                // If OAuth was used and failed, mark it invalid and try API key
                if is_oauth {
                    crate::oauth_google::mark_oauth_gemini_invalid(state);
                    tracing::info!("model_registry: OAuth failed, trying API key fallback");
                    if let Some((fallback_cred, fallback_is_oauth)) =
                        crate::oauth_google::get_google_api_key_credential(state).await
                    {
                        match fetch_google_models(
                            &state.http_client,
                            &fallback_cred,
                            fallback_is_oauth,
                        )
                        .await
                        {
                            Ok(models) => {
                                tracing::info!(
                                    "model_registry: fallback OK — fetched {} Google models via API key",
                                    models.len()
                                );
                                all_models.insert("google".to_string(), models);
                            }
                            Err(e2) => {
                                tracing::warn!(
                                    "model_registry: API key fallback also failed: {}",
                                    e2
                                );
                                errors.push(format!("google (oauth): {}", e));
                                errors.push(format!("google (api_key): {}", e2));
                            }
                        }
                    } else {
                        errors.push(format!("google: {} (no API key fallback available)", e));
                    }
                } else {
                    errors.push(format!("google: {}", e));
                }
            }
        }
    }

    let mut cache = state.model_cache.write().await;
    cache.models = all_models.clone();
    cache.fetched_at = Some(Instant::now());

    (all_models, errors)
}

// ── Model selection ──────────────────────────────────────────────────────────

/// Extract a sortable version key from a model ID.
/// Handles patterns like "gemini-2.5-flash", "gemini-3.1-pro", "claude-sonnet-4-6".
/// Returns (major * 1000 + minor, date_suffix) for proper ordering.
fn version_key(id: &str) -> (u64, String) {
    let mut version: u64 = 0;
    let mut date_suffix = String::new();

    for part in id.split('-') {
        if let Some((major_s, minor_s)) = part.split_once('.') {
            if let (Ok(major), Ok(minor)) = (major_s.parse::<u64>(), minor_s.parse::<u64>()) {
                let v = major * 1000 + minor;
                if v > version {
                    version = v;
                }
            }
        } else if let Ok(n) = part.parse::<u64>() {
            if n > 20000000 {
                date_suffix = part.to_string();
            } else if n < 100 {
                let v = n * 1000;
                if v > version {
                    version = v;
                }
            }
        }
    }

    // Tier bonus: "pro" > "flash"/"lite" for same version number
    if id.contains("-pro") {
        version += 100;
    } else if id.contains("-ultra") {
        version += 200;
    }

    (version, date_suffix)
}

/// Select the best model from a list using include/exclude filters.
/// Sorts by extracted version key (highest = newest).
fn select_best(
    models: &[ModelInfo],
    must_contain: &[&str],
    must_not_contain: &[&str],
) -> Option<ModelInfo> {
    let mut candidates: Vec<&ModelInfo> = models
        .iter()
        .filter(|m| must_contain.iter().all(|p| m.id.contains(p)))
        .filter(|m| must_not_contain.iter().all(|p| !m.id.contains(p)))
        .collect();

    candidates.sort_by(|a, b| {
        let (av, ad) = version_key(&a.id);
        let (bv, bd) = version_key(&b.id);
        bv.cmp(&av).then_with(|| bd.cmp(&ad))
    });

    candidates.first().map(|m| (*m).clone())
}

/// Resolve the best model for each use case from the cached models.
pub async fn resolve_models(state: &AppState) -> ResolvedModels {
    {
        let cache = state.model_cache.read().await;
        if cache.is_stale() {
            drop(cache);
            let _ = refresh_cache(state).await;
        }
    }

    let cache = state.model_cache.read().await;
    let anthropic = cache.models.get("anthropic").cloned().unwrap_or_default();

    // Commander: latest opus (prefer non-dated, fallback to dated)
    let commander = select_best(&anthropic, &["opus"], &["20"])
        .or_else(|| select_best(&anthropic, &["opus"], &[]));

    // Coordinator: latest sonnet (prefer non-dated)
    let coordinator = select_best(&anthropic, &["sonnet"], &["20"])
        .or_else(|| select_best(&anthropic, &["sonnet"], &[]));

    // Executor: latest haiku (prefer non-dated)
    let executor = select_best(&anthropic, &["haiku"], &["20"])
        .or_else(|| select_best(&anthropic, &["haiku"], &[]));

    // Flash: latest Google Flash model for fast simple tasks
    let google = cache.models.get("google").cloned().unwrap_or_default();
    let flash = select_best(
        &google,
        &["flash"],
        &[
            "lite", "latest", "image", "tts", "computer", "robotics", "audio", "thinking",
        ],
    );

    ResolvedModels {
        commander,
        coordinator,
        executor,
        flash,
    }
}

/// Classify prompt complexity for auto-tier routing.
/// Returns "simple" (→ flash), "complex" (→ commander), or "medium" (→ coordinator).
pub fn classify_complexity(prompt: &str) -> &'static str {
    let chars = prompt.len();
    let words = prompt.split_whitespace().count();
    let lower = prompt.to_lowercase();
    let complex_keywords = [
        "architect",
        "refactor",
        "design pattern",
        "migration",
        "security audit",
        "performance",
        "optimize",
        "scale",
        "infrastructure",
        "deploy",
        "```",
        "fn ",
        "function ",
        "class ",
        "impl ",
        "async ",
        "struct ",
    ];
    let has_complex = complex_keywords.iter().any(|k| lower.contains(k));

    if chars > 1000 || has_complex {
        "complex"
    } else if chars < 80 && words < 15 {
        "simple"
    } else {
        "medium"
    }
}

/// Get the model ID for a given tier/use case.
/// Priority: 1) DB pin  2) dynamic auto-selection  3) hardcoded fallback.
pub async fn get_model_id(state: &AppState, use_case: &str) -> String {
    // 1) Check for a pinned model in DB
    let pinned: Option<String> =
        sqlx::query_scalar("SELECT model_id FROM ch_model_pins WHERE use_case = $1")
            .bind(use_case)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

    if let Some(ref pin) = pinned {
        tracing::info!(
            "model_registry: use_case={} → model={} (pinned)",
            use_case,
            pin
        );
        return pin.clone();
    }

    // 2) Dynamic auto-selection
    let resolved = resolve_models(state).await;

    let (model, fallback) = match use_case {
        "commander" | "Commander" => (resolved.commander, "claude-opus-4-6"),
        "coordinator" | "Coordinator" => (resolved.coordinator, "claude-sonnet-4-6"),
        "executor" | "Executor" => (resolved.executor, "claude-haiku-4-5-20251001"),
        "flash" | "Flash" => (resolved.flash, "gemini-3.1-flash-preview"),
        _ => (resolved.coordinator, "claude-sonnet-4-6"),
    };

    let id = model.as_ref().map(|m| m.id.as_str()).unwrap_or(fallback);

    tracing::info!(
        "model_registry: use_case={} → model={}{}",
        use_case,
        id,
        if model.is_some() {
            " (auto)"
        } else {
            " (fallback)"
        }
    );

    id.to_string()
}

/// Map a tier name to the current best model ID (used by agent init).
pub async fn model_for_tier(state: &AppState, tier: &str) -> String {
    get_model_id(state, tier).await
}

// ── HTTP handlers ────────────────────────────────────────────────────────────

/// Read all pins from DB as a HashMap.
async fn get_pins_map(state: &AppState) -> HashMap<String, String> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT use_case, model_id FROM ch_model_pins")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

    rows.into_iter().collect()
}

// ── Startup sync ─────────────────────────────────────────────────────────────

/// Called once at startup: fetch models from API, pick the best per tier,
/// and persist the coordinator model as `default_model` in `ch_settings`.
pub async fn startup_sync(state: &AppState) {
    tracing::info!("model_registry: fetching models at startup…");

    let (models, startup_errors) = refresh_cache(state).await;
    let total: usize = models.values().map(|v| v.len()).sum();
    tracing::info!(
        "model_registry: {} models cached from {} providers",
        total,
        models.len()
    );
    for err in &startup_errors {
        tracing::warn!("model_registry: startup fetch error: {}", err);
    }

    let resolved = resolve_models(state).await;

    // Persist coordinator (default chat model) into ch_settings
    if let Some(ref best) = resolved.coordinator {
        tracing::info!("model_registry: best coordinator model → {}", best.id);

        let res = sqlx::query(
            "UPDATE ch_settings SET default_model = $1, updated_at = NOW() WHERE id = 1",
        )
        .bind(&best.id)
        .execute(&state.db)
        .await;

        match res {
            Ok(_) => tracing::info!("model_registry: default_model updated to {}", best.id),
            Err(e) => tracing::warn!("model_registry: failed to update default_model: {}", e),
        }
    } else {
        tracing::warn!("model_registry: no coordinator model resolved — keeping DB default");
    }

    tracing::info!(
        "model_registry: resolved → commander={}, coordinator={}, executor={}, flash={}",
        resolved
            .commander
            .as_ref()
            .map(|m| m.id.as_str())
            .unwrap_or("(none)"),
        resolved
            .coordinator
            .as_ref()
            .map(|m| m.id.as_str())
            .unwrap_or("(none)"),
        resolved
            .executor
            .as_ref()
            .map(|m| m.id.as_str())
            .unwrap_or("(none)"),
        resolved
            .flash
            .as_ref()
            .map(|m| m.id.as_str())
            .unwrap_or("(none)"),
    );
}

// --- Shared Handlers ---

/// GET /api/models — Return all cached models + resolved selections + pins
#[utoipa::path(get, path = "/api/models", tag = "models",
    responses((status = 200, description = "Cached models, resolved selections, and pins", body = Value))
)]
pub async fn list_models(State(state): State<AppState>) -> impl IntoResponse {
    let resolved = resolve_models(&state).await;
    let pins = get_pins_map(&state).await;
    let cache = state.model_cache.read().await;

    let total: usize = cache.models.values().map(|v| v.len()).sum();
    let stale = cache.is_stale();
    let fetched_ago = cache.fetched_at.map(|t| t.elapsed().as_secs());

    let body = Json(json!({
        "total_models": total,
        "cache_stale": stale,
        "cache_age_seconds": fetched_ago,
        "pins": pins,
        "selected": {
            "commander": resolved.commander,
            "coordinator": resolved.coordinator,
            "executor": resolved.executor,
            "flash": resolved.flash,
        },
        "providers": {
            "anthropic": cache.models.get("anthropic").cloned().unwrap_or_default(),
            "google": cache.models.get("google").cloned().unwrap_or_default(),
        }
    }));

    // #6 — Cache static model list for 60 seconds
    ([(header::CACHE_CONTROL, "public, max-age=60")], body)
}

/// POST /api/models/refresh — Force refresh of model cache
#[utoipa::path(post, path = "/api/models/refresh", tag = "models",
    responses((status = 200, description = "Refreshed model cache", body = Value))
)]
pub async fn refresh_models(State(state): State<AppState>) -> Json<Value> {
    let (models, errors) = refresh_cache(&state).await;
    let resolved = resolve_models(&state).await;
    let pins = get_pins_map(&state).await;

    let total: usize = models.values().map(|v| v.len()).sum();

    let mut resp = json!({
        "refreshed": true,
        "total_models": total,
        "pins": pins,
        "selected": {
            "commander": resolved.commander,
            "coordinator": resolved.coordinator,
            "executor": resolved.executor,
            "flash": resolved.flash,
        }
    });
    if !errors.is_empty() {
        for err in &errors {
            tracing::error!("model registry refresh: {}", err);
        }
        resp["errors"] = json!(format!("{} provider(s) failed to refresh", errors.len()));
    }
    Json(resp)
}

/// POST /api/models/pin — Pin a specific model to a tier
#[utoipa::path(post, path = "/api/models/pin", tag = "models",
    request_body = PinModelRequest,
    responses((status = 200, description = "Model pinned", body = Value))
)]
pub async fn pin_model(
    State(state): State<AppState>,
    Json(body): Json<PinModelRequest>,
) -> Json<Value> {
    let normalized = body.use_case.to_lowercase();
    let valid = ["commander", "coordinator", "executor", "flash"];

    if !valid.contains(&normalized.as_str()) {
        return Json(
            json!({ "error": format!("Invalid use_case '{}'. Valid: commander, coordinator, executor, flash", body.use_case) }),
        );
    }

    let result = sqlx::query(
        "INSERT INTO ch_model_pins (use_case, model_id) \
         VALUES ($1, $2) \
         ON CONFLICT (use_case) DO UPDATE SET model_id = $2, pinned_at = now()",
    )
    .bind(&normalized)
    .bind(&body.model_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            tracing::info!(
                "model_registry: pinned use_case={} → model={}",
                normalized,
                body.model_id
            );
            // #40 Audit log
            crate::audit::log_audit(
                &state.db,
                "pin_model",
                json!({ "use_case": normalized, "model_id": body.model_id }),
                None,
            )
            .await;
            Json(json!({ "pinned": true, "use_case": normalized, "model_id": body.model_id }))
        }
        Err(e) => {
            tracing::error!("model registry: failed to pin use_case={} model={}: {}", normalized, body.model_id, e);
            Json(json!({ "error": "Internal database error" }))
        }
    }
}

/// DELETE /api/models/pin/{use_case} — Unpin a tier
#[utoipa::path(delete, path = "/api/models/pin/{use_case}", tag = "models",
    params(("use_case" = String, Path, description = "Use case to unpin")),
    responses((status = 200, description = "Model unpinned", body = Value))
)]
pub async fn unpin_model(
    State(state): State<AppState>,
    Path(use_case): Path<String>,
) -> Json<Value> {
    let result = sqlx::query("DELETE FROM ch_model_pins WHERE use_case = $1")
        .bind(&use_case)
        .execute(&state.db)
        .await;

    match result {
        Ok(r) => Json(json!({ "unpinned": r.rows_affected() > 0, "use_case": use_case })),
        Err(e) => {
            tracing::error!("model registry: failed to unpin use_case={}: {}", use_case, e);
            Json(json!({ "error": "Internal database error" }))
        }
    }
}

/// GET /api/models/pins — List all active pins
#[utoipa::path(get, path = "/api/models/pins", tag = "models",
    responses((status = 200, description = "All active model pins", body = Value))
)]
pub async fn list_pins(State(state): State<AppState>) -> Json<Value> {
    let pins = get_pins_map(&state).await;
    Json(json!({ "pins": pins }))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Helper: make a ModelInfo ──────────────────────────────────────────

    fn model(id: &str, provider: &str) -> ModelInfo {
        ModelInfo {
            id: id.to_string(),
            provider: provider.to_string(),
            display_name: None,
            capabilities: vec!["text".to_string()],
        }
    }

    // ── version_key ──────────────────────────────────────────────────────

    #[test]
    fn version_key_claude_opus_4_6() {
        let (v, _) = version_key("claude-opus-4-6");
        assert_eq!(v, 6000);
    }

    #[test]
    fn version_key_claude_sonnet_4_6() {
        let (v, _) = version_key("claude-sonnet-4-6");
        assert_eq!(v, 6000);
    }

    #[test]
    fn version_key_claude_haiku_with_date() {
        let (v, d) = version_key("claude-haiku-4-5-20251001");
        assert_eq!(v, 5000);
        assert_eq!(d, "20251001");
    }

    #[test]
    fn version_key_gemini_2_5_flash() {
        // "2.5" → major=2, minor=5 → 2*1000 + 5 = 2005
        let (v, _) = version_key("gemini-2.5-flash");
        assert_eq!(v, 2005);
    }

    #[test]
    fn version_key_gemini_3_1_pro() {
        // "3.1" → 3*1000+1=3001, plus +100 pro bonus = 3101
        let (v, _) = version_key("gemini-3.1-pro-preview");
        assert_eq!(v, 3101);
    }

    #[test]
    fn version_key_no_version() {
        let (v, d) = version_key("some-model-name");
        assert_eq!(v, 0);
        assert!(d.is_empty());
    }

    #[test]
    fn version_key_ordering_claude_models() {
        let (v_opus, _) = version_key("claude-opus-4-6");
        let (v_haiku_dated, d) = version_key("claude-haiku-4-5-20251001");
        // opus 4-6 has version 6000, haiku 4-5 has version 5000
        assert!(v_opus > v_haiku_dated);
        assert_eq!(d, "20251001");
    }

    // ── select_best ──────────────────────────────────────────────────────

    #[test]
    fn select_best_picks_highest_version() {
        let models = vec![
            model("claude-haiku-4-5-20251001", "anthropic"),
            model("claude-sonnet-4-6", "anthropic"),
            model("claude-opus-4-6", "anthropic"),
        ];

        let best = select_best(&models, &[], &[]);
        // Both opus and sonnet have version 6000, but opus sorts first alphabetically
        // Actually they have identical version_key — sort is stable so first in sorted order wins
        let best_id = best
            .expect("select_best should find a model from non-empty list")
            .id;
        assert!(
            best_id == "claude-sonnet-4-6" || best_id == "claude-opus-4-6",
            "Expected opus or sonnet, got: {}",
            best_id
        );
    }

    #[test]
    fn select_best_opus_filter() {
        let models = vec![
            model("claude-haiku-4-5-20251001", "anthropic"),
            model("claude-sonnet-4-6", "anthropic"),
            model("claude-opus-4-6", "anthropic"),
        ];

        let best = select_best(&models, &["opus"], &[]);
        assert_eq!(
            best.expect("opus filter should match claude-opus-4-6").id,
            "claude-opus-4-6"
        );
    }

    #[test]
    fn select_best_sonnet_filter() {
        let models = vec![
            model("claude-haiku-4-5-20251001", "anthropic"),
            model("claude-sonnet-4-6", "anthropic"),
            model("claude-sonnet-4-5-20250929", "anthropic"),
            model("claude-opus-4-6", "anthropic"),
        ];

        let best = select_best(&models, &["sonnet"], &[]);
        assert_eq!(
            best.expect("sonnet filter should match claude-sonnet-4-6")
                .id,
            "claude-sonnet-4-6"
        );
    }

    #[test]
    fn select_best_haiku_filter() {
        let models = vec![
            model("claude-haiku-4-5-20251001", "anthropic"),
            model("claude-sonnet-4-6", "anthropic"),
        ];

        let best = select_best(&models, &["haiku"], &[]);
        assert_eq!(
            best.expect("haiku filter should match claude-haiku-4-5-20251001")
                .id,
            "claude-haiku-4-5-20251001"
        );
    }

    #[test]
    fn select_best_exclude_dated_prefers_non_dated() {
        let models = vec![
            model("claude-sonnet-4-5-20250929", "anthropic"),
            model("claude-sonnet-4-6", "anthropic"),
        ];

        // Excluding "20" removes dated variants
        let best = select_best(&models, &["sonnet"], &["20"]);
        assert_eq!(
            best.expect("sonnet filter excluding dated should match claude-sonnet-4-6")
                .id,
            "claude-sonnet-4-6"
        );
    }

    #[test]
    fn select_best_no_match() {
        let models = vec![model("claude-sonnet-4-6", "anthropic")];

        let best = select_best(&models, &["nonexistent"], &[]);
        assert!(best.is_none());
    }

    #[test]
    fn select_best_empty_list() {
        let best = select_best(&[], &[], &[]);
        assert!(best.is_none());
    }

    // ── ModelCache ───────────────────────────────────────────────────────

    #[test]
    fn model_cache_new_is_stale() {
        let cache = ModelCache::new();
        assert!(cache.is_stale());
    }

    #[test]
    fn model_cache_default_is_stale() {
        let cache = ModelCache::default();
        assert!(cache.is_stale());
    }

    #[test]
    fn model_cache_fresh_after_set() {
        let mut cache = ModelCache::new();
        cache.fetched_at = Some(std::time::Instant::now());
        assert!(!cache.is_stale());
    }

    #[test]
    fn model_cache_empty_models_by_default() {
        let cache = ModelCache::new();
        assert!(cache.models.is_empty());
    }
}
