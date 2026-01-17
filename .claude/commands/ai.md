---
description: 'Quick local AI query using Ollama (cost=$0)'
---

# /ai - Quick Local AI Query

Execute a quick AI query using local Ollama models. Zero cost, fast response.

## Usage

```
/ai <your question or task>
```

## Examples

```
/ai explain this error: TypeError undefined is not a function
/ai write a regex to match email addresses
/ai summarize: <paste text>
```

## Instructions for Claude

When the user invokes `/ai`, execute this command using Bash tool:

```bash
powershell -ExecutionPolicy Bypass -Command "[Environment]::SetEnvironmentVariable('CLAUDECLI_ENCRYPTION_KEY', 'ClaudeCLI-2024', 'Process'); Import-Module 'C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\AIModelHandler.psm1' -Force; Invoke-AIRequest -Provider 'ollama' -Model 'llama3.2:3b' -Messages @(@{role='user'; content='$ARGUMENTS'})"
```

**Important:**

1. Always use local Ollama (cost=$0)
2. Display the full response to user
3. If Ollama not running, it auto-starts

## Model Selection

| Query Type        | Model                | Why             |
| ----------------- | -------------------- | --------------- |
| General questions | `llama3.2:3b`        | Best quality    |
| Code generation   | `qwen2.5-coder:1.5b` | Code specialist |
| Quick/simple      | `llama3.2:1b`        | Fastest         |

## Query: $ARGUMENTS
