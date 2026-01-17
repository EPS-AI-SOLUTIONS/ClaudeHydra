---
description: 'Show AI Health Dashboard'
---

# /ai-health - AI Handler Health

Display health dashboard including provider status, token usage, and costs.

## Instructions for Claude

Execute this command:

```bash
powershell -ExecutionPolicy Bypass -Command ". 'C:\Users\BIURODOM\Desktop\GeminiCLI\ai-handler\Initialize-AIHandler.ps1'; . 'C:\Users\BIURODOM\Desktop\GeminiCLI\ai-handler\Invoke-AIHealth.ps1' {{args}}"
```

Available arguments:

- `-Json`: Export health data in JSON format
