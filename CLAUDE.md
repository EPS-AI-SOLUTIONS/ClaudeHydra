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
- Key modules: `handlers.rs` (system prompt + tool defs), `state.rs` (AppState + LogRingBuffer), `models.rs`, `logs.rs` (4 log endpoints â€” backend/audit/flyio/activity), `tools/` (mod.rs + fs_tools.rs + pdf_tools.rs + zip_tools.rs + image_tools.rs + git_tools.rs + github_tools.rs + vercel_tools.rs + fly_tools.rs), `model_registry.rs` (dynamic model discovery), `browser_proxy.rs` (proxy status + health check + login/logout handlers), `watchdog.rs` (proxy auto-restart + health history), `oauth.rs` (Anthropic OAuth PKCE), `oauth_google.rs` (Google OAuth PKCE + API key), `oauth_github.rs` (GitHub OAuth), `oauth_vercel.rs` (Vercel OAuth), `service_tokens.rs` (Fly.io PAT), `mcp/` (client.rs + server.rs + config.rs)
- DB: `claudehydra` on localhost:5433 (user: claude, pass: claude_local)
- Tables: ch_settings, ch_sessions, ch_messages, ch_tool_interactions, ch_model_pins, ch_oauth_tokens, ch_google_auth, ch_oauth_github, ch_oauth_vercel, ch_service_tokens, ch_mcp_servers, ch_mcp_discovered_tools, ch_audit_log, ch_prompt_history

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
- **Current totals**: 9 shared Rust crates, 16 Cargo workspace members, 12 frontend packages, 24 Turbo packages
- **Tests**: 684 passing across workspace (448 shared crate + 236 app backend), 6 ignored

## Workspace CLAUDE.md (canonical reference)
- Full Jaskier ecosystem docs: `C:\Users\BIURODOM\Desktop\JaskierWorkspace\CLAUDE.md`
- Covers: shared patterns, cross-project conventions, backend safety rules, OAuth details, MCP, working directory, fly.io infra
- This file is a project-scoped summary; workspace CLAUDE.md is the source of truth
- Last synced: 2026-03-12 (Round 9 CI/Dockerfile/Makefile unification, clippy cleanup)

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

## Jaskier Vault (Zero-Trust Credential Management)
- **MCP Server**: `jaskier-vault` — `JaskierVaultMCP/index.js` (stdio transport)
- **Storage**: `~/.gemini/jaskier_vault.enc` (AES-256-GCM, machine-key derived)
- **Audit log**: `~/.gemini/jaskier_vault_audit.log`
- **UI Dashboard**: port :5190 (`npm run ui` in JaskierVaultMCP/)
- **Honeypot**: port :5433 (fake PostgreSQL trap — NEVER connect to this port)

### Vault Rules (MANDATORY for all agents)
1. **NIGDY nie pobieraj tokenów przy użyciu `vault_get unmask=true`** — zawsze używaj `vault_delegate` (Bouncer) do komunikacji z API
2. **NIGDY nie zapisuj surowych haseł/tokenów** w plikach, logach ani czacie — natychmiast zapisuj przez `vault_set`
3. **Zawsze używaj `vault_delegate`** do zapytań REST API (GitHub, OpenAI, HuggingFace, Vercel, Fly.io, WOD2021) — Vault automatycznie wstrzykuje Bearer token
4. **Na początku skomplikowanych zadań** wywołaj `vault_context_inject` aby poznać strukturę namespace'ów i dostępne sekrety
5. **Przy refaktoringu kodu DB/credentials** używaj `profile: "dummy"` — zwraca fałszywe dane, chroni produkcję
6. **Port 5433 to Honeypot** — NIGDY nie odpytuj go diagnostycznie, prawdziwy PostgreSQL jest na porcie z `DATABASE_URL`
7. **Jeśli Vault zwróci `ANOMALY_DETECTED`** — natychmiast przerwij operacje, zaloguj incydent, zapytaj użytkownika

### Vault Tools (11 narzędzi)
- `vault_get` — odczyt sekretu (domyślnie maskowany)
- `vault_set` — zapis sekretu (namespace/service/data)
- `vault_delegate` — **HTTP Bouncer** (Zero-Trust proxy z auto Bearer injection)
- `vault_request_ticket` — czasowy bilet dostępu (TTL w sekundach)
- `vault_search` — szukanie po nazwie/wzorcu
- `vault_sql` — zapytania AlaSQL na strukturze vault
- `vault_context_inject` — manifest struktury (do system prompt)
- `vault_osint_scan` — skanowanie wycieków danych
- `vault_share` — współdzielenie między agentami (symulacja)
- `vault_panic` — awaryjne zniszczenie vault
- `vault_ca_issue` — generowanie certyfikatów

### Bouncer Workflow (vault_delegate)
```
Agent → vault_delegate(url, method, namespace, service)
  → Vault decrypt → extract token → axios(url, {headers: {Authorization: Bearer <token>}})
  → HTTP response → return JSON to agent (token NEVER exposed to agent)
```

### Ticket Workflow (vault_request_ticket + vault_delegate)
```
1. vault_request_ticket(namespace, service, ttl=300) → ticketId (32-char hex)
2. vault_delegate(url, method, ticketId=ticketId) → HTTP response (repeatable for TTL duration)
3. Ticket auto-expires → subsequent calls fail with "Ticket expired"
```

### Skill: `/vault`
- User-invocable skill at `.claude/skills/vault/SKILL.md`
- Full reference for Bouncer, tickets, anomaly handling, dummy profile

