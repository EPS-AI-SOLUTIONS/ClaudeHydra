#Requires -Version 5.1
<#
.SYNOPSIS
    Show all AI Handler commands - wrapper for /ai-help
#>

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "         AI HANDLER - Command Reference" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "  QUERIES" -ForegroundColor Yellow
Write-Host "  -------" -ForegroundColor Gray
Write-Host "  /ai <question>           " -NoNewline -ForegroundColor White
Write-Host "Single local AI query" -ForegroundColor Gray

Write-Host "  /ai -Code <question>     " -NoNewline -ForegroundColor White
Write-Host "Use code-specialist model" -ForegroundColor Gray

Write-Host "  /ai -Fast <question>     " -NoNewline -ForegroundColor White
Write-Host "Use fastest model" -ForegroundColor Gray

Write-Host ""
Write-Host "  BATCH PROCESSING" -ForegroundColor Yellow
Write-Host "  ----------------" -ForegroundColor Gray
Write-Host "  /ai-batch ""Q1; Q2; Q3""   " -NoNewline -ForegroundColor White
Write-Host "Multiple queries in parallel" -ForegroundColor Gray

Write-Host "  /ai-batch -File <path>   " -NoNewline -ForegroundColor White
Write-Host "Queries from file" -ForegroundColor Gray

Write-Host ""
Write-Host "  STATUS & CONFIG" -ForegroundColor Yellow
Write-Host "  ---------------" -ForegroundColor Gray
Write-Host "  /ai-status               " -NoNewline -ForegroundColor White
Write-Host "Show providers & models status" -ForegroundColor Gray

Write-Host "  /ai-status -Test         " -NoNewline -ForegroundColor White
Write-Host "Test connectivity to all providers" -ForegroundColor Gray

Write-Host "  /ai-health               " -NoNewline -ForegroundColor White
Write-Host "Health dashboard (status/tokeny/koszt)" -ForegroundColor Gray

Write-Host "  /ai-health -Json          " -NoNewline -ForegroundColor White
Write-Host "Export dashboard as JSON" -ForegroundColor Gray

Write-Host "  /ai-config -Show         " -NoNewline -ForegroundColor White
Write-Host "Show current configuration" -ForegroundColor Gray

Write-Host "  /ai-config -PreferLocal  " -NoNewline -ForegroundColor White
Write-Host "Set local/cloud preference" -ForegroundColor Gray

Write-Host "  /ai-config -MaxConcurrent" -NoNewline -ForegroundColor White
Write-Host " Set parallel limit (1-16)" -ForegroundColor Gray

Write-Host "  /ai-config -Reset        " -NoNewline -ForegroundColor White
Write-Host "Reset to defaults" -ForegroundColor Gray

Write-Host ""
Write-Host "  MODEL MANAGEMENT" -ForegroundColor Yellow
Write-Host "  ----------------" -ForegroundColor Gray
Write-Host "  /ai-pull -List           " -NoNewline -ForegroundColor White
Write-Host "List installed Ollama models" -ForegroundColor Gray

Write-Host "  /ai-pull -Popular        " -NoNewline -ForegroundColor White
Write-Host "Show recommended models" -ForegroundColor Gray

Write-Host "  /ai-pull <model>         " -NoNewline -ForegroundColor White
Write-Host "Download new model" -ForegroundColor Gray

Write-Host "  /ai-pull -Remove <model> " -NoNewline -ForegroundColor White
Write-Host "Remove installed model" -ForegroundColor Gray

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "                QUICK START" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Check status:    " -NoNewline -ForegroundColor Gray
Write-Host "/ai-status" -ForegroundColor White

Write-Host "  2. Ask question:    " -NoNewline -ForegroundColor Gray
Write-Host "/ai What is 2+2?" -ForegroundColor White

Write-Host "  3. Generate code:   " -NoNewline -ForegroundColor Gray
Write-Host "/ai Write Python hello world" -ForegroundColor White

Write-Host "  4. Batch process:   " -NoNewline -ForegroundColor Gray
Write-Host "/ai-batch ""Q1; Q2; Q3""" -ForegroundColor White

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "                  FEATURES" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [*] Local-first     " -NoNewline -ForegroundColor Green
Write-Host "Ollama by default (cost=`$0)" -ForegroundColor Gray

Write-Host "  [*] Auto-fallback   " -NoNewline -ForegroundColor Green
Write-Host "Cloud backup if local fails" -ForegroundColor Gray

Write-Host "  [*] Parallel        " -NoNewline -ForegroundColor Green
Write-Host "4 concurrent requests" -ForegroundColor Gray

Write-Host "  [*] Auto-detect     " -NoNewline -ForegroundColor Green
Write-Host "Code queries use specialist model" -ForegroundColor Gray

Write-Host "  [*] Multi-provider  " -NoNewline -ForegroundColor Green
Write-Host "Anthropic + OpenAI + Google + Mistral + Groq + Ollama" -ForegroundColor Gray

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
