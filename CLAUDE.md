# ClaudeHydra v4 -- AI Swarm Control Center

## Quick Start
- `npm run dev` -- port 5199
- `npx tsc --noEmit` -- type check

## Architecture
- Pure Vite SPA -- React 19 + Zustand 5
- Views: home, chat, agents, history, settings, logs
- ViewRouter in `src/main.tsx` with AnimatePresence transitions
- Sidebar: `src/components/organisms/Sidebar.tsx` (flat nav, session manager with rename/delete)

## Key Files
- `src/features/home/components/HomePage.tsx` -- WelcomeScreen (ported from GeminiHydra)
- `src/shared/hooks/useViewTheme.ts` -- full ViewTheme (replaced v3 simplified version)
- `src/stores/viewStore.ts` -- ChatSession type, chatSessions, openTabs, activeSessionId
- `src/features/chat/components/OllamaChatView.tsx` -- main chat interface
- `backend/src/ai_gateway/` -- unified AI provider gateway (Skarbiec Krasnali)

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
- Route syntax: `{id}` (NOT `:id` -- axum 0.8 breaking change)
- Entry point: `backend/src/lib.rs` -> `create_router()` builds all API routes
- Key modules: `handlers.rs`, `state.rs` (AppState + LogRingBuffer), `models.rs`, `logs.rs` (4 log endpoints), `tools/` (fs, pdf, zip, image, git, github, vercel, fly), `model_registry.rs`, `browser_proxy.rs`, `watchdog.rs`, `ai_gateway/` (unified provider gateway), `mcp/` (client + server + config), `semantic_cache/`, `sandbox.rs`, `memory_pruning.rs`, `swarm.rs`, `collab.rs`, `profiling.rs`
- DB: `claudehydra` on localhost:5433 (user: claude, pass: claude_local)
- Tables: ch_settings, ch_sessions, ch_messages, ch_tool_interactions, ch_model_pins, ch_ai_providers, ch_mcp_servers, ch_mcp_discovered_tools, ch_audit_log, ch_prompt_history, ch_swarm_tasks, ch_crdt_documents, ch_sandbox_sessions, ch_sandbox_executions, ch_semantic_cache_config, ch_semantic_cache_metrics, ch_compression_stats, ch_memory_pruning_log, ch_memory_pruning_config, ch_memory_pruning_cycles, ch_profiling_snapshots

## Backend Local Dev
- Wymaga Docker Desktop (PostgreSQL container)
- Image: `postgres:17-alpine` (NO pgvector needed)
- Start: `docker compose up -d` (from `backend/`)
- Backend: `DATABASE_URL="postgresql://claude:claude_local@localhost:5433/claudehydra" cargo run --release`
- Env vars: `DATABASE_URL` (required), `ANTHROPIC_API_KEY` (required), `GOOGLE_API_KEY` (optional), `PORT` (default 8082)

## Fly.io Deploy
- App: `claudehydra-v4-backend` | Region: `arn` | VM: shared-cpu-1x 256MB
- Deploy: `cd backend && fly deploy`
- Dockerfile: multi-stage (rust builder -> debian:trixie-slim runtime)
- DB: Fly Postgres `jaskier-db` -> database `claudehydra_v4_backend` (NOT `claudehydra`!)
- Shared DB cluster `jaskier-db` hosts: geminihydra_v15_backend, claudehydra_v4_backend, tissaia_v4_backend
- Secrets: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `AUTH_SECRET` (set via `fly secrets set`)
- auto_stop_machines=stop, auto_start_machines=true, min_machines=0 (scales to zero)
- Health: `curl https://claudehydra-v4-backend.fly.dev/api/health`

## Migrations
- Folder: `backend/migrations/`
- Format: YYYYMMDDNN (unique 10-digit prefix -- date + 2-digit sequence number within date)
- All migrations MUST be idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING) -- SQLx checks checksums
- All migration files MUST use LF line endings (not CRLF) -- `.gitattributes` enforces this
- **Gotcha**: Line ending changes (CRLF<->LF) cause checksum mismatch -> `VersionMismatch` panic. Fix: reset `_sqlx_migrations` table
- **Gotcha**: Fly Postgres (`jaskier-db`) does NOT have pgvector. Use `DO $$ ... EXCEPTION WHEN OTHERS` to skip gracefully

## Dynamic Model Registry
- At startup `model_registry::startup_sync()` fetches all models from Anthropic + Google APIs
- Caches in `AppState.model_cache` (TTL 1h, refreshed via `/api/models/refresh`)
- Auto-selects best model per tier: **commander** (opus), **coordinator** (sonnet), **executor** (haiku)
- Pin override: `POST /api/models/pin` saves to `ch_model_pins` (priority 1, above auto-selection)
- API: `GET /api/models`, `POST /api/models/refresh`, `POST/DELETE /api/models/pin`

## Agent Tools (20+ tools via shared crates)
- **Filesystem**: `read_file`, `list_directory`, `write_file`, `search_in_files`
- **PDF/ZIP**: `read_pdf`, `list_zip`, `extract_zip_file`
- **Image**: `analyze_image` (Claude Vision, 5MB limit)
- **Web Scraping v2**: `fetch_webpage` (SSRF protection, HTML->markdown, retry+backoff), `crawl_website` (robots.txt, concurrent, dedup)
- **Git**: `git_status`, `git_log`, `git_diff`, `git_branch`, `git_commit` (NO push)
- **GitHub**: `github_list_repos`, `github_get_repo`, `github_list_issues`, `github_get_issue`, `github_create_issue`, `github_create_pr`
- **Vercel**: `vercel_list_projects`, `vercel_deploy`, `vercel_get_deployment`
- **Fly.io**: `fly_list_apps`, `fly_get_status`, `fly_get_logs` (read-only)
- **MCP proxy**: `mcp_{server}_{tool}` -- routed via `state.mcp_client.call_tool()`
- **Sandbox**: `sandbox_execute_code` -- Docker-isolated code execution
- **Swarm**: `swarm_delegate_task` -- cross-agent task delegation with attachments

## "Co dalej?" -- Follow-up Task Proposals
- System prompt rule: after every completed task, agent MUST add `## Co dalej?` with 5 numbered follow-up tasks
- Works on both streaming and non-streaming endpoints

## Logs View (F21)
- Frontend: `LogsView.tsx` (4 tabs: Backend/Audit/Fly.io/Activity) + `useLogs.ts` (5s polling)
- Backend: `logs.rs` -- 4 endpoints, `LogRingBuffer` (capacity 1000), custom tracing Layer
- View type: `| 'logs'` in viewStore

## Prompt History (Jaskier Shared Pattern)
- **Hook**: `usePromptHistory.ts` -- `{ promptHistory, addPrompt }`
- **Storage**: DB `ch_prompt_history` (max 200, auto-cleanup) + localStorage cache
- **Endpoints**: `GET/POST/DELETE /api/prompt-history`
- **Arrow Up/Down** in ChatInput -- bash-like prompt history navigation with draft preservation

## Shared Crate Integration (Rounds 5-12, consolidated)
- **jaskier-core**: app_builder, audit, router_builder (~470-line shared router), sessions (replaced 1700+ per-app lines), handlers (agents, streaming for Gemini/OpenAI/Anthropic), context, circuit_breaker, prompt, mcp, models, metrics (`HasMetricsState`)
- **jaskier-oauth**: Anthropic (`HasAnthropicOAuthState`), Google, GitHub, Vercel OAuth + service_tokens -- all extracted to shared crate
- **jaskier-browser**: watchdog extracted; `HasWatchdogState` extends `HasModelRegistryState`
- **jaskier-tools**: agent tools (git, github, vercel, fly, web_scraping, zip) + ocr shared across apps
- **jaskier-imaging**: SCRFD face detection, YOLOv8 object detection, Real-ESRGAN super-resolution (ONNX feature-gated)
- **jaskier-hydra-state**: `BaseHydraState` + `delegate_base_traits!` macro for Quad Hydras
- **jaskier-swarm**: SwarmRegistry, SwarmOrchestrator, protocol types, multimodal attachments, Axum handlers (19 tests)
- **jaskier-collab**: Yrs CRDT engine, WebSocket sync, CollabHub, GC worker (10 tests)
- **jaskier-graph**: Neo4j + Qdrant hybrid search, knowledge graph RAG (14 tests)
- **jaskier-wasm-core** v0.2: PII masking, token counting, cosine similarity, text analysis -- compiled to WASM (23+ tests)
- **jaskier-observability**: Prometheus metrics collection, Grafana dashboard provisioning, alert rules
- **jaskier-sandbox**: Docker container lifecycle, resource limits, language runtimes (9 tests)
- **jaskier-integration-tests**: cross-crate integration tests (trait chain, macro verification)
- **Frontend packages**: `@jaskier/hydra-app` (shared shell), `@jaskier/pipeline-module`, `@jaskier/settings-module`, `@jaskier/i18n`, `@jaskier/wasm-worker`, `@jaskier/vault-client`
- **CH state.rs**: `BaseHydraState` wrapper + `delegate_base_traits!` with `extra_traits: [HasAnthropicOAuthState, HasMetricsState]`
- **Trait hierarchy**: `HasGoogleOAuthState` -> `HasModelRegistryState` -> `HasWatchdogState` (supertrait chain)
- **Current totals**: 18 shared Rust crates, 21+ Cargo workspace members, 12 frontend packages

## AI Gateway -- Skarbiec Krasnali (2026-03-14)
- **Architecture**: Unified AI Provider Gateway -- all credentials via Jaskier Vault (zero-trust, Bouncer pattern)
- **Strategy**: `STRICT_PLAN_ONLY` -- consumer plans only (Claude Max, ChatGPT Plus, Gemini Advanced, X Premium+, DeepSeek, Ollama)
- **Backend** (6 files in `backend/src/ai_gateway/`): mod.rs (`AiProvider` enum, `HasAiGateway`), vault_bridge.rs (`VaultClient`, `HasVaultBridge`), handlers.rs (9 handlers + SSE proxy), oauth_flows.rs (unified PKCE), session_manager.rs (cookie-based auth), model_router.rs (intelligent routing), vault_handlers.rs
- **API**: `POST /api/ai/{provider}/chat`, `GET /api/ai/{provider}/stream`, `GET /api/ai/providers`, `/api/vault/*`
- **DB**: `025_ai_provider_gateway.sql` (ch_ai_providers), `026_drop_old_auth_tables.sql` (cleaned legacy OAuth tables)
- **Frontend**: `AiProvidersSection.tsx`, `VaultStatusSection.tsx`, `useAiProviders.ts`, `useVaultStatus.ts`
- **Tests**: 122 tests across ai_gateway modules

## Workspace CLAUDE.md (canonical reference)
- Full Jaskier ecosystem docs: `C:\Users\BIURODOM\Desktop\JaskierWorkspace\CLAUDE.md`
- This file is project-scoped summary; workspace CLAUDE.md is the source of truth
- Last synced: 2026-03-15 (R13 -- shared crates expansion, observability, Process Compose)

## Browser Proxy (gemini-browser-proxy)
- **Watchdog**: `watchdog.rs` checks health every 30s, auto-restarts with exponential backoff (120s->900s max)
- **State**: `BrowserProxyStatus` -- ~18 fields (configured, reachable, ready, workers, failures, backoff, restarts)
- **Context mode**: `launchPersistentContext` (NOT `storageState`) -- preserves Google sessions via full Chrome profile
- **Endpoints**: `GET /api/browser-proxy/status`, `/history`, `POST /login`, `/reinit`, `/logout`
- **Frontend**: `BrowserProxySection.tsx` (settings), `BrowserProxyBadge` in StatusFooter

## Jaskier Vault v8 (Zero-Trust Dynamic Credentials)
- **MCP Server**: `@jaskier/vault-mcp` v9.0 -- `services/JaskierVaultMCP/` (stdio transport, IPFS P2P backup)
- **Storage**: `~/.gemini/sejf_krasnali.enc` (AES-256-GCM, scrypt KDF, machine-key derived)
- **UI Dashboard**: port :5190 -- 4 tabs: Vault/Audit/ACL/Auto-Rotacja
- **Honeypot**: port :5433 (fake PostgreSQL trap -- NEVER connect)
- **Client library**: `@jaskier/vault-client` -- framework-agnostic types, HTTP client, constants

### Vault v8 Features
1. **Ephemeral Tickets (JIT)**: `vault_request_ticket` (TTL 1-3600s, default 120s, auto-cleaned every 30s)
2. **HTTP Bouncer**: `vault_delegate` -- auto Bearer injection, SSRF protection, ACL-enforced
3. **Namespace ACL**: `vault_acl` -- per-agent namespace isolation
4. **Auto-Rotation**: `vault_auto_rotate` -- scheduled credential rotation (min 60s interval)
5. **Audit System**: structured JSON logging, optional Loki push
6. **IPFS P2P backup**: `vault_ipfs_backup`/`vault_ipfs_restore` -- decentralized encrypted backup (v9.0)

### Vault Rules (MANDATORY)
1. **NIGDY** `vault_get unmask=true` -- zawsze `vault_delegate` (Bouncer)
2. **NIGDY** surowych tokenow w plikach/logach -- natychmiast `vault_set`
3. **Zawsze** `vault_delegate` do REST API (GitHub, OpenAI, Vercel, Fly.io)
4. **Port 5433 to Honeypot** -- prawdziwy PostgreSQL na porcie z `DATABASE_URL`
5. **ANOMALY_DETECTED** -- przerwij operacje, zaloguj, zapytaj uzytkownika
6. **Podawaj `agent` parameter** we wszystkich vault_* callach

### Vault Tools (13 MCP tools)
- `vault_get`, `vault_set`, `vault_list`, `vault_backup`, `vault_panic`, `vault_rotate_cookies`
- `vault_delegate` (HTTP Bouncer), `vault_request_ticket` (JIT), `vault_acl` (ACL)
- `vault_auto_rotate` (rotation), `vault_ipfs_backup`, `vault_ipfs_restore`, `vault_p2p_memory`
- Skill: `/vault` at `.claude/skills/vault/SKILL.md`

## Swarm IPC -- Cross-Agent Communication (Tasks 14+33)
- **Shared crate**: `jaskier-swarm` -- protocol types, registry, orchestrator, Axum handlers
- **OrchestrationPattern**: parallel, sequential, review, hierarchical, fan_out
- **SwarmRegistry**: Auto-discovers Hydra instances via `/api/health` probes (ports 8080-8085), 30s background loop
- **Multimodal attachments** (Task 33): `SwarmAttachment` (content_type, url, name), SSE `AttachmentReceived`/`MediaStreamChunk`, sequential forwarding, review with attachment context
- **API**: `GET /api/swarm/discover`, `/peers`, `POST /api/swarm/delegate`, `GET /api/swarm/tasks`, `/tasks/{id}`, `/events` (SSE)
- **DB**: `033_swarm_ipc.sql`, `036_swarm_attachments.sql`
- **Frontend**: `SwarmView.tsx` (@xyflow/react graph), `useSwarm.ts` (SSE events, delegation with attachments)
- **Tests**: 19 unit tests (protocol, orchestrator, handlers, attachment extraction)
- **Known peers**: claudehydra(:8082), geminihydra(:8081), grokhydra(:8084), openaihydra(:8083), deepseekhydra(:8085), tissaia(:8080)

## CRDT Real-time Collaboration (Task 19)
- **Shared crate**: `jaskier-collab` -- Yrs (Rust Yjs) CRDT engine, WebSocket sync, GC
- **CollabHub**: room management, CRDT broadcasting, debounced save every 5s to PostgreSQL
- **GC**: compacts documents >64KB with no peers every 5 min, idle rooms auto-closed after 30 min
- **API**: `GET /ws/sync/{app}/{doc_key}`, `/api/collab/stats`, `/rooms`, `/events` (SSE)
- **DB**: `034_crdt_documents.sql`
- **Frontend**: `CollabView` (live cursors, undo/redo), `CollabCursors`, `CollabStatusBadge`
- **Tests**: 10 unit tests

## WASM Edge Computing (Task 20, v0.2)
- **Rust crate**: `jaskier-wasm-core` v0.2 -- PII masking, token counting, cosine similarity, text analysis
- **PII masking**: email, credit cards, PESEL (checksum), phone, NIP (checksum), IBAN
- **v0.2 additions**: `cosine_similarity` (vector comparison), `text_analysis` (word count, sentence count, readability)
- **WASM build**: `wasm-pack build --target web --release` -> `pkg/` (1MB + 16KB JS glue)
- **TS package**: `@jaskier/wasm-worker` -- Web Worker wrapper, Cache API (0ms reload)
- **React hook**: `useWasmWorker()` -- singleton client, ref-counted lifecycle
- **Dashboard**: `WasmEdgePanel` in Settings -- PII demo, token counter, benchmark, cache info
- **Tests**: 28 Rust unit tests (PII, tokenizer, similarity, text analysis, PESEL/NIP validation)

## Semantic Cache & Context Compression (Task 21)
- **Backend**: `backend/src/semantic_cache/` -- 5 files (mod.rs, qdrant.rs, embeddings.rs, compressor.rs, handlers.rs)
- **Semantic Router**: Qdrant cosine similarity -- exact hit (>=95%): cached response, partial (85-95%): few-shot injection, miss (<85%): normal + cache
- **AST Compressor**: Tree-Sitter code compression (Rust, TS, JS, Python, Go), regex fallback
- **TTL/Invalidation**: 24h default, git-commit-based invalidation, background cleanup every 5 min
- **Metrics**: atomic counters (queries, hits, misses, tokens_saved, cost_saved) + Prometheus
- **API** (8 endpoints): `/api/semantic-cache/stats`, `/health`, `/config`, `/entries`, `/invalidate`, `/compress`
- **Frontend**: `SemanticCacheView.tsx` -- stats dashboard, health badges, config panel, entries list

## Swarm Sandbox Environment (Task 32)
- **Architecture**: Docker-based isolation for AI agent code execution, process fallback when Docker unavailable
- **Languages**: Node.js, Python, Rust, Bash (all alpine-based images)
- **Security**: `--cap-drop=ALL`, `--no-new-privileges`, `--network=none`, `--pids-limit=64`
- **API** (7 endpoints): `/api/sandbox/health`, `/create`, `/execute`, `/sessions`, `/sessions/{id}`, `/executions`
- **DB**: `035_sandbox_environment.sql`
- **Frontend**: `SandboxPanel.tsx` (3rd tab in SwarmView), `SandboxNode` in SwarmBuilder
- **Tests**: 9 unit tests

## Memory Pruning -- Self-Reflection (Task 31)
- **Architecture**: Background watchdog + manual trigger for Knowledge Graph pruning via hipokamp MCP
- **Algorithm**: Fetch entities -> Gemini embeddings -> cosine clustering -> merge duplicates -> delete redundant -> audit + notification
- **API** (5 endpoints): `POST /api/memory/prune`, `GET /stats`, `/history`, `/details/{cycle_id}`, `GET/PATCH /config`
- **DB**: `038_memory_pruning.sql`
- **Frontend**: `MemoryPruningPanel` (4th tab in SwarmView)
- **Watchdog**: configurable interval (default 1h), 60s startup delay
- **Tests**: 13 unit tests

## Predictive UI Pre-fetching (Task 34)
- **Two strategies**: AI-driven WS hints + hover-based nav prefetch
- **Backend**: `detect_view_hints()` -- keyword analysis (PL+EN), emits `WsServerMessage::ViewHint`
- **Frontend**: `usePredictivePrefetch.ts` -- listens WS events, triggers `import()` + `queryClient.prefetchQuery()`
- **Hover prefetch**: Sidebar nav 150ms debounce, dedup via `prefetchedChunks` Set
- **Zero overhead**: chunks fetched at most once, queries respect staleTime

## Observability (R13, 2026-03-15)
- **Prometheus**: 8 alert rules (high error rate, slow responses, DB connection pool, cache hit rate, memory usage, disk space, swarm peer loss, sandbox container leak)
- **Grafana**: 28 panels across 4 dashboards (Overview, API Performance, Swarm Health, Infrastructure)
- **visual-regression.yml**: CI workflow for Chromatic + Playwright visual regression tests on PR
- **Metrics endpoint**: `/api/metrics` (Prometheus format) -- request count, latency histogram, cache stats, swarm peer count, active sessions

## Process Compose (R13, 2026-03-15)
- **20 processes** with health probes: 6 backends (ClaudeHydra, GeminiHydra, Tissaia, GrokHydra, OpenAIHydra, DeepSeekHydra), 6 frontends, 3 Docker DB instances, vault-mcp (Rust), jaskier-knowledge, neo4j, monitoring-stack, docker-engine, pre-warm-cargo/turbo
- **Health probes**: HTTP GET on `/api/health` for all backends, TCP for databases
- **JaskierMCP v3.0**: 17 tools (up from 12), new: semantic search, knowledge graph query, workspace stats, process health, batch operations

## Infrastructure (R13)
- **jaskier-cli**: CLI tool for workspace management -- `jaskier dev`, `jaskier deploy`, `jaskier test`, `jaskier migrate`
- **jaskier-vault-mcp** v9.0: IPFS P2P backup, OrbitDB shared memory, ED25519 signing (48 tests)
- **MCP servers** (13 Polish aliases): skryba, kukielkarz, tropiciel, zgniatacz, osmiorniczka, kartotekarz, hipokamp, rozkminiak, bibliotekarz, komendant-pulpitu, skarbiec, grafomanka, dozorca
