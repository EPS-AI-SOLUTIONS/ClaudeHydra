# Test Unified Advanced AI Interface
$ErrorActionPreference = "Continue"

Write-Host "`n=== HYDRA Unified AI Interface Test ===" -ForegroundColor Cyan

# Import all modules
Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\SelfCorrection.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\FewShotLearning.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\SpeculativeDecoding.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\LoadBalancer.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\SemanticFileMapping.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\AdvancedAI.psm1" -Force -DisableNameChecking

# Initialize cache
Initialize-FewShotCache | Out-Null

Write-Host "`n--- 1. Testing Mode Detection ---" -ForegroundColor Yellow
$codeMode = Get-OptimalMode -Prompt "Write a Python function"
$analysisMode = Get-OptimalMode -Prompt "Explain how databases work"
$fastMode = Get-OptimalMode -Prompt "What is 2+2?"
Write-Host "  'Write a Python function' -> $codeMode" -ForegroundColor $(if ($codeMode -eq "code") {"Green"} else {"Red"})
Write-Host "  'Explain how databases work' -> $analysisMode" -ForegroundColor $(if ($analysisMode -eq "analysis") {"Green"} else {"Red"})
Write-Host "  'What is 2+2?' -> $fastMode" -ForegroundColor $(if ($fastMode -eq "fast") {"Green"} else {"Red"})

Write-Host "`n--- 2. Testing Invoke-AdvancedAI (Fast Mode) ---" -ForegroundColor Yellow
Write-Host "  Prompt: 'What is the capital of Poland?'" -ForegroundColor Gray
$fastResult = Invoke-AdvancedAI -Prompt "What is the capital of Poland?" -Mode "fast" -MaxTokens 100
Write-Host "  Mode: $($fastResult.Mode)" -ForegroundColor Cyan
Write-Host "  Model: $($fastResult.Model)" -ForegroundColor Cyan
Write-Host "  Time: $([math]::Round($fastResult.ElapsedSeconds, 2))s" -ForegroundColor Cyan
Write-Host "  Response: $($fastResult.Content.Substring(0, [math]::Min(100, $fastResult.Content.Length)))..." -ForegroundColor White

Write-Host "`n--- 3. Testing Invoke-AdvancedAI (Code Mode) ---" -ForegroundColor Yellow
Write-Host "  Prompt: 'Write a Python function to reverse a string'" -ForegroundColor Gray
$codeResult = Invoke-AdvancedAI -Prompt "Write a Python function to reverse a string" -Mode "code" -MaxTokens 256
Write-Host "  Mode: $($codeResult.Mode)" -ForegroundColor Cyan
Write-Host "  Model: $($codeResult.Model)" -ForegroundColor Cyan
Write-Host "  Valid: $($codeResult.Valid)" -ForegroundColor $(if ($codeResult.Valid) {"Green"} else {"Yellow"})
Write-Host "  Time: $([math]::Round($codeResult.ElapsedSeconds, 2))s" -ForegroundColor Cyan
Write-Host "  Code Preview:" -ForegroundColor White
$preview = $codeResult.Content.Substring(0, [math]::Min(200, $codeResult.Content.Length))
Write-Host "  $preview..." -ForegroundColor Gray

Write-Host "`n--- 4. Testing Convenience Functions ---" -ForegroundColor Yellow

Write-Host "  Get-AIQuick 'Name 3 colors'..." -ForegroundColor Gray
$quickResult = Get-AIQuick "Name 3 colors"
Write-Host "  Response: $($quickResult.Content.Substring(0, [math]::Min(80, $quickResult.Content.Length)))..." -ForegroundColor White

Write-Host "`n--- 5. Testing Get-AdvancedAIStatus ---" -ForegroundColor Yellow
$status = Get-AdvancedAIStatus
Write-Host "  Ollama: $($status.OllamaRunning)" -ForegroundColor $(if ($status.OllamaRunning) {"Green"} else {"Red"})
Write-Host "  Self-Correction: $($status.SelfCorrectionEnabled)" -ForegroundColor Cyan
Write-Host "  Few-Shot: $($status.FewShotEnabled)" -ForegroundColor Cyan
Write-Host "  Speculative: $($status.SpeculativeEnabled)" -ForegroundColor Cyan
Write-Host "  System Load: CPU $($status.SystemLoad.CpuPercent)% | Memory $($status.SystemLoad.MemoryPercent)%" -ForegroundColor Cyan

Write-Host "`n=== ALL UNIFIED AI TESTS COMPLETE ===" -ForegroundColor Green
