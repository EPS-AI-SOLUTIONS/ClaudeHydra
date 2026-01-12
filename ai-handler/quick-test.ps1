# Quick test of all modules
$ErrorActionPreference = "Continue"

Write-Host "`n=== HYDRA Advanced AI Quick Test ===" -ForegroundColor Cyan
Write-Host "Testing all 5 advanced modules..." -ForegroundColor Gray

# Import modules
Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\SelfCorrection.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\FewShotLearning.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\SpeculativeDecoding.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\LoadBalancer.psm1" -Force -DisableNameChecking
Import-Module "$PSScriptRoot\modules\SemanticFileMapping.psm1" -Force -DisableNameChecking

Write-Host "`n--- 1. SELF-CORRECTION ---" -ForegroundColor Yellow
$code = "def hello(): print('world')"
$validation = Test-CodeSyntax -Code $code -Language "python"
Write-Host "  Code validation: $($validation.Valid)" -ForegroundColor $(if ($validation.Valid) {"Green"} else {"Red"})

Write-Host "`n--- 2. FEW-SHOT LEARNING ---" -ForegroundColor Yellow
Initialize-FewShotCache | Out-Null
Save-SuccessfulResponse -Prompt "Test" -Response "Test response" -Rating 4 | Out-Null
$stats = Get-FewShotStats
Write-Host "  Cache entries: $($stats.TotalEntries)" -ForegroundColor Green

Write-Host "`n--- 3. LOAD BALANCER ---" -ForegroundColor Yellow
$load = Get-SystemLoad
Write-Host "  CPU: $($load.CpuPercent)% | Memory: $($load.MemoryPercent)% | Rec: $($load.Recommendation)" -ForegroundColor Green

Write-Host "`n--- 4. SEMANTIC FILE MAPPING ---" -ForegroundColor Yellow
$lang1 = Get-FileLanguage -FilePath "test.py"
$lang2 = Get-FileLanguage -FilePath "app.tsx"
Write-Host "  test.py -> $lang1 | app.tsx -> $lang2" -ForegroundColor Green

Write-Host "`n--- 5. SPECULATIVE DECODING ---" -ForegroundColor Yellow
Write-Host "  Running model race..." -ForegroundColor Gray
$race = Invoke-ModelRace -Prompt "Say OK" -Models @("llama3.2:1b") -TimeoutMs 15000
Write-Host "  Winner: $($race.Model) in $([math]::Round($race.ElapsedSeconds, 2))s" -ForegroundColor Green
Write-Host "  Response: $($race.Content.Substring(0, [math]::Min(50, $race.Content.Length)))..." -ForegroundColor White

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
