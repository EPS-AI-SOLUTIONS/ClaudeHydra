# Test AI Handler Fallback on API Failure
$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force

Write-Host ""
Write-Host "=== TEST: Fallback when Anthropic API fails ===" -ForegroundColor Cyan
Write-Host ""

# Temporarily save and remove Anthropic API key to simulate failure
$savedAnthropicKey = $env:ANTHROPIC_API_KEY
$env:ANTHROPIC_API_KEY = "sk-invalid-key-for-testing"

Write-Host "[Setup] Anthropic API key set to invalid value" -ForegroundColor Yellow
Write-Host "[Setup] This will trigger auth error and fallback" -ForegroundColor Yellow
Write-Host ""

$messages = @(
    @{ role = "user"; content = "Say 'Fallback worked!' and nothing else." }
)

try {
    Write-Host "[Test] Requesting with AutoFallback enabled..." -ForegroundColor Cyan
    Write-Host "[Test] Expected: Anthropic fails -> OpenAI or Ollama succeeds" -ForegroundColor Gray
    Write-Host ""

    $response = Invoke-AIRequest -Messages $messages -Provider "anthropic" -Model "claude-3-5-haiku-20241022" -MaxTokens 50 -AutoFallback

    Write-Host ""
    Write-Host "=== RESULT ===" -ForegroundColor Green
    Write-Host "Response: $($response.content)" -ForegroundColor White
    Write-Host "Final Provider: $($response._meta.provider)" -ForegroundColor Cyan
    Write-Host "Final Model: $($response._meta.model)" -ForegroundColor Cyan
    Write-Host "Attempts: $($response._meta.attempt)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[SUCCESS] Fallback mechanism worked!" -ForegroundColor Green

} catch {
    Write-Host ""
    Write-Host "[FAILED] $($_.Exception.Message)" -ForegroundColor Red

} finally {
    # Restore original API key
    $env:ANTHROPIC_API_KEY = $savedAnthropicKey
    Write-Host ""
    Write-Host "[Cleanup] Anthropic API key restored" -ForegroundColor Yellow
}
