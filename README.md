# HYDRA 10.6.1 - Multi-CLI Control Center

```
+============================================================================+
|  ##   ## ##    ## ##### ##### #####                                        |
|  ##   ##  ##  ##  ##  ## ##  ## ##  ##                                      |
|  #######   ####   ##  ## ##### #######  10.6.1 MULTI-CLI EDITION           |
|  ##   ##    ##    ##  ## ## ## ##   ##                                      |
|  ##   ##    ##    ##### ##  ## ##   ##                                      |
|                                         Witcher Mode: ENABLED              |
+============================================================================+
```

![HYDRA Compliance](https://img.shields.io/badge/HYDRA-10.6.1-green)
![Witcher Mode](https://img.shields.io/badge/Witcher-Active-red)
![License](https://img.shields.io/badge/license-MIT-blue)

## Multi-CLI Dashboard

HYDRA orchestrates multiple AI CLI tools from a unified dashboard:

| CLI | Provider | Folder | Status |
|-----|----------|--------|--------|
| **Claude** | Anthropic | Root | Active |
| **Gemini** | Google | `GeminiCLI/` | Active |
| **Jules** | Google | `JulesCLI/` | Active |
| **Codex** | OpenAI | `CodexCLI/` | Active |
| **Grok** | xAI | `GrokCLI/` | Active |
| **Ollama** | Local | `GeminiCLI/` | Active |

## Features

- **Multi-Provider Orchestration** - Route tasks to optimal AI provider
- **Witcher Mode** - Combine all CLIs for complex tasks
- **SWARM Protocol** - 6-step agent orchestration (default mode)
- **Streaming Support** - Real-time responses with StreamPanel
- **MultiInputDashboard** - Unified input with provider selection
- **Ollama Control** - Start/Stop/Restart local models
- **MCP Integration** - Serena + Desktop Commander + Playwright

## UI Components

| Component | Description |
|-----------|-------------|
| **MultiInputDashboard** | Multi-provider input with unified interface |
| **StreamPanel** | Real-time streaming output with syntax highlighting |
| **CLI Handlers** | Provider-specific handlers (gemini, grok, codex, jules) |

## Project Structure

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
|       +-- server.js
+-- JulesCLI/                # Google Jules async tasks
|   +-- src/
|       +-- jules-handler.js
|       +-- server.js
+-- CodexCLI/                # OpenAI Codex MCP
|   +-- src/
|       +-- codex-handler.js
|       +-- server.js
+-- GrokCLI/                 # xAI Grok MCP
|   +-- src/
|       +-- grok-handler.js
|       +-- server.js
|
+-- hydra-launcher/          # Tauri Desktop App
+-- docs/                    # API documentation
+-- CLAUDE.md                # Main Dashboard
+-- README.md                # This file
```

## Witcher Mode

Witcher Mode unites ALL CLIs for complex multi-step tasks:

```bash
# Activate Witcher Mode
/witcher "Analyze codebase, generate tests, create documentation"

# Use Witcher Signs
/witcher aard "Fast code generation"     # -> Codex
/witcher igni "Deep analysis"            # -> Gemini
/witcher yrden "Background task"         # -> Jules
/witcher quen "Security audit"           # -> Grok + Claude
/witcher axii "Multi-model consensus"    # -> All
```

## Quick Start

### 1. Setup Claude CLI (Required)

```bash
# Claude CLI is configured via CLAUDE.md
# Ensure ANTHROPIC_API_KEY is set
```

### 2. Install External CLIs (Optional)

```bash
# Gemini
npm install -g @google/gemini-cli
export GOOGLE_API_KEY="..."

# Jules
npm install -g @google/jules
jules login

# Codex
npm install -g @openai/codex
# Requires ChatGPT Plus/Pro

# Grok
npm install -g @vibe-kit/grok-cli
export XAI_API_KEY="..."

# Ollama (Local)
# Download from ollama.ai
ollama pull llama3.2:3b
```

### 3. Launch Dashboard

```bash
/dashboard  # Show Multi-CLI Control Center
```

## Commands

### Core HYDRA

| Command | Description |
|---------|-------------|
| `/hydra <task>` | Full orchestration |
| `/ai <query>` | Quick local AI ($0) |
| `/swarm <task>` | Agent swarm protocol |

### Multi-CLI

| Command | Description |
|---------|-------------|
| `/dashboard` | Control center |
| `/witcher <task>` | All CLIs combined |
| `/gemini <query>` | Google Gemini |
| `/jules <task>` | Google Jules |
| `/codex <task>` | OpenAI Codex |
| `/grok <query>` | xAI Grok |

## Configuration

### Environment Variables

```bash
# Required for each CLI
export ANTHROPIC_API_KEY="..."   # Claude
export GOOGLE_API_KEY="..."      # Gemini + Jules
export OPENAI_API_KEY="..."      # Codex
export XAI_API_KEY="..."         # Grok

# Optional
export WITCHER_MODE="enabled"
```

### Config File

See `.claude/config/multi-cli.json` for full configuration.

## Architecture

```
+---------------------------------------------------------------------+
|                     WITCHER MODE (Orchestrator)                      |
+---------------------------------------------------------------------+
|  Claude   |  Gemini   |  Jules   |  Codex   |  Grok   |  Ollama    |
| (Anthropic)| (Google) | (Google) | (OpenAI) |  (xAI)  |  (Local)   |
+---------------------------------------------------------------------+
|                         MCP Integration                              |
|           Serena + Desktop Commander + Playwright                    |
+---------------------------------------------------------------------+
```

## Documentation

| CLI | Docs |
|-----|------|
| Claude | `CLAUDE.md` |
| Gemini | https://geminicli.com/docs/ |
| Jules | https://jules.google/docs/cli/reference/ |
| Codex | https://developers.openai.com/codex/cli/ |
| Grok | https://grokcli.io/ |
| Ollama | https://ollama.ai/library |

## API Specification

See `docs/API_SPECIFICATION.md` for detailed API documentation including:
- Message formats for all providers
- Streaming protocols (SSE, WebSocket, NDJSON)
- Error handling and rate limits
- Complete code examples

## License

MIT License - See LICENSE file
