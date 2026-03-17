//! Agent-to-Agent delegation (call_agent tool).
//!
//! Runs a non-streaming Claude conversation with the target agent's identity
//! and tier model. Supports nested delegation up to configurable depth.

use serde_json::{Value, json};

use jaskier_core::handlers::anthropic_streaming::{
    sanitize_api_error, trim_conversation,
    truncate_for_context_with_limit as truncate_tool_output,
};

use crate::state::AppState;

use super::{
    TOOL_TIMEOUT_SECS, send_to_anthropic, truncate_for_context_with_limit,
};

/// Execute a `call_agent` tool call — runs a non-streaming Claude conversation
/// with the target agent's identity and tier model. Supports nested delegation.
pub(crate) async fn execute_agent_call(
    state: &AppState,
    input: &Value,
    working_directory: &str,
    call_depth: u32,
) -> (String, bool) {
    // Read configurable limits from DB (with fallback defaults)
    let (max_call_depth, agent_max_iterations) = {
        let row: Option<(i32, i32)> = sqlx::query_as(
            "SELECT COALESCE(agent_max_call_depth, 3), COALESCE(agent_max_iterations, 8) \
             FROM ch_settings WHERE id = 1",
        )
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        row.unwrap_or((3, 8))
    };

    let depth = call_depth + 1;
    if depth > max_call_depth as u32 {
        return (
            format!(
                "Agent call depth limit ({}) reached — cannot delegate further",
                max_call_depth
            ),
            true,
        );
    }

    let agent_name = match input.get("agent_name").and_then(|v| v.as_str()) {
        Some(n) => n.to_lowercase(),
        None => return ("Missing required argument: agent_name".to_string(), true),
    };
    let task = match input.get("task").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return ("Missing required argument: task".to_string(), true),
    };

    // Find agent by name (case-insensitive)
    let (agent_display_name, agent_role, agent_tier, agent_desc) = {
        let agents = state.agents.read().await;
        match agents.iter().find(|a| a.name.to_lowercase() == agent_name) {
            Some(a) => (
                a.name.clone(),
                a.role.clone(),
                a.tier.clone(),
                a.description.clone(),
            ),
            None => {
                let available: Vec<String> = agents.iter().map(|a| a.name.to_lowercase()).collect();
                return (
                    format!(
                        "Unknown agent '{}'. Available: {}",
                        agent_name,
                        available.join(", ")
                    ),
                    true,
                );
            }
        }
    };

    // Get the model for the agent's tier
    let model = crate::model_registry::get_model_id(state, &agent_tier.to_lowercase()).await;
    let max_tokens = crate::handlers::prompt::tier_token_budget(&model);

    tracing::info!(
        "call_agent: delegating to {} ({}, {}, depth={}) — model={}",
        agent_display_name,
        agent_role,
        agent_tier,
        depth,
        model
    );

    let task_start = std::time::Instant::now();

    // Log delegation to DB (fire-and-forget)
    let task_id = uuid::Uuid::new_v4();
    {
        let db = state.db.clone();
        let name = agent_name.clone();
        let tier = agent_tier.clone();
        let model_clone = model.clone();
        let task_clone = task.to_string();
        tokio::spawn(async move {
            let _ = sqlx::query(
                "INSERT INTO ch_a2a_tasks (id, agent_name, agent_tier, task_prompt, model_used, call_depth, status) \
                 VALUES ($1, $2, $3, $4, $5, $6, 'working')"
            )
            .bind(task_id)
            .bind(&name)
            .bind(&tier)
            .bind(&task_clone)
            .bind(&model_clone)
            .bind(depth as i32)
            .execute(&db)
            .await;
        });
    }

    // Build agent-specific system prompt
    let lang = {
        let row: Option<(String,)> =
            sqlx::query_as("SELECT COALESCE(language, 'en') FROM ch_settings WHERE id = 1")
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten();
        row.map(|(l,)| l).unwrap_or_else(|| "en".to_string())
    };
    let lang_name = if lang == "pl" { "Polish" } else { "English" };

    let system_prompt = format!(
        "## Identity\n\
         **{name}** | {role} | {tier} | `{model}` | ClaudeHydra v4 (delegated agent, depth {depth})\n\
         {desc}\n\n\
         ## Rules\n\
         - Write ALL text in **{lang}** (except code/paths/identifiers).\n\
         - You run on a LOCAL Windows machine with FULL filesystem access.\n\
         - Be concise and focused on the delegated task.\n\
         - Use tools proactively. Request MULTIPLE tool calls in PARALLEL when independent.\n\
         - {delegation_hint}\n\
         {wd_section}",
        name = agent_display_name,
        role = agent_role,
        tier = agent_tier,
        model = model,
        depth = depth,
        desc = agent_desc,
        lang = lang_name,
        delegation_hint = if depth < max_call_depth as u32 {
            "You can use `call_agent` to further delegate if needed."
        } else {
            "You are at max delegation depth — complete the task yourself."
        },
        wd_section = if !working_directory.is_empty() {
            format!(
                "\n## Working Directory\n**Current working directory**: `{}`",
                working_directory
            )
        } else {
            String::new()
        },
    );

    // Build tool definitions (including MCP)
    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions_with_mcp(state, Some(&model))
        .await
        .into_iter()
        .map(|td| {
            json!({
                "name": td.name,
                "description": td.description,
                "input_schema": td.input_schema,
            })
        })
        .collect();

    let mut conversation: Vec<Value> = vec![json!({ "role": "user", "content": task })];

    let mut collected_text = String::new();

    for iter in 0..agent_max_iterations as usize {
        let body = json!({
            "model": &model,
            "max_tokens": max_tokens,
            "system": &system_prompt,
            "messages": &conversation,
            "tools": &tool_defs,
        });

        let resp = match send_to_anthropic(state, &body, 120).await {
            Ok(r) => r,
            Err((_, axum::Json(err_val))) => {
                let raw_msg = err_val
                    .get("error")
                    .and_then(|e| e.as_str())
                    .unwrap_or("Unknown error");
                tracing::error!(
                    "Agent delegation '{}' send_to_anthropic failed: {}",
                    agent_display_name,
                    raw_msg
                );
                return (
                    format!("[{} error: AI provider request failed]", agent_display_name),
                    true,
                );
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await.unwrap_or_default();
            tracing::error!(
                "Agent delegation '{}' API error (status={}): {}",
                agent_display_name,
                status,
                &truncate_for_context_with_limit(&err, 500)
            );
            let safe_err = sanitize_api_error(&err);
            return (format!("[{} {}]", agent_display_name, safe_err), true);
        }

        let resp_json: Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                tracing::error!(
                    "Agent delegation '{}' response parse error: {}",
                    agent_display_name,
                    e
                );
                return (
                    format!(
                        "[{} error: failed to parse AI response]",
                        agent_display_name
                    ),
                    true,
                );
            }
        };

        let stop_reason = resp_json
            .get("stop_reason")
            .and_then(|s| s.as_str())
            .unwrap_or("end_turn");
        let content = resp_json.get("content").and_then(|c| c.as_array());

        let mut text_parts = Vec::new();
        let mut tool_uses: Vec<Value> = Vec::new();

        if let Some(blocks) = content {
            for block in blocks {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(t) = block.get("text").and_then(|t| t.as_str()) {
                            text_parts.push(t.to_string());
                            collected_text.push_str(t);
                        }
                    }
                    "tool_use" => {
                        tool_uses.push(block.clone());
                    }
                    _ => {}
                }
            }
        }

        if stop_reason == "tool_use" && !tool_uses.is_empty() {
            // Build assistant message
            let mut assistant_blocks: Vec<Value> = Vec::new();
            for t in &text_parts {
                assistant_blocks.push(json!({ "type": "text", "text": t }));
            }
            assistant_blocks.extend(tool_uses.clone());
            conversation.push(json!({ "role": "assistant", "content": assistant_blocks }));

            // Execute tools
            let mut tool_results: Vec<Value> = Vec::new();
            for tu in &tool_uses {
                let tool_name = tu.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let tool_id = tu.get("id").and_then(|i| i.as_str()).unwrap_or("");
                let empty = json!({});
                let tool_input = tu.get("input").unwrap_or(&empty);

                let (result, is_error) = if tool_name == "call_agent" {
                    // Recursive delegation
                    Box::pin(execute_agent_call(
                        state,
                        tool_input,
                        working_directory,
                        depth,
                    ))
                    .await
                } else {
                    let executor = state
                        .tool_executor
                        .with_working_directory(working_directory);
                    let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                    match tokio::time::timeout(
                        timeout,
                        executor.execute_with_state(tool_name, tool_input, state),
                    )
                    .await
                    {
                        Ok(res) => res,
                        Err(_) => (format!("Tool '{}' timed out", tool_name), true),
                    }
                };

                let truncated = truncate_tool_output(&result, 15000);
                tool_results.push(json!({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": &truncated,
                    "is_error": is_error,
                }));
            }

            conversation.push(json!({ "role": "user", "content": tool_results }));

            // Sliding window: trim conversation
            trim_conversation(&mut conversation);

            if iter >= 6 {
                conversation.push(json!({
                    "role": "user",
                    "content": "[SYSTEM: Approaching iteration limit. Wrap up now.]"
                }));
            }

            continue;
        }

        // end_turn — done
        break;
    }

    // Update task status in DB (clamped to i32::MAX to prevent overflow)
    let duration_ms = task_start.elapsed().as_millis().min(i32::MAX as u128) as i32;
    let is_error = collected_text.is_empty();
    let preview: String = collected_text.chars().take(500).collect();
    {
        let db = state.db.clone();
        tokio::spawn(async move {
            let _ = sqlx::query(
                "UPDATE ch_a2a_tasks SET status = $1, result_preview = $2, duration_ms = $3, \
                 is_error = $4, completed_at = NOW() WHERE id = $5",
            )
            .bind(if is_error { "failed" } else { "completed" })
            .bind(&preview)
            .bind(duration_ms)
            .bind(is_error)
            .bind(task_id)
            .execute(&db)
            .await;
        });
    }

    if collected_text.is_empty() {
        return (
            format!(
                "[{} completed the task but produced no text output]",
                agent_display_name
            ),
            false,
        );
    }

    (
        format!(
            "**[Agent {} ({})]:**\n\n{}",
            agent_display_name, agent_role, collected_text
        ),
        false,
    )
}
