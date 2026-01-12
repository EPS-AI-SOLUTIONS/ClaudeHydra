# Test AI Handler Request
$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force

Write-Host "=== Testing AI Handler ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Get optimal model
Write-Host "[Test 1] Get-OptimalModel for 'code' task:" -ForegroundColor Yellow
$optimal = Get-OptimalModel -Task "code" -EstimatedTokens 500 -PreferCheapest
Write-Host "  Selected: $($optimal.provider)/$($optimal.model)" -ForegroundColor Green
Write-Host ""

# Test 2: Make actual API request
Write-Host "[Test 2] Making API request with auto-fallback..." -ForegroundColor Yellow

$messages = @(
    @{ role = "user"; content = "Say 'Hello from AI Handler!' - nothing else." }
)

try {
    $response = Invoke-AIRequest -Messages $messages -MaxTokens 50 -AutoFallback

    Write-Host ""
    Write-Host "=== Response ===" -ForegroundColor Green
    Write-Host $response.content -ForegroundColor White
    Write-Host ""
    Write-Host "--- Metadata ---" -ForegroundColor Gray
    Write-Host "Provider: $($response._meta.provider)" -ForegroundColor Gray
    Write-Host "Model: $($response._meta.model)" -ForegroundColor Gray
    Write-Host "Attempt: $($response._meta.attempt)" -ForegroundColor Gray
    Write-Host "Tokens: $($response.usage.input_tokens) in / $($response.usage.output_tokens) out" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[SUCCESS] AI Handler test completed!" -ForegroundColor Green

} catch {
    Write-Host ""
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""

    # Show which providers are available
    Write-Host "Available providers:" -ForegroundColor Yellow
    if ($env:ANTHROPIC_API_KEY) {
        Write-Host "  [OK] Anthropic (key set)" -ForegroundColor Green
    } else {
        Write-Host "  [--] Anthropic (ANTHROPIC_API_KEY not set)" -ForegroundColor Red
    }
    if ($env:OPENAI_API_KEY) {
        Write-Host "  [OK] OpenAI (key set)" -ForegroundColor Green
    } else {
        Write-Host "  [--] OpenAI (OPENAI_API_KEY not set)" -ForegroundColor Yellow
    }
    Write-Host "  [??] Ollama (local - check if running)" -ForegroundColor Yellow
}
