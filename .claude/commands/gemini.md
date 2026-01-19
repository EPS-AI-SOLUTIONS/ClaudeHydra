---
description: "Gemini CLI - Google's Multimodal AI with 2M context"
---

# 🔵 GEMINI CLI - Google AI

## ⚡ AUTO-INIT PROTOCOL

When this command is invoked, **IMMEDIATELY** send an initialization prompt to warm up the model:

```bash
# MANDATORY: Run this FIRST before any user query
gemini -p "You are Gemini CLI in HYDRA 10.6.1 system. You have FULL ACCESS to: files (read/write/edit), system (bash, processes), network (web fetch/search), MCP servers (Playwright browser, Desktop Commander, Chrome). Available commands: /dashboard, /witcher, /gemini, /deepseek, /codex, /grok, /jules, /ai, /swarm. Respond: GEMINI READY - Full system access enabled."
```

Then process the user's query: `$ARGUMENTS`

---

```
┌─────────────────────────────────────────────────────────────────┐
│  🔵 GEMINI CLI                                                  │
│  ════════════════════════════════════════════════════════       │
│  Provider: Google                                               │
│  Models: Gemini 2.0 Flash / Pro                                 │
│  Context: 2,000,000 tokens                                      │
│  Specialty: Multimodal, Long-context, Code analysis             │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Installation

```bash
# Option 1: npm
npm install -g @google/gemini-cli

# Option 2: Install script
curl -fsSL https://geminicli.com/install.sh | bash

# Verify installation
gemini --version
```

## 🔐 Authentication

```bash
# Option 1: Environment variable
export GOOGLE_API_KEY="your-api-key-here"

# Option 2: Interactive login
gemini auth login

# Option 3: Config file
echo '{"apiKey": "your-key"}' > ~/.gemini/config.json
```

## 📋 Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `gemini` | Start interactive REPL | `gemini` |
| `gemini chat "query"` | Single query mode | `gemini chat "Explain this code"` |
| `gemini analyze <file>` | Analyze file | `gemini analyze src/main.ts` |
| `/model` | Switch model (in REPL) | `/model pro` |
| `/settings` | Configure behavior | `/settings` |
| `/help` | Show help | `/help` |

## 🎯 Best Use Cases

| Task | Why Gemini? |
|------|-------------|
| **Large codebase analysis** | 2M token context window |
| **Image + code tasks** | Native multimodal support |
| **Documentation review** | Long document comprehension |
| **Architecture diagrams** | Visual understanding |

## 💡 Usage Examples

### Basic Query
```bash
gemini chat "What's the time complexity of quicksort?"
```

### Analyze Codebase
```bash
# Start REPL
gemini

# In REPL
> Analyze this entire repository and identify potential issues
> /model pro
> Generate a comprehensive architecture document
```

### File Analysis
```bash
gemini analyze ./src --output report.md
```

### Multimodal (Image + Text)
```bash
gemini chat "Explain this diagram" --image ./architecture.png
```

## ⚙️ Configuration

### Environment Variables
```bash
export GOOGLE_API_KEY="..."
export GEMINI_MODEL="gemini-2.0-flash"  # or gemini-2.0-pro
export GEMINI_MAX_TOKENS="8192"
```

### Config File: `~/.gemini/config.json`
```json
{
  "apiKey": "your-api-key",
  "model": "gemini-2.0-flash",
  "maxTokens": 8192,
  "temperature": 0.7,
  "safetySettings": "default"
}
```

## 🔗 Integration with HYDRA

```bash
# Via HYDRA Dashboard
/dashboard gemini "Long context analysis task"

# Via Witcher Mode (auto-routed)
/witcher "Analyze entire codebase"
# → Routes to Gemini due to context length
```

## 📚 Resources

- **Documentation:** https://geminicli.com/docs/
- **Quickstart:** https://geminicli.com/docs/get-started
- **API Reference:** https://ai.google.dev/docs
- **Pricing:** https://ai.google.dev/pricing

---

## 📊 Model Comparison

| Model | Speed | Context | Cost | Best For |
|-------|-------|---------|------|----------|
| Flash | ⚡ Fast | 1M | $ | Quick tasks |
| Pro | 🐢 Slower | 2M | $$$ | Complex analysis |

---

ARGUMENTS: $ARGUMENTS
