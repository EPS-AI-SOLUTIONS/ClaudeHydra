#Requires -Version 5.1
<#
.SYNOPSIS
    Demo script for Advanced AI features
.DESCRIPTION
    Demonstrates all three advanced AI capabilities:
    1. Agentic Self-Correction
    2. Dynamic Few-Shot Learning
    3. Speculative Decoding
.EXAMPLE
    .\Demo-AdvancedAI.ps1
.EXAMPLE
    .\Demo-AdvancedAI.ps1 -Demo SelfCorrection
.EXAMPLE
    .\Demo-AdvancedAI.ps1 -Demo All
#>

param(
    [ValidateSet("SelfCorrection", "FewShot", "Speculation", "All")]
    [string]$Demo = "All",

    [switch]$Interactive
)

$ErrorActionPreference = "Stop"

# Initialize - import modules directly to ensure they're in scope
$modulesPath = Join-Path $PSScriptRoot "modules"

# Load main module first
Import-Module (Join-Path $PSScriptRoot "AIModelHandler.psm1") -Force -DisableNameChecking -Scope Global

# Load all advanced modules individually (order matters - AdvancedAI last)
$moduleList = @("SelfCorrection", "FewShotLearning", "SpeculativeDecoding", "LoadBalancer", "SemanticFileMapping")
foreach ($modName in $moduleList) {
    $modPath = Join-Path $modulesPath "$modName.psm1"
    if (Test-Path $modPath) {
        Import-Module $modPath -Force -DisableNameChecking -Scope Global
        Write-Host "[Loaded] $modName" -ForegroundColor Gray
    }
}

# Load AdvancedAI last (it depends on others)
Import-Module (Join-Path $modulesPath "AdvancedAI.psm1") -Force -DisableNameChecking -Scope Global
Write-Host "[Loaded] AdvancedAI" -ForegroundColor Gray

# Initialize FewShot cache
Initialize-FewShotCache | Out-Null

# Show banner
Write-Host @"

    _       _                               _      _    ___
   / \   __| |_   ____ _ _ __   ___ ___  __| |    / \  |_ _|
  / _ \ / _`  \ \ / / _`  | '_ \ / __/ _ \/ _`  |   / _ \  | |
 / ___ \ (_| |\ V / (_| | | | | (_|  __/ (_| |  / ___ \ | |
/_/   \_\__,_| \_/ \__,_|_| |_|\___\___|\__,_| /_/   \_\___|

        HYDRA Advanced AI Demo v2.0

"@ -ForegroundColor Cyan

function Show-Header {
    param([string]$Title)
    Write-Host "`n" -NoNewline
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor White
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host ""
}

function Wait-ForUser {
    if ($Interactive) {
        Write-Host "`nPress Enter to continue..." -ForegroundColor Gray
        Read-Host | Out-Null
    } else {
        Start-Sleep -Seconds 1
    }
}

#region Demo: Self-Correction

function Demo-SelfCorrection {
    Show-Header "DEMO 1: Agentic Self-Correction"

    Write-Host @"
Self-Correction automatically validates generated code using a fast
validation model (phi3:mini) and regenerates if issues are found.

"@ -ForegroundColor Gray

    # Demo 1: Simple syntax validation
    Write-Host "--- Test 1: Syntax Validation ---" -ForegroundColor Yellow

    $testCode = @"
def greet(name):
    print(f"Hello, {name}!")
    return True
"@

    Write-Host "Testing valid Python code:" -ForegroundColor Cyan
    Write-Host $testCode -ForegroundColor White

    $result = Test-CodeSyntax -Code $testCode -Language "python"

    Write-Host "`nResult: $(if ($result.Valid) { 'VALID' } else { 'INVALID' })" -ForegroundColor $(if ($result.Valid) { "Green" } else { "Red" })
    Write-Host "Language: $($result.Language)" -ForegroundColor Gray

    Wait-ForUser

    # Demo 2: Code with issues
    Write-Host "`n--- Test 2: Code with Syntax Errors ---" -ForegroundColor Yellow

    $brokenCode = @"
def broken_function(
    print("Missing closing paren"
    return
"@

    Write-Host "Testing broken Python code:" -ForegroundColor Cyan
    Write-Host $brokenCode -ForegroundColor White

    $result2 = Test-CodeSyntax -Code $brokenCode -Language "python"

    Write-Host "`nResult: $(if ($result2.Valid) { 'VALID' } else { 'INVALID' })" -ForegroundColor $(if ($result2.Valid) { "Green" } else { "Red" })
    if ($result2.Issues.Count -gt 0) {
        Write-Host "Issues found:" -ForegroundColor Yellow
        foreach ($issue in $result2.Issues) {
            Write-Host "  - $issue" -ForegroundColor Yellow
        }
    }

    Wait-ForUser

    # Demo 3: Full self-correction pipeline
    Write-Host "`n--- Test 3: Full Self-Correction Pipeline ---" -ForegroundColor Yellow
    Write-Host "Generating code with automatic self-correction..." -ForegroundColor Cyan

    $prompt = "Write a Python function that calculates factorial using recursion"

    $correctedResult = Invoke-CodeWithSelfCorrection -Prompt $prompt -MaxAttempts 2

    Write-Host "`nGenerated Code:" -ForegroundColor Green
    Write-Host $correctedResult.Code -ForegroundColor White
    Write-Host "`nAttempts: $($correctedResult.Attempts) | Valid: $($correctedResult.Valid) | Language: $($correctedResult.Language)" -ForegroundColor Gray

    Wait-ForUser
}

#endregion

#region Demo: Few-Shot Learning

function Demo-FewShot {
    Show-Header "DEMO 2: Dynamic Few-Shot Learning"

    Write-Host @"
Few-Shot Learning stores successful responses and automatically
includes relevant examples when generating similar content.

"@ -ForegroundColor Gray

    # Demo 1: Save a successful example
    Write-Host "--- Test 1: Saving Successful Response ---" -ForegroundColor Yellow

    $examplePrompt = "Write a SQL query to find users who signed up in the last 30 days"
    $exampleResponse = @"
SELECT id, username, email, created_at
FROM users
WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
ORDER BY created_at DESC;
"@

    Write-Host "Saving example SQL query..." -ForegroundColor Cyan
    Write-Host "Prompt: $examplePrompt" -ForegroundColor White
    Write-Host "Response:`n$exampleResponse" -ForegroundColor White

    $savedId = Save-SuccessfulResponse -Prompt $examplePrompt -Response $exampleResponse -Rating 5

    Write-Host "`nSaved with ID: $savedId" -ForegroundColor Green

    Wait-ForUser

    # Demo 2: Retrieve relevant examples
    Write-Host "`n--- Test 2: Retrieving Similar Examples ---" -ForegroundColor Yellow

    $newQuery = "Write a SQL query to get active users from the database"

    Write-Host "New query: $newQuery" -ForegroundColor Cyan
    Write-Host "Searching for relevant examples..." -ForegroundColor Gray

    $examples = Get-SuccessfulExamples -Query $newQuery -MaxExamples 3

    Write-Host "`nFound $($examples.Count) relevant example(s):" -ForegroundColor Green
    foreach ($ex in $examples) {
        Write-Host "  Category: $($ex.category) | Rating: $($ex.rating)" -ForegroundColor Gray
        Write-Host "  Prompt: $($ex.prompt.Substring(0, [Math]::Min(50, $ex.prompt.Length)))..." -ForegroundColor White
    }

    Wait-ForUser

    # Demo 3: Generate with Few-Shot
    Write-Host "`n--- Test 3: Generation with Few-Shot Examples ---" -ForegroundColor Yellow

    Write-Host "Generating SQL with learned examples..." -ForegroundColor Cyan

    $fewShotResult = Invoke-AIWithFewShot -Prompt $newQuery -Model "llama3.2:3b" -MaxTokens 512

    Write-Host "`nGenerated Response:" -ForegroundColor Green
    Write-Host $fewShotResult.Content -ForegroundColor White
    Write-Host "`nExamples Used: $($fewShotResult.ExamplesUsed)" -ForegroundColor Gray

    Wait-ForUser

    # Demo 4: Show stats
    Write-Host "`n--- Test 4: Few-Shot Cache Statistics ---" -ForegroundColor Yellow

    $stats = Get-FewShotStats

    Write-Host "Cache Statistics:" -ForegroundColor Cyan
    Write-Host "  Total Entries: $($stats.TotalEntries)" -ForegroundColor White
    Write-Host "  Categories: $($stats.Categories.Keys -join ', ')" -ForegroundColor White
    Write-Host "  Average Rating: $($stats.AverageRating)" -ForegroundColor White
    Write-Host "  Total Uses: $($stats.TotalUses)" -ForegroundColor White

    Wait-ForUser
}

#endregion

#region Demo: Speculative Decoding

function Demo-Speculation {
    Show-Header "DEMO 3: Speculative Decoding"

    Write-Host @"
Speculative Decoding runs multiple models in parallel and returns
the best result based on speed and validation.

"@ -ForegroundColor Gray

    # Demo 1: Basic speculation
    Write-Host "--- Test 1: Basic Speculative Decoding ---" -ForegroundColor Yellow

    $prompt = "Explain the difference between stack and heap memory in 3 sentences"

    Write-Host "Prompt: $prompt" -ForegroundColor Cyan
    Write-Host "Running fast (llama3.2:1b) and accurate (llama3.2:3b) in parallel..." -ForegroundColor Gray

    $specResult = Invoke-SpeculativeDecoding -Prompt $prompt -TimeoutMs 30000

    Write-Host "`nResult:" -ForegroundColor Green
    Write-Host $specResult.Content -ForegroundColor White
    Write-Host "`nSelected: $($specResult.ModelType) model ($($specResult.Model))" -ForegroundColor Gray
    Write-Host "Reason: $($specResult.SelectionReason)" -ForegroundColor Gray
    Write-Host "Time: $([math]::Round($specResult.ElapsedSeconds, 2))s" -ForegroundColor Gray

    Wait-ForUser

    # Demo 2: Model Racing
    Write-Host "`n--- Test 2: Model Racing ---" -ForegroundColor Yellow

    $racePrompt = "What is the capital of Japan?"

    Write-Host "Prompt: $racePrompt" -ForegroundColor Cyan
    Write-Host "Racing 3 models for fastest response..." -ForegroundColor Gray

    $raceResult = Invoke-ModelRace -Prompt $racePrompt -Models @("llama3.2:1b", "phi3:mini", "llama3.2:3b") -TimeoutMs 15000

    Write-Host "`nWinner: $($raceResult.Model)" -ForegroundColor Green
    Write-Host "Response: $($raceResult.Content)" -ForegroundColor White
    Write-Host "Time: $([math]::Round($raceResult.ElapsedSeconds, 2))s" -ForegroundColor Gray

    Wait-ForUser

    # Demo 3: Code Speculation
    Write-Host "`n--- Test 3: Code-Optimized Speculation ---" -ForegroundColor Yellow

    $codePrompt = "Write a JavaScript function to reverse a string"

    Write-Host "Prompt: $codePrompt" -ForegroundColor Cyan
    Write-Host "Using specialized code speculation (llama3.2:1b + qwen2.5-coder)..." -ForegroundColor Gray

    $codeSpecResult = Invoke-CodeSpeculation -Prompt $codePrompt -MaxTokens 512

    Write-Host "`nGenerated Code:" -ForegroundColor Green
    Write-Host $codeSpecResult.Content -ForegroundColor White
    Write-Host "`nModel: $($codeSpecResult.Model) | Time: $([math]::Round($codeSpecResult.ElapsedSeconds, 2))s" -ForegroundColor Gray

    Wait-ForUser

    # Demo 4: Consensus Generation
    Write-Host "`n--- Test 4: Multi-Model Consensus ---" -ForegroundColor Yellow

    $consensusPrompt = "List 3 benefits of using TypeScript over JavaScript"

    Write-Host "Prompt: $consensusPrompt" -ForegroundColor Cyan
    Write-Host "Generating with multiple models and checking consensus..." -ForegroundColor Gray

    $consensusResult = Invoke-ConsensusGeneration -Prompt $consensusPrompt -Models @("llama3.2:3b", "phi3:mini") -MaxTokens 512

    Write-Host "`nConsensus Response:" -ForegroundColor Green
    Write-Host $consensusResult.Content -ForegroundColor White
    Write-Host "`nHas Consensus: $($consensusResult.Consensus) | Similarity: $([math]::Round($consensusResult.Similarity * 100, 1))%" -ForegroundColor Gray

    Wait-ForUser
}

#endregion

#region Demo: Unified Interface

function Demo-Unified {
    Show-Header "DEMO 4: Unified Advanced AI Interface"

    Write-Host @"
The unified interface (Invoke-AdvancedAI) combines all features
and automatically selects the best approach based on your prompt.

"@ -ForegroundColor Gray

    # Demo 1: Auto mode
    Write-Host "--- Test 1: Auto Mode Selection ---" -ForegroundColor Yellow

    $prompts = @(
        "Write a Python class for a binary search tree"
        "Explain how HTTPS encryption works"
        "What is 2 + 2?"
    )

    foreach ($p in $prompts) {
        Write-Host "`nPrompt: $p" -ForegroundColor Cyan
        $result = Invoke-AdvancedAI -Prompt $p -Mode "auto" -MaxTokens 256

        Write-Host "Auto-selected mode: $($result.Mode)" -ForegroundColor Yellow
        Write-Host "Response preview: $($result.Content.Substring(0, [Math]::Min(100, $result.Content.Length)))..." -ForegroundColor White
        Write-Host "Time: $([math]::Round($result.ElapsedSeconds, 2))s" -ForegroundColor Gray
    }

    Wait-ForUser

    # Demo 2: Convenience functions
    Write-Host "`n--- Test 2: Convenience Functions ---" -ForegroundColor Yellow

    Write-Host "`nNew-AICode example:" -ForegroundColor Cyan
    $codeResult = New-AICode "PowerShell function to get disk space"

    Write-Host "`nGet-AIQuick example:" -ForegroundColor Cyan
    $quickResult = Get-AIQuick "Name the 4 seasons"

    Wait-ForUser
}

#endregion

#region Main

Write-Host @"

=============================================
   Advanced AI Demo - HYDRA System v1.0
=============================================

This demo showcases three innovative AI features:

1. Agentic Self-Correction
   - Automatic code validation
   - Error detection and regeneration

2. Dynamic Few-Shot Learning
   - Learn from successful responses
   - Context-aware examples

3. Speculative Decoding
   - Parallel multi-model generation
   - Speed vs quality optimization

"@ -ForegroundColor White

switch ($Demo) {
    "SelfCorrection" {
        Demo-SelfCorrection
    }
    "FewShot" {
        Demo-FewShot
    }
    "Speculation" {
        Demo-Speculation
    }
    "All" {
        Demo-SelfCorrection
        Demo-FewShot
        Demo-Speculation
        Demo-Unified
    }
}

Show-Header "Demo Complete!"

Write-Host @"
All advanced AI features are now available.

Quick Reference:
  Invoke-AdvancedAI -Prompt "..." -Mode [auto|code|analysis|fast|consensus|fewshot]
  New-AICode "description"
  Get-AIAnalysis "topic"
  Get-AIQuick "question"

Check status: Get-AdvancedAIStatus

"@ -ForegroundColor Green

#endregion
