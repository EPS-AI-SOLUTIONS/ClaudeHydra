# Test Anthropic API directly
$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force

Write-Host "=== Testing Anthropic Provider ===" -ForegroundColor Cyan

$messages = @(
    @{ role = "user"; content = "Reply with exactly: 'Claude says hi!'" }
)

try {
    $response = Invoke-AIRequest -Messages $messages -Provider "anthropic" -Model "claude-3-5-haiku-20241022" -MaxTokens 20

    Write-Host ""
    Write-Host "Response: $($response.content)" -ForegroundColor Green
    Write-Host "Model: $($response._meta.model)" -ForegroundColor Gray
    Write-Host "Tokens: $($response.usage.input_tokens) in / $($response.usage.output_tokens) out" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[SUCCESS] Anthropic test passed!" -ForegroundColor Green

} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
