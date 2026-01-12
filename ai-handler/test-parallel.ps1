# Test Parallel AI Execution
$ErrorActionPreference = "Stop"
Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force

Write-Host @"

  ============================================================
             PARALLEL AI EXECUTION TEST (LOCAL-FIRST)
  ============================================================

"@ -ForegroundColor Cyan

# Check config
Write-Host "[1] Configuration Check" -ForegroundColor Yellow
Write-Host "-------------------------" -ForegroundColor Gray

$config = Get-AIConfig
Write-Host "  Provider Order: $($config.providerFallbackOrder -join ' -> ')" -ForegroundColor White
Write-Host "  Prefer Local: $($config.settings.preferLocal)" -ForegroundColor White
Write-Host "  Default Ollama Model: $($config.settings.ollamaDefaultModel)" -ForegroundColor White
Write-Host "  Max Concurrent: $($config.settings.parallelExecution.maxConcurrent)" -ForegroundColor White
Write-Host ""

# Check local models
Write-Host "[2] Local Models Available" -ForegroundColor Yellow
Write-Host "--------------------------" -ForegroundColor Gray

$localModels = Get-LocalModels
if ($localModels.Count -gt 0) {
    foreach ($model in $localModels) {
        Write-Host "  [OK] $($model.Name) ($($model.Size) GB)" -ForegroundColor Green
    }
} else {
    Write-Host "  [X] No local models found" -ForegroundColor Red
}
Write-Host ""

# Test batch processing
Write-Host "[3] Batch Processing Test (4 prompts parallel)" -ForegroundColor Yellow
Write-Host "-----------------------------------------------" -ForegroundColor Gray

$prompts = @(
    "What is 2+2? Answer with just the number.",
    "What is the capital of France? Answer in one word.",
    "What color is the sky? Answer in one word.",
    "What is H2O? Answer in one word."
)

$startTime = Get-Date
$results = Invoke-AIBatch -Prompts $prompts -MaxTokens 50
$elapsed = ((Get-Date) - $startTime).TotalSeconds

Write-Host ""
Write-Host "Results:" -ForegroundColor Cyan
foreach ($r in $results) {
    $status = if ($r.Success) { "[OK]" } else { "[FAIL]" }
    $color = if ($r.Success) { "Green" } else { "Red" }
    $promptShort = $r.Prompt
    if ($promptShort.Length -gt 40) { $promptShort = $promptShort.Substring(0, 40) }

    if ($r.Success) {
        $answer = $r.Content.Trim()
        if ($answer.Length -gt 50) { $answer = $answer.Substring(0, 50) }
    } else {
        $answer = $r.Error
    }

    Write-Host "  $status $promptShort..." -ForegroundColor $color -NoNewline
    Write-Host " -> $answer" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Total time: $([math]::Round($elapsed, 2))s for $($prompts.Count) requests" -ForegroundColor Cyan
Write-Host "Avg per request: $([math]::Round($elapsed / $prompts.Count, 2))s" -ForegroundColor Gray

# Calculate efficiency
$successCount = ($results | Where-Object { $_.Success }).Count
Write-Host ""
Write-Host "Success rate: $successCount/$($prompts.Count)" -ForegroundColor $(if ($successCount -eq $prompts.Count) { "Green" } else { "Yellow" })

Write-Host @"

  ============================================================
                       TEST COMPLETED
  ============================================================

"@ -ForegroundColor Green
