# GEMINI CLI - HYDRA Ollama Extension

**Status**: Active | **Mode**: MCP Extension | **Project**: GeminiCLI
**Path**: `C:\Users\BIURODOM\Desktop\GeminiCLI`

## Quick Start

```powershell
# Double-click shortcut on Desktop or run:
wscript.exe "C:\Users\BIURODOM\Desktop\GeminiCLI\GeminiCLI.vbs"

# Or directly:
gemini
```

---

## 1. Project Structure

```
C:\Users\BIURODOM\Desktop\GeminiCLI\
├── GeminiCLI.vbs              # Main launcher (double-click)
├── _launcher.ps1              # PowerShell launcher script
├── .env                       # Environment variables
├── icon.ico                   # Application icon
├── gemini-extension.json      # Extension configuration
├── prompt-optimizer-gemini.json  # Prompt optimizer config
├── package.json               # Node.js manifest
├── cache/                     # Response cache
│   └── gemini-models.json     # Cached model list
├── src/                       # Source code
│   ├── server.js              # Main MCP server
│   ├── ollama-client.js       # Ollama API client
│   ├── prompt-optimizer.js    # Auto prompt enhancement
│   ├── self-correction.js     # Code validation
│   ├── speculative.js         # Multi-model racing
│   ├── prompt-queue.js        # Request queue
│   ├── cache.js               # Caching layer
│   └── gemini-models.js       # Gemini model definitions
└── node_modules/              # Dependencies
```

---

## 2. Features

### 2.1 Prompt Optimizer

Automatically enhances prompts before sending to AI.

| Feature | Description |
|---------|-------------|
| **Category Detection** | code, analysis, question, creative, task, summary |
| **Language Detection** | Python, JavaScript, TypeScript, Rust, Go, SQL, etc. |
| **Clarity Scoring** | 0-100 score with improvement suggestions |
| **Auto-Enhancement** | Adds context, instructions, structure |

```
Input:  "python sort"
Output: "[Python] python sort

Provide clean, well-documented code. Include error handling where appropriate. Follow best practices for the language."
```

### 2.2 Speculative Decoding

Run multiple models in parallel, return best result.

| Mode | Description |
|------|-------------|
| `speculativeGenerate` | Fast (1b) + Accurate (3b) parallel |
| `modelRace` | Race N models, fastest wins |
| `consensusGenerate` | Multi-model agreement |

### 2.3 Self-Correction

Automatic code validation before presenting to user.

| Language | Validation |
|----------|------------|
| Python | Syntax check via `py_compile` |
| JavaScript/TypeScript | ESLint-style checks |
| PowerShell | `[ScriptBlock]::Create()` |
| SQL | Basic syntax validation |

### 2.4 Caching

SHA-256 based response caching with TTL.

```
cache/
├── {hash}.json          # Cached responses
└── gemini-models.json   # Model list cache
```

---

## 3. Ollama Integration

### Available Models

| Model | Size | Use Case |
|-------|------|----------|
| `llama3.2:1b` | 1.3 GB | Fast responses, simple tasks |
| `llama3.2:3b` | 2.0 GB | Balanced quality/speed |
| `phi3:mini` | 2.2 GB | Reasoning, analysis |
| `qwen2.5-coder:1.5b` | 986 MB | Code generation |

### Model Selection

```
Simple question  → llama3.2:1b (fastest)
Code generation  → qwen2.5-coder:1.5b
Complex analysis → llama3.2:3b + phi3:mini (consensus)
```

### Health Check

```powershell
# Check Ollama status
Invoke-RestMethod -Uri 'http://localhost:11434/api/tags'

# List models
ollama list

# Pull new model
ollama pull llama3.2:3b
```

---

## 4. MCP Server Tools

The extension provides these MCP tools:

| Tool | Description |
|------|-------------|
| `generate` | Generate text using Ollama |
| `generate_code` | Code generation with self-correction |
| `speculative_generate` | Fast + accurate parallel generation |
| `model_race` | Race models, fastest wins |
| `consensus_generate` | Multi-model consensus |
| `optimize_prompt` | Enhance prompt quality |
| `test_prompt_quality` | Analyze prompt and get suggestions |
| `list_models` | List available Ollama models |
| `pull_model` | Download new model |
| `get_cache_stats` | Cache statistics |
| `clear_cache` | Clear response cache |

---

## 5. Configuration

### Environment Variables (.env)

```env
OLLAMA_HOST=http://localhost:11434
CACHE_TTL=3600
AUTO_OPTIMIZE=true
SHOW_ENHANCEMENTS=false
```

### Prompt Optimizer (prompt-optimizer-gemini.json)

```json
{
  "config": {
    "enabled": true,
    "autoOptimize": true,
    "showEnhancements": false,
    "minClarityThreshold": 60
  }
}
```

### Extension Config (gemini-extension.json)

```json
{
  "name": "ollama-hydra",
  "version": "1.0.0",
  "contextFileName": ["GEMINI.md", "HYDRA.md"]
}
```

---

## 6. Usage Examples

### Basic Generation

```
> Write a Python function to reverse a string

[Prompt optimized: +2 enhancements]
[Model: qwen2.5-coder:1.5b]

def reverse_string(s: str) -> str:
    """Reverse a string."""
    return s[::-1]
```

### Speculative Mode

```
> /speculative Explain async/await in JavaScript

[Running: llama3.2:1b + llama3.2:3b]
[Winner: llama3.2:3b (better quality)]

Async/await is syntactic sugar over Promises...
```

### Model Racing

```
> /race What is the capital of France?

[Racing: llama3.2:1b, phi3:mini, llama3.2:3b]
[Winner: llama3.2:1b in 0.8s]

Paris
```

---

## 7. Troubleshooting

### Ollama Not Running

```powershell
# Start Ollama
ollama serve

# Or via launcher (auto-starts)
wscript.exe GeminiCLI.vbs
```

### Model Not Found

```powershell
# Pull required models
ollama pull llama3.2:1b
ollama pull llama3.2:3b
ollama pull phi3:mini
ollama pull qwen2.5-coder:1.5b
```

### Cache Issues

```powershell
# Clear cache
Remove-Item "C:\Users\BIURODOM\Desktop\GeminiCLI\cache\*.json" -Force
```

### Extension Not Loading

```powershell
# Reinstall dependencies
cd C:\Users\BIURODOM\Desktop\GeminiCLI
npm install
```

---

## 8. Development

### Run MCP Server Manually

```powershell
cd C:\Users\BIURODOM\Desktop\GeminiCLI
node src/server.js
```

### Test Ollama Connection

```powershell
curl http://localhost:11434/api/tags
```

### Debug Mode

```powershell
$env:DEBUG = "true"
node src/server.js
```

---

## 9. Performance Tips

| Tip | Impact |
|-----|--------|
| Use `llama3.2:1b` for simple queries | 3x faster |
| Enable caching | Instant repeated queries |
| Use speculative for important queries | Best quality |
| Pre-pull models | No download delays |

---

## 10. Security

| Rule | Description |
|------|-------------|
| Local only | Ollama runs on localhost:11434 |
| No API keys | All models run locally |
| Cache isolation | Per-project cache directories |
| No telemetry | Zero data sent externally |

---

> *"Local AI, cloud quality. HYDRA extension for Gemini CLI."*
