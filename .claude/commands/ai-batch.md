---
description: "Parallel batch AI queries using local Ollama (cost=$0)"
---

# /ai-batch - Parallel Batch Processing

Run multiple AI queries in parallel using local Ollama. Zero cost.

## Usage

```
/ai-batch
prompt1: <first query>
prompt2: <second query>
prompt3: <third query>
```

## Instructions for Claude

When user provides multiple prompts, execute them in parallel:

```powershell
[Environment]::SetEnvironmentVariable('CLAUDECLI_ENCRYPTION_KEY', 'ClaudeCLI-2024', 'Process')
Import-Module 'C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\AIModelHandler.psm1' -Force

$prompts = @("prompt1", "prompt2", "prompt3")
Invoke-AIBatch -Prompts $prompts -Model "llama3.2:3b" -MaxConcurrent 4
```

**Features:**
- Parallel execution (up to 4 concurrent)
- Auto load balancing
- Zero cost (local Ollama)
