//! System prompt construction, chat context resolution, and auto-tier routing.
//!
//! - `build_system_prompt` — server-side system prompt (single source of truth)
//! - `resolve_chat_context` — model selection, session WD, generation params
//! - `warm_prompt_cache` — pre-warm system prompt cache at startup
//! - `tier_token_budget` — per-model max_tokens budget
//! - `classify_complexity` — auto-tier routing (re-exported from model_registry)

use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  Token budget per model tier
// ═══════════════════════════════════════════════════════════════════════

pub(crate) fn tier_token_budget(model: &str) -> u32 {
    let lower = model.to_lowercase();
    if lower.contains("opus") { 8192 }
    else if lower.contains("sonnet") { 4096 }
    else if lower.contains("haiku") { 2048 }
    else if lower.contains("flash") || lower.contains("gemini") { 8192 }
    else { 4096 }
}

// ═══════════════════════════════════════════════════════════════════════
//  Chat context — resolved model, tokens, WD, system prompt
// ═══════════════════════════════════════════════════════════════════════

pub(crate) struct ChatContext {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f64,
    pub max_iterations: i32,
    pub working_directory: String,
    pub session_id: Option<uuid::Uuid>,
    pub system_prompt: String,
}

// ═══════════════════════════════════════════════════════════════════════
//  System prompt builder (server-side, single source of truth)
// ═══════════════════════════════════════════════════════════════════════

/// Build system prompt server-side (single source of truth).
fn build_system_prompt(working_directory: &str, language: &str) -> String {
    let lang_name = if language == "pl" { "Polish" } else { "English" };
    let mut lines = vec![
        "You are a Witcher-themed AI agent in the ClaudeHydra v4 Swarm Control Center.".to_string(),
        "The swarm consists of 12 agents organized in 3 tiers:".to_string(),
        "- Commander (Geralt, Yennefer, Vesemir) → Claude Opus 4.6".to_string(),
        "- Coordinator (Triss, Jaskier, Ciri, Dijkstra) → Claude Sonnet 4.6".to_string(),
        "- Executor (Lambert, Eskel, Regis, Zoltan, Philippa) → Claude Haiku 4.5".to_string(),
        String::new(),
        "You assist the user with software engineering tasks.".to_string(),
        "You have access to local file tools (read_file, list_directory, write_file, search_in_files).".to_string(),
        "Use them proactively when the user asks about files or code.".to_string(),
        "Respond concisely and helpfully. Use markdown formatting when appropriate.".to_string(),
        format!("Write ALL text in **{}** (except code, file paths, and identifiers).", lang_name),
        String::new(),
        "## Multi-Agent Delegation (MANDATORY)".to_string(),
        "You MUST use `call_agent` to delegate subtasks to specialized agents when:".to_string(),
        "1. **Cross-domain tasks** — task spans multiple specializations (e.g., frontend + backend → delegate one part)".to_string(),
        "2. **Security review** — after ANY code change, delegate review to geralt or philippa".to_string(),
        "3. **Complex analysis** — use regis for deep research, yennefer for architecture review".to_string(),
        "4. **Multi-file changes** — delegate parallel subtasks to specialists (eskel for backend, zoltan for frontend)".to_string(),
        "5. **Testing** — after implementation, delegate test creation to vesemir".to_string(),
        String::new(),
        "**Agent roster for `call_agent`:**".to_string(),
        "- `geralt` — Security audits, OWASP, vulnerability scanning".to_string(),
        "- `yennefer` — Architecture review, design patterns, refactoring".to_string(),
        "- `triss` — Database schemas, SQL optimization, data modeling".to_string(),
        "- `jaskier` — Documentation, API docs, README".to_string(),
        "- `vesemir` — Testing, validation, edge cases".to_string(),
        "- `ciri` — Performance profiling, optimization, bundle analysis".to_string(),
        "- `dijkstra` — Project planning, risk assessment, technical debt".to_string(),
        "- `lambert` — DevOps, Docker, CI/CD, deployment".to_string(),
        "- `eskel` — Rust/Axum backend, error handling, API endpoints".to_string(),
        "- `regis` — Deep code analysis, cross-referencing, research".to_string(),
        "- `zoltan` — React/TypeScript frontend, UI components, accessibility".to_string(),
        "- `philippa` — Auth flows, logging, rate limiting, monitoring".to_string(),
        String::new(),
        "**Rules:** For tasks involving 2+ domains, MUST delegate at least one subtask. Never do everything yourself when a specialist exists. Max delegation depth: 3.".to_string(),
        String::new(),
        "## Task Completion".to_string(),
        "At the END of every completed task, add a section '## Co dalej?' with exactly 5 numbered follow-up tasks the user could ask you to do next. Make them specific, actionable, and relevant to the work just completed. Format each as a one-line imperative sentence.".to_string(),
    ];
    if !working_directory.is_empty() {
        lines.extend([
            String::new(),
            "## Working Directory".to_string(),
            format!("**Current working directory**: `{}`", working_directory),
            "You can use relative paths (e.g. `src/main.rs`) — they resolve against this directory.".to_string(),
            "You do NOT need to specify absolute paths unless referencing files outside this folder.".to_string(),
        ]);
    }
    lines.join("\n")
}

// ═══════════════════════════════════════════════════════════════════════
//  Chat context resolution (model, tokens, WD, system prompt)
// ═══════════════════════════════════════════════════════════════════════

/// Resolves model, max_tokens, session WD (session → global fallback).
pub(crate) async fn resolve_chat_context(state: &AppState, req: &crate::models::ChatRequest) -> ChatContext {
    let model = if let Some(ref m) = req.model {
        m.clone()
    } else {
        let prompt_text: String = req.messages.iter().rev().take(1).map(|m| m.content.as_str()).collect();
        let complexity = crate::model_registry::classify_complexity(&prompt_text);
        match complexity {
            "simple" => crate::model_registry::get_model_id(state, "coordinator").await,
            "complex" => crate::model_registry::get_model_id(state, "commander").await,
            _ => crate::model_registry::get_model_id(state, "commander").await,
        }
    };

    // A/B testing: read ab_model_b + ab_split from settings
    let model = {
        let ab_row: Option<(Option<String>, Option<f64>)> = sqlx::query_as(
            "SELECT ab_model_b, ab_split::float8 FROM ch_settings WHERE id = 1",
        )
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        if let Some((Some(model_b), Some(split))) = ab_row {
            if !model_b.is_empty() && rand::random::<f64>() < split {
                tracing::info!("A/B test: using model_b={} (split={:.0}%)", model_b, split * 100.0);
                model_b
            } else { model }
        } else { model }
    };

    let session_uuid = req
        .session_id
        .as_deref()
        .and_then(|s| uuid::Uuid::parse_str(s).ok());

    // Single query: fetch session WD, global WD, language, and generation params
    let (working_directory, language, db_temperature, db_max_tokens, db_max_iterations) = if let Some(ref sid) = session_uuid {
        let row: Option<(String, String, String, f64, i32, i32)> = sqlx::query_as(
            "SELECT COALESCE(s.working_directory, '') AS session_wd, \
             COALESCE(g.working_directory, '') AS global_wd, \
             COALESCE(g.language, 'en') AS language, \
             COALESCE(g.temperature, 0.7) AS temperature, \
             COALESCE(g.max_tokens, 4096) AS max_tokens, \
             COALESCE(g.max_iterations, 10) AS max_iterations \
             FROM ch_sessions s \
             CROSS JOIN ch_settings g \
             WHERE s.id = $1 AND g.id = 1",
        )
        .bind(sid)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        match row {
            Some((session_wd, global_wd, lang, temp, mtok, miter)) => {
                let wd = if !session_wd.is_empty() { session_wd } else { global_wd };
                (wd, lang, temp, mtok, miter)
            }
            None => (String::new(), "en".to_string(), 0.7, 4096, 10),
        }
    } else {
        let row: Option<(String, String, f64, i32, i32)> = sqlx::query_as(
            "SELECT COALESCE(working_directory, ''), COALESCE(language, 'en'), \
             COALESCE(temperature, 0.7), COALESCE(max_tokens, 4096), COALESCE(max_iterations, 10) \
             FROM ch_settings WHERE id = 1",
        )
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        row.unwrap_or(("".to_string(), "en".to_string(), 0.7, 4096, 10))
    };

    let budget = tier_token_budget(&model);
    let max_tokens = req.max_tokens.unwrap_or(db_max_tokens as u32).min(budget);
    let temperature = req.temperature.unwrap_or(db_temperature);

    // Use cached system prompt if available
    let cache_key = format!("{}:{}", working_directory, language);
    let system_prompt = {
        let cache = state.prompt_cache.read().await;
        cache.get(&cache_key).cloned()
    }.unwrap_or_else(|| {
        let prompt = build_system_prompt(&working_directory, &language);
        let prompt_clone = prompt.clone();
        let state_clone = state.prompt_cache.clone();
        let key_clone = cache_key;
        tokio::spawn(async move {
            state_clone.write().await.insert(key_clone, prompt_clone);
        });
        prompt
    });

    ChatContext {
        model,
        max_tokens,
        temperature,
        max_iterations: db_max_iterations,
        working_directory,
        session_id: session_uuid,
        system_prompt,
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Prompt cache pre-warming
// ═══════════════════════════════════════════════════════════════════════

/// Pre-warm system prompt cache for common language variants.
pub async fn warm_prompt_cache(state: &AppState) {
    let languages = ["en", "pl"];
    let mut count = 0;
    for lang in &languages {
        let prompt = build_system_prompt("", lang);
        state.prompt_cache.write().await.insert(format!(":{}", lang), prompt);
        count += 1;
    }
    tracing::info!("prompt_cache: pre-warmed {} system prompt variants", count);
}
