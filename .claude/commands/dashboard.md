---
description: "HYDRA Dashboard - Multi-CLI Control Center & Witcher Mode"
---

# HYDRA DASHBOARD - Multi-CLI Control Center

```
+============================================================================+
|  ##### #####  ##### ##   ## ##### ##### #####  ##### ##### #####           |
|  ##  ## ##  ## ##   ##   ## ##  ## ## ## ##  ## ## ##  ##  ## ##  ##        |
|  ##  ## ###### ##### ####### ##### ## ## ###### #####  ##  ## ##  ##        |
|  ##  ## ##  ##    ## ##   ## ##  ## ## ## ##  ## ## ## ##  ## ##  ##        |
|  ##### ##  ## ##### ##   ## ##### ##### ##  ## ##  ## ##### #####          |
|                                                                            |
|              Witcher Mode: Unite All CLI Powers                            |
+============================================================================+
```

## CLI Status Matrix

| CLI | Provider | Status | Model | Specialty |
|-----|----------|--------|-------|-----------|
| **Claude** | Anthropic | `$CLAUDE_STATUS` | Claude Opus 4.5 | Symbolic analysis, Orchestration |
| **Gemini** | Google | `$GEMINI_STATUS` | Gemini 2.0 | Multimodal, Long Context |
| **Jules** | Google | `$JULES_STATUS` | Jules AI | Async Tasks, GitHub Delegation |
| **Codex** | OpenAI | `$CODEX_STATUS` | GPT-4o | Code Generation, MCP |
| **Grok** | xAI | `$GROK_STATUS` | Grok 3 | Real-time, Unfiltered |
| **Ollama** | Local | `$OLLAMA_STATUS` | Llama 3.2 | Local inference, $0 cost |
| **Witcher Mode** | ALL | `$WITCHER_STATUS` | Multi-Model | Combined Intelligence |

---

## Claude (Anthropic)

```
+---------------------------------------------------------------------+
|  CLAUDE - HYDRA Core                                                 |
|  ====================================================================
|  Model: Claude Opus 4.5                                              |
|  Components: Serena, Desktop Commander, Agent Swarm                  |
|  Specialty: Symbolic analysis, System operations, Orchestration      |
+---------------------------------------------------------------------+
```

### Key Features
- Symbolic code analysis (Serena)
- System operations (Desktop Commander)
- Agent Swarm orchestration
- MCP integration (Playwright, Chrome)

### Commands
| Command | Description |
|---------|-------------|
| `/hydra <task>` | Full orchestration |
| `/swarm <task>` | Agent swarm protocol |
| `/ai <query>` | Quick local AI ($0) |

---

## Gemini CLI (Google)

```
+---------------------------------------------------------------------+
|  GEMINI CLI                                                          |
|  ====================================================================
|  Model: Gemini 2.0 Flash/Pro                                         |
|  Context: 2M tokens                                                  |
|  Specialty: Multimodal, Long-context analysis                        |
+---------------------------------------------------------------------+
```

### Handler: gemini-handler.js
| Tool | Description |
|------|-------------|
| `gemini_stream` | Stream with real-time SSE |
| `gemini_generate` | Text generation |
| `gemini_chat` | Multi-turn conversations |
| `gemini_analyze` | Code/document/image analysis |
| `gemini_summarize` | Long content summarization |

### Quick Start
```bash
/gemini "Analyze this codebase"
/witcher igni "Deep analysis burn"
```

**Docs:** https://geminicli.com/docs/

---

## Jules CLI (Google)

```
+---------------------------------------------------------------------+
|  JULES CLI                                                           |
|  ====================================================================
|  Model: Jules AI                                                     |
|  Mode: Asynchronous Task Delegation                                  |
|  Specialty: Background coding, GitHub integration                    |
+---------------------------------------------------------------------+
```

### Handler: jules-handler.js
| Tool | Description |
|------|-------------|
| `jules_delegate` | Delegate async task |
| `jules_status` | Check task progress |
| `jules_cancel` | Cancel running task |
| `jules_list` | List all tasks |
| `jules_pull` | Pull completed results |

### Quick Start
```bash
/jules "Create tests for auth module"
/witcher yrden "Background task"
```

**Docs:** https://jules.google/docs/cli/reference/

---

## Codex CLI (OpenAI)

```
+---------------------------------------------------------------------+
|  CODEX CLI                                                           |
|  ====================================================================
|  Model: GPT-4o                                                       |
|  Mode: Interactive TUI                                               |
|  Specialty: Code generation, MCP tools, Image input                  |
+---------------------------------------------------------------------+
```

### Handler: codex-handler.js
| Tool | Description |
|------|-------------|
| `codex_stream` | Stream code generation |
| `codex_stream_code` | Stream with validation |
| `codex_stream_review` | Stream code review |
| `codex_code` | Self-correcting code |
| `codex_review` | Comprehensive review |
| `codex_test` | Generate unit tests |

### Quick Start
```bash
/codex "Generate REST API endpoints"
/witcher aard "Fast code generation"
```

**Docs:** https://developers.openai.com/codex/cli/

---

## Grok CLI (xAI)

```
+---------------------------------------------------------------------+
|  GROK CLI                                                            |
|  ====================================================================
|  Model: Grok 3                                                       |
|  Mode: Conversational AI                                             |
|  Specialty: Real-time data, Unfiltered responses                     |
+---------------------------------------------------------------------+
```

### Handler: grok-handler.js
| Tool | Description |
|------|-------------|
| `grok_ws_connect` | WebSocket connection |
| `grok_ws_subscribe` | Subscribe to topics |
| `grok_ws_query` | Query over WebSocket |
| `grok_generate` | Text generation |
| `grok_realtime` | Real-time information |

### Quick Start
```bash
/grok "What's trending in AI?"
/witcher quen "Security audit"
```

**Docs:** https://grokcli.io/

---

## Ollama (Local)

```
+---------------------------------------------------------------------+
|  OLLAMA - Local AI                                                   |
|  ====================================================================
|  Models: Llama 3.2, Mistral, DeepSeek-Coder                          |
|  Cost: $0 (local inference)                                          |
|  Control: Start/Stop/Restart                                         |
+---------------------------------------------------------------------+
```

### Control Tools
| Tool | Description |
|------|-------------|
| `ollama_generate` | Generate with local models |
| `ollama_status` | Check server status |
| `ollama_start` | Start Ollama server |
| `ollama_stop` | Stop Ollama server |
| `ollama_restart` | Restart server |
| `ollama_pull` | Download new model |
| `ollama_list` | List available models |

### Quick Start
```bash
/ai "Quick local query - $0"
/ai-status
/ai-pull llama3.2:3b
```

---

## WITCHER MODE - Combined Intelligence

```
+======================================================================+
|                                                                      |
|   ##   ## ##### ##### ##### ##   ## ##### #####                      |
|   ##   ##   ##    ##  ##    ##   ## ##    ##  ##                     |
|   ## # ##   ##    ##  ##    ####### ####  #####                      |
|   #######   ##    ##  ##    ##   ## ##    ##  ##                     |
|    ## ##  #####   ##  ##### ##   ## ##### ##  ##                     |
|                                                                      |
|           "Wind's Howling. Time for All Tools."                      |
+======================================================================+
```

### Routing Matrix

| Task Type | Primary CLI | Fallback | Reason |
|-----------|-------------|----------|--------|
| Long-context analysis | Gemini | Codex | 2M context window |
| Async GitHub tasks | Jules | Claude | Background processing |
| Code generation | Codex | Claude | Self-correction |
| Real-time research | Grok | Gemini | Live data access |
| Symbolic analysis | Claude | Codex | Serena integration |
| Local/offline | Ollama | - | Zero cost |

### Witcher Signs

| Sign | Effect | CLI Used |
|------|--------|----------|
| **Aard** | Rapid code generation | Codex |
| **Igni** | Deep analysis burn | Gemini |
| **Yrden** | Background task delegation | Jules |
| **Quen** | Security audit | Grok + Claude |
| **Axii** | Multi-model consensus | All |

---

## UI Components

### MultiInputDashboard
Multi-provider input panel with unified interface and provider selection.

### StreamPanel
Real-time streaming output with syntax highlighting and provider indicators.

---

## Quick Commands

```bash
# Individual CLI
/gemini "Query for Gemini"
/jules "Async task for Jules"
/codex "Code task for Codex"
/grok "Query for Grok"
/ai "Local Ollama query"

# Witcher Mode (All CLIs)
/witcher "Complex multi-CLI task"

# Dashboard
/dashboard           # Show this panel
/dashboard status    # Check all CLI health
/ai-status           # Provider health check
```

---

## Configuration

### Environment Variables

```bash
# Required API Keys
export ANTHROPIC_API_KEY="..."   # Claude
export GOOGLE_API_KEY="..."      # Gemini + Jules
export OPENAI_API_KEY="..."      # Codex
export XAI_API_KEY="..."         # Grok

# Optional
export WITCHER_MODE="enabled"
export DEFAULT_CLI="claude"
```

### Config File: `.claude/config/multi-cli.json`

```json
{
  "claude": { "enabled": true, "model": "claude-opus-4-5" },
  "gemini": { "enabled": true, "model": "gemini-2.0-flash" },
  "jules": { "enabled": true, "auth": "google" },
  "codex": { "enabled": true, "model": "gpt-4o" },
  "grok": { "enabled": true, "model": "grok-3" },
  "ollama": { "enabled": true, "model": "llama3.2:3b" },
  "witcher": { "enabled": true, "auto_route": true }
}
```

---

## Next Steps

1. **[Setup APIs]** - Configure API keys for each CLI
2. **[Test Each CLI]** - Verify individual CLI connections
3. **[Enable Witcher]** - Activate multi-CLI orchestration
4. **[Create Workflow]** - Design custom multi-CLI pipelines
5. **[Monitor Usage]** - Track costs and performance

CONFIDENCE_SCORE: 0.95

---

ARGUMENTS: $ARGUMENTS
