// Jaskier Shared Pattern -- ocr
// ClaudeHydra v4 — OCR via Claude Vision API (primary) / Gemini Vision (fallback)
//
// Types re-exported from jaskier-tools::ocr (shared crate).
// Handlers are local because ClaudeHydra has a dual-provider strategy
// (Claude Vision primary, Gemini fallback) and uses ch_ocr_history table.
//
// Endpoints:
//   POST /api/ocr              — synchronous OCR (single image or PDF)
//   POST /api/ocr/stream       — SSE streaming OCR with progress events
//   POST /api/ocr/batch/stream — SSE batch OCR (multiple files)
//   GET  /api/ocr/history      — paginated OCR history
//   GET  /api/ocr/history/{id} — single history entry (full text)
//   DELETE /api/ocr/history/{id} — delete history entry

use std::convert::Infallible;
use std::time::Instant;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::Stream;
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use crate::state::AppState;

// ── Re-export shared types from jaskier-tools ────────────────────────────────

pub use jaskier_tools::ocr::{
    OcrBatchItem, OcrBatchItemResult, OcrBatchRequest, OcrHistoryEntry, OcrHistoryFull,
    OcrHistoryParams, OcrPage, OcrRequest, OcrResponse, PaginatedOcrHistory,
};

// ── Constants ────────────────────────────────────────────────────────────────

const OCR_PROMPT: &str = "\
Extract ALL text from this document/image exactly as written.\n\
\n\
FORMATTING RULES:\n\
- Preserve line breaks, paragraph structure, and reading order (left-to-right, top-to-bottom)\n\
- Use # markdown headers for section titles and document headings\n\
- Format key:value pairs as **Key:** Value\n\
- CRITICAL: Format ALL tables using markdown pipe table syntax, like this:\n\
  | Column A | Column B | Column C |\n\
  |----------|----------|----------|\n\
  | data 1   | data 2   | data 3   |\n\
- Preserve special characters, numbers, currencies, and diacritics exactly\n\
- If the text is handwritten, transcribe it as accurately as possible\n\
- For multi-page documents, insert ---PAGE 2---, ---PAGE 3--- etc. markers between pages (use the actual page number)\n\
\n\
Return ONLY the extracted text with markdown formatting, no descriptions or commentary.";

const OCR_HTML_PROMPT: &str = "\
Extract ALL text from this document/image and return it as semantic HTML.\n\
\n\
HTML FORMATTING RULES:\n\
- Use <table>, <thead>, <tbody>, <tr>, <th>, <td> for ALL tables\n\
- Use <h1>-<h6> for headers and section titles\n\
- Use <p> for paragraphs\n\
- Use <ul>/<ol>/<li> for lists\n\
- Use <strong> and <em> for emphasis\n\
- Use <br> for line breaks within blocks\n\
- Format key:value pairs as <strong>Key:</strong> Value inside <p> tags\n\
- Preserve reading order (left-to-right, top-to-bottom)\n\
- Preserve ALL special characters, numbers, currencies, and diacritics exactly\n\
- If the text is handwritten, transcribe it as accurately as possible\n\
- For multi-page documents, insert <hr data-page=\"2\">, <hr data-page=\"3\"> etc. between pages (use the actual page number)\n\
\n\
Return ONLY the HTML content. Do NOT include <html>, <head>, or <body> wrapper tags. No descriptions or commentary.";

const STRUCTURED_EXTRACTION_PROMPT: &str = "\
Extract structured data from this OCR text into a JSON object.\n\
\n\
Return ONLY a valid JSON object with these fields (omit fields not found):\n\
{\n\
  \"document_type\": \"invoice|receipt|document|unknown\",\n\
  \"seller\": { \"name\": \"\", \"address\": \"\", \"nip\": \"\", \"phone\": \"\", \"email\": \"\" },\n\
  \"buyer\": { \"name\": \"\", \"address\": \"\", \"nip\": \"\" },\n\
  \"invoice_number\": \"\",\n\
  \"issue_date\": \"\",\n\
  \"due_date\": \"\",\n\
  \"items\": [{ \"name\": \"\", \"quantity\": 0, \"unit\": \"\", \"net_price\": 0, \"net_value\": 0, \"vat_rate\": \"\", \"vat_amount\": 0, \"gross_value\": 0 }],\n\
  \"totals\": { \"net\": 0, \"vat\": 0, \"gross\": 0, \"currency\": \"PLN\" },\n\
  \"payment\": { \"method\": \"\", \"bank_account\": \"\", \"due_date\": \"\" }\n\
}\n\
\n\
Return ONLY the JSON, no explanation or markdown fences.";

const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL: &str = "claude-sonnet-4-6";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_OCR_MODEL: &str = "gemini-3.1-flash-preview";
const MAX_INPUT_SIZE: usize = 30_000_000; // ~22 MB decoded
const MAX_BATCH_ITEMS: usize = 10;

const ALLOWED_MIME_TYPES: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/heic",
    "application/pdf",
];

// ── Auto-detect preset ──────────────────────────────────────────────────────

/// Auto-detect OCR preset from filename keywords.
fn detect_preset(filename: Option<&str>, _mime_type: &str) -> Option<&'static str> {
    let name = filename?;
    let lower = name.to_lowercase();
    if lower.contains("faktura") || lower.contains("invoice") || lower.contains("rechnung") {
        return Some("invoice");
    }
    if lower.contains("paragon") || lower.contains("receipt") || lower.contains("bon") {
        return Some("receipt");
    }
    if lower.contains("dokument")
        || lower.contains("document")
        || lower.contains("umowa")
        || lower.contains("wniosek")
        || lower.contains("zaswiadczenie")
    {
        return Some("document");
    }
    None
}

// ── Prompt builder ──────────────────────────────────────────────────────────

/// Build the effective OCR prompt from base prompt + optional language/preset.
fn build_ocr_prompt(base: &str, language: Option<&str>, preset: Option<&str>) -> String {
    let mut prompt = base.to_string();

    if let Some(lang) = language {
        prompt.push_str(&format!(
            "\n\nThe document is in {lang}. Pay special attention to language-specific \
             characters, diacritics, and terminology."
        ));
    }

    if let Some(preset) = preset {
        let extra = match preset {
            "invoice" => {
                "\n\nThis is an INVOICE/RECEIPT. You MUST extract:\n\
                - Seller and buyer details (name, address, NIP/VAT ID)\n\
                - Invoice number and dates\n\
                - Line items table with columns: Lp./Name/Qty/Unit/Net price/Net value/VAT rate/VAT amount/Gross value\n\
                - Summary totals (net, VAT, gross)\n\
                - Payment details (bank account, due date)"
            }
            "receipt" => {
                "\n\nThis is a RECEIPT. Extract all items with prices in a table. \
                Include store name, date, total, and payment method."
            }
            "table" => {
                "\n\nThis document contains IMPORTANT TABLES. Extract EVERY table with \
                precise alignment of columns and rows using markdown pipe syntax. Do not skip any cells."
            }
            "handwriting" => {
                "\n\nThis contains HANDWRITTEN text. Take extra care to:\n\
                - Distinguish similar characters (l/1, O/0, n/u)\n\
                - Preserve crossed-out text as ~~strikethrough~~\n\
                - Mark illegible words as [illegible]"
            }
            "document" => {
                "\n\nThis is an official DOCUMENT. Preserve:\n\
                - All form fields and their values as key:value pairs\n\
                - Official stamps and signatures as [stamp] / [signature]\n\
                - Reference numbers, dates, and legal identifiers exactly"
            }
            _ => "",
        };
        prompt.push_str(extra);
    }

    prompt
}

// ── Synchronous OCR endpoint ─────────────────────────────────────────────────

pub async fn ocr(
    State(state): State<AppState>,
    Json(body): Json<OcrRequest>,
) -> Result<Json<OcrResponse>, impl IntoResponse> {
    if body.data_base64.len() > MAX_INPUT_SIZE {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "Input exceeds maximum size (22 MB)"})),
        ));
    }
    if !ALLOWED_MIME_TYPES.contains(&body.mime_type.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                json!({"error": format!("Unsupported MIME type: {}. Allowed: image/png, image/jpeg, image/webp, image/gif, image/heic, application/pdf", body.mime_type)}),
            ),
        ));
    }

    let started = Instant::now();

    // Auto-detect preset if not explicitly set
    let detected = detect_preset(body.filename.as_deref(), &body.mime_type);
    let effective_preset = body.preset.as_deref().or(detected);

    let format = body.output_format.as_deref().unwrap_or("text");
    let default_prompt = if format == "html" {
        OCR_HTML_PROMPT
    } else {
        OCR_PROMPT
    };
    let base_prompt = body.prompt.as_deref().unwrap_or(default_prompt);
    let effective_prompt =
        build_ocr_prompt(base_prompt, body.language.as_deref(), effective_preset);

    let (text, provider, confidence) = ocr_extract(
        &state,
        &body.data_base64,
        &body.mime_type,
        &effective_prompt,
    )
    .await
    .map_err(|e| {
        tracing::error!("OCR failed: {e}");
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "OCR processing failed"})))
    })?;

    let pages = if format == "html" {
        split_html_into_pages(&text)
    } else {
        split_into_pages(&text)
    };
    let total_pages = pages.len().max(1);

    // Structured data extraction (optional second AI call)
    let structured_data = if body.extract_structured == Some(true)
        && matches!(effective_preset, Some("invoice" | "receipt"))
    {
        extract_structured_data(&state, &text).await.ok()
    } else {
        None
    };

    let detected_preset = detected.map(|s| s.to_string());

    let response = OcrResponse {
        text,
        pages,
        total_pages,
        processing_time_ms: started.elapsed().as_millis() as u64,
        provider,
        output_format: format.to_string(),
        confidence,
        detected_preset: detected_preset.clone(),
        structured_data: structured_data.clone(),
    };

    // Save to history (fire-and-forget)
    let db = state.db.clone();
    let resp_clone = response.clone();
    let filename = body.filename.clone();
    let mime = body.mime_type.clone();
    let preset_str = body.preset.clone().or(detected_preset);
    tokio::spawn(async move {
        if let Err(e) = save_ocr_result(
            &db,
            filename.as_deref(),
            &mime,
            preset_str.as_deref(),
            &resp_clone,
        )
        .await
        {
            tracing::warn!("Failed to save OCR history: {e}");
        }
    });

    Ok(Json(response))
}

// ── SSE streaming OCR endpoint ───────────────────────────────────────────────

pub async fn ocr_stream(
    State(state): State<AppState>,
    Json(body): Json<OcrRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, impl IntoResponse> {
    if body.data_base64.len() > MAX_INPUT_SIZE {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "Input exceeds maximum size (22 MB)"})),
        ));
    }
    if !ALLOWED_MIME_TYPES.contains(&body.mime_type.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                json!({"error": format!("Unsupported MIME type: {}. Allowed: image/png, image/jpeg, image/webp, image/gif, image/heic, application/pdf", body.mime_type)}),
            ),
        ));
    }

    let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(32);

    tokio::spawn(async move {
        let started = Instant::now();

        send_progress(&tx, "start", None).await;

        // Auto-detect preset
        let detected = detect_preset(body.filename.as_deref(), &body.mime_type);
        let effective_preset = body.preset.as_deref().or(detected);

        let format = body.output_format.as_deref().unwrap_or("text");
        let default_prompt = if format == "html" {
            OCR_HTML_PROMPT
        } else {
            OCR_PROMPT
        };
        let base_prompt = body.prompt.as_deref().unwrap_or(default_prompt);
        let effective_prompt =
            build_ocr_prompt(base_prompt, body.language.as_deref(), effective_preset);

        let result = ocr_extract(
            &state,
            &body.data_base64,
            &body.mime_type,
            &effective_prompt,
        )
        .await;

        match result {
            Ok((text, provider, confidence)) => {
                let pages = if format == "html" {
                    split_html_into_pages(&text)
                } else {
                    split_into_pages(&text)
                };
                let total = pages.len().max(1);

                for (i, page) in pages.iter().enumerate() {
                    let preview = if page.text.len() > 200 {
                        let end = page
                            .text
                            .char_indices()
                            .take_while(|(i, _)| *i < 200)
                            .last()
                            .map(|(i, c)| i + c.len_utf8())
                            .unwrap_or(200);
                        format!("{}...", &page.text[..end])
                    } else {
                        page.text.clone()
                    };
                    send_progress(
                        &tx,
                        "progress",
                        Some(&json!({
                            "pages_done": i + 1,
                            "pages_total": total,
                            "progress": (i + 1) as f64 / total as f64,
                            "current_page_preview": preview,
                            "elapsed_seconds": started.elapsed().as_secs(),
                        })),
                    )
                    .await;
                }

                // Structured extraction if requested
                let structured_data = if body.extract_structured == Some(true)
                    && matches!(effective_preset, Some("invoice" | "receipt"))
                {
                    extract_structured_data(&state, &text).await.ok()
                } else {
                    None
                };

                send_progress(&tx, "done", None).await;

                let detected_preset = detected.map(|s| s.to_string());
                let response = OcrResponse {
                    text,
                    pages,
                    total_pages: total,
                    processing_time_ms: started.elapsed().as_millis() as u64,
                    provider,
                    output_format: format.to_string(),
                    confidence,
                    detected_preset: detected_preset.clone(),
                    structured_data: structured_data.clone(),
                };

                // Save to history
                let db = state.db.clone();
                let resp_clone = response.clone();
                let filename = body.filename.clone();
                let mime = body.mime_type.clone();
                let preset_str = body.preset.clone().or(detected_preset);
                tokio::spawn(async move {
                    if let Err(e) = save_ocr_result(
                        &db,
                        filename.as_deref(),
                        &mime,
                        preset_str.as_deref(),
                        &resp_clone,
                    )
                    .await
                    {
                        tracing::warn!("Failed to save OCR history: {e}");
                    }
                });

                let complete = Event::default()
                    .event("complete")
                    .data(serde_json::to_string(&response).unwrap_or_default());
                let _ = tx.send(Ok(complete)).await;
            }
            Err(e) => {
                tracing::error!("OCR stream failed: {e}");
                let err_event = Event::default()
                    .event("error")
                    .data(json!({"error": "OCR processing failed"}).to_string());
                let _ = tx.send(Ok(err_event)).await;
            }
        }
    });

    let stream = ReceiverStream::new(rx);
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

// ── Batch SSE streaming endpoint ─────────────────────────────────────────────

pub async fn ocr_batch_stream(
    State(state): State<AppState>,
    Json(body): Json<OcrBatchRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, impl IntoResponse> {
    if body.items.len() > MAX_BATCH_ITEMS {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("Maximum {MAX_BATCH_ITEMS} files per batch")})),
        ));
    }
    for item in &body.items {
        if item.data_base64.len() > MAX_INPUT_SIZE {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                Json(json!({"error": "One or more files exceed maximum size (22 MB)"})),
            ));
        }
        if !ALLOWED_MIME_TYPES.contains(&item.mime_type.as_str()) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(
                    json!({"error": format!("Unsupported MIME type: {}. Allowed: image/png, image/jpeg, image/webp, image/gif, image/heic, application/pdf", item.mime_type)}),
                ),
            ));
        }
    }

    let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(64);
    let files_total = body.items.len();

    tokio::spawn(async move {
        let started = Instant::now();
        let mut results: Vec<OcrBatchItemResult> = Vec::new();

        for (idx, item) in body.items.iter().enumerate() {
            let filename = item.filename.clone();

            // batch/file_start
            let start_event = Event::default().event("batch_file_start").data(
                json!({"file_index": idx, "filename": &filename, "files_total": files_total})
                    .to_string(),
            );
            let _ = tx.send(Ok(start_event)).await;

            let detected = detect_preset(item.filename.as_deref(), &item.mime_type);
            let effective_preset = item.preset.as_deref().or(detected);
            let item_format = item.output_format.as_deref().unwrap_or("text");
            let default_prompt = if item_format == "html" {
                OCR_HTML_PROMPT
            } else {
                OCR_PROMPT
            };
            let base_prompt = body.prompt.as_deref().unwrap_or(default_prompt);
            let effective_prompt =
                build_ocr_prompt(base_prompt, item.language.as_deref(), effective_preset);

            match ocr_extract(
                &state,
                &item.data_base64,
                &item.mime_type,
                &effective_prompt,
            )
            .await
            {
                Ok((text, provider, confidence)) => {
                    let pages = if item_format == "html" {
                        split_html_into_pages(&text)
                    } else {
                        split_into_pages(&text)
                    };
                    let total_pages = pages.len().max(1);

                    let structured_data = if item.extract_structured == Some(true)
                        && matches!(effective_preset, Some("invoice" | "receipt"))
                    {
                        extract_structured_data(&state, &text).await.ok()
                    } else {
                        None
                    };

                    let response = OcrResponse {
                        text,
                        pages,
                        total_pages,
                        processing_time_ms: started.elapsed().as_millis() as u64,
                        provider,
                        output_format: item_format.to_string(),
                        confidence,
                        detected_preset: detected.map(|s| s.to_string()),
                        structured_data,
                    };

                    // Save to history
                    let db = state.db.clone();
                    let resp_clone = response.clone();
                    let fn_clone = filename.clone();
                    let mime = item.mime_type.clone();
                    let preset_str = item
                        .preset
                        .clone()
                        .or_else(|| detected.map(|s| s.to_string()));
                    tokio::spawn(async move {
                        let _ = save_ocr_result(
                            &db,
                            fn_clone.as_deref(),
                            &mime,
                            preset_str.as_deref(),
                            &resp_clone,
                        )
                        .await;
                    });

                    let result = OcrBatchItemResult {
                        filename: filename.clone(),
                        response: Some(response),
                        error: None,
                    };
                    let done_event = Event::default().event("batch_file_done").data(
                        serde_json::to_string(&json!({"file_index": idx, "result": &result}))
                            .unwrap_or_default(),
                    );
                    let _ = tx.send(Ok(done_event)).await;
                    results.push(result);
                }
                Err(e) => {
                    tracing::error!("Batch OCR file {idx} failed: {e}");
                    let safe_msg = "OCR processing failed".to_string();
                    let result = OcrBatchItemResult {
                        filename: filename.clone(),
                        response: None,
                        error: Some(safe_msg.clone()),
                    };
                    let err_event = Event::default().event("batch_file_error").data(
                        json!({"file_index": idx, "filename": &filename, "error": safe_msg}).to_string(),
                    );
                    let _ = tx.send(Ok(err_event)).await;
                    results.push(result);
                }
            }
        }

        // batch/complete
        let complete = Event::default().event("batch_complete").data(
            json!({
                "total_files": files_total,
                "successful": results.iter().filter(|r| r.response.is_some()).count(),
                "failed": results.iter().filter(|r| r.error.is_some()).count(),
                "total_time_ms": started.elapsed().as_millis() as u64,
            })
            .to_string(),
        );
        let _ = tx.send(Ok(complete)).await;
    });

    let stream = ReceiverStream::new(rx);
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

// ── OCR History endpoints ────────────────────────────────────────────────────

pub async fn ocr_history(
    State(state): State<AppState>,
    Query(params): Query<OcrHistoryParams>,
) -> Result<Json<PaginatedOcrHistory>, (StatusCode, Json<Value>)> {
    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let (items, total) = if let Some(search) = &params.search {
        let pattern = format!("%{search}%");
        let items: Vec<OcrHistoryEntry> = sqlx::query_as::<_, OcrHistoryEntry>(concat!(
            "SELECT id::TEXT as id, filename, mime_type, preset, total_pages, provider, ",
            "processing_time_ms, detected_preset, created_at ",
            "FROM ",
            "ch_ocr_history",
            " WHERE filename ILIKE $1 OR preset ILIKE $1 OR detected_preset ILIKE $1 ",
            "ORDER BY created_at DESC LIMIT $2 OFFSET $3"
        ))
        .bind(&pattern)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e: sqlx::Error| {
            tracing::error!("ocr history search query: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Internal database error"})),
            )
        })?;

        let total: (i64,) = sqlx::query_as::<_, (i64,)>(concat!(
            "SELECT COUNT(*) FROM ",
            "ch_ocr_history",
            " WHERE filename ILIKE $1 OR preset ILIKE $1 OR detected_preset ILIKE $1"
        ))
        .bind(&pattern)
        .fetch_one(&state.db)
        .await
        .map_err(|e: sqlx::Error| {
            tracing::error!("ocr history search count: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Internal database error"})),
            )
        })?;

        (items, total.0)
    } else {
        let items: Vec<OcrHistoryEntry> = sqlx::query_as::<_, OcrHistoryEntry>(concat!(
            "SELECT id::TEXT as id, filename, mime_type, preset, total_pages, provider, ",
            "processing_time_ms, detected_preset, created_at ",
            "FROM ",
            "ch_ocr_history",
            " ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        ))
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e: sqlx::Error| {
            tracing::error!("ocr history list query: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Internal database error"})),
            )
        })?;

        let total: (i64,) =
            sqlx::query_as::<_, (i64,)>(concat!("SELECT COUNT(*) FROM ", "ch_ocr_history"))
                .fetch_one(&state.db)
                .await
                .map_err(|e: sqlx::Error| {
                    tracing::error!("ocr history list count: {e}");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": "Internal database error"})),
                    )
                })?;

        (items, total.0)
    };

    Ok(Json(PaginatedOcrHistory {
        items,
        total,
        limit,
        offset,
    }))
}

pub async fn ocr_history_item(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<OcrHistoryFull>, (StatusCode, Json<Value>)> {
    let entry: OcrHistoryFull = sqlx::query_as::<_, OcrHistoryFull>(concat!(
        "SELECT id::TEXT as id, filename, mime_type, preset, text, pages_json, total_pages, ",
        "confidence, provider, processing_time_ms, detected_preset, structured_data, created_at ",
        "FROM ",
        "ch_ocr_history",
        " WHERE id::TEXT = $1"
    ))
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e: sqlx::Error| {
        tracing::error!("ocr history item query: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Internal database error"})),
        )
    })?
    .ok_or_else(|| (StatusCode::NOT_FOUND, Json(json!({"error": "Not found"}))))?;

    Ok(Json(entry))
}

pub async fn ocr_history_delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let result = sqlx::query(concat!(
        "DELETE FROM ",
        "ch_ocr_history",
        " WHERE id::TEXT = $1"
    ))
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e: sqlx::Error| {
        tracing::error!("ocr history delete: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Internal database error"})),
        )
    })?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, Json(json!({"error": "Not found"}))));
    }

    Ok(Json(json!({"deleted": true})))
}

// ── OCR extraction (tries Claude first, falls back to Gemini) ────────────────
// CH-specific: dual-provider strategy — Claude Vision primary, Gemini fallback.
// Shared crate is Gemini-only; this is the main reason handlers remain local.

async fn ocr_extract(
    state: &AppState,
    data_b64: &str,
    mime_type: &str,
    prompt: &str,
) -> Result<(String, String, Option<f64>), String> {
    // Try Claude Vision API first
    let api_key = {
        let rt = state.runtime.read().await;
        rt.api_keys.get("ANTHROPIC_API_KEY").cloned()
    };

    if let Some(key) = api_key {
        match ocr_with_claude(&state.http_client, &key, data_b64, mime_type, prompt).await {
            Ok((text, confidence)) => return Ok((text, "claude".to_string(), confidence)),
            Err(e) => {
                tracing::warn!("Claude OCR failed, trying Gemini fallback: {e}");
            }
        }
    }

    // Fallback: Gemini Vision API via Google OAuth
    if let Some((credential, is_oauth)) = jaskier_oauth::google::get_google_credential(state).await {
        let (text, confidence) = ocr_with_gemini(
            &state.http_client,
            &credential,
            is_oauth,
            data_b64,
            mime_type,
            prompt,
        )
        .await?;
        return Ok((text, "gemini".to_string(), confidence));
    }

    Err("No API credentials configured (Anthropic or Google)".to_string())
}

// ── Claude Vision OCR ────────────────────────────────────────────────────────

async fn ocr_with_claude(
    client: &reqwest::Client,
    api_key: &str,
    data_b64: &str,
    mime_type: &str,
    prompt: &str,
) -> Result<(String, Option<f64>), String> {
    // Claude supports PDFs via "document" source type, images via "image" source type
    let is_pdf = mime_type == "application/pdf";

    let source_content = if is_pdf {
        json!({
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": mime_type,
                "data": data_b64
            }
        })
    } else {
        json!({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": mime_type,
                "data": data_b64
            }
        })
    };

    let request_body = json!({
        "model": CLAUDE_MODEL,
        "max_tokens": 16384,
        "messages": [{
            "role": "user",
            "content": [
                source_content,
                {
                    "type": "text",
                    "text": prompt
                }
            ]
        }]
    });

    let response = client
        .post(CLAUDE_API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Claude API request failed: {e}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Claude response: {e}"))?;

    if !status.is_success() {
        let msg = body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown Claude API error");
        return Err(format!("Claude API error ({status}): {msg}"));
    }

    let text = body["content"]
        .as_array()
        .and_then(|blocks| {
            blocks
                .iter()
                .filter_map(|b| {
                    if b["type"].as_str() == Some("text") {
                        b["text"].as_str().map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .next()
        })
        .unwrap_or_default();

    if text.is_empty() {
        return Err("Claude returned empty OCR result".to_string());
    }

    // Claude API does not expose avgLogprobs — confidence unavailable
    Ok((text, None))
}

// ── Gemini Vision OCR (fallback) ─────────────────────────────────────────────

async fn ocr_with_gemini(
    client: &reqwest::Client,
    credential: &str,
    is_oauth: bool,
    data_b64: &str,
    mime_type: &str,
    prompt: &str,
) -> Result<(String, Option<f64>), String> {
    let url = format!("{GEMINI_API_BASE}/{GEMINI_OCR_MODEL}:generateContent");

    let request_body = json!({
        "contents": [{
            "parts": [
                {
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": data_b64
                    }
                },
                {
                    "text": prompt
                }
            ]
        }],
        "generationConfig": {
            "temperature": 1.0, // Gemini 3: ALWAYS 1.0 — lower values cause looping/degradation
            "maxOutputTokens": 16384
        }
    });

    let builder = client.post(&url).json(&request_body);
    let builder = jaskier_oauth::google::apply_google_auth(builder, credential, is_oauth);

    let response = builder
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Gemini API request failed: {e}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Gemini response: {e}"))?;

    if !status.is_success() {
        let msg = body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown Gemini API error");
        return Err(format!("Gemini API error ({status}): {msg}"));
    }

    let text = body["candidates"][0]["content"]["parts"]
        .as_array()
        .and_then(|parts| {
            parts
                .iter()
                .filter_map(|p| p["text"].as_str())
                .next()
                .map(|s| s.to_string())
        })
        .unwrap_or_default();

    if text.is_empty() {
        return Err("Gemini returned empty OCR result".to_string());
    }

    // Extract confidence from avgLogprobs (if available)
    let confidence = body["candidates"][0]["avgLogprobs"]
        .as_f64()
        .map(|logprob| logprob.exp().clamp(0.0, 1.0));

    Ok((text, confidence))
}

// ── Structured data extraction ───────────────────────────────────────────────

/// Extract structured data from OCR text. Uses Gemini (text-only, simpler) since
/// this is a second-pass analysis that doesn't need vision capabilities.
async fn extract_structured_data(state: &AppState, ocr_text: &str) -> Result<Value, String> {
    let (credential, is_oauth) = jaskier_oauth::google::get_google_credential(state)
        .await
        .ok_or_else(|| {
            "No Google API credential configured for structured extraction".to_string()
        })?;

    let url = format!("{GEMINI_API_BASE}/{GEMINI_OCR_MODEL}:generateContent");

    let prompt = format!("{STRUCTURED_EXTRACTION_PROMPT}\n\nOCR TEXT:\n{ocr_text}");

    let request_body = json!({
        "contents": [{
            "parts": [{ "text": prompt }]
        }],
        "generationConfig": {
            "temperature": 1.0, // Gemini 3: ALWAYS 1.0 — lower values cause looping/degradation
            "maxOutputTokens": 4096
        }
    });

    let builder = state.http_client.post(&url).json(&request_body);
    let builder = jaskier_oauth::google::apply_google_auth(builder, &credential, is_oauth);

    let response = builder
        .send()
        .await
        .map_err(|e| format!("Structured extraction request failed: {e}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse structured extraction response: {e}"))?;

    if !status.is_success() {
        return Err("Structured extraction API error".to_string());
    }

    let raw_text = body["candidates"][0]["content"]["parts"]
        .as_array()
        .and_then(|parts| parts.iter().filter_map(|p| p["text"].as_str()).next())
        .unwrap_or("");

    // Try to parse JSON directly, or extract from markdown code block
    let trimmed = raw_text.trim();
    let json_str = if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        trimmed
    };

    serde_json::from_str(json_str).map_err(|e| format!("Failed to parse structured data JSON: {e}"))
}

// ── Save to history ──────────────────────────────────────────────────────────

async fn save_ocr_result(
    db: &sqlx::PgPool,
    filename: Option<&str>,
    mime_type: &str,
    preset: Option<&str>,
    response: &OcrResponse,
) -> Result<(), sqlx::Error> {
    let pages_json = serde_json::to_value(&response.pages).unwrap_or_else(|_| json!([]));

    sqlx::query(concat!(
        "INSERT INTO ",
        "ch_ocr_history",
        " (filename, mime_type, preset, text, pages_json, total_pages, confidence, ",
        "provider, processing_time_ms, detected_preset, structured_data) ",
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"
    ))
    .bind(filename)
    .bind(mime_type)
    .bind(preset)
    .bind(&response.text)
    .bind(&pages_json)
    .bind(response.total_pages as i32)
    .bind(response.confidence)
    .bind(&response.provider)
    .bind(response.processing_time_ms as i64)
    .bind(response.detected_preset.as_deref())
    .bind(&response.structured_data)
    .execute(db)
    .await?;

    Ok(())
}

// ── Public helpers for agent tool fallback ────────────────────────────────────

/// OCR a PDF document. Used by `read_pdf` tool as fallback when `pdf-extract`
/// returns empty text (scanned/image-based PDFs).
pub async fn ocr_pdf_text(
    state: &AppState,
    data_b64: &str,
    _page_range: Option<&str>,
) -> Result<String, String> {
    let (text, provider, _confidence) =
        ocr_extract(state, data_b64, "application/pdf", OCR_PROMPT).await?;
    tracing::info!("OCR PDF fallback completed via {provider}");
    Ok(text)
}

/// OCR a single image. Used by `analyze_image` tool when `extract_text` is true.
pub async fn ocr_image_text(
    state: &AppState,
    data_b64: &str,
    mime_type: &str,
) -> Result<String, String> {
    let (text, provider, _confidence) = ocr_extract(state, data_b64, mime_type, OCR_PROMPT).await?;
    tracing::info!("OCR image extraction completed via {provider}");
    Ok(text)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Split HTML OCR output into pages by `<hr data-page="N">` markers.
fn split_html_into_pages(html: &str) -> Vec<OcrPage> {
    let re = regex::Regex::new(r#"<hr\s+data-page="(\d+)"\s*/?>"#)
        .expect("html page marker regex is valid");

    let mut pages = Vec::new();
    let mut last_end = 0;
    let mut page_num = 1;

    for cap in re.captures_iter(html) {
        if let Some(m) = cap.get(0) {
            let before = html[last_end..m.start()].trim();
            if !before.is_empty() {
                pages.push(OcrPage {
                    page_number: page_num,
                    text: before.to_string(),
                });
                page_num += 1;
            }
            if let Some(n_match) = cap.get(1)
                && let Ok(n) = n_match.as_str().parse::<usize>()
            {
                page_num = n;
            }
            last_end = m.end();
        }
    }

    let remaining = html[last_end..].trim();
    if !remaining.is_empty() {
        pages.push(OcrPage {
            page_number: page_num,
            text: remaining.to_string(),
        });
    }

    if pages.is_empty() {
        pages.push(OcrPage {
            page_number: 1,
            text: html.to_string(),
        });
    }

    pages
}

/// Split OCR output into pages by `---PAGE N---` markers.
fn split_into_pages(text: &str) -> Vec<OcrPage> {
    // Match ---PAGE 2--- (numbered) or ---PAGE N--- (literal N from Gemini)
    let re = regex::Regex::new(r"---PAGE\s+(\d+|N)---").expect("page marker regex is valid");

    let mut pages = Vec::new();
    let mut last_end = 0;
    let mut page_num = 1;

    for cap in re.captures_iter(text) {
        if let Some(m) = cap.get(0) {
            let before = text[last_end..m.start()].trim();
            if !before.is_empty() {
                pages.push(OcrPage {
                    page_number: page_num,
                    text: before.to_string(),
                });
                page_num += 1;
            }
            if let Some(n_match) = cap.get(1)
                && let Ok(n) = n_match.as_str().parse::<usize>()
            {
                page_num = n;
            }
            last_end = m.end();
        }
    }

    // Remaining text after last marker (or entire text if no markers)
    let remaining = text[last_end..].trim();
    if !remaining.is_empty() {
        pages.push(OcrPage {
            page_number: page_num,
            text: remaining.to_string(),
        });
    }

    if pages.is_empty() {
        pages.push(OcrPage {
            page_number: 1,
            text: text.to_string(),
        });
    }

    pages
}

/// Send an SSE progress event.
async fn send_progress(
    tx: &mpsc::Sender<Result<Event, Infallible>>,
    status: &str,
    detail: Option<&Value>,
) {
    let mut payload = json!({
        "step": "ocr",
        "status": status,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    if let Some(d) = detail {
        payload["detail"] = d.clone();
    }
    let event = Event::default().event("progress").data(payload.to_string());
    if tx.send(Ok(event)).await.is_err() {
        tracing::warn!("OCR SSE {status}: client disconnected");
    }
}
