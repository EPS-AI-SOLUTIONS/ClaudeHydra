# 🟢 Codex CLI

```
┌─────────────────────────────────────────────────────────────────┐
│  CODEX CLI - OpenAI Code Agent                                  │
│  ════════════════════════════════════════════════════════       │
│  Provider: OpenAI                                               │
│  Models: GPT-5-Codex / GPT-5                                    │
│  Features: MCP, Image input, Code review                        │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
# Via npm
npm install -g @openai/codex

# Via Homebrew (macOS)
brew install openai-codex

# Update
npm install -g @openai/codex@latest
```

## Requirements

- macOS, Linux, or Windows (WSL)
- ChatGPT Plus/Pro/Business/Edu/Enterprise

## Quick Start

```bash
# Start interactive TUI
codex

# In TUI:
> Implement REST API for auth
> /model gpt-5-codex
```

## Key Features

| Feature | Description |
|---------|-------------|
| 🖼️ Image Input | Screenshots, design specs |
| 🔍 Code Review | Pre-commit verification |
| 🌐 Web Search | Online research |
| 🔧 MCP Support | External tools |

## Documentation

https://developers.openai.com/codex/cli/

## Integration with HYDRA

```bash
/codex "Generate unit tests"
/witcher aard "Fast code generation"  # Routes to Codex
```
