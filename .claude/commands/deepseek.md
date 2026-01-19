---
description: "DeepSeek CLI - Code-focused AI supporting 100+ languages"
---

# 🔴 DEEPSEEK CLI - Code Intelligence

## ⚡ AUTO-INIT PROTOCOL

When this command is invoked, **IMMEDIATELY** send an initialization prompt to warm up the model:

```bash
# MANDATORY: Run this FIRST before any user query
deepseek -p "You are DeepSeek CLI in HYDRA 10.6.1 system. You have FULL ACCESS to: files (read/write/edit), system (bash, processes), network (web fetch/search), MCP servers (Playwright browser, Desktop Commander, Chrome). Available commands: /dashboard, /witcher, /gemini, /deepseek, /codex, /grok, /jules, /ai, /swarm. Respond: DEEPSEEK READY - Full system access enabled."
```

Then process the user's query: `$ARGUMENTS`

---

```
┌─────────────────────────────────────────────────────────────────┐
│  🔴 DEEPSEEK CLI                                                │
│  ════════════════════════════════════════════════════════       │
│  Provider: DeepSeek                                             │
│  Models: DeepSeek-R1 / DeepSeek-Coder                           │
│  Mode: Code-focused AI (API or Local via Ollama)                │
│  Specialty: 100+ languages, Repo understanding, Reasoning       │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Installation

### Option 1: NPM (Recommended)
```bash
npm install -g run-deepseek-cli

# Verify
deepseek --version
```

### Option 2: Docker
```bash
docker run -it \
  -v $(pwd):/workspace \
  -e DEEPSEEK_API_KEY=your_key \
  deepseek/cli
```

### Option 3: From Source
```bash
git clone https://github.com/holasoymalva/deepseek-cli.git
cd deepseek-cli
npm install
npm run build
npm link
```

## 📋 Requirements

- **Node.js:** 18 or higher
- **Ollama:** For local mode (optional)
- **API Key:** For cloud mode

## 🔐 Configuration

### API Mode (Cloud)
```bash
export DEEPSEEK_API_KEY="your-api-key"
```

### Local Mode (Ollama)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull DeepSeek model
ollama pull deepseek-r1

# Setup CLI
deepseek setup
```

## 📋 Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `deepseek` | Launch interactive mode | `deepseek` |
| `deepseek setup` | Configure environment | `deepseek setup` |
| `deepseek chat "prompt"` | Single prompt | `deepseek chat "Write a sort function"` |
| `deepseek --model <name>` | Select model | `deepseek --model deepseek-coder` |
| `deepseek --help` | Show help | `deepseek --help` |

## 🎯 Key Features

| Feature | Description |
|---------|-------------|
| 🌐 **100+ Languages** | Supports virtually any programming language |
| 📁 **Repo Understanding** | Analyzes entire codebases |
| 🔄 **Refactoring** | SOLID principles, design patterns |
| 🆕 **Project Generation** | Scaffolds new projects |
| 🏠 **Local Mode** | Run completely offline via Ollama |
| 💰 **Cost-effective** | Cheaper than GPT-4/Claude |

## 💡 Usage Examples

### Interactive Mode
```bash
deepseek

> Write a Python function for binary search with error handling
> Explain the architecture of this application
> Refactor this class to follow SOLID principles
```

### Code Generation
```bash
deepseek chat "Create a React TypeScript project with Redux and Material-UI"
```

### Architecture Analysis
```bash
deepseek

> Analyze this codebase and identify main components
> Find potential security vulnerabilities
> Suggest performance improvements
```

### Refactoring
```bash
deepseek

> Refactor this function to be more readable
> Convert this callback-based code to async/await
> Apply the Strategy pattern to this class
```

### Project Scaffolding
```bash
deepseek chat "Create a FastAPI backend with PostgreSQL and JWT auth"
```

## ⚙️ Configuration

### Environment Variables
```bash
export DEEPSEEK_API_KEY="..."
export DEEPSEEK_MODEL="deepseek-r1"  # or deepseek-coder
export DEEPSEEK_MODE="api"           # or "local"
```

### Config File
```json
{
  "apiKey": "your-api-key",
  "model": "deepseek-r1",
  "mode": "api",
  "ollamaUrl": "http://localhost:11434"
}
```

## 🔄 API vs Local Mode

| Aspect | API Mode | Local Mode |
|--------|----------|------------|
| Setup | API key only | Ollama + model download |
| Speed | Fast | Depends on hardware |
| Cost | Pay per token | Free |
| Privacy | Cloud | 100% local |
| Models | All | Ollama-compatible |

## 🔗 Integration with HYDRA

```bash
# Via HYDRA Dashboard
/dashboard deepseek "Multi-language code task"

# Via Witcher Mode
/witcher "Implement algorithms in Python, Rust, and Go"
# → Routes multi-language to DeepSeek

# Direct command
/deepseek "Convert this Python script to Rust"
```

## 📚 Resources

- **GitHub:** https://github.com/holasoymalva/deepseek-cli
- **DeepSeek API:** https://platform.deepseek.com
- **Ollama:** https://ollama.ai
- **Models:** https://huggingface.co/deepseek-ai

---

## 📊 Model Comparison

| Model | Specialty | Speed | Best For |
|-------|-----------|-------|----------|
| DeepSeek-R1 | Reasoning | 🐢 | Complex problems |
| DeepSeek-Coder | Code | ⚡ | Quick code tasks |
| DeepSeek-V2 | General | ⚡ | Chat + Code |

---

## ⚠️ Tips

- Use `deepseek-coder` for fast code generation
- Use `deepseek-r1` for complex reasoning tasks
- Local mode is free but requires good GPU
- API mode is cheap and fast

---

## 🏠 Local Setup Guide

```bash
# 1. Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 2. Start Ollama
ollama serve

# 3. Pull model (choose one)
ollama pull deepseek-r1        # Reasoning (large)
ollama pull deepseek-coder     # Code (smaller)

# 4. Configure CLI
deepseek setup
# Select "local" mode
# Confirm Ollama URL

# 5. Start using
deepseek
```

---

ARGUMENTS: $ARGUMENTS
