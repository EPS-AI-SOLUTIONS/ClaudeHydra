#Requires -Version 5.1
# ============================================================
#          AI HANDLER - FULL SYSTEM TEST
# ============================================================

$ErrorActionPreference = "Stop"
$script:TestResults = @()
$script:StartTime = Get-Date

function Write-TestHeader {
    param([string]$Title)
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-TestResult {
    param([string]$Test, [bool]$Passed, [string]$Details = "")

    $status = if ($Passed) { "[PASS]" } else { "[FAIL]" }
    $color = if ($Passed) { "Green" } else { "Red" }

    Write-Host "  $status " -NoNewline -ForegroundColor $color
    Write-Host $Test -NoNewline -ForegroundColor White
    if ($Details) {
        Write-Host " - $Details" -ForegroundColor Gray
    } else {
        Write-Host ""
    }

    $script:TestResults += @{
        Test = $Test
        Passed = $Passed
        Details = $Details
    }
}

# ============================================================
Write-Host ""
Write-Host "  ############################################" -ForegroundColor Magenta
Write-Host "  #     AI HANDLER - FULL SYSTEM TEST       #" -ForegroundColor Magenta
Write-Host "  ############################################" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Starting comprehensive test suite..." -ForegroundColor Gray
Write-Host "  Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray

# ============================================================
# TEST 1: Module Loading
# ============================================================
Write-TestHeader "TEST 1: Module Loading"

try {
    $modulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"
    Import-Module $modulePath -Force -Global
    Write-TestResult "Import AIModelHandler.psm1" $true
} catch {
    Write-TestResult "Import AIModelHandler.psm1" $false $_.Exception.Message
    exit 1
}

# Check exported functions
$expectedFunctions = @(
    "Get-AIConfig", "Invoke-AIRequest", "Invoke-AIRequestParallel",
    "Invoke-AIBatch", "Get-LocalModels", "Test-OllamaAvailable"
)

foreach ($func in $expectedFunctions) {
    $exists = Get-Command $func -ErrorAction SilentlyContinue
    Write-TestResult "Function: $func" ($null -ne $exists)
}

# ============================================================
# TEST 2: Configuration
# ============================================================
Write-TestHeader "TEST 2: Configuration"

try {
    $config = Get-AIConfig
    Write-TestResult "Load ai-config.json" $true

    # Check structure
    Write-TestResult "Config has providers" ($null -ne $config.providers)
    Write-TestResult "Config has fallbackChain" ($null -ne $config.fallbackChain)
    Write-TestResult "Config has settings" ($null -ne $config.settings)

    # Check settings
    Write-TestResult "preferLocal = $($config.settings.preferLocal)" $config.settings.preferLocal
    Write-TestResult "autoFallback = $($config.settings.autoFallback)" $config.settings.autoFallback
    Write-TestResult "parallelExecution.maxConcurrent = $($config.settings.parallelExecution.maxConcurrent)" ($config.settings.parallelExecution.maxConcurrent -gt 0)

} catch {
    Write-TestResult "Load configuration" $false $_.Exception.Message
}

# ============================================================
# TEST 3: Ollama Availability
# ============================================================
Write-TestHeader "TEST 3: Ollama Availability"

$ollamaAvailable = Test-OllamaAvailable
Write-TestResult "Ollama is running" $ollamaAvailable

if ($ollamaAvailable) {
    $models = Get-LocalModels
    Write-TestResult "Get local models" ($models.Count -gt 0) "$($models.Count) models found"

    foreach ($model in $models) {
        Write-TestResult "Model: $($model.Name)" $true "$($model.Size) GB"
    }
} else {
    Write-Host "  [WARN] Ollama not running - skipping local tests" -ForegroundColor Yellow
}

# ============================================================
# TEST 4: Single Request (Local)
# ============================================================
Write-TestHeader "TEST 4: Single Request (Ollama)"

if ($ollamaAvailable) {
    try {
        $messages = @(@{ role = "user"; content = "What is 2+2? Answer with just the number." })

        $startReq = Get-Date
        $response = Invoke-AIRequest -Provider "ollama" -Model "llama3.2:1b" -Messages $messages -MaxTokens 50
        $elapsed = ((Get-Date) - $startReq).TotalSeconds

        $hasContent = $response.content -match "\d"
        Write-TestResult "Ollama single request" $hasContent "Response: $($response.content.Trim()) (${elapsed}s)"
        Write-TestResult "Response has usage stats" ($null -ne $response.usage)
        Write-TestResult "Response has _meta" ($null -ne $response._meta)

    } catch {
        Write-TestResult "Ollama single request" $false $_.Exception.Message
    }
} else {
    Write-Host "  [SKIP] Ollama not available" -ForegroundColor Yellow
}

# ============================================================
# TEST 5: Code Detection & Model Selection
# ============================================================
Write-TestHeader "TEST 5: Code Detection"

$codeQueries = @(
    @{ Query = "Write a Python function"; Expected = $true },
    @{ Query = "What is the capital of France?"; Expected = $false },
    @{ Query = "Create a regex for email"; Expected = $true },
    @{ Query = "How are you today?"; Expected = $false },
    @{ Query = "Implement sorting algorithm in JavaScript"; Expected = $true }
)

$codePatterns = @(
    "write.*(function|code|script|class|method)",
    "create.*(function|code|script|class|method)",
    "implement\s+",
    "\b(regex|regexp)\b",
    "in\s+(python|javascript|powershell|bash)"
)

foreach ($test in $codeQueries) {
    $isCode = $false
    foreach ($pattern in $codePatterns) {
        if ($test.Query -match $pattern) {
            $isCode = $true
            break
        }
    }
    $passed = $isCode -eq $test.Expected
    $result = if ($isCode) { "CODE" } else { "GENERAL" }
    Write-TestResult "Detect: '$($test.Query.Substring(0, [Math]::Min(30, $test.Query.Length)))...'" $passed $result
}

# ============================================================
# TEST 6: Parallel Execution
# ============================================================
Write-TestHeader "TEST 6: Parallel Execution"

if ($ollamaAvailable) {
    try {
        $prompts = @(
            "What is 1+1? Number only.",
            "What is 2+2? Number only.",
            "What is 3+3? Number only.",
            "What is 4+4? Number only."
        )

        $startBatch = Get-Date
        $results = Invoke-AIBatch -Prompts $prompts -Model "llama3.2:1b" -MaxTokens 20
        $elapsed = ((Get-Date) - $startBatch).TotalSeconds

        $successCount = ($results | Where-Object { $_.Success }).Count
        Write-TestResult "Batch execution (4 parallel)" ($successCount -eq 4) "$successCount/4 success in ${elapsed}s"

        # Check each result
        for ($i = 0; $i -lt $results.Count; $i++) {
            $r = $results[$i]
            if ($r.Success) {
                Write-TestResult "  Result[$i]" $true $r.Content.Trim()
            } else {
                Write-TestResult "  Result[$i]" $false $r.Error
            }
        }

        # Performance check
        $avgTime = $elapsed / 4
        $isEfficient = $avgTime -lt 2  # Should be under 2s per request on average
        Write-TestResult "Parallel efficiency" $isEfficient "Avg: ${avgTime}s/request"

    } catch {
        Write-TestResult "Batch execution" $false $_.Exception.Message
    }
} else {
    Write-Host "  [SKIP] Ollama not available" -ForegroundColor Yellow
}

# ============================================================
# TEST 7: Provider Fallback Chain
# ============================================================
Write-TestHeader "TEST 7: Fallback Chain"

$configPath = Join-Path $PSScriptRoot "ai-config.json"
$jsonConfig = Get-Content $configPath -Raw | ConvertFrom-Json

Write-TestResult "Provider order defined" ($jsonConfig.providerFallbackOrder.Count -gt 0) ($jsonConfig.providerFallbackOrder -join " -> ")

foreach ($provider in $jsonConfig.providerFallbackOrder) {
    $chain = $jsonConfig.fallbackChain.$provider
    $hasChain = $chain.Count -gt 0
    Write-TestResult "Fallback chain: $provider" $hasChain ($chain -join " -> ")
}

# ============================================================
# TEST 8: OpenAI Connectivity (if key available)
# ============================================================
Write-TestHeader "TEST 8: OpenAI Provider"

$openaiKey = $env:OPENAI_API_KEY
if ($openaiKey) {
    try {
        $messages = @(@{ role = "user"; content = "Say OK" })

        $startReq = Get-Date
        $response = Invoke-AIRequest -Provider "openai" -Model "gpt-4o-mini" -Messages $messages -MaxTokens 10
        $elapsed = ((Get-Date) - $startReq).TotalMilliseconds

        Write-TestResult "OpenAI request" $true "${elapsed}ms"
    } catch {
        Write-TestResult "OpenAI request" $false $_.Exception.Message
    }
} else {
    Write-Host "  [SKIP] OPENAI_API_KEY not set" -ForegroundColor Yellow
}

# ============================================================
# TEST 9: Anthropic Connectivity (if key available)
# ============================================================
Write-TestHeader "TEST 9: Anthropic Provider"

$anthropicKey = $env:ANTHROPIC_API_KEY
if ($anthropicKey) {
    try {
        $messages = @(@{ role = "user"; content = "Say OK" })

        $startReq = Get-Date
        $response = Invoke-AIRequest -Provider "anthropic" -Model "claude-3-5-haiku-20241022" -Messages $messages -MaxTokens 10
        $elapsed = ((Get-Date) - $startReq).TotalMilliseconds

        Write-TestResult "Anthropic request" $true "${elapsed}ms"
    } catch {
        Write-TestResult "Anthropic request" $false $_.Exception.Message
    }
} else {
    Write-Host "  [SKIP] ANTHROPIC_API_KEY not set" -ForegroundColor Yellow
}

# ============================================================
# TEST 10: Command Scripts Exist
# ============================================================
Write-TestHeader "TEST 10: Command Scripts"

$scripts = @(
    "Invoke-QuickAI.ps1",
    "Invoke-QuickAIBatch.ps1",
    "Invoke-AIStatus.ps1",
    "Invoke-AIConfig.ps1",
    "Invoke-AIPull.ps1",
    "Invoke-AIHelp.ps1"
)

foreach ($script in $scripts) {
    $path = Join-Path $PSScriptRoot $script
    $exists = Test-Path $path
    Write-TestResult "Script: $script" $exists
}

# ============================================================
# TEST 11: Command Definitions Exist
# ============================================================
Write-TestHeader "TEST 11: Command Definitions"

$commands = @(
    "ai.md",
    "ai-batch.md",
    "ai-status.md",
    "ai-config.md",
    "ai-pull.md",
    "ai-help.md"
)

$commandsPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".claude\commands"

foreach ($cmd in $commands) {
    $path = Join-Path $commandsPath $cmd
    $exists = Test-Path $path
    Write-TestResult "Command: /$($cmd -replace '\.md$', '')" $exists
}

# ============================================================
# TEST 12: Real-World Scenario
# ============================================================
Write-TestHeader "TEST 12: Real-World Scenario"

if ($ollamaAvailable) {
    Write-Host "  Running code analysis scenario..." -ForegroundColor Gray

    try {
        # Simulate code analysis batch
        $analysisPrompts = @(
            "What is SQL injection? One sentence.",
            "What is XSS? One sentence.",
            "What is CSRF? One sentence."
        )

        $startScenario = Get-Date
        $results = Invoke-AIBatch -Prompts $analysisPrompts -Model "llama3.2:3b" -MaxTokens 100
        $elapsed = ((Get-Date) - $startScenario).TotalSeconds

        $successCount = ($results | Where-Object { $_.Success }).Count
        Write-TestResult "Security analysis batch" ($successCount -eq 3) "$successCount/3 in ${elapsed}s"

    } catch {
        Write-TestResult "Real-world scenario" $false $_.Exception.Message
    }
} else {
    Write-Host "  [SKIP] Ollama not available" -ForegroundColor Yellow
}

# ============================================================
# SUMMARY
# ============================================================
Write-Host ""
Write-Host "  ############################################" -ForegroundColor Magenta
Write-Host "  #              TEST SUMMARY                #" -ForegroundColor Magenta
Write-Host "  ############################################" -ForegroundColor Magenta
Write-Host ""

$totalTests = $script:TestResults.Count
$passedTests = ($script:TestResults | Where-Object { $_.Passed }).Count
$failedTests = $totalTests - $passedTests
$passRate = [math]::Round(($passedTests / $totalTests) * 100, 1)

$totalTime = ((Get-Date) - $script:StartTime).TotalSeconds

Write-Host "  Total Tests:  $totalTests" -ForegroundColor White
Write-Host "  Passed:       " -NoNewline; Write-Host $passedTests -ForegroundColor Green
Write-Host "  Failed:       " -NoNewline; Write-Host $failedTests -ForegroundColor $(if ($failedTests -eq 0) { "Green" } else { "Red" })
Write-Host "  Pass Rate:    " -NoNewline; Write-Host "$passRate%" -ForegroundColor $(if ($passRate -ge 90) { "Green" } elseif ($passRate -ge 70) { "Yellow" } else { "Red" })
Write-Host "  Total Time:   $([math]::Round($totalTime, 2))s" -ForegroundColor White
Write-Host ""

if ($failedTests -gt 0) {
    Write-Host "  FAILED TESTS:" -ForegroundColor Red
    $script:TestResults | Where-Object { -not $_.Passed } | ForEach-Object {
        Write-Host "  - $($_.Test): $($_.Details)" -ForegroundColor Red
    }
    Write-Host ""
}

$statusColor = if ($failedTests -eq 0) { "Green" } elseif ($failedTests -le 3) { "Yellow" } else { "Red" }
$statusText = if ($failedTests -eq 0) { "ALL TESTS PASSED" } elseif ($failedTests -le 3) { "MOSTLY PASSED" } else { "NEEDS ATTENTION" }

Write-Host "  ============================================" -ForegroundColor $statusColor
Write-Host "           $statusText" -ForegroundColor $statusColor
Write-Host "  ============================================" -ForegroundColor $statusColor
Write-Host ""
