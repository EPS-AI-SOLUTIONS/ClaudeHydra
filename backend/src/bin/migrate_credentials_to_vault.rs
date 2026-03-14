// migrate_credentials_to_vault — One-shot migration of PostgreSQL OAuth tokens to Jaskier Vault
//
// Reads existing OAuth/service tokens from ClaudeHydra's ch_* tables, decrypts
// them using jaskier-oauth::crypto (AES-256-GCM), and stores them in Jaskier
// Vault via its HTTP API. Idempotent: skips credentials that already exist.
//
// Usage:
//   DATABASE_URL="postgresql://claude:claude_local@localhost:5433/claudehydra" \
//   AUTH_SECRET="<your-secret>" \
//   cargo run --bin migrate-credentials-to-vault
//
// Requires Vault running on http://localhost:5190 (or VAULT_URL env override).

use std::io::Write;

use reqwest::Client;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use tracing::{error, info, warn};

// ── Vault HTTP helpers ──────────────────────────────────────────────────────

/// Check whether a credential already exists in Vault (returns true if found).
async fn vault_has(client: &Client, vault_url: &str, namespace: &str, service: &str) -> bool {
    let resp = client
        .post(format!("{}/api/vault/get", vault_url))
        .json(&json!({
            "namespace": namespace,
            "service": service,
            "unmask": false,
        }))
        .send()
        .await;

    match resp {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    }
}

/// Store a credential in Vault via HTTP POST.
async fn vault_set(
    client: &Client,
    vault_url: &str,
    namespace: &str,
    service: &str,
    data: serde_json::Value,
) -> Result<(), String> {
    let resp = client
        .post(format!("{}/api/vault/set", vault_url))
        .json(&json!({
            "namespace": namespace,
            "service": service,
            "data": data,
        }))
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if resp.status().is_success() {
        Ok(())
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        Err(format!("Vault returned {}: {}", status, &body[..body.len().min(300)]))
    }
}

// ── Decrypt helper ──────────────────────────────────────────────────────────

/// Decrypt a token stored in DB. Uses jaskier-oauth::crypto which reads
/// OAUTH_ENCRYPTION_KEY / AUTH_SECRET from env. Plaintext tokens (no "enc:"
/// prefix) pass through unchanged.
fn try_decrypt(stored: &str, field_name: &str) -> String {
    if stored.is_empty() {
        return String::new();
    }
    match jaskier_oauth::decrypt_token(stored) {
        Ok(plaintext) => plaintext,
        Err(e) => {
            warn!(
                "Failed to decrypt {}: {} — storing as-is (may be plaintext)",
                field_name, e
            );
            stored.to_string()
        }
    }
}

// ── Table existence check ───────────────────────────────────────────────────

async fn table_exists(pool: &sqlx::PgPool, table_name: &str) -> bool {
    let result: Option<(bool,)> = sqlx::query_as(
        "SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        )",
    )
    .bind(table_name)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    result.map(|(exists,)| exists).unwrap_or(false)
}

// ── Migration functions (one per table) ─────────────────────────────────────

/// ch_oauth_tokens -> ai_providers/anthropic_max
async fn migrate_anthropic(
    pool: &sqlx::PgPool,
    client: &Client,
    vault_url: &str,
) -> Result<bool, String> {
    let namespace = "ai_providers";
    let service = "anthropic_max";

    if !table_exists(pool, "ch_oauth_tokens").await {
        info!("Table ch_oauth_tokens does not exist — skipping Anthropic migration");
        return Ok(false);
    }

    if vault_has(client, vault_url, namespace, service).await {
        info!("Vault already has {}/{} — skipping", namespace, service);
        return Ok(false);
    }

    let row: Option<(String, String, i64, Option<String>)> = sqlx::query_as(
        "SELECT access_token, refresh_token, expires_at, scope FROM ch_oauth_tokens WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Query ch_oauth_tokens failed: {}", e))?;

    let Some((access_token, refresh_token, expires_at, scope)) = row else {
        info!("No Anthropic OAuth token row found in ch_oauth_tokens");
        return Ok(false);
    };

    let data = json!({
        "access_token": try_decrypt(&access_token, "anthropic.access_token"),
        "refresh_token": try_decrypt(&refresh_token, "anthropic.refresh_token"),
        "expires_at": expires_at,
        "scope": scope.unwrap_or_default(),
    });

    vault_set(client, vault_url, namespace, service, data).await?;
    info!("Migrated Anthropic OAuth token to {}/{}", namespace, service);
    Ok(true)
}

/// ch_google_auth -> ai_providers/google_gemini
async fn migrate_google(
    pool: &sqlx::PgPool,
    client: &Client,
    vault_url: &str,
) -> Result<bool, String> {
    let namespace = "ai_providers";
    let service = "google_gemini";

    if !table_exists(pool, "ch_google_auth").await {
        info!("Table ch_google_auth does not exist — skipping Google migration");
        return Ok(false);
    }

    if vault_has(client, vault_url, namespace, service).await {
        info!("Vault already has {}/{} — skipping", namespace, service);
        return Ok(false);
    }

    let row: Option<(String, String, String, i64, String, String)> = sqlx::query_as(
        "SELECT auth_method, access_token, refresh_token, expires_at, api_key_encrypted, user_email \
         FROM ch_google_auth WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Query ch_google_auth failed: {}", e))?;

    let Some((auth_method, access_token, refresh_token, expires_at, api_key_encrypted, user_email)) =
        row
    else {
        info!("No Google auth row found in ch_google_auth");
        return Ok(false);
    };

    // Skip if all token fields are empty defaults (table created but never used)
    if access_token.is_empty() && refresh_token.is_empty() && api_key_encrypted.is_empty() {
        info!("Google auth row exists but has no tokens — skipping");
        return Ok(false);
    }

    let data = json!({
        "auth_method": auth_method,
        "access_token": try_decrypt(&access_token, "google.access_token"),
        "refresh_token": try_decrypt(&refresh_token, "google.refresh_token"),
        "expires_at": expires_at,
        "api_key": try_decrypt(&api_key_encrypted, "google.api_key"),
        "user_email": user_email,
    });

    vault_set(client, vault_url, namespace, service, data).await?;
    info!("Migrated Google auth to {}/{}", namespace, service);
    Ok(true)
}

/// ch_oauth_github -> integrations/github_oauth
async fn migrate_github(
    pool: &sqlx::PgPool,
    client: &Client,
    vault_url: &str,
) -> Result<bool, String> {
    let namespace = "integrations";
    let service = "github_oauth";

    if !table_exists(pool, "ch_oauth_github").await {
        info!("Table ch_oauth_github does not exist — skipping GitHub migration");
        return Ok(false);
    }

    if vault_has(client, vault_url, namespace, service).await {
        info!("Vault already has {}/{} — skipping", namespace, service);
        return Ok(false);
    }

    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT access_token, scope FROM ch_oauth_github WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Query ch_oauth_github failed: {}", e))?;

    let Some((access_token, scope)) = row else {
        info!("No GitHub OAuth token row found in ch_oauth_github");
        return Ok(false);
    };

    let data = json!({
        "access_token": try_decrypt(&access_token, "github.access_token"),
        "scope": scope,
    });

    vault_set(client, vault_url, namespace, service, data).await?;
    info!("Migrated GitHub OAuth token to {}/{}", namespace, service);
    Ok(true)
}

/// ch_oauth_vercel -> integrations/vercel_oauth
async fn migrate_vercel(
    pool: &sqlx::PgPool,
    client: &Client,
    vault_url: &str,
) -> Result<bool, String> {
    let namespace = "integrations";
    let service = "vercel_oauth";

    if !table_exists(pool, "ch_oauth_vercel").await {
        info!("Table ch_oauth_vercel does not exist — skipping Vercel migration");
        return Ok(false);
    }

    if vault_has(client, vault_url, namespace, service).await {
        info!("Vault already has {}/{} — skipping", namespace, service);
        return Ok(false);
    }

    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT access_token, team_id FROM ch_oauth_vercel WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Query ch_oauth_vercel failed: {}", e))?;

    let Some((access_token, team_id)) = row else {
        info!("No Vercel OAuth token row found in ch_oauth_vercel");
        return Ok(false);
    };

    let data = json!({
        "access_token": try_decrypt(&access_token, "vercel.access_token"),
        "team_id": team_id.unwrap_or_default(),
    });

    vault_set(client, vault_url, namespace, service, data).await?;
    info!("Migrated Vercel OAuth token to {}/{}", namespace, service);
    Ok(true)
}

/// ch_service_tokens -> integrations/{service_name} (one per row)
async fn migrate_service_tokens(
    pool: &sqlx::PgPool,
    client: &Client,
    vault_url: &str,
) -> Result<u32, String> {
    let namespace = "integrations";

    if !table_exists(pool, "ch_service_tokens").await {
        info!("Table ch_service_tokens does not exist — skipping service token migration");
        return Ok(0);
    }

    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT service, encrypted_token FROM ch_service_tokens ORDER BY service",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Query ch_service_tokens failed: {}", e))?;

    if rows.is_empty() {
        info!("No service tokens found in ch_service_tokens");
        return Ok(0);
    }

    let mut migrated = 0u32;
    for (service_name, encrypted_token) in &rows {
        // Normalize service name for Vault key (lowercase, underscores)
        let vault_service = service_name.to_lowercase().replace(['-', ' '], "_");

        if vault_has(client, vault_url, namespace, &vault_service).await {
            info!(
                "Vault already has {}/{} — skipping",
                namespace, vault_service
            );
            continue;
        }

        let data = json!({
            "access_token": try_decrypt(encrypted_token, &format!("service_token.{}", service_name)),
            "service_name": service_name,
        });

        match vault_set(client, vault_url, namespace, &vault_service, data).await {
            Ok(()) => {
                info!(
                    "Migrated service token '{}' to {}/{}",
                    service_name, namespace, vault_service
                );
                migrated += 1;
            }
            Err(e) => {
                error!(
                    "Failed to migrate service token '{}': {}",
                    service_name, e
                );
            }
        }
    }

    Ok(migrated)
}

// ── Main ────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_target(false)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("=== ClaudeHydra Credential Migration to Jaskier Vault ===");
    info!("");

    // ── Read config ─────────────────────────────────────────────────────
    let database_url = match std::env::var("DATABASE_URL") {
        Ok(url) => url,
        Err(_) => {
            error!("DATABASE_URL env var is required");
            std::process::exit(1);
        }
    };

    let vault_url = std::env::var("VAULT_URL")
        .unwrap_or_else(|_| "http://localhost:5190".to_string());

    let encryption_configured = jaskier_oauth::is_encryption_configured();
    if encryption_configured {
        info!("Encryption key detected (AUTH_SECRET / OAUTH_ENCRYPTION_KEY) — will decrypt tokens");
    } else {
        warn!("No encryption key configured — encrypted tokens (enc:...) will fail to decrypt");
        warn!("Set AUTH_SECRET or OAUTH_ENCRYPTION_KEY env var to enable decryption");
    }

    info!("Database: {}", mask_connection_string(&database_url));
    info!("Vault:    {}", vault_url);
    info!("");

    // ── Verify Vault is reachable ───────────────────────────────────────
    let http_client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("Failed to build HTTP client");

    match http_client
        .get(format!("{}/api/vault/health", vault_url))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            info!("Vault is reachable and healthy");
        }
        Ok(resp) => {
            warn!("Vault returned status {} — proceeding anyway", resp.status());
        }
        Err(e) => {
            error!("Cannot reach Vault at {}: {}", vault_url, e);
            error!("Ensure Jaskier Vault MCP is running (cd JaskierVaultMCP && npm start)");
            std::process::exit(1);
        }
    }

    // ── Connect to PostgreSQL ───────────────────────────────────────────
    let pool = match PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
    {
        Ok(pool) => {
            info!("Connected to PostgreSQL");
            pool
        }
        Err(e) => {
            error!("Failed to connect to PostgreSQL: {}", e);
            std::process::exit(1);
        }
    };

    // ── Confirmation prompt ─────────────────────────────────────────────
    info!("");
    info!("This will read OAuth tokens from PostgreSQL and store them in Vault.");
    info!("Existing Vault entries will NOT be overwritten (idempotent).");
    info!("");
    print!("Type 'yes' to proceed: ");
    std::io::stdout().flush().ok();

    let mut input = String::new();
    std::io::stdin()
        .read_line(&mut input)
        .expect("Failed to read stdin");

    if input.trim() != "yes" {
        info!("Aborted by user.");
        std::process::exit(0);
    }

    info!("");
    info!("Starting migration...");
    info!("");

    // ── Run migrations ──────────────────────────────────────────────────
    let mut total = 0u32;
    let mut migrated = 0u32;
    let mut errors = Vec::new();

    // 1. Anthropic OAuth
    total += 1;
    match migrate_anthropic(&pool, &http_client, &vault_url).await {
        Ok(true) => migrated += 1,
        Ok(false) => {} // skipped (already exists or no data)
        Err(e) => {
            error!("Anthropic migration failed: {}", e);
            errors.push(format!("Anthropic: {}", e));
        }
    }

    // 2. Google Auth
    total += 1;
    match migrate_google(&pool, &http_client, &vault_url).await {
        Ok(true) => migrated += 1,
        Ok(false) => {}
        Err(e) => {
            error!("Google migration failed: {}", e);
            errors.push(format!("Google: {}", e));
        }
    }

    // 3. GitHub OAuth
    total += 1;
    match migrate_github(&pool, &http_client, &vault_url).await {
        Ok(true) => migrated += 1,
        Ok(false) => {}
        Err(e) => {
            error!("GitHub migration failed: {}", e);
            errors.push(format!("GitHub: {}", e));
        }
    }

    // 4. Vercel OAuth
    total += 1;
    match migrate_vercel(&pool, &http_client, &vault_url).await {
        Ok(true) => migrated += 1,
        Ok(false) => {}
        Err(e) => {
            error!("Vercel migration failed: {}", e);
            errors.push(format!("Vercel: {}", e));
        }
    }

    // 5. Service tokens (variable count)
    match migrate_service_tokens(&pool, &http_client, &vault_url).await {
        Ok(count) => {
            total += count.max(1); // count at least 1 for the category
            migrated += count;
        }
        Err(e) => {
            total += 1;
            error!("Service tokens migration failed: {}", e);
            errors.push(format!("Service tokens: {}", e));
        }
    }

    // ── Summary ─────────────────────────────────────────────────────────
    info!("");
    info!("========================================");
    info!("  Migration Summary");
    info!("========================================");
    info!("  Migrated: {}/{} credentials to Vault", migrated, total);

    if !errors.is_empty() {
        error!("  Errors ({}):", errors.len());
        for err in &errors {
            error!("    - {}", err);
        }
    }

    if errors.is_empty() && migrated > 0 {
        info!("  Status: SUCCESS");
    } else if errors.is_empty() {
        info!("  Status: COMPLETE (all credentials already in Vault or no data)");
    } else {
        warn!("  Status: PARTIAL ({} errors)", errors.len());
    }

    info!("========================================");

    pool.close().await;
}

// ── Utility ─────────────────────────────────────────────────────────────────

/// Mask password in a connection string for safe logging.
fn mask_connection_string(url: &str) -> String {
    // postgresql://user:password@host:port/db -> postgresql://user:***@host:port/db
    if let Some(at_pos) = url.find('@') {
        if let Some(colon_pos) = url[..at_pos].rfind(':') {
            let scheme_end = url.find("://").map(|p| p + 3).unwrap_or(0);
            if colon_pos > scheme_end {
                return format!("{}***{}", &url[..colon_pos + 1], &url[at_pos..]);
            }
        }
    }
    url.to_string()
}
