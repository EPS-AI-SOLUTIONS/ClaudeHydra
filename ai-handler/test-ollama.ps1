# Test Ollama directly
Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force

Write-Host "=== OLLAMA TEST ===" -ForegroundColor Cyan
Write-Host ""

# Check if Ollama is running
Write-Host "[1] Checking Ollama status..." -ForegroundColor Yellow
$available = Test-OllamaAvailable
Write-Host "    Ollama running: $available" -ForegroundColor $(if($available){"Green"}else{"Red"})
Write-Host ""

# Make request
Write-Host "[2] Sending request to llama3.2:1b..." -ForegroundColor Yellow
$messages = @(
    @{ role = "user"; content = "Powiedz czesc po polsku i napisz krotki zart." }
)

try {
    $response = Invoke-AIRequest -Messages $messages -Provider "ollama" -Model "llama3.2:1b" -MaxTokens 100

    Write-Host ""
    Write-Host "=== RESPONSE ===" -ForegroundColor Green
    Write-Host $response.content -ForegroundColor White
    Write-Host ""
    Write-Host "--- Stats ---" -ForegroundColor Gray
    Write-Host "Provider: $($response._meta.provider)" -ForegroundColor Gray
    Write-Host "Model: $($response._meta.model)" -ForegroundColor Gray
    Write-Host "Tokens: $($response.usage.input_tokens) in / $($response.usage.output_tokens) out" -ForegroundColor Gray
    Write-Host "Cost: FREE (local)" -ForegroundColor Green
    Write-Host ""
    Write-Host "[OK] Ollama test passed!" -ForegroundColor Green

} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
