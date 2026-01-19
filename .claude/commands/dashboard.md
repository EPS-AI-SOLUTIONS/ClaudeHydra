---
description: "HYDRA Dashboard - Multi-CLI Control Center & Witcher Mode"
---

# 🎮 HYDRA DASHBOARD - Multi-CLI Control Center

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ██████╗  █████╗ ███████╗██╗  ██╗██████╗  ██████╗  █████╗ ██████╗ ██████╗ ║
║  ██╔══██╗██╔══██╗██╔════╝██║  ██║██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██╔══██╗║
║  ██║  ██║███████║███████╗███████║██████╔╝██║   ██║███████║██████╔╝██║  ██║║
║  ██║  ██║██╔══██║╚════██║██╔══██║██╔══██╗██║   ██║██╔══██║██╔══██╗██║  ██║║
║  ██████╔╝██║  ██║███████║██║  ██║██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝║
║  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ║
║                                                                          ║
║              🐺 WITCHER MODE: Unite All CLI Powers 🐺                    ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## 📊 CLI Status Matrix

| CLI | Provider | Status | Model | Specialty |
|-----|----------|--------|-------|-----------|
| 🔵 **Gemini CLI** | Google | `$GEMINI_STATUS` | Gemini 2.0 | Multimodal, Long Context |
| 🟣 **Jules CLI** | Google | `$JULES_STATUS` | Jules AI | Async Tasks, GitHub Delegation |
| 🟢 **Codex CLI** | OpenAI | `$CODEX_STATUS` | GPT-5-Codex | Code Generation, MCP |
| ⚫ **Grok CLI** | xAI | `$GROK_STATUS` | Grok 3 | Real-time, Unfiltered |
| 🔴 **DeepSeek CLI** | DeepSeek | `$DEEPSEEK_STATUS` | DeepSeek-R1 | Code, 100+ Languages |
| 🐺 **Witcher Mode** | ALL | `$WITCHER_STATUS` | Multi-Model | Combined Intelligence |

---

## 🔵 GEMINI CLI (Google)

```
┌─────────────────────────────────────────────────────────────────┐
│  🔵 GEMINI CLI                                                  │
│  ════════════════════════════════════════════════════════       │
│  Model: Gemini 2.0 Flash/Pro                                    │
│  Context: 2M tokens                                             │
│  Specialty: Multimodal, Long-context analysis                   │
└─────────────────────────────────────────────────────────────────┘
```

### Installation
```bash
# Install via npm
npm install -g @anthropic-ai/gemini-cli

# Or download from official site
curl -fsSL https://geminicli.com/install.sh | bash
```

### Configuration
```bash
# Set API key
export GOOGLE_API_KEY="your-api-key"

# Or configure via CLI
gemini auth login
```

### Key Commands
| Command | Description |
|---------|-------------|
| `gemini` | Start interactive REPL |
| `gemini chat "query"` | Single query mode |
| `/model` | Switch between Flash/Pro |
| `/settings` | Configure behavior |

### Quick Start
```bash
# Start session
gemini

# In REPL
> Analyze this codebase and suggest improvements
> /model pro
> Review this PR for security issues
```

**Docs:** https://geminicli.com/docs/

---

## 🟣 JULES CLI (Google)

```
┌─────────────────────────────────────────────────────────────────┐
│  🟣 JULES CLI                                                   │
│  ════════════════════════════════════════════════════════       │
│  Model: Jules AI                                                │
│  Mode: Asynchronous Task Delegation                             │
│  Specialty: Background coding, GitHub integration               │
└─────────────────────────────────────────────────────────────────┘
```

### Installation
```bash
npm install -g @google/jules
```

### Authentication
```bash
jules login   # Opens browser for Google auth
jules logout  # Sign out
```

### Key Commands
| Command | Description |
|---------|-------------|
| `jules` | Launch interactive TUI |
| `jules remote list --repo` | List connected repos |
| `jules remote list --session` | List all sessions |
| `jules remote new --repo owner/repo --session "task"` | Create async task |
| `jules remote pull --session ID` | Fetch completed results |
| `jules version` | Show version |

### Workflow Example
```bash
# Create async coding task
jules remote new --repo myorg/myapp --session "Add unit tests for auth module"

# Check session status
jules remote list --session

# Pull completed work
jules remote pull --session 123456

# Interactive dashboard
jules
```

**Docs:** https://jules.google/docs/cli/reference/

---

## 🟢 CODEX CLI (OpenAI)

```
┌─────────────────────────────────────────────────────────────────┐
│  🟢 CODEX CLI                                                   │
│  ════════════════════════════════════════════════════════       │
│  Model: GPT-5-Codex                                             │
│  Mode: Interactive TUI                                          │
│  Specialty: Code generation, MCP tools, Image input             │
└─────────────────────────────────────────────────────────────────┘
```

### Installation
```bash
# Via npm
npm install -g @openai/codex

# Via Homebrew
brew install openai-codex

# Update
npm install -g @openai/codex@latest
```

### Requirements
- macOS, Linux, or Windows (WSL)
- ChatGPT Plus/Pro/Business/Edu/Enterprise

### Key Commands
| Command | Description |
|---------|-------------|
| `codex` | Launch interactive TUI |
| `/model` | Switch GPT-5-Codex ↔ GPT-5 |
| `codex exec "task"` | Scripted automation |

### Features
- 🖼️ **Image Input** - Screenshots, design specs
- 🔍 **Code Review** - Pre-commit verification
- 🌐 **Web Search** - Online research
- 🔧 **MCP Support** - External tools
- ⚙️ **Approval Modes** - Control file edits

### Quick Start
```bash
# Start session
codex

# In TUI
> Review this PR and suggest improvements
> /model gpt-5
> Generate unit tests for the auth module
```

**Docs:** https://developers.openai.com/codex/cli/

---

## ⚫ GROK CLI (xAI)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚫ GROK CLI                                                    │
│  ════════════════════════════════════════════════════════       │
│  Model: Grok 3                                                  │
│  Mode: Conversational AI                                        │
│  Specialty: Real-time data, Unfiltered responses                │
└─────────────────────────────────────────────────────────────────┘
```

### Installation
```bash
npm install -g @vibe-kit/grok-cli
```

### Configuration
```bash
# Set API key
export XAI_API_KEY="your-api-key"

# Or via CLI
grok auth
```

### Key Commands
| Command | Description |
|---------|-------------|
| `grok` | Start interactive mode |
| `grok chat "query"` | Single query |
| `grok --help` | Show all commands |

### Features
- 💬 Conversational AI in terminal
- 📝 Intelligent text editing
- ⚡ Real-time information access
- 🔓 Less restrictive responses

### Quick Start
```bash
# Start session
grok

# Interactive chat
> What's the latest news about AI development?
> Help me debug this Python code
> Explain this algorithm in simple terms
```

**Docs:** https://grokcli.io/ | GitHub: superagent-ai/grok-cli

---

## 🔴 DEEPSEEK CLI

```
┌─────────────────────────────────────────────────────────────────┐
│  🔴 DEEPSEEK CLI                                                │
│  ════════════════════════════════════════════════════════       │
│  Model: DeepSeek-R1 / DeepSeek-Coder                            │
│  Mode: Code-focused AI                                          │
│  Specialty: 100+ languages, Repo understanding, Local/API       │
└─────────────────────────────────────────────────────────────────┘
```

### Installation
```bash
# Via npm
npm install -g run-deepseek-cli

# Via Docker
docker run -it -v $(pwd):/workspace -e DEEPSEEK_API_KEY=your_key deepseek/cli

# From source
git clone https://github.com/holasoymalva/deepseek-cli.git
cd deepseek-cli && npm install && npm run build && npm link
```

### Requirements
- Node.js 18+
- Ollama (for local mode)

### Configuration
```bash
# API mode
export DEEPSEEK_API_KEY="your-api-key"

# Local mode (Ollama)
deepseek setup
ollama pull deepseek-r1
```

### Key Commands
| Command | Description |
|---------|-------------|
| `deepseek` | Launch interactive mode |
| `deepseek setup` | Configure environment |
| `deepseek chat "prompt"` | Single prompt |
| `deepseek --model <name>` | Select model |
| `deepseek --help` | Show help |

### Use Cases
```bash
# Code generation
> Write a Python function for binary search with error handling

# Architecture analysis
> Explain this application's architecture and main components

# Refactoring
> Refactor this class to follow SOLID principles

# Project scaffolding
> Create a React TypeScript project with Redux and Material-UI
```

**Docs:** https://github.com/holasoymalva/deepseek-cli

---

## 🐺 WITCHER MODE - Combined Intelligence

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   ██╗    ██╗██╗████████╗ ██████╗██╗  ██╗███████╗██████╗          ║
║   ██║    ██║██║╚══██╔══╝██╔════╝██║  ██║██╔════╝██╔══██╗         ║
║   ██║ █╗ ██║██║   ██║   ██║     ███████║█████╗  ██████╔╝         ║
║   ██║███╗██║██║   ██║   ██║     ██╔══██║██╔══╝  ██╔══██╗         ║
║   ╚███╔███╔╝██║   ██║   ╚██████╗██║  ██║███████╗██║  ██║         ║
║    ╚══╝╚══╝ ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝         ║
║                                                                  ║
║          🗡️ "Wind's Howling. Time for All Tools." 🗡️              ║
╚══════════════════════════════════════════════════════════════════╝
```

### What is Witcher Mode?

Witcher Mode orchestrates ALL available CLI tools simultaneously, selecting the best tool for each subtask. Like Geralt choosing between steel and silver swords, Witcher Mode picks the right AI for each challenge.

### Activation
```bash
/witcher <task>

# Or via dashboard
/dashboard witcher "Complex multi-step task"
```

### Routing Matrix

| Task Type | Primary CLI | Fallback | Reason |
|-----------|-------------|----------|--------|
| Long-context analysis | Gemini | Codex | 2M context window |
| Async GitHub tasks | Jules | Codex | Background processing |
| Code generation | Codex | DeepSeek | MCP + GPT-5 |
| Real-time research | Grok | Gemini | Live data access |
| Multi-language code | DeepSeek | Codex | 100+ languages |
| Image understanding | Gemini/Codex | Grok | Multimodal |

### Witcher Protocol (6 Steps)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. ANALYZE    → Parse task, identify subtasks                  │
│  2. ROUTE      → Assign best CLI for each subtask               │
│  3. PARALLEL   → Run independent subtasks simultaneously        │
│  4. SEQUENTIAL → Chain dependent subtasks                       │
│  5. SYNTHESIZE → Merge results, resolve conflicts               │
│  6. REPORT     → Unified response per HYDRA contract            │
└─────────────────────────────────────────────────────────────────┘
```

### Example Workflow

```bash
/witcher "Analyze this codebase, generate tests, and create documentation"

# Witcher Mode dispatches:
# 1. Gemini → Analyzes codebase (long context)
# 2. DeepSeek → Generates comprehensive tests (multi-language)
# 3. Jules → Creates async documentation task
# 4. Codex → Reviews and refines output
# 5. Grok → Adds real-time best practices
```

### Signs (Special Abilities)

| Sign | Effect | CLI Used |
|------|--------|----------|
| **Aard** | Force push - Rapid code generation | Codex |
| **Igni** | Fire - Deep analysis burn | Gemini |
| **Yrden** | Trap - Background task delegation | Jules |
| **Quen** | Shield - Security audit | Grok |
| **Axii** | Mind - Multi-model consensus | All |

---

## 🚀 Quick Commands

```bash
# Individual CLI
/gemini "Query for Gemini"
/jules "Async task for Jules"
/codex "Code task for Codex"
/grok "Query for Grok"
/deepseek "Code task for DeepSeek"

# Witcher Mode (All CLIs)
/witcher "Complex multi-CLI task"

# Dashboard
/dashboard           # Show this panel
/dashboard status    # Check all CLI health
/dashboard config    # Configure APIs
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# Required API Keys
export GOOGLE_API_KEY="..."      # Gemini
export OPENAI_API_KEY="..."      # Codex
export XAI_API_KEY="..."         # Grok
export DEEPSEEK_API_KEY="..."    # DeepSeek

# Optional
export WITCHER_MODE="enabled"
export DEFAULT_CLI="codex"
```

### Config File: `.claude/config/multi-cli.json`

```json
{
  "gemini": { "enabled": true, "model": "gemini-2.0-flash" },
  "jules": { "enabled": true, "auth": "google" },
  "codex": { "enabled": true, "model": "gpt-5-codex" },
  "grok": { "enabled": true, "model": "grok-3" },
  "deepseek": { "enabled": true, "model": "deepseek-r1", "mode": "api" },
  "witcher": { "enabled": true, "auto_route": true }
}
```

---

## 📌 Next Steps

1. **[Setup APIs]** - Configure API keys for each CLI
2. **[Test Each CLI]** - Verify individual CLI connections
3. **[Enable Witcher]** - Activate multi-CLI orchestration
4. **[Create Workflow]** - Design custom multi-CLI pipelines
5. **[Monitor Usage]** - Track costs and performance

CONFIDENCE_SCORE: 0.95

---

ARGUMENTS: $ARGUMENTS
