# HYDRA 10.6.1 - Multi-CLI Control Center

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗                                ║
║  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗                               ║
║  ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║  10.6.1 MULTI-CLI EDITION    ║
║  ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║                               ║
║  ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║                               ║
║  ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  🐺 WITCHER MODE ENABLED     ║
╚══════════════════════════════════════════════════════════════════════════╝
```

![HYDRA Compliance](https://img.shields.io/badge/HYDRA-10.6.1-green)
![Witcher Mode](https://img.shields.io/badge/Witcher-Active-red)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🎮 Multi-CLI Dashboard

HYDRA now supports orchestrating multiple AI CLI tools:

| CLI | Provider | Folder | Status |
|-----|----------|--------|--------|
| 🐉 **Claude CLI** | Anthropic | `ClaudeCLI/` | ✅ Active |
| 🔵 **Gemini CLI** | Google | `GeminiCLI/` | 📋 Placeholder |
| 🟣 **Jules CLI** | Google | `JulesCLI/` | 📋 Placeholder |
| 🟢 **Codex CLI** | OpenAI | `CodexCLI/` | 📋 Placeholder |
| ⚫ **Grok CLI** | xAI | `GrokCLI/` | 📋 Placeholder |
| 🔴 **DeepSeek CLI** | DeepSeek | `DeepSeekCLI/` | 📋 Placeholder |

## 📁 Project Structure

```
ClaudeHYDRA/
├── ClaudeCLI/              # 🐉 Claude CLI (HYDRA Core)
│   ├── .claude/            # Configuration & commands
│   ├── .serena/            # Serena MCP
│   ├── CLAUDE.md           # Main specification
│   └── hydra-config.json   # HYDRA config
│
├── GeminiCLI/              # 🔵 Google Gemini (2M context)
│   └── README.md           # Setup instructions
│
├── JulesCLI/               # 🟣 Google Jules (Async tasks)
│   └── README.md           # Setup instructions
│
├── CodexCLI/               # 🟢 OpenAI Codex (GPT-5)
│   └── README.md           # Setup instructions
│
├── GrokCLI/                # ⚫ xAI Grok (Real-time)
│   └── README.md           # Setup instructions
│
├── DeepSeekCLI/            # 🔴 DeepSeek (100+ langs)
│   └── README.md           # Setup instructions
│
├── hydra-launcher/         # 🚀 Tauri Desktop App
└── README.md               # This file
```

## 🐺 Witcher Mode

Witcher Mode unites ALL CLIs for complex multi-step tasks:

```bash
# Activate Witcher Mode
/witcher "Analyze codebase, generate tests, create documentation"

# Use Witcher Signs
/witcher aard "Fast code generation"     # → Codex
/witcher igni "Deep analysis"            # → Gemini
/witcher yrden "Background task"         # → Jules
/witcher quen "Security audit"           # → Grok + HYDRA
/witcher axii "Multi-model consensus"    # → All
```

## 🚀 Quick Start

### 1. Setup Claude CLI (Required)

```bash
cd ClaudeCLI
# Claude CLI is already configured via CLAUDE.md
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

# DeepSeek
npm install -g run-deepseek-cli
export DEEPSEEK_API_KEY="..."
```

### 3. Launch Dashboard

```bash
/dashboard  # Show Multi-CLI Control Center
```

## 📋 Commands

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
| `/deepseek <task>` | DeepSeek |

## ⚙️ Configuration

### Environment Variables

```bash
# Required for each CLI
export ANTHROPIC_API_KEY="..."   # Claude
export GOOGLE_API_KEY="..."      # Gemini + Jules
export OPENAI_API_KEY="..."      # Codex
export XAI_API_KEY="..."         # Grok
export DEEPSEEK_API_KEY="..."    # DeepSeek

# Optional
export WITCHER_MODE="enabled"
```

### Config File

See `ClaudeCLI/.claude/config/multi-cli.json` for full configuration.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     WITCHER MODE (Orchestrator)                 │
├─────────────────────────────────────────────────────────────────┤
│  🐉 Claude  │  🔵 Gemini  │  🟣 Jules  │  🟢 Codex  │  ⚫ Grok  │
│  (HYDRA)   │  (Google)  │  (Google) │  (OpenAI) │  (xAI)   │
├─────────────────────────────────────────────────────────────────┤
│                     🔴 DeepSeek (Local/API)                     │
└─────────────────────────────────────────────────────────────────┘
```

## 📚 Documentation

| CLI | Docs |
|-----|------|
| Claude | `ClaudeCLI/CLAUDE.md` |
| Gemini | https://geminicli.com/docs/ |
| Jules | https://jules.google/docs/cli/reference/ |
| Codex | https://developers.openai.com/codex/cli/ |
| Grok | https://grokcli.io/ |
| DeepSeek | https://github.com/holasoymalva/deepseek-cli |

## License

MIT License - See LICENSE file
