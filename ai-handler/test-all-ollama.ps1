# Test all Ollama models
Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force

Write-Host ""
Write-Host "=== TESTING ALL OLLAMA MODELS ===" -ForegroundColor Cyan
Write-Host ""

$models = @("llama3.2:3b", "qwen2.5-coder:1.5b", "phi3:mini", "llama3.2:1b")

foreach ($model in $models) {
    Write-Host "[$model]" -ForegroundColor Yellow -NoNewline
    Write-Host " Testing..." -ForegroundColor Gray

    $messages = @(
        @{ role = "user"; content = "Say 'Hello from $model' and nothing else." }
    )

    try {
        $response = Invoke-AIRequest -Messages $messages -Provider "ollama" -Model $model -MaxTokens 50
        Write-Host "  Response: $($response.content)" -ForegroundColor Green
        Write-Host "  Tokens: $($response.usage.input_tokens) in / $($response.usage.output_tokens) out" -ForegroundColor Gray
        Write-Host ""
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
    }
}

Write-Host "=== ALL TESTS COMPLETED ===" -ForegroundColor Cyan
