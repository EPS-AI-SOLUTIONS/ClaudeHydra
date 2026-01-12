# Test AI Handler Fallback Chain
$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force

Write-Host @"

  ╔════════════════════════════════════════════════════════════════╗
  ║              AI HANDLER FALLBACK TEST                          ║
  ╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Test 1: Check all providers status
Write-Host "[TEST 1] Provider Status" -ForegroundColor Yellow
Write-Host "─────────────────────────" -ForegroundColor Gray
Get-AIStatus
Write-Host ""

# Test 2: Direct Ollama test
Write-Host "[TEST 2] Direct Ollama Request" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────" -ForegroundColor Gray

$messages = @(
    @{ role = "user"; content = "Say 'Hello from Ollama!' and nothing else." }
)

try {
    $response = Invoke-AIRequest -Messages $messages -Provider "ollama" -Model "llama3.2:1b" -MaxTokens 50

    Write-Host "Response: $($response.content)" -ForegroundColor Green
    Write-Host "Provider: $($response._meta.provider)" -ForegroundColor Gray
    Write-Host "Model: $($response._meta.model)" -ForegroundColor Gray
    Write-Host "Tokens: $($response.usage.input_tokens) in / $($response.usage.output_tokens) out" -ForegroundColor Gray
    Write-Host "[OK] Ollama test passed!" -ForegroundColor Green

} catch {
    Write-Host "[ERROR] Ollama test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Auto-fallback test (force Ollama by setting as only provider)
Write-Host "[TEST 3] Auto Model Selection (PreferCheapest)" -ForegroundColor Yellow
Write-Host "───────────────────────────────────────────────" -ForegroundColor Gray

$optimal = Get-OptimalModel -Task "simple" -EstimatedTokens 100 -PreferCheapest
if ($optimal) {
    Write-Host "Selected: $($optimal.provider)/$($optimal.model)" -ForegroundColor Green
    Write-Host "Tier: $($optimal.tier)" -ForegroundColor Gray
    Write-Host "Est. Cost: `$$([math]::Round($optimal.cost, 6))" -ForegroundColor Gray
} else {
    Write-Host "[ERROR] No model selected" -ForegroundColor Red
}

Write-Host ""

# Test 4: Full fallback chain simulation
Write-Host "[TEST 4] Fallback Chain Test" -ForegroundColor Yellow
Write-Host "────────────────────────────" -ForegroundColor Gray

Write-Host "Testing fallback from anthropic..." -ForegroundColor Gray

# Get fallback from anthropic's first model
$fallback1 = Get-FallbackModel -CurrentProvider "anthropic" -CurrentModel "claude-sonnet-4-20250514"
if ($fallback1) {
    Write-Host "  anthropic/claude-sonnet-4 -> $($fallback1.provider)/$($fallback1.model)" -ForegroundColor Cyan
}

$fallback2 = Get-FallbackModel -CurrentProvider "anthropic" -CurrentModel "claude-3-5-sonnet-20241022"
if ($fallback2) {
    Write-Host "  anthropic/claude-3-5-sonnet -> $($fallback2.provider)/$($fallback2.model)" -ForegroundColor Cyan
}

$fallback3 = Get-FallbackModel -CurrentProvider "anthropic" -CurrentModel "claude-3-5-haiku-20241022" -CrossProvider
if ($fallback3) {
    Write-Host "  anthropic/haiku [cross-provider] -> $($fallback3.provider)/$($fallback3.model)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host @"

  ╔════════════════════════════════════════════════════════════════╗
  ║              ALL TESTS COMPLETED                               ║
  ╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green
