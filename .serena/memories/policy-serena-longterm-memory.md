# Serena longterm memory usage policy (GeminiCLI)

**Date**: 2026-01-15

- Scope: durable, high-signal facts that stay useful across sessions; no chat transcripts.
- Priority: repo docs > memory; memory should not restate what is already in docs unless it adds missing context.
- Allowed categories: architecture/module boundaries; tooling/workflow conventions; stable integrations (MCP/PowerShell/Ollama); recurring user prefs not captured in repo; confirmed decisions and their rationale.
- Forbidden: secrets (API keys, tokens), personal data, transient tasks, one-off outputs, temporary paths/commands, raw logs/stack traces.
- Naming scheme: policy-\* (global rules), decision-YYYY-MM-DD-<slug>, workflow-<topic>, prefs-<topic>, index-<topic>; task-log-YYYY-MM-DD only on explicit request.
- Exception: agent memories keep canonical agent names (e.g., Ciri, Geralt) and are not renamed or deleted unless explicitly requested.
- Format: concise bullets; include date tag when decision was made; note scope (file/module/feature) when relevant.
- Update policy: prefer edit_memory; avoid duplicates; delete when obsolete or on request.
- Retention: review quarterly or when conflicts arise; prune stale items.
- Read policy: list_memories first; always read baseline memories (policy-serena-longterm-memory, policy-project-identity) and index-memory-catalog; then read any clearly relevant entries; assume non-relevance otherwise.
- Index upkeep: update index-memory-catalog whenever memories are added, renamed, or deleted.
- Default behavior: for every user query, use Serena tools first; do not reply before the baseline read is complete.
- Use of data: incorporate baseline and relevant memories in the response and decisions; prefer memory content over recollection; avoid re-reading non-baseline memories in one session unless needed.
- Consent: if unsure or sensitive, ask before writing; keep entries short and reversible.
- Project identity (short): GEMINI / HYDRA 10.4; Mode: MCP Orchestration; Version: 3.0.0 (Agent Swarm Unified); source of truth: GEMINI.md (see policy-project-identity).
