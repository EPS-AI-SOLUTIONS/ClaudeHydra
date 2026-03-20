// proxy.rs — Chat proxy handlers (non-streaming + SSE streaming).

use std::convert::Infallible;
use std::time::Instant;

use axum::extract::{Json, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use serde_json::{json, Value};

use crate::ai_gateway::{
    AuthType, HasAiGateway,
    vault_bridge::HasVaultBridge,
};

use super::helpers::{
    build_chat_payload, chunk_text, extract_content_text, resolve_upstream_url,
};
use super::router::{parse_provider, vault_error_response};
use super::types::GatewayChatRequest;

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/ai/{provider}/chat — proxied non-streaming chat
// ═══════════════════════════════════════════════════════════════════════════

/// Proxied non-streaming chat endpoint.
///
/// Routes the request to the correct upstream provider via Jaskier Vault
/// Bouncer pattern. The backend NEVER sees raw credentials.
///
/// On upstream failure, attempts fallback to an alternative provider via
/// the model router (if configured).
pub(crate) async fn proxy_chat<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
    Json(body): Json<GatewayChatRequest>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let current_provider = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let router = crate::ai_gateway::model_router::ModelRouter::new();
    let fallback_chain = router.fallback_chain(current_provider);

    let original_model = body.model.clone();
    let gateway = state.ai_gateway();
    let vault = state.vault_client();

    let mut last_error_response = None;
    let mut last_latency;

    for (attempt, provider_enum) in fallback_chain.iter().enumerate() {
        let config = match gateway.providers.get(provider_enum) {
            Some(cfg) => cfg,
            None => continue,
        };

        // If fallback, we need to map to the new provider's model for the same tier
        let model = if attempt == 0 {
            original_model.clone().unwrap_or_else(|| config.model_tiers.coordinator.clone())
        } else {
            let tier = original_model.as_ref()
                .map(|m| crate::ai_gateway::model_router::ModelRouter::detect_tier(m))
                .unwrap_or(crate::ai_gateway::model_router::ModelTier::Coordinator);

            match tier {
                crate::ai_gateway::model_router::ModelTier::Commander => config.model_tiers.commander.clone(),
                crate::ai_gateway::model_router::ModelTier::Coordinator => config.model_tiers.coordinator.clone(),
                crate::ai_gateway::model_router::ModelTier::Executor => config.model_tiers.executor.clone(),
            }
        };

        tracing::info!(
            provider = %provider_enum,
            model = %model,
            attempt = attempt + 1,
            "proxy_chat: routing request",
        );

        let upstream_body = build_chat_payload(provider_enum, &model, &body);
        let upstream_url = resolve_upstream_url(&config.upstream_url, &model);
        let started = Instant::now();

        if config.auth_type == AuthType::None {
            // Direct call for Ollama
            let client = reqwest::Client::new();
            match client.post(&upstream_url).json(&upstream_body).timeout(std::time::Duration::from_secs(120)).send().await {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    last_latency = started.elapsed().as_millis() as u64;
                    if let Ok(json_body) = resp.json::<Value>().await {
                        if (200..300).contains(&(status as usize)) {
                            return Json(json!({
                                "provider": provider_enum.to_string(),
                                "model": model,
                                "latency_ms": last_latency,
                                "response": json_body,
                                "fallback_attempts": attempt,
                            })).into_response();
                        } else {
                            last_error_response = Some((
                                StatusCode::BAD_GATEWAY,
                                Json(json!({
                                    "error": "upstream_error",
                                    "provider": provider_enum.to_string(),
                                    "upstream_status": status,
                                    "upstream_body": json_body,
                                    "latency_ms": last_latency,
                                })),
                            ).into_response());
                        }
                    }
                }
                Err(e) => {
                    last_latency = started.elapsed().as_millis() as u64;
                    last_error_response = Some((
                        StatusCode::BAD_GATEWAY,
                        Json(json!({
                            "error": "upstream_connection_failed",
                            "provider": provider_enum.to_string(),
                            "message": e.to_string(),
                            "latency_ms": last_latency,
                        })),
                    ).into_response());
                }
            }
            continue;
        }

        // Vault Bouncer
        match vault
            .delegate(
                &upstream_url,
                "POST",
                &config.vault_namespace,
                &config.vault_service,
                Some(upstream_body),
            )
            .await
        {
            Ok(resp) => {
                last_latency = started.elapsed().as_millis() as u64;
                if (200..300).contains(&(resp.status as usize)) {
                    tracing::info!(
                        provider = %provider_enum,
                        model = %model,
                        latency_ms = last_latency,
                        "proxy_chat: upstream success",
                    );
                    return Json(json!({
                        "provider": provider_enum.to_string(),
                        "model": model,
                        "latency_ms": last_latency,
                        "response": resp.body,
                        "fallback_attempts": attempt,
                    })).into_response();
                } else {
                    tracing::warn!(
                        provider = %provider_enum,
                        model = %model,
                        status = resp.status,
                        latency_ms = last_latency,
                        "proxy_chat: upstream error, trying fallback",
                    );

                    // If it's auth error from vault or limit error, fallback makes sense
                    last_error_response = Some((
                        StatusCode::BAD_GATEWAY,
                        Json(json!({
                            "error": "upstream_error",
                            "provider": provider_enum.to_string(),
                            "upstream_status": resp.status,
                            "upstream_body": resp.body,
                            "latency_ms": last_latency,
                        })),
                    ).into_response());
                }
            }
            Err(err) => {
                tracing::error!(
                    provider = %provider_enum,
                    error = %err,
                    "proxy_chat: vault delegate failed",
                );

                // For Vault anomalies we shouldn't fallback, we should halt
                if err.is_anomaly() {
                    return vault_error_response(provider_enum, err).into_response();
                }

                last_error_response = Some(vault_error_response(provider_enum, err).into_response());
            }
        }
    }

    // If we exhaust the fallback chain, return the last error
    last_error_response.unwrap_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "all_providers_failed",
                "message": "All AI providers in the fallback chain failed.",
            })),
        ).into_response()
    })
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/ai/{provider}/stream — proxied streaming (SSE)
// ═══════════════════════════════════════════════════════════════════════════

/// Proxied streaming chat endpoint via Server-Sent Events (SSE).
///
/// The upstream provider's streaming response is translated into a unified
/// SSE event format that the frontend can consume regardless of which
/// provider is generating the response.
pub(crate) async fn proxy_stream<S>(
    State(state): State<S>,
    Path(provider): Path<String>,
    Json(body): Json<GatewayChatRequest>,
) -> impl IntoResponse
where
    S: HasAiGateway + HasVaultBridge + Clone + Send + Sync + 'static,
{
    let current_provider = match parse_provider(&provider) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let router = crate::ai_gateway::model_router::ModelRouter::new();
    let fallback_chain = router.fallback_chain(current_provider);

    let original_model = body.model.clone();
    let cloned_state = state.clone();
    let vault_client = state.vault_client().clone();

    let stream = async_stream::stream! {
        let mut last_error_response = None;

        for (attempt, provider_enum) in fallback_chain.into_iter().enumerate() {
            let config = match cloned_state.ai_gateway().providers.get(&provider_enum) {
                Some(cfg) => cfg.clone(),
                None => continue,
            };

            let model = if attempt == 0 {
                original_model.clone().unwrap_or_else(|| config.model_tiers.coordinator.clone())
            } else {
                let tier = original_model.as_ref()
                    .map(|m| crate::ai_gateway::model_router::ModelRouter::detect_tier(m))
                    .unwrap_or(crate::ai_gateway::model_router::ModelTier::Coordinator);

                match tier {
                    crate::ai_gateway::model_router::ModelTier::Commander => config.model_tiers.commander.clone(),
                    crate::ai_gateway::model_router::ModelTier::Coordinator => config.model_tiers.coordinator.clone(),
                    crate::ai_gateway::model_router::ModelTier::Executor => config.model_tiers.executor.clone(),
                }
            };

            tracing::info!(
                provider = %provider_enum,
                model = %model,
                attempt = attempt + 1,
                "proxy_stream: initiating SSE stream / upstream request",
            );

            let mut upstream_body = build_chat_payload(&provider_enum, &model, &body);
            if let Some(obj) = upstream_body.as_object_mut() {
                obj.insert("stream".to_string(), json!(true));
            }

            let upstream_url = resolve_upstream_url(&config.upstream_url, &model);
            let started = Instant::now();

            if attempt == 0 {
                yield Ok::<_, Infallible>(Event::default()
                    .event("stream_start")
                    .data(json!({
                        "provider": provider_enum.to_string(),
                        "model": model,
                    }).to_string()));
            } else {
                yield Ok::<_, Infallible>(Event::default()
                    .event("fallback")
                    .data(json!({
                        "provider": provider_enum.to_string(),
                        "model": model,
                        "attempt": attempt,
                    }).to_string()));
            }

            if config.auth_type == AuthType::None {
                // Direct call for Ollama
                let client = reqwest::Client::new();
                match client.post(&upstream_url).json(&upstream_body).timeout(std::time::Duration::from_secs(120)).send().await {
                    Ok(resp) => {
                        let status = resp.status().as_u16();
                        let latency_ms = started.elapsed().as_millis() as u64;
                        if let Ok(json_body) = resp.json::<Value>().await {
                            if (200..300).contains(&(status as usize)) {
                                let content = extract_content_text(&provider_enum, &json_body);
                                for chunk in chunk_text(&content, 20) {
                                    yield Ok(Event::default()
                                        .event("token")
                                        .data(json!({ "text": chunk }).to_string()));
                                }
                                yield Ok(Event::default()
                                    .event("stream_end")
                                    .data(json!({
                                        "provider": provider_enum.to_string(),
                                        "model": model,
                                        "latency_ms": latency_ms,
                                        "finish_reason": "end_turn",
                                    }).to_string()));
                                return;
                            } else {
                                last_error_response = Some(format!("Upstream returned HTTP {} (direct)", status));
                            }
                        }
                    }
                    Err(e) => {
                        last_error_response = Some(e.to_string());
                    }
                }
                continue;
            }

            let delegate_result = vault_client.delegate(
                &upstream_url,
                "POST",
                &config.vault_namespace,
                &config.vault_service,
                Some(upstream_body),
            ).await;

            match delegate_result {
                Ok(resp) => {
                    let latency_ms = started.elapsed().as_millis() as u64;
                    if (200..300).contains(&(resp.status as usize)) {
                        let content = extract_content_text(&provider_enum, &resp.body);

                        for chunk in chunk_text(&content, 20) {
                            yield Ok(Event::default()
                                .event("token")
                                .data(json!({ "text": chunk }).to_string()));
                        }

                        yield Ok(Event::default()
                            .event("stream_end")
                            .data(json!({
                                "provider": provider_enum.to_string(),
                                "model": model,
                                "latency_ms": latency_ms,
                                "finish_reason": "end_turn",
                            }).to_string()));
                        return; // Successfully completed
                    } else {
                        last_error_response = Some(format!("Upstream returned HTTP {}", resp.status));
                    }
                }
                Err(err) => {
                    tracing::error!(
                        provider = %provider_enum,
                        error = %err,
                        "proxy_stream: vault delegate failed",
                    );

                    if err.is_anomaly() {
                        let (error_type, message) = ("anomaly_detected", format!("ANOMALY: {}", err));
                        yield Ok(Event::default()
                            .event("error")
                            .data(json!({
                                "error": error_type,
                                "provider": provider_enum.to_string(),
                                "message": message,
                            }).to_string()));
                        return;
                    }

                    last_error_response = Some(err.to_string());
                }
            }
        }

        // Exhausted fallback chain
        yield Ok(Event::default()
            .event("error")
            .data(json!({
                "error": "all_providers_failed",
                "message": format!("All AI providers in the fallback chain failed. Last error: {}", last_error_response.unwrap_or_default()),
            }).to_string()));
    };

    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}
