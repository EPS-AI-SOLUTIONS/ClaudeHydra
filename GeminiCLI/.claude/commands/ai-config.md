---
description: 'Configure AI Handler settings'
---

# /ai-config - AI Handler Configuration

View and modify AI Handler configuration settings like local/cloud preference and parallel execution limits.

## Instructions for Claude

Execute this command:

```bash
powershell -ExecutionPolicy Bypass -Command "[Environment]::SetEnvironmentVariable('CLAUDECLI_ENCRYPTION_KEY', 'ClaudeCLI-2024', 'Process'); . 'C:\Users\BIURODOM\Desktop\GeminiCLI\ai-handler\Initialize-AIHandler.ps1'; . 'C:\Users\BIURODOM\Desktop\GeminiCLI\ai-handler\Invoke-AIConfig.ps1' {{args}}"
```

Available arguments:

- `-Show`: View current configuration
- `-PreferLocal true/false`: Set local Ollama preference
- `-AutoFallback true/false`: Enable/disable automatic provider switching
- `-DefaultModel <name>`: Set default Ollama model
- `-MaxConcurrent <number>`: Set max parallel requests
- `-Reset`: Reset to default settings
