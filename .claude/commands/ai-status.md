---
description: 'Check AI providers, models and configuration status'
---

# /ai-status - AI Handler Status

Check the status of all configured AI providers and models.

## Instructions for Claude

Execute this command:

```bash
powershell -ExecutionPolicy Bypass -Command "[Environment]::SetEnvironmentVariable('CLAUDECLI_ENCRYPTION_KEY', 'ClaudeCLI-2024', 'Process'); Import-Module 'C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\AIModelHandler.psm1' -Force; Get-AIStatus"
```

Display the output showing:

- Provider status (OK/NO KEY/ERROR)
- Available models per provider
- Rate limit usage
- Current settings
