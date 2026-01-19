---
description: "Load and display available AI models from all providers"
---

# 🤖 AI MODELS - Lazy Loader

## ⚡ AUTO-LOAD PROTOCOL

When this command is invoked, **IMMEDIATELY** load models from all providers:

```bash
# Load all models with lazy caching
node .claude/scripts/model-loader.js status
```

## 📊 Available Commands

| Command | Description |
|---------|-------------|
| `/ai-models` | Show all available models |
| `/ai-models best code` | Get best model for coding |
| `/ai-models best analysis` | Get best model for analysis |
| `/ai-models provider google` | Show Google/Gemini models |
| `/ai-models provider ollama` | Show local Ollama models |

## 🎯 Task Types

| Task | Best Providers |
|------|----------------|
| `code` | DeepSeek → OpenAI → Anthropic → Google |
| `analysis` | Google → Anthropic → OpenAI → DeepSeek |
| `reasoning` | Anthropic → DeepSeek → OpenAI → Google |
| `multimodal` | Google → OpenAI → Anthropic |
| `realtime` | xAI → Google → OpenAI |
| `local` | Ollama |

## 🔧 Configuration

Models are cached for 5 minutes. Configuration in:
- `.claude/config/multi-cli.json` → `model_loader` section
- `.claude/scripts/model-loader.js` → `MODEL_RANKINGS`

---

ARGUMENTS: $ARGUMENTS
