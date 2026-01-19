# 🎮 HYDRA 10.6.1 - Multi-CLI Dashboard

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗                                ║
║  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗                               ║
║  ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║  10.6.1 MULTI-CLI DASHBOARD  ║
║  ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║                               ║
║  ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║                               ║
║  ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  🐺 WITCHER MODE ENABLED     ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## 📊 Quick Status

| Component | Status | Location |
|-----------|--------|----------|
| 🐉 HYDRA Core | ✅ Active | `.claude/hydra/` |
| 🐺 **SWARM Protocol** | ✅ **DEFAULT** | `hydra-config.json` |
| 🐺 Witcher Mode | ✅ Enabled | `.claude/config/multi-cli.json` |
| 📋 CLI Commands | 24 commands | `.claude/commands/` |
| 🎮 Dashboard | ✅ Active | `/dashboard` |

> ⚡ **SWARM jest teraz DOMYŚLNYM trybem** - każde zapytanie automatycznie uruchamia 6-krokowy protokół orkiestracji agentów.

---

## 🎯 CLI Status Matrix

| # | CLI | Provider | Status | Model | Folder |
|---|-----|----------|--------|-------|--------|
| 1 | 🐉 **HYDRA** | Anthropic | ✅ **ACTIVE** | Claude Opus 4.5 | Root |
| 2 | 🔵 **Gemini** | Google | ✅ **ACTIVE** | Gemini 2.0 | `GeminiCLI/` |
| 3 | 🟣 **Jules** | Google | ✅ **ACTIVE** | Jules AI | `JulesCLI/` |
| 4 | 🔴 **DeepSeek** | DeepSeek | ✅ **ACTIVE** | DeepSeek-R1 | `DeepSeekCLI/` |
| 5 | 🟢 **Codex** | OpenAI | 📋 Placeholder | GPT-5-Codex | `CodexCLI/` |
| 6 | ⚫ **Grok** | xAI | 📋 Placeholder | Grok 3 | `GrokCLI/` |

---

## 🔴 IRON LAW (HARD - UNBREAKABLE)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⛔ SAFETY > AUTONOMY                                           │
│  ⛔ DETERMINISM > CREATIVITY                                    │
│  ⛔ NO GUESSING - state uncertainty explicitly                  │
│  ⛔ NO HALLUCINATIONS - verify before claiming                  │
│  ⛔ NO DESTRUCTIVE OPS - unless explicitly confirmed safe       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🐺 SWARM PROTOCOL (DEFAULT MODE)

```
┌─────────────────────────────────────────────────────────────────┐
│  🐺 SWARM PROTOCOL - DOMYŚLNY TRYB HYDRA                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ROUTE      → Analiza zapytania, wybór agentów               │
│  2. SPECULATE  → Researcher zbiera kontekst                     │
│  3. PLAN       → Planner tworzy podział zadań                   │
│  4. EXECUTE    → Agenci wykonują równolegle/sekwencyjnie        │
│  5. SYNTHESIZE → Scalenie wyników, rozwiązanie konfliktów       │
│  6. REPORT     → Format odpowiedzi wg kontraktu HYDRA           │
│                                                                 │
│  ⚡ AUTO-AKTYWACJA: Każde zapytanie → SWARM Protocol            │
└─────────────────────────────────────────────────────────────────┘
```

### Dostępni Agenci

| Agent | Rola | Narzędzia |
|-------|------|-----------|
| 🔍 Researcher | Zbieranie kontekstu | Serena, Grep, WebSearch |
| 📐 Architect | Projektowanie | Serena symbols, patterns |
| 💻 Coder | Implementacja | Edit, Write, Bash |
| 🧪 Tester | Testowanie | Bash (tests), Playwright |
| 📝 Reviewer | Code review | Read, Serena analysis |
| 🔒 Security | Audyt bezpieczeństwa | Grep, patterns |

---

## 🐺 WITCHER MODE - Multi-CLI Orchestration

```
┌─────────────────────────────────────────────────────────────────┐
│  WITCHER MODE ROUTING                                           │
├─────────────────────────────────────────────────────────────────┤
│  Long Context (>100K)  → 🔵 Gemini (2M tokens)                  │
│  Code Generation       → 🐉 HYDRA → 🔴 DeepSeek                 │
│  Background Tasks      → 🟣 Jules (async)                       │
│  Multi-language        → 🔴 DeepSeek (100+ langs)               │
│  Symbolic Analysis     → 🐉 HYDRA (Serena)                      │
│  System Operations     → 🐉 HYDRA (Desktop Commander)           │
└─────────────────────────────────────────────────────────────────┘
```

### 🗡️ Witcher Signs

| Sign | Command | Effect | CLI |
|------|---------|--------|-----|
| 💨 Aard | `/witcher aard` | Fast code generation | Codex → DeepSeek |
| 🔥 Igni | `/witcher igni` | Deep analysis | Gemini |
| ⚡ Yrden | `/witcher yrden` | Background tasks | Jules |
| 🛡️ Quen | `/witcher quen` | Security audit | Grok → HYDRA |
| 🧠 Axii | `/witcher axii` | Multi-model consensus | All |

---

## ⚡ SLASH COMMANDS

### 🎮 Dashboard & Witcher

| Command | Description |
|---------|-------------|
| `/dashboard` | Show this Multi-CLI Control Center |
| `/witcher <task>` | 🐺 Unite ALL CLIs for complex tasks |

### 🌐 External CLI Providers

| Command | Provider | Specialty |
|---------|----------|-----------|
| `/gemini <query>` | Google | 2M context, Multimodal |
| `/jules <task>` | Google | Async background tasks |
| `/codex <task>` | OpenAI | GPT-5-Codex, MCP |
| `/grok <query>` | xAI | Real-time, Unfiltered |
| `/deepseek <task>` | DeepSeek | 100+ languages, Local/API |

### 🐉 HYDRA Core

| Command | Description |
|---------|-------------|
| `/hydra [task]` | Full orchestration (Serena + DC + Swarm) |
| `/ai <query>` | Quick local AI query ($0) |
| `/ai-status` | Check all provider health |
| `/swarm <query>` | Invoke full agent protocol |

### ⚙️ Advanced

| Command | Description |
|---------|-------------|
| `/self-correct` | Code with auto-validation |
| `/speculate` | Model racing (fastest wins) |
| `/semantic-query` | Deep RAG with imports |
| `/few-shot` | Learn from history |
| `/yolo` | Toggle YOLO mode |

---

## 🏗️ PROJECT STRUCTURE

```
ClaudeHYDRA/
├── .claude/                 # Claude CLI configuration
│   ├── commands/            # 24 slash commands
│   ├── config/              # multi-cli.json
│   ├── hydra/               # HYDRA specification
│   └── skills/              # Custom skills
│
├── GeminiCLI/               # 🔵 Google Gemini placeholder
├── JulesCLI/                # 🟣 Google Jules placeholder
├── CodexCLI/                # 🟢 OpenAI Codex placeholder
├── GrokCLI/                 # ⚫ xAI Grok placeholder
├── DeepSeekCLI/             # 🔴 DeepSeek placeholder
│
├── hydra-launcher/          # 🚀 Tauri Desktop App
├── CLAUDE.md                # This file (Dashboard)
└── README.md                # Project documentation
```

---

## 📋 RESPONSE CONTRACT (MANDATORY)

```
┌─────────────────────────────────────────────────────────────────┐
│  EVERY RESPONSE MUST CONTAIN:                                   │
├─────────────────────────────────────────────────────────────────┤
│  1. 📊 Visual summary (table/diagram/ASCII)                     │
│  2. ✅ List of actions taken                                    │
│  3. 📌 EXACTLY 5 next step proposals                            │
│  4. 🎯 CONFIDENCE_SCORE: 0.0–1.0                                │
│                                                                 │
│  If omitted → JUSTIFY explicitly                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📚 DOCUMENTS INDEX

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

## 🚀 Quick Start

```bash
# Show Dashboard
/dashboard

# Witcher Mode - All CLIs
/witcher "Analyze codebase and generate tests"

# Individual CLIs
/gemini "Deep analysis with 2M context"
/jules "Background task delegation"
/deepseek "Multi-language code generation"

# HYDRA Core
/hydra "Full orchestration task"
```

---

> **HYDRA 10.6.1** - Multi-CLI Dashboard Edition
> Witcher Mode: ENABLED | Active CLIs: 4/6 | Placeholders: 2/6
