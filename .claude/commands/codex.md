---
description: "Codex CLI - OpenAI's GPT-5-Codex for Code Generation & MCP"
---

# 🟢 CODEX CLI - OpenAI Code Agent

```
┌─────────────────────────────────────────────────────────────────┐
│  🟢 CODEX CLI                                                   │
│  ════════════════════════════════════════════════════════       │
│  Provider: OpenAI                                               │
│  Models: GPT-5-Codex / GPT-5                                    │
│  Mode: Interactive TUI                                          │
│  Specialty: Code generation, MCP tools, Image input, Review     │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Installation

```bash
# Via npm (recommended)
npm install -g @openai/codex

# Via Homebrew (macOS)
brew install openai-codex

# Update to latest
npm install -g @openai/codex@latest

# Verify installation
codex --version
```

## 📋 Requirements

- **OS:** macOS, Linux, or Windows (WSL required)
- **Account:** ChatGPT Plus, Pro, Business, Edu, or Enterprise
- **Node.js:** 18+ recommended

## 🔐 Authentication

```bash
# First run prompts for auth
codex

# Options:
# 1. Sign in with ChatGPT account (browser)
# 2. Enter API key manually
```

## 📋 Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `codex` | Launch interactive TUI | `codex` |
| `codex exec "task"` | Scripted automation | `codex exec "run tests"` |
| `/model` | Switch model (in TUI) | `/model gpt-5` |
| `/help` | Show help | `/help` |

## 🎯 Key Features

| Feature | Description |
|---------|-------------|
| 🖼️ **Image Input** | Screenshots, design specs, diagrams |
| 🔍 **Code Review** | Pre-commit verification |
| 🌐 **Web Search** | Online research capabilities |
| 🔧 **MCP Support** | Model Context Protocol tools |
| ⚙️ **Approval Modes** | Control file edits/commands |
| 📝 **Scripting** | Automation via `exec` |

## 💡 Usage Examples

### Interactive Session
```bash
# Start TUI
codex

# In TUI:
> Implement a REST API for user authentication
> /model gpt-5-codex
> Add unit tests for the auth module
> Review this PR for security issues
```

### With Image Input
```bash
codex

> [drag & drop screenshot]
> Implement this UI design in React
```

### Scripted Automation
```bash
# Run single task
codex exec "Fix all TypeScript errors in src/"

# Chain tasks
codex exec "Run tests" && codex exec "Generate coverage report"
```

### Code Review
```bash
codex

> Review the changes in this PR:
> git diff main...feature-branch
```

## ⚙️ Configuration

### Environment Variables
```bash
export OPENAI_API_KEY="sk-..."
export CODEX_MODEL="gpt-5-codex"
export CODEX_APPROVAL_MODE="auto"  # or "manual"
```

### Approval Modes

| Mode | Behavior |
|------|----------|
| `auto` | Auto-approve safe operations |
| `manual` | Ask before every action |
| `suggest` | Show suggestions, user applies |

## 🔄 MCP Integration

Codex CLI supports Model Context Protocol for external tools:

```bash
# Configure MCP servers in ~/.codex/config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@anthropic/mcp-server-filesystem"]
    }
  }
}
```

## 🔗 Integration with HYDRA

```bash
# Via HYDRA Dashboard
/dashboard codex "Implement feature X"

# Via Witcher Mode
/witcher "Write and test new API endpoint"
# → Routes code tasks to Codex

# Direct command
/codex "Generate unit tests for auth.ts"
```

## 📚 Resources

- **Documentation:** https://developers.openai.com/codex/cli/
- **API Reference:** https://platform.openai.com/docs
- **Pricing:** https://openai.com/pricing
- **Community:** https://community.openai.com

---

## 📊 Model Comparison

| Model | Speed | Capability | Best For |
|-------|-------|------------|----------|
| GPT-5-Codex | ⚡ Fast | Code-optimized | Code generation |
| GPT-5 | 🐢 Slower | General + Code | Complex reasoning |

---

## ⚠️ Tips

- Use `/model gpt-5-codex` for faster code tasks
- Use `/model gpt-5` for complex reasoning
- Enable MCP for file system access
- Use `exec` for CI/CD automation

---

ARGUMENTS: $ARGUMENTS
