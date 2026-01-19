# HYDRA 10.6.1 - Multi-CLI Dashboard

```
+============================================================================+
|  ##   ## ##    ## ##### ##### #####                                        |
|  ##   ##  ##  ##  ##  ## ##  ## ##  ##                                      |
|  #######   ####   ##  ## ##### #######  10.6.1 MULTI-CLI DASHBOARD         |
|  ##   ##    ##    ##  ## ## ## ##   ##                                      |
|  ##   ##    ##    ##### ##  ## ##   ##                                      |
|                                         Witcher Mode: ENABLED              |
+============================================================================+
```

## Quick Status

| Component | Status | Location |
|-----------|--------|----------|
| Claude Core | Active | `.claude/hydra/` |
| **SWARM Protocol** | **DEFAULT** | `hydra-config.json` |
| Witcher Mode | Enabled | `.claude/config/multi-cli.json` |
| CLI Commands | 24 commands | `.claude/commands/` |
| Dashboard | Active | `/dashboard` |
| MultiInputDashboard | Active | `hydra-launcher/src/` |
| StreamPanel | Active | `hydra-launcher/src/` |

> **SWARM jest teraz DOMYSLNYM trybem** - kazde zapytanie automatycznie uruchamia 6-krokowy protokol orkiestracji agentow.

---

## CLI Status Matrix

| # | CLI | Provider | Status | Model | Folder |
|---|-----|----------|--------|-------|--------|
| 1 | **Claude** | Anthropic | **ACTIVE** | Claude Opus 4.5 | Root |
| 2 | **Gemini** | Google | **ACTIVE** | Gemini 2.0 | `GeminiCLI/` |
| 3 | **Jules** | Google | **ACTIVE** | Jules AI | `JulesCLI/` |
| 4 | **Codex** | OpenAI | **ACTIVE** | GPT-4o | `CodexCLI/` |
| 5 | **Grok** | xAI | **ACTIVE** | Grok 3 | `GrokCLI/` |
| 6 | **Ollama** | Local | **ACTIVE** | Llama 3.2 | `GeminiCLI/` |

---

## UI Components

### MultiInputDashboard
Multi-provider input panel with provider selection and unified interface.

### StreamPanel
Real-time streaming output panel with syntax highlighting and provider indicators.

### CLI Handlers
| Handler | Location | Provider |
|---------|----------|----------|
| `gemini-handler.js` | `GeminiCLI/src/` | Google Gemini |
| `grok-handler.js` | `GrokCLI/src/` | xAI Grok |
| `codex-handler.js` | `CodexCLI/src/` | OpenAI Codex |
| `jules-handler.js` | `JulesCLI/src/` | Google Jules |

---

## IRON LAW (HARD - UNBREAKABLE)

```
+---------------------------------------------------------------------+
|  SAFETY > AUTONOMY                                                   |
|  DETERMINISM > CREATIVITY                                            |
|  NO GUESSING - state uncertainty explicitly                          |
|  NO HALLUCINATIONS - verify before claiming                          |
|  NO DESTRUCTIVE OPS - unless explicitly confirmed safe               |
+---------------------------------------------------------------------+
```

---

## SWARM PROTOCOL (DEFAULT MODE)

```
+---------------------------------------------------------------------+
|  SWARM PROTOCOL - DOMYSLNY TRYB HYDRA                                |
+---------------------------------------------------------------------+
|                                                                      |
|  1. ROUTE      -> Analiza zapytania, wybor agentow                   |
|  2. SPECULATE  -> Researcher zbiera kontekst                         |
|  3. PLAN       -> Planner tworzy podzial zadan                       |
|  4. EXECUTE    -> Agenci wykonuja rownolegle/sekwencyjnie            |
|  5. SYNTHESIZE -> Scalenie wynikow, rozwiazanie konfliktow           |
|  6. REPORT     -> Format odpowiedzi wg kontraktu HYDRA               |
|                                                                      |
|  AUTO-AKTYWACJA: Kazde zapytanie -> SWARM Protocol                   |
+---------------------------------------------------------------------+
```

### Dostepni Agenci

| Agent | Rola | Narzedzia |
|-------|------|-----------|
| Researcher | Zbieranie kontekstu | Serena, Grep, WebSearch |
| Architect | Projektowanie | Serena symbols, patterns |
| Coder | Implementacja | Edit, Write, Bash |
| Tester | Testowanie | Bash (tests), Playwright |
| Reviewer | Code review | Read, Serena analysis |
| Security | Audyt bezpieczenstwa | Grep, patterns |

---

## WITCHER MODE - Multi-CLI Orchestration

```
+---------------------------------------------------------------------+
|  WITCHER MODE ROUTING                                                |
+---------------------------------------------------------------------+
|  Long Context (>100K)  -> Gemini (2M tokens)                         |
|  Code Generation       -> Claude -> Codex                            |
|  Background Tasks      -> Jules (async)                              |
|  Real-time Data        -> Grok (X/Twitter integration)               |
|  Symbolic Analysis     -> Claude (Serena)                            |
|  System Operations     -> Claude (Desktop Commander)                 |
|  Local/Offline         -> Ollama (Start/Stop/Restart control)        |
+---------------------------------------------------------------------+
```

### Witcher Signs

| Sign | Command | Effect | CLI |
|------|---------|--------|-----|
| Aard | `/witcher aard` | Fast code generation | Codex |
| Igni | `/witcher igni` | Deep analysis | Gemini |
| Yrden | `/witcher yrden` | Background tasks | Jules |
| Quen | `/witcher quen` | Security audit | Grok -> Claude |
| Axii | `/witcher axii` | Multi-model consensus | All |

---

## Ollama Control

Local model management with Start/Stop/Restart capabilities:

```bash
# Start Ollama server
/ai-status          # Check if running
ollama serve        # Manual start

# Model management
ollama pull llama3.2:3b
ollama list
ollama rm <model>

# In HYDRA
/ai <query>         # Quick local query ($0 cost)
/ai-pull <model>    # Download model
```

| Command | Description |
|---------|-------------|
| `ollama serve` | Start local server |
| `ollama stop` | Stop server |
| `ollama list` | List downloaded models |
| `ollama pull` | Download new model |

---

## SLASH COMMANDS

### Dashboard & Witcher

| Command | Description |
|---------|-------------|
| `/dashboard` | Show this Multi-CLI Control Center |
| `/witcher <task>` | Unite ALL CLIs for complex tasks |

### External CLI Providers

| Command | Provider | Specialty |
|---------|----------|-----------|
| `/gemini <query>` | Google | 2M context, Multimodal |
| `/jules <task>` | Google | Async background tasks |
| `/codex <task>` | OpenAI | GPT-4o, Code generation |
| `/grok <query>` | xAI | Real-time, X integration |

### Claude Core

| Command | Description |
|---------|-------------|
| `/hydra [task]` | Full orchestration (Serena + DC + Swarm) |
| `/ai <query>` | Quick local AI query ($0) |
| `/ai-status` | Check all provider health |
| `/swarm <query>` | Invoke full agent protocol |

### Advanced

| Command | Description |
|---------|-------------|
| `/self-correct` | Code with auto-validation |
| `/speculate` | Model racing (fastest wins) |
| `/semantic-query` | Deep RAG with imports |
| `/few-shot` | Learn from history |
| `/yolo` | Toggle YOLO mode |

---

## PROJECT STRUCTURE

```
ClaudeHYDRA/
+-- .claude/                 # Claude CLI configuration
|   +-- commands/            # 24 slash commands
|   +-- config/              # multi-cli.json
|   +-- hydra/               # HYDRA specification
|   +-- skills/              # Custom skills
|
+-- GeminiCLI/               # Google Gemini + Ollama MCP
|   +-- src/
|       +-- gemini-handler.js
+-- JulesCLI/                # Google Jules async tasks
|   +-- src/
|       +-- jules-handler.js
+-- CodexCLI/                # OpenAI Codex MCP
|   +-- src/
|       +-- codex-handler.js
+-- GrokCLI/                 # xAI Grok MCP
|   +-- src/
|       +-- grok-handler.js
|
+-- hydra-launcher/          # Tauri Desktop App
|   +-- src/
|       +-- MultiInputDashboard.tsx
|       +-- StreamPanel.tsx
+-- CLAUDE.md                # This file (Dashboard)
+-- README.md                # Project documentation
```

---

## RESPONSE CONTRACT (MANDATORY)

```
+---------------------------------------------------------------------+
|  EVERY RESPONSE MUST CONTAIN:                                        |
+---------------------------------------------------------------------+
|  1. Visual summary (table/diagram/ASCII)                             |
|  2. List of actions taken                                            |
|  3. EXACTLY 5 next step proposals                                    |
|  4. CONFIDENCE_SCORE: 0.0-1.0                                        |
|                                                                      |
|  If omitted -> JUSTIFY explicitly                                    |
+---------------------------------------------------------------------+
```

---

## DOCUMENTS INDEX

| File | Purpose |
|------|---------|
| `.claude/hydra/HYDRA_CORE.md` | Core rules & architecture |
| `.claude/hydra/HYDRA_SECURITY.md` | Security policy |
| `.claude/hydra/HYDRA_AGENTS.md` | Agent swarm contracts |
| `.claude/hydra/HYDRA_FILES.md` | File handling rules |
| `.claude/config/multi-cli.json` | Multi-CLI configuration |
| `.claude/commands/witcher.md` | Witcher Mode specification |
| `.claude/commands/dashboard.md` | Full dashboard details |

---

## Quick Start

```bash
# Show Dashboard
/dashboard

# Witcher Mode - All CLIs
/witcher "Analyze codebase and generate tests"

# Individual CLIs
/gemini "Deep analysis with 2M context"
/jules "Background task delegation"
/codex "Code generation with GPT-4o"
/grok "Real-time information query"

# Claude Core
/hydra "Full orchestration task"

# Local AI (Ollama)
/ai "Quick local query - $0 cost"
```

---

> **HYDRA 10.6.1** - Multi-CLI Dashboard Edition
> Witcher Mode: ENABLED | Active CLIs: 5/5 | Ollama: ACTIVE
