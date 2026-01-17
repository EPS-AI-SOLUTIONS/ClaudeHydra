---
description: 'Pull/download Ollama models'
---

# /ai-pull - AI Model Management

Download new models for local Ollama, list installed models, or show popular recommendations.

## Instructions for Claude

Execute this command:

```bash
powershell -ExecutionPolicy Bypass -Command ". 'C:\Users\BIURODOM\Desktop\GeminiCLI\ai-handler\Initialize-AIHandler.ps1'; . 'C:\Users\BIURODOM\Desktop\GeminiCLI\ai-handler\Invoke-AIPull.ps1' {{args}}"
```

Available arguments:

- `-List`: List installed models and their sizes
- `-Popular`: Show recommended models to download
- `<model-name>`: Pull/download specific model
- `-Remove <model-name>`: Remove an installed model
