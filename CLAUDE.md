# ClaudeHydra v4 â€” AI Swarm Control Center

## Quick Start
- `npm run dev` â€” port 5199
- `npx tsc --noEmit` â€” type check

## Architecture
- Pure Vite SPA â€” React 19 + Zustand 5
- Views: home, chat, agents, history, settings, logs
- ViewRouter in `src/main.tsx` with AnimatePresence transitions
- Sidebar: `src/components/organisms/Sidebar.tsx` (flat nav, session manager with rename/delete)

## Key Files
- `src/features/home/components/HomePage.tsx` â€” WelcomeScreen (ported from GeminiHydra)
- `src/shared/hooks/useViewTheme.ts` â€” full ViewTheme (replaced v3 simplified version)
- `src/stores/viewStore.ts` â€” ChatSession type, chatSessions, openTabs, activeSessionId
- `src/features/chat/components/OllamaChatView.tsx` â€” main chat interface
- `backend/src/ai_gateway/` â€” unified AI provider gateway (Skarbiec Krasnali)

## Store API (differs from GeminiHydra)
- `setView(view)` not `setCurrentView(view)`
- `chatSessions` not `sessions`
- `activeSessionId` not `currentSessionId`
- `ChatSession` has `messageCount` field (GH uses `chatHistory[id].length`)

## Sidebar Session Manager
- `SessionItem` sub-component z rename (inline edit), delete (confirm), tooltip (preview)
- Sessions sorted by `updatedAt` descending
- Collapsed mode: only icon buttons for sessions

## Conventions
- motion/react for animations
- Biome for linting
- npm as package manager

## Backend (Rust/Axum)
- Port: 8082 | Prod: claudehydra-v4-backend.fly.dev
- Stack: Rust + Axum 0.8 + SQLx + PostgreSQL 17
- Route syntax: `{id}` (NOT `:id` â€” axum 0.8 breaking change)
- Entry point: `backend/src/lib.rs` â†’ `create_router()` builds all API routes
- Key modules: `handlers.rs` (system prompt + tool defs), `state.rs` (AppState + LogRingBuffer), `models.rs`, `logs.rs` (4 log endpoints â€” backend/audit/flyio/activity), `tools/` (mod.rs + fs_tools.rs + pdf_tools.rs + zip_tools.rs + image_tools.rs + git_tools.rs + github_tools.rs + vercel_tools.rs + fly_tools.rs), `model_registry.rs` (dynamic model discovery), `browser_proxy.rs` (proxy status + health check + login/logout handlers), `watchdog.rs` (proxy auto-restart + health history), `ai_gateway/` (unified AI provider gateway â€” Skarbiec Krasnali), `oauth.rs` (Anthropic OAuth PKCE â€” **deprecated**, use ai_gateway), `oauth_google.rs` (Google OAuth PKCE â€” **deprecated**), `oauth_github.rs` (GitHub OAuth â€” **deprecated**), `oauth_vercel.rs` (Vercel OAuth â€” **deprecated**), `service_tokens.rs` (Fly.io PAT â€” **deprecated**), `mcp/` (client.rs + server.rs + config.rs)
- DB: `claudehydra` on localhost:5433 (user: claude, pass: claude_local)
- Tables: ch_settings, ch_sessions, ch_messages, ch_tool_interactions, ch_model_pins, ch_ai_providers, ch_mcp_servers, ch_mcp_discovered_tools, ch_audit_log, ch_prompt_history (legacy: ch_oauth_tokens, ch_google_auth, ch_oauth_github, ch_oauth_vercel, ch_service_tokens — dropped by migration 026)

## Backend Local Dev
- Wymaga Docker Desktop (PostgreSQL container)
- Image: `postgres:17-alpine` (NO pgvector needed â€” ClaudeHydra doesn't use embeddings)
- Start: `docker compose up -d` (from `backend/`)
- Backend: `DATABASE_URL="postgresql://claude:claude_local@localhost:5433/claudehydra" cargo run --release`
- Env vars: `DATABASE_URL` (required), `ANTHROPIC_API_KEY` (required), `GOOGLE_API_KEY` (optional, for model_registry Google fetch), `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` (optional â€” enables Google OAuth button), `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` (optional), `VERCEL_CLIENT_ID` + `VERCEL_CLIENT_SECRET` (optional), `PORT` (default 8082)

## Fly.io Deploy
- App: `claudehydra-v4-backend` | Region: `arn` | VM: shared-cpu-1x 256MB
- Deploy: `cd backend && fly deploy`
- Dockerfile: multi-stage (rust builder â†’ debian:trixie-slim runtime)
- DB: Fly Postgres `jaskier-db` â†’ database `claudehydra_v4_backend` (NOT `claudehydra`!)
- Shared DB cluster `jaskier-db` hosts: geminihydra_v15_backend, claudehydra_v4_backend, tissaia_v4_backend
- Secrets: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `AUTH_SECRET` (set via `fly secrets set`)
- auto_stop_machines=stop, auto_start_machines=true, min_machines=0 (scales to zero)
- Connect to prod DB: `fly pg connect -a jaskier-db -d claudehydra_v4_backend`
- Logs: `fly logs --no-tail` or `fly logs`
- Health: `curl https://claudehydra-v4-backend.fly.dev/api/health`

## Migrations
- Folder: `backend/migrations/`
- SQLx sorts by filename prefix â€” each migration MUST have a unique date prefix
- Format: YYYYMMDDNN (unique 10-digit prefix â€” date + 2-digit sequence number within date)
- Current order: 2026021401_001 â†’ 2026021501_002 â†’ 2026021601_003 â†’ 2026021701_004 â†’ 2026022401_005 â†’ 2026022402_006 â†’ 2026022601_007 â†’ 2026022801_009 â†’ 2026022802_010 â†’ 2026022803_011 â†’ 2026022804_012 â†’ 2026022805_013 â†’ 2026022806_014 â†’ 2026022807_015 â†’ 2026030101_016
- All migrations MUST be idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING) â€” SQLx checks checksums
- All migration files MUST use LF line endings (not CRLF) â€” `.gitattributes` with `*.sql text eol=lf` enforces this
- Migration 005: model_pins table for pinning preferred models per role
- Migration 016: prompt_history table for input history persistence

## Migrations Gotchas (learned the hard way)
- **Checksum mismatch on deploy**: SQLx stores SHA-256 checksum per migration. If line endings change (CRLFâ†’LF between Windows and Docker), checksum won't match â†’ `VersionMismatch` panic. Fix: reset `_sqlx_migrations` table
- **Duplicate date prefixes**: Multiple files with same date cause `duplicate key` error. Fixed 2026-03-01: all files renamed from YYYYMMDD to YYYYMMDDNN format (10-digit unique prefix)
- **pgvector not on fly.io**: Fly Postgres (`jaskier-db`) does NOT have pgvector. If future migrations need it, use `DO $$ ... EXCEPTION WHEN OTHERS` to skip gracefully
- **Reset prod DB migrations**: `fly pg connect -a jaskier-db -d claudehydra_v4_backend` then `DROP TABLE _sqlx_migrations CASCADE;` + drop all ch_* tables, then redeploy

## Dynamic Model Registry
- At startup `model_registry::startup_sync()` fetches all models from Anthropic + Google APIs
- Caches them in `AppState.model_cache` (TTL 1h, refreshed on demand via `/api/models/refresh`)
- Currently: 31 models cached (9 Anthropic + 22 Google)
- Auto-selects best model per tier using `version_key()` sort (highest version wins):
  - **commander**: latest `opus` (prefer non-dated, fallback to dated) â†’ `claude-opus-4-6`
  - **coordinator**: latest `sonnet` (prefer non-dated, fallback to dated) â†’ `claude-sonnet-4-6`
  - **executor**: latest `haiku` (prefer non-dated, fallback to dated) â†’ `claude-haiku-4-5-20251001`
- Persists chosen coordinator model into `ch_settings.default_model` at startup
- No hardcoded model list â€” adapts automatically when Anthropic releases new models
- Pin override: `POST /api/models/pin` saves to `ch_model_pins` (priority 1, above auto-selection)
- API endpoints: `GET /api/models`, `POST /api/models/refresh`, `POST /api/models/pin`, `DELETE /api/models/pin/{use_case}`, `GET /api/models/pins`

## OAuth / Authentication (Anthropic Claude MAX Plan)
- Backend module: `backend/src/oauth.rs` â€” Anthropic PKCE flow for Claude MAX Plan flat-rate API access
- State: `OAuthPkceState` in `state.rs` â†’ `AppState.oauth_pkce: Arc<RwLock<Option<OAuthPkceState>>>`
- DB table: `ch_oauth_tokens` (singleton row with `id=1` CHECK constraint)
- Token encryption: AES-256-GCM encryption is used for storing the token securely in the DB
- Token auto-refresh: `get_valid_access_token()` refreshes expired tokens automatically
- API endpoints: `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/callback`, `POST /api/auth/logout`
- Frontend: `src/features/settings/components/OAuthSection.tsx` â€” 3-step PKCE flow (idle â†’ waiting_code â†’ exchanging)

## OAuth / Authentication (Google OAuth PKCE + API Key)
- Backend module: `backend/src/oauth_google.rs` â€” Google OAuth 2.0 redirect-based PKCE + API key management
- **Separate from Anthropic OAuth** â€” ClaudeHydra has dual OAuth (Anthropic for Claude API + Google for Gemini models)
- State: `AppState.google_oauth_pkce: Arc<RwLock<Option<OAuthPkceState>>>` (separate from `oauth_pkce`)
- DB table: `ch_google_auth` (singleton row, id=1 CHECK) â€” stores auth_method, access_token, refresh_token, api_key_encrypted, user_email
- `get_google_credential(state)` â†’ credential resolution: DB OAuth token â†’ DB API key â†’ env var (`GOOGLE_API_KEY`/`GEMINI_API_KEY`)
- API endpoints: `GET /api/auth/google/status`, `POST /api/auth/google/login`, `GET /api/auth/google/redirect`, `POST /api/auth/google/logout`, `POST/DELETE /api/auth/google/apikey`
- Env vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (optional â€” OAuth button hidden if not set)
- Google Cloud Console: app "Jaskier", redirect URI: `http://localhost:8082/api/auth/google/redirect`
- Frontend: `GoogleOAuthSection.tsx` + `useGoogleAuthStatus.ts` in `src/features/settings/components/`

## OAuth â€” GitHub + Vercel + Fly.io
- `oauth_github.rs` â€” GitHub OAuth code exchange, DB table `ch_oauth_github`, endpoints `/api/auth/github/*`
- `oauth_vercel.rs` â€” Vercel OAuth code exchange, DB table `ch_oauth_vercel`, endpoints `/api/auth/vercel/*`
- `service_tokens.rs` â€” encrypted PAT storage (AES-256-GCM), DB table `ch_service_tokens`, endpoints `/api/tokens`

## Agent Tools (20+ tools, all tested & working)
- **Filesystem** (fs_tools.rs): `read_file`, `list_directory`, `write_file`, `search_in_files`
- **PDF/ZIP** (pdf_tools.rs, zip_tools.rs): `read_pdf`, `list_zip`, `extract_zip_file`
- **Image** (image_tools.rs): `analyze_image` (Claude Vision API, 5MB limit)
- **Web Scraping v2** (web_tools.rs, ~950 lines): `fetch_webpage` (SSRF protection, enhanced HTMLâ†’markdown, metadata/OpenGraph/JSON-LD, link categorization, retry+backoff, JSON output), `crawl_website` (robots.txt, sitemap, concurrent JoinSet, SHA-256 dedup, path prefix filter, exclude patterns)
- **Git** (git_tools.rs): `git_status`, `git_log`, `git_diff`, `git_branch`, `git_commit` (NO push)
- **GitHub** (github_tools.rs): `github_list_repos`, `github_get_repo`, `github_list_issues`, `github_get_issue`, `github_create_issue`, `github_create_pr`
- **Vercel** (vercel_tools.rs): `vercel_list_projects`, `vercel_deploy`, `vercel_get_deployment`
- **Fly.io** (fly_tools.rs): `fly_list_apps`, `fly_get_status`, `fly_get_logs` (read-only)
- **MCP proxy**: `mcp_{server}_{tool}` â€” routed via `state.mcp_client.call_tool()`

## "Co dalej?" â€” Follow-up Task Proposals
- System prompt rule in `build_system_prompt()` (`handlers.rs` ~L686): after every completed task, agent MUST add a `## Co dalej?` section with exactly 5 numbered follow-up tasks (specific, actionable, relevant)
- Works on both streaming (`/api/claude/chat/stream`) and non-streaming (`/api/claude/chat` via `resolve_chat_context()`)

## Dead Code Cleanup (2026-02-24)
- Removed 13 files, ~200 lines of unused code
- Deleted hooks: useAgents.ts, useChat.ts, useHealth.ts, useHistory.ts (features), useMarkdownWorker.ts (shared)
- Deleted worker: markdownWorker.ts
- Deleted 5 barrel index.ts files (features/home, agents, history, settings, chat)
- Deleted 2 empty .gitkeep files (chat/workers, shared/workers)
- Schema types made private: ProviderInfo, ClaudeModels (removed from exports in schemas.ts)

## Logs View (F21)
- Frontend: `src/features/logs/` â€” `LogsView.tsx` (4 tabs: Backend/Audit/Fly.io/Activity) + `useLogs.ts` (TanStack Query hooks, 5s polling)
- Backend: `logs.rs` â€” 4 endpoints (`/api/logs/backend`, `/api/logs/audit`, `/api/logs/flyio`, `/api/logs/activity`)
- `LogRingBuffer` in `state.rs` â€” in-memory ring buffer (capacity 1000) with `std::sync::Mutex`
- `LogBufferLayer` in `main.rs` â€” custom tracing Layer capturing events into ring buffer
- Fly.io logs: PAT from `service_tokens` (DB) with `FLY_API_TOKEN` env var fallback
- Sidebar: `ScrollText` icon, i18n keys `nav.logs`, `logs.*`
- View type: `| 'logs'` in `src/stores/viewStore.ts`

## Prompt History (Jaskier Shared Pattern â€” identical in GH)
- **Hook**: `usePromptHistory.ts` w `src/features/chat/hooks/` â€” eksportuje `{ promptHistory, addPrompt }`
- **Storage**: DB table `ch_prompt_history` (max 200 wpisĂłw, auto-cleanup) + `localStorage` cache (`'prompt-history-cache'`)
- **Endpoints** (PROTECTED): `GET /api/prompt-history` (ASC, limit 500), `POST /api/prompt-history` (consecutive dedup + cap 200), `DELETE /api/prompt-history`
- **Backend**: `handlers.rs` linie 2360-2458
- **Migration**: `016_prompt_history.sql`
- **Arrow Up/Down w ChatInput.tsx** â€” bash-like nawigacja historii promptĂłw:
  - **ArrowUp**: kursor na poczÄ…tku textarea LUB single-line â†’ nawigacja wstecz (newestâ†’oldest). Pierwszy press zapisuje draft do `savedDraftRef`
  - **ArrowDown**: kursor na koĹ„cu LUB single-line â†’ nawigacja do przodu. Po ostatnim wpisie przywraca zapisany draft
  - **Draft preservation**: tekst uĹĽytkownika zachowany przy nawigacji, przywracany po wyjĹ›ciu z historii
  - **Session change**: resetuje `historyIndex` do -1
- **Integracja**: `ClaudeChatView.tsx` â†’ `usePromptHistory()` + `addPrompt()` w `handleSend()` â†’ props `promptHistory` do `ChatInput`

## Shared Crate Integration (Round 5+6)
- **jaskier-oauth**: `oauth_google.rs`, `oauth_github.rs`, `oauth_vercel.rs`, `service_tokens.rs` extracted to shared crate; app re-exports via `pub use jaskier_oauth::*`
- **jaskier-core**: `model_registry` extracted; `HasModelRegistryState` trait, `ModelInfo`, `ModelCache` shared across all Hydras
- **jaskier-browser**: `watchdog` extracted; `HasWatchdogState` extends `HasModelRegistryState` (supertrait chain)
- **jaskier-tools**: agent tools (git, github, vercel, fly, web_scraping, zip) + `ocr.rs` shared across apps
- **Trait hierarchy**: `HasGoogleOAuthState` -> `HasModelRegistryState` -> `HasWatchdogState`
- **Pattern**: local module -> shared crate with trait -> re-export stub in app's `state.rs`
- **Frontend**: `@jaskier/pipeline-module` (Tissaia pipeline UI), `@jaskier/settings-module` (shared settings UI), `@jaskier/i18n` (shared locales)

## Shared Crate Integration (Round 7+8+9) — as of 2026-03-12
- **jaskier-core expanded**: app_builder (tracing init, banner, shutdown signal), audit (fire-and-forget logging), router_builder (shared ~470-line Hydra router for Quad apps), sessions (CRUD, history, settings, memory, messages — replaced 1700+ per-app lines), handlers (agents, gemini_streaming, openai_streaming, system), context (ExecuteContext), circuit_breaker (3-strike with HALF_OPEN recovery), prompt (HasKnowledgeApi + fetch_knowledge_context), mcp (client + config + server), models (WitcherAgent)
- **jaskier-imaging** (NEW crate): SCRFD face detection, YOLOv8 object detection, Real-ESRGAN super-resolution, ONNX feature-gated
- **jaskier-hydra-state** (NEW crate): BaseHydraState — shared fields, constructor, trait impls for Quad Hydras (GeminiHydra, GrokHydra, OpenAIHydra, DeepSeekHydra)
- **@jaskier/hydra-app** (NEW package): shared Hydra app shell, layout, routing, top-level providers
- **New traits**: HasSessionsState, HasAgentState, HasHealthState, HasMcpState, HasMcpServerState, HasA2aState, HasKnowledgeApi, HasGeminiStreamingState, HasOpenAIStreamingState
- **R9 cleanup**: CI updated (sparse-clone verifies all 9 crates), Makefile `ci-all` target, 17 clippy collapsible-if warnings fixed in shared crates (edition 2024 let chains)

## Shared Crate Integration (Round 12) — as of 2026-03-13
- **CH BaseHydraState migration** (ARCH-001): `state.rs` refactored from ~230 lines of manual trait impls to `BaseHydraState` wrapper + `delegate_base_traits!` macro with `extra_traits: [HasAnthropicOAuthState, HasMetricsState]`
- **jaskier-core::handlers::anthropic_streaming**: `HasAnthropicStreamingState` trait + shared streaming handler extracted from CH's custom `handlers/streaming.rs`
- **jaskier-oauth::anthropic**: `HasAnthropicOAuthState` trait extracted — Anthropic MAX Plan PKCE flow now in shared crate
- **jaskier-core::metrics**: `HasMetricsState` trait + Prometheus metrics endpoint extracted to shared crate
- **jaskier-integration-tests** (NEW crate): cross-crate integration tests verifying trait chain, delegate_base_traits! macro, extra_traits extensions
- **@jaskier/memory deleted**: 205 LOC package with zero direct imports — Knowledge Graph client merged into @jaskier/hydra-app
- **Frontend**: `client.ts` migrated to shared pattern, `tsconfig.json` updated to extend @jaskier/typescript-config, E2E navigation test added
- **Current totals**: 11 shared Rust crates, 18 Cargo workspace members, 10 frontend packages, 22 Turbo packages
- **Clippy**: 0 warnings in shared crates (all 5 expect_used warnings fixed)

## AI Gateway — Skarbiec Krasnali (2026-03-14)
- **Architecture**: Unified AI Provider Gateway replacing per-provider OAuth modules (`oauth.rs`, `oauth_google.rs`, `oauth_github.rs`, `oauth_vercel.rs`, `service_tokens.rs` — all marked `#[deprecated]`)
- **Strategy**: `STRICT_PLAN_ONLY` — consumer plan subscriptions only (Claude Max, ChatGPT Plus, Gemini Advanced, X Premium+, DeepSeek, Ollama). No direct API keys in DB; all credentials managed via Jaskier Vault
- **Credential Store**: Jaskier Vault (The Sentinel) — zero-trust AES-256-GCM encryption, Bouncer pattern (`vault_delegate`) for all API calls. Backend never sees raw tokens
- **Backend modules** (6 files in `backend/src/ai_gateway/`):
  - `mod.rs` — `AiProvider` enum (Anthropic, Google, OpenAI, xAI, DeepSeek, Ollama), `ProviderConfig`, `HasAiGateway` trait
  - `vault_bridge.rs` — `VaultClient`, `HasVaultBridge` trait, retry logic, credential cache (TTL-based)
  - `handlers.rs` — 9 HTTP handlers + SSE streaming proxy for all providers
  - `oauth_flows.rs` — unified PKCE flow for Anthropic/Google/GitHub/Vercel (replaces 4 separate modules)
  - `session_manager.rs` — cookie-based auth for OpenAI/xAI consumer plans, background session refresh
  - `model_router.rs` — intelligent routing (provider selection, fallback chain, tier detection, cost optimization)
  - `vault_handlers.rs` — Vault proxy endpoints for frontend (status, provider list, credential health)
- **API endpoints**:
  - `POST /api/ai/{provider}/chat` — unified chat completion (all providers)
  - `GET /api/ai/{provider}/stream` — SSE streaming proxy (all providers)
  - `GET /api/ai/providers` — list configured providers + health status
  - `/api/vault/*` — Vault proxy (status, credentials, provider config)
- **DB migration**: `025_ai_provider_gateway.sql` — creates `ch_ai_providers` (provider metadata only — NO tokens stored in DB)
- **DB cleanup**: `026_drop_old_auth_tables.sql` — drops ch_oauth_tokens, ch_google_auth, ch_oauth_github, ch_oauth_vercel, ch_service_tokens
- **Frontend**:
  - `src/features/settings/components/AiProvidersSection.tsx` — provider cards with Vault connection status
  - `src/features/settings/components/VaultStatusSection.tsx` — Vault health, namespace browser, credential overview
  - `src/features/settings/hooks/useAiProviders.ts` — provider CRUD + health polling
  - `src/features/settings/hooks/useVaultStatus.ts` — Vault connectivity + secret counts
- **Tests**: 122 new tests across ai_gateway modules (unit + integration)
- **Deprecated modules**: `oauth.rs`, `oauth_google.rs`, `oauth_github.rs`, `oauth_vercel.rs`, `service_tokens.rs` — marked `#[deprecated(since = "4.1.0", note = "use ai_gateway")]`, will be removed in next major version

## Workspace CLAUDE.md (canonical reference)
- Full Jaskier ecosystem docs: `C:\Users\BIURODOM\Desktop\JaskierWorkspace\CLAUDE.md`
- Covers: shared patterns, cross-project conventions, backend safety rules, OAuth details, MCP, working directory, fly.io infra
- This file is a project-scoped summary; workspace CLAUDE.md is the source of truth
- Last synced: 2026-03-13 (R12 — BaseHydraState migration, @jaskier/memory deletion, new traits, integration tests)

## Browser Proxy (gemini-browser-proxy)
- **Watchdog**: `watchdog.rs` checks proxy health every 30s via `detailed_health_check()`, auto-restarts with exponential backoff (120sâ†’240sâ†’480sâ†’900s max)
- **State**: `BrowserProxyStatus` in `state.rs` â€” `Arc<RwLock<BrowserProxyStatus>>` with ~18 fields (configured, reachable, ready, workers_ready/busy, pool_size, queue_length, consecutive_failures, backoff_level, total_restarts, last_pid)
- **Health history**: `ProxyHealthHistory` â€” ring buffer (50 events) tracking status transitions (unreachableâ†’restart_initiatedâ†’online)
- **Endpoints**: `GET /api/browser-proxy/status`, `GET /api/browser-proxy/history`, `POST /api/browser-proxy/login`, `GET /api/browser-proxy/login/status`, `POST /api/browser-proxy/reinit`, `POST /api/browser-proxy/logout`
- **Env vars**: `BROWSER_PROXY_URL` (enables proxy), `BROWSER_PROXY_DIR` (path to proxy project for auto-restart)
- **Frontend**: `BrowserProxySection.tsx` (settings), `BrowserProxyBadge` in `StatusFooter.tsx` (green/red/yellow dot, pulse when busy)
- **Agent tool**: `generate_image` â€” sends image+prompt to proxy for Gemini browser-based generation

## Browser Proxy â€” Persistent Context Architecture
- **Context mode**: `launchPersistentContext` (NOT `storageState`) â€” `storageState` alone does NOT preserve Google sessions (cookies expired/invalidated server-side)
- **Login**: `npm run login:persistent` creates `browser-profile/` directory with full Chrome profile (cookies, localStorage, IndexedDB)
- **Workers**: share single persistent context â€” 4 pages within 1 browser process (not 4 separate contexts)
- **Profile backup**: `browser-profile/` copied to `worker-profile/` at init for crash recovery
- **Login detection**: positive signal â€” chat input textarea visible on AI Studio page (NOT absence of "Sign in" button, which is unreliable)
- **Session check**: Windows Task Scheduler `GeminiProxySessionCheck` runs every 6h to verify session validity
- **Why persistent context**: Google sets `httpOnly` + `secure` + `SameSite` cookies that `storageState` JSON export cannot fully capture; persistent context keeps the actual Chrome cookie DB intact

## Jaskier Vault v8 (Zero-Trust Dynamic Credentials)
- **MCP Server**: `@jaskier/vault-mcp` v8.0.0 — `services/JaskierVaultMCP/index.js` (stdio transport)
- **Storage**: `~/.gemini/sejf_krasnali.enc` (AES-256-GCM, scrypt KDF, machine-key derived)
- **Audit log**: `~/.gemini/sejf_krasnali_audit.log` (structured JSON, optional Loki push)
- **UI Dashboard**: port :5190 (`npm run ui` in services/JaskierVaultMCP/) — 4 tabs: Vault/Audit/ACL/Auto-Rotacja
- **Honeypot**: port :5433 (fake PostgreSQL trap — NEVER connect to this port)
- **Client library**: `@jaskier/vault-client` — framework-agnostic types, HTTP client, constants

### Vault v8 Features (Task 10 — Dynamic Credentials)
1. **Ephemeral Tickets (JIT)**: `vault_request_ticket` creates short-lived tickets (default TTL: 120s, max: 3600s). Tickets stored in-memory, auto-cleaned every 30s
2. **HTTP Bouncer**: `vault_delegate` proxies HTTP requests with auto Bearer injection. Token NEVER exposed to agent. Supports ticket-based or direct namespace+service auth. SSRF protection blocks localhost/private IPs
3. **Namespace ACL**: `vault_acl` configures per-agent namespace isolation (e.g. Claude → ch_*, Gemini → gh_*). No ACL = open access (backward compatible). Stored in `__vault_acl__` internal namespace
4. **Auto-Rotation**: `vault_auto_rotate` registers services for scheduled credential rotation (min 60s interval). Rotation check runs every 60s. Config stored in `__vault_rotation__` internal namespace
5. **Audit System**: All vault operations logged with structured JSON (timestamp, action, agent, namespace, service, result, meta). Optional Loki push via `LOKI_PUSH_URL` + `GRAFANA_TOKEN` env vars
6. **SSRF Protection**: `vault_delegate` blocks requests to localhost, private IP ranges, metadata endpoints
7. **Ticket fingerprinting**: ticketIds are SHA-256 hashed in audit logs (never stored raw)

### Vault Rules (MANDATORY for all agents)
1. **NIGDY nie pobieraj tokenów przy użyciu `vault_get unmask=true`** — zawsze używaj `vault_delegate` (Bouncer) do komunikacji z API
2. **NIGDY nie zapisuj surowych haseł/tokenów** w plikach, logach ani czacie — natychmiast zapisuj przez `vault_set`
3. **Zawsze używaj `vault_delegate`** do zapytań REST API (GitHub, OpenAI, HuggingFace, Vercel, Fly.io, WOD2021) — Vault automatycznie wstrzykuje Bearer token
4. **Na początku skomplikowanych zadań** wywołaj `vault_context_inject` aby poznać strukturę namespace'ów i dostępne sekrety
5. **Przy refaktoringu kodu DB/credentials** używaj `profile: "dummy"` — zwraca fałszywe dane, chroni produkcję
6. **Port 5433 to Honeypot** — NIGDY nie odpytuj go diagnostycznie, prawdziwy PostgreSQL jest na porcie z `DATABASE_URL`
7. **Jeśli Vault zwróci `ANOMALY_DETECTED`** — natychmiast przerwij operacje, zaloguj incydent, zapytaj użytkownika
8. **Podawaj `agent` parameter** we wszystkich vault_* callach — umożliwia ACL enforcement i audyt

### Vault Tools (10 narzędzi MCP)
- `vault_get` — odczyt sekretu (domyślnie maskowany, unmask=false)
- `vault_set` — zapis sekretu (namespace/service/data)
- `vault_delegate` — **HTTP Bouncer** (Zero-Trust proxy z auto Bearer injection + SSRF protection)
- `vault_request_ticket` — czasowy bilet dostępu (TTL 1-3600s, domyślnie 120s)
- `vault_acl` — **kontrola dostępu** do namespace per agent (set/get/remove)
- `vault_auto_rotate` — **auto-rotacja** poświadczeń (register/unregister/list/trigger)
- `vault_list` — lista namespace + serwisów (filtrowana przez ACL)
- `vault_backup` — zanonimizowana kopia zapasowa
- `vault_panic` — awaryjne zniszczenie vault (nieodwracalne)
- `vault_rotate_cookies` — odświeżanie cookies (z Zod + ACL)

### Bouncer Workflow (vault_delegate)
```
Agent → vault_delegate(url, method, namespace, service, agent="claude")
  → SSRF check (block localhost/private IPs)
  → ACL check (agent has namespace access?)
  → Vault decrypt → extract token (access_token|token|api_key|bearer|cookie|jwt)
  → axios(url, {headers: {Authorization: Bearer <token>}})
  → HTTP response → return JSON to agent (token NEVER exposed)
```

### JIT Ticket Workflow (vault_request_ticket + vault_delegate)
```
1. vault_request_ticket(namespace, service, ttl=120, agent="claude") → ticketId (32-char hex)
2. vault_delegate(url, method, ticketId=ticketId) → HTTP response (repeatable within TTL)
3. Ticket auto-expires → subsequent calls fail with "Ticket expired"
4. Expired tickets cleaned every 30s
```

### ACL Workflow (vault_acl)
```
1. vault_acl(action="set", agent_name="claude", namespaces=["ch_ai_providers", "default", "cookies"])
2. vault_acl(action="set", agent_name="gemini", namespaces=["gh_credentials", "default"])
3. vault_acl(action="set", agent_name="*", namespaces=["default"])  // wildcard
4. vault_get(service="github_token", agent="grok") → ACL denied (grok not in rules)
```

### Auto-Rotation Workflow (vault_auto_rotate)
```
1. vault_auto_rotate(action="register", namespace="cookies", service="google_session", interval=21600)
2. Background scheduler checks every 60s, rotates when interval elapsed
3. vault_auto_rotate(action="list") → shows all registered services + status
4. vault_auto_rotate(action="trigger", namespace="cookies", service="google_session") → manual trigger
```

### Skill: `/vault`
- User-invocable skill at `.claude/skills/vault/SKILL.md`
- Full reference for Bouncer, tickets, ACL, rotation, anomaly handling, dummy profile

## Swarm IPC — Cross-Agent Communication Protocol (Task 14, 2026-03-14)
- **Shared crate**: `jaskier-swarm` in `crates/jaskier-swarm/` — protocol types, registry, orchestrator, Axum handlers
- **Protocol types**: SwarmPeer, SwarmTask, SwarmResult, SwarmEvent, SwarmMessage, DelegateRequest
- **OrchestrationPattern**: parallel, sequential, review, hierarchical, fan_out
- **SwarmRegistry**: Auto-discovers Hydra instances via `/api/health` probes (ports 8080-8085), JoinSet concurrent probing, 30s background loop
- **SwarmOrchestrator**: Multi-agent task execution — parallel (all targets simultaneously), sequential (chain output→input), review (worker+reviewer), builds on A2A `/a2a/message/send`
- **HasSwarmHub trait**: `swarm_registry()`, `swarm_orchestrator()`, `swarm_tasks()`, `swarm_event_tx()`, `swarm_db()`, `swarm_self_id()`
- **API endpoints**: `GET /api/swarm/discover`, `GET /api/swarm/peers`, `POST /api/swarm/delegate`, `GET /api/swarm/tasks`, `GET /api/swarm/tasks/{id}`, `GET /api/swarm/events` (SSE)
- **CH integration**: `swarm.rs` module, `SwarmState` on `AppState`, discovery loop spawned at startup
- **MCP tool**: `swarm_delegate_task` (prompt, pattern, targets, timeout_secs, attachments)
- **Multimodal attachments** (Task 33): `SwarmAttachment` type (content_type, url, name), SSE events `AttachmentReceived`/`MediaStreamChunk`, sequential forwarding of attachments between agents, review prompt with attachment context
- **DB migration**: `033_swarm_ipc.sql` — `ch_swarm_tasks` table (pattern, source_peer, target_peers JSONB, results JSONB), `036_swarm_attachments.sql` — attachments JSONB column
- **Frontend**: `SwarmView.tsx` with `@xyflow/react` agent network graph, `useSwarm.ts` hook with SSE events, peer discovery, task delegation with attachments (URL input, MIME detection, chips), `SwarmBuilder.tsx` with `MediaEdge` edge type
- **Tests**: 19 unit tests in jaskier-swarm crate (protocol, orchestrator, handlers, attachment extraction)
- **Known peers**: claudehydra(:8082), geminihydra(:8081), grokhydra(:8084), openaihydra(:8083), deepseekhydra(:8085), tissaia(:8080)

## CRDT Real-time Collaboration (Task 19, 2026-03-14)
- **Shared crate**: `jaskier-collab` in `crates/jaskier-collab/` — Yrs (Rust Yjs port) CRDT engine, WebSocket sync, GC
- **CRDT engine**: `yrs` v0.21 (Yjs for Rust) — conflict-free replicated data types, tombstone GC, state vectors
- **CollabDocument**: thread-safe Yrs Doc wrapper with awareness tracking (cursor positions, peer presence)
- **CollabHub**: room management, CRDT update broadcasting, debounced save every 5s to PostgreSQL
- **HasCollabState trait**: `collab_hub()`, `collab_db()`, `crdt_table()`, `collab_app_id()`
- **Sync protocol**: `SyncMessage` enum — `FullState`, `Update`, `SyncStep1/2`, `AwarenessUpdate`
- **GC worker**: `CrdtGarbageCollector` — compacts documents >64KB with no active peers every 5 minutes
- **Idle cleanup**: rooms with 0 peers for >30 minutes auto-closed
- **DB migration**: `034_crdt_documents.sql` — `ch_crdt_documents` table (BYTEA state, version, active_peers)
- **API endpoints**:
  - `GET /ws/sync/{app}/{doc_key}` — WebSocket CRDT document sync
  - `GET /api/collab/stats` — collaboration statistics (active rooms, peers, document sizes)
  - `GET /api/collab/rooms` — list active rooms
  - `GET /api/collab/events` — SSE stream (peer_joined, peer_left, document_saved, gc_completed)
- **CH integration**: `collab.rs` module, `CollabState` on `AppState`, `HasCollabState` impl
- **Frontend**:
  - `useCollabDocument` hook — Yjs Doc + y-websocket provider, awareness, Y.UndoManager
  - `useCollabStats` hook — TanStack Query polling (5s)
  - `CollabView` — collaborative text editor with live cursors, undo/redo, room stats
  - `CollabCursors` — peer presence indicators (name, color, AI badge)
  - `CollabStatusBadge` — connection status (connected/connecting/disconnected)
- **View**: `collab` in ViewRouter, Sidebar nav with Users icon
- **Enterprise features**: session-isolated Y.UndoManager, awareness protocol, automatic reconnect
- **Tests**: 10 unit tests in jaskier-collab crate (document CRUD, concurrent merges, awareness, GC, serialization)

## WASM Edge Computing (Task 20, 2026-03-14)
- **Rust crate**: `jaskier-wasm-core` in `crates/jaskier-wasm-core/` — PII masking, token counting, compiled to WebAssembly
- **PII masking**: email, credit cards, PESEL (checksum validated), phone numbers, NIP (checksum validated), IBAN — all via compiled regex
- **Token counter**: cl100k_base heuristic approximation (~95% accuracy), batch support
- **WASM build**: `wasm-pack build --target web --release` → `pkg/` (1MB binary + 16KB JS glue)
- **SIMD build**: `RUSTFLAGS="-C target-feature=+simd128" wasm-pack build --features simd` → `pkg-simd/`
- **wasm-opt flags**: `--enable-bulk-memory --enable-simd` (required for Rust 2024 edition)
- **TS package**: `@jaskier/wasm-worker` in `packages/wasm-worker/` — `WasmClient` class, Web Worker wrapper, Cache API
- **Web Worker**: all WASM ops run in dedicated worker thread (0% main thread blocking, 60 FPS guaranteed)
- **Cache**: Service Worker Cache API caching of `.wasm` binaries (0ms load on revisit)
- **React hook**: `useWasmWorker()` in `src/shared/hooks/useWasmWorker.ts` — singleton client, ref-counted lifecycle
- **Dashboard**: `WasmEdgePanel` in Settings — module status, PII masking demo, token counter, benchmark, cache info
- **Vite plugins**: `vite-plugin-wasm` + `vite-plugin-top-level-await` — PWA globPatterns includes `*.wasm`
- **Deploy**: `public/wasm/jaskier_wasm_core.js` + `jaskier_wasm_core_bg.wasm` (served as static assets)
- **Build scripts**: `build.sh` (standard), `deploy.sh` (build + copy to all Hydra apps)
- **Tests**: 23 Rust unit tests (PII masking, tokenizer, PESEL/NIP checksum validation, 50k char performance)

## Semantic Cache & Context Compression (Task 21, 2026-03-14)
- **Backend module**: `backend/src/semantic_cache/` — 5 files (mod.rs, qdrant.rs, embeddings.rs, compressor.rs, handlers.rs)
- **Semantic Router**: Intercepts AI queries, checks Qdrant (port 6333) for cosine similarity
  - **Exact hit** (>= 95%): returns cached response directly — zero LLM API cost
  - **Partial hit** (85-95%): injects cached response as few-shot example ("Historyczny przykład rozwiązania")
  - **Miss** (<85%): proceeds normally, caches the response for future queries
- **Qdrant Client** (`qdrant.rs`): REST API client (reqwest-based, no external crate)
  - Collection: `semantic_cache` (cosine distance, 3072-dim vectors)
  - Ops: ensure_collection, search, upsert, scroll, delete_by_filter, update_payload
  - Payload indexes: ttl_expires_at, git_commit_hash, provider, model, hit_count
- **Embedding Client** (`embeddings.rs`): Gemini Embedding API (`gemini-embedding-2-preview`, 3072 dims)
  - Credential chain: explicit key → GOOGLE_API_KEY → GEMINI_API_KEY env vars
- **AST Compressor** (`compressor.rs`): Tree-Sitter based code compression
  - Strips function/method bodies, replaces with `/* body omitted */` (Python: `... # body omitted`)
  - Supports: Rust, TypeScript, JavaScript, Python, Go
  - Regex fallback when Tree-Sitter parsing fails
  - 5 unit tests (detect_language, compress_rust, compress_python, preserves_imports, unknown_language)
- **TTL/Invalidation**: 24h default TTL, git-commit-based invalidation, background cleanup every 5 minutes
- **Metrics**: Lock-free atomic counters (total_queries, exact_hits, partial_hits, misses, tokens_saved, cost_saved)
  - Prometheus output integrated via `extra_metrics_lines()` in HasMetricsState
  - EMA-smoothed average search latency tracking
- **API endpoints** (8):
  - `GET /api/semantic-cache/stats` — metrics + Qdrant collection info
  - `GET /api/semantic-cache/health` — Qdrant + embedding health check
  - `GET /api/semantic-cache/config` — current configuration
  - `PATCH /api/semantic-cache/config` — update TTL, thresholds, enabled flag
  - `GET /api/semantic-cache/entries` — list cached entries (paginated scroll)
  - `DELETE /api/semantic-cache/entries/{id}` — delete specific entry
  - `POST /api/semantic-cache/invalidate` — invalidate by git commit or flush all
  - `POST /api/semantic-cache/compress` — compress code on demand (AST-aware)
- **DB migration**: `034_semantic_cache.sql` — ch_semantic_cache_config (singleton), ch_semantic_cache_metrics (time-series), ch_compression_stats
- **State**: `SemanticCacheState` on `AppState`, `HasSemanticCache` trait, `spawn_ttl_cleanup_loop()` in main.rs
- **Frontend**: `SemanticCacheView.tsx` — dashboard with stats cards (hit rate, cost saved, latency, total queries), hit/miss distribution bar, health badges, config panel, cached entries list with delete, flush cache button
- **Hook**: `useSemanticCache.ts` — TanStack Query (useCacheStats 10s, useCacheHealth 30s, useCacheConfig, useCacheEntries, useUpdateConfig, useDeleteEntry, useInvalidateCache, useCompressCode)
- **View**: `semantic-cache` in ViewRouter, Sidebar nav with Brain icon

## Swarm Sandbox Environment (Task 32, 2026-03-15)
- **Architecture**: Docker-based isolation for safe code execution by AI agents, with process fallback when Docker unavailable
- **Backend module**: `backend/src/sandbox.rs` — SandboxState, Docker container lifecycle, resource limits, cleanup loop
- **Trait**: `HasSandboxState` on `AppState` — `sandbox()`, `sandbox_db()`
- **Languages**: Node.js (node:22-alpine), Python (python:3.13-alpine), Rust (rust:1.87-alpine), Bash (alpine:3.21)
- **Security**: `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--network=none`, `--pids-limit=64`, memory/CPU limits
- **API endpoints** (7):
  - `GET /api/sandbox/health` — Docker status, active sessions, fallback mode
  - `POST /api/sandbox/create` — create persistent sandbox session (Docker container)
  - `POST /api/sandbox/execute` — execute code (ephemeral or in session)
  - `GET /api/sandbox/sessions` — list active sessions
  - `GET /api/sandbox/sessions/{id}` — session details
  - `DELETE /api/sandbox/sessions/{id}` — destroy session + container
  - `GET /api/sandbox/executions` — recent execution history
- **MCP tool**: `sandbox_execute_code` — available to AI agents for testing code before applying changes
- **DB migration**: `035_sandbox_environment.sql` — ch_sandbox_sessions, ch_sandbox_executions
- **Frontend**:
  - `SandboxPanel.tsx` — code editor, language selector, execution output, session management
  - `useSandbox.ts` — sandbox API calls, health check, session CRUD
  - Integrated as "Sandbox" tab in SwarmView (3rd tab: Monitoring | Builder | Sandbox)
  - `SandboxNode` in SwarmBuilder — draggable sandbox nodes (Node.js/Python/Bash)
- **Cleanup**: background loop every 5 minutes, removes idle sessions >30 min
- **Tests**: 9 unit tests (language images, run commands, resource limits, state lifecycle, cleanup)

## Memory Pruning — Self-Reflection & Knowledge Graph Cleanup (Task 31, 2026-03-15)
- **Architecture**: Background watchdog + manual trigger for Knowledge Graph pruning, embedding-based similarity clustering, MCP hipokamp integration
- **Backend module**: `backend/src/memory_pruning.rs` — MemoryPruningState, PruningConfig, PruningMetrics, execute_pruning_cycle, spawn_pruning_watchdog
- **Trait**: `HasMemoryPruning` on `AppState` — `memory_pruning()`, `pruning_db()`, `mcp_client()`
- **Algorithm**: Fetch entities from hipokamp MCP → generate Gemini embeddings → cosine clustering (threshold-based) → merge duplicates → delete redundant → audit log + notification
- **Self-Reflection prompt**: Builds per-cluster analysis prompt (PL) for evaluating duplicates, contradictions, obsolescence
- **API endpoints** (5):
  - `POST /api/memory/prune` — trigger manual pruning cycle (202 ACCEPTED, async)
  - `GET /api/memory/prune/stats` — metrics + running status
  - `GET /api/memory/prune/history` — pruning cycle history (limit param)
  - `GET /api/memory/prune/details/{cycle_id}` — detailed log entries for a cycle
  - `GET/PATCH /api/memory/prune/config` — pruning configuration (threshold, interval, max entries)
- **DB migration**: `038_memory_pruning.sql` — ch_memory_pruning_log, ch_memory_pruning_config (singleton), ch_memory_pruning_cycles
- **Metrics**: Lock-free atomics (total_cycles, deleted, merged, kept, tokens_saved, clusters_found, last_cycle_ms) + Prometheus output
- **Frontend**: `MemoryPruningPanel` — 4th tab in SwarmView (Brain icon, purple accent), stat cards, config panel, cycle history with expandable details
- **Hook**: `useMemoryPruning.ts` — TanStack Query (usePruningStats 10s, usePruningHistory 30s, usePruningConfig, usePruningDetails, useUpdatePruningConfig, useTriggerPrune)
- **Watchdog**: Configurable interval (default 1h), auto-disabled when config.enabled=false, 60s startup delay
- **Audit**: All pruning actions logged to ch_audit_log + MCP notification via grzankarz_show_notification
- **Tests**: 13 unit tests (cosine similarity, clustering, token estimation, metrics, config, prompt building, Prometheus output)

## Predictive UI Pre-fetching (Task 34, 2026-03-15)
- **Two strategies**: AI-driven WS hints + hover-based nav prefetch
- **Backend**: `detect_view_hints()` in `streaming.rs` — keyword analysis of prompt text (PL+EN), emits `WsServerMessage::ViewHint { views }` after `Start`
- **Keywords**: statystyk→analytics, ustawieni→settings, log/błęd→logs, agent/narzędzi→agents, delegacj→delegations, rój/swarm→swarm, cache/semantyczn→semantic-cache, kolaboracj/crdt→collab
- **REST fallback**: `POST /api/prefetch/hints` — for NDJSON streaming clients (returns `{ views: [...] }`)
- **Frontend hook**: `usePredictivePrefetch.ts` — listens to WS `view_hint` events via CustomEvent bus, triggers `import()` + `queryClient.prefetchQuery()`
- **Hover prefetch**: Sidebar nav buttons have `onPointerEnter`/`onPointerLeave` — 150ms debounce, dedup via `prefetchedChunks` Set
- **Query prefetch**: analytics/summary, logs/backend, agents, settings, swarm/peers, semantic-cache/stats
- **Zod schema**: `wsViewHintSchema` added to `wsServerMessageSchema` discriminated union
- **WS integration**: `parseServerMessage()` in `useWebSocketChat.ts` dispatches `viewhint` CustomEvent on `view_hint` type
- **Import map**: `viewImports` in `main.tsx` — shared factory functions for `lazy()` calls, duplicated in hook to avoid circular dep
- **Zero overhead**: chunks fetched at most once (Set tracking), queries respect staleTime, no network waste

