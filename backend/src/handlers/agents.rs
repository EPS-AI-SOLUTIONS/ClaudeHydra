//! Agent listing, refresh, and delegation monitoring endpoints.

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/agents
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(
    get,
    path = "/api/agents",
    tag = "agents",
    responses((status = 200, description = "List of Witcher agents"))
)]
pub async fn list_agents(State(state): State<AppState>) -> Json<Value> {
    let agents = state.agents.read().await;
    Json(serde_json::to_value(&*agents).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

// ═══════════════════════════════════════════════════════════════════════
//  POST /api/agents/refresh
// ═══════════════════════════════════════════════════════════════════════

pub async fn refresh_agents(State(state): State<AppState>) -> Json<Value> {
    state.refresh_agents().await;
    let agents = state.agents.read().await;
    Json(json!({
        "status": "refreshed",
        "count": agents.len(),
    }))
}

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/agents/delegations — A2A delegation monitoring
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(
    get,
    path = "/api/agents/delegations",
    tag = "agents",
    responses((status = 200, description = "Recent agent-to-agent delegations"))
)]
pub async fn list_delegations(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let rows: Vec<(
        uuid::Uuid,
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        i32,
        Option<i32>,
        bool,
        chrono::DateTime<chrono::Utc>,
        Option<chrono::DateTime<chrono::Utc>>,
    )> = sqlx::query_as(
        "SELECT id, agent_name, agent_tier, task_prompt, model_used, status, \
         result_preview, call_depth, duration_ms, is_error, created_at, completed_at \
         FROM ch_a2a_tasks ORDER BY created_at DESC LIMIT 50"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": format!("DB error: {}", e) })),
    ))?;

    let tasks: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.0.to_string(),
        "agent_name": r.1,
        "agent_tier": r.2,
        "task_prompt": r.3,
        "model_used": r.4,
        "status": r.5,
        "result_preview": r.6,
        "call_depth": r.7,
        "duration_ms": r.8,
        "is_error": r.9,
        "created_at": r.10.to_rfc3339(),
        "completed_at": r.11.map(|t| t.to_rfc3339()),
    })).collect();

    // Stats summary
    let stats_row: Option<(i64, i64, i64, Option<f64>)> = sqlx::query_as(
        "SELECT COUNT(*), \
         COUNT(*) FILTER (WHERE status = 'completed'), \
         COUNT(*) FILTER (WHERE is_error = TRUE), \
         AVG(duration_ms)::float8 \
         FROM ch_a2a_tasks"
    )
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let (total, completed, errors, avg_ms) = stats_row.unwrap_or((0, 0, 0, None));

    Ok(Json(json!({
        "tasks": tasks,
        "stats": {
            "total": total,
            "completed": completed,
            "errors": errors,
            "avg_duration_ms": avg_ms.map(|v| v as i64),
        }
    })))
}
