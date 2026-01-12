#Requires -Version 5.1
<#
.SYNOPSIS
    Initialize Advanced AI Modules for ClaudeCLI
.DESCRIPTION
    Loads and initializes all advanced AI capabilities:
    - Agentic Self-Correction
    - Dynamic Few-Shot Learning
    - Speculative Decoding

    Run this script to enable advanced AI features.
.EXAMPLE
    . .\Initialize-AdvancedAI.ps1
.EXAMPLE
    . "C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\Initialize-AdvancedAI.ps1"
#>

$ErrorActionPreference = "Stop"

$script:AIHandlerPath = $PSScriptRoot
$script:ModulesPath = Join-Path $PSScriptRoot "modules"

Write-Host @"

    _       _                               _      _    ___
   / \   __| |_   ____ _ _ __   ___ ___  __| |    / \  |_ _|
  / _ \ / _` \ \ / / _` | '_ \ / __/ _ \/ _` |   / _ \  | |
 / ___ \ (_| |\ V / (_| | | | | (_|  __/ (_| |  / ___ \ | |
/_/   \_\__,_| \_/ \__,_|_| |_|\___\___|\__,_| /_/   \_\___|

        HYDRA Advanced AI System v2.0
        Self-Correction | Few-Shot | Speculation | Load Balancing | Semantic RAG

"@ -ForegroundColor Cyan

# Load main AI Handler
Write-Host "[Init] Loading AIModelHandler..." -ForegroundColor Gray
$mainModule = Join-Path $script:AIHandlerPath "AIModelHandler.psm1"
if (Test-Path $mainModule) {
    Import-Module $mainModule -Force -Global
    Write-Host "[OK] AIModelHandler loaded" -ForegroundColor Green
} else {
    Write-Error "AIModelHandler.psm1 not found at $mainModule"
}

# Load advanced modules
$advancedModules = @(
    @{ Name = "SelfCorrection"; Desc = "Agentic Self-Correction" }
    @{ Name = "FewShotLearning"; Desc = "Dynamic Few-Shot Learning" }
    @{ Name = "SpeculativeDecoding"; Desc = "Speculative Decoding" }
    @{ Name = "LoadBalancer"; Desc = "Dynamic Load Balancing" }
    @{ Name = "SemanticFileMapping"; Desc = "Semantic File Mapping (RAG)" }
    @{ Name = "AdvancedAI"; Desc = "Unified Advanced AI Interface" }
)

foreach ($mod in $advancedModules) {
    $path = Join-Path $script:ModulesPath "$($mod.Name).psm1"
    Write-Host "[Init] Loading $($mod.Desc)..." -ForegroundColor Gray

    if (Test-Path $path) {
        try {
            Import-Module $path -Force -Global
            Write-Host "[OK] $($mod.Name) loaded" -ForegroundColor Green
        } catch {
            Write-Warning "[WARN] Failed to load $($mod.Name): $($_.Exception.Message)"
        }
    } else {
        Write-Warning "[WARN] Module not found: $path"
    }
}

# Check Ollama availability
Write-Host "`n[Init] Checking Ollama..." -ForegroundColor Gray

# Define local check function to avoid scope issues
function Test-OllamaRunning {
    try {
        $request = [System.Net.WebRequest]::Create("http://localhost:11434/api/tags")
        $request.Method = "GET"
        $request.Timeout = 3000
        $response = $request.GetResponse()
        $response.Close()
        return $true
    } catch {
        return $false
    }
}

if (Test-OllamaRunning) {
    Write-Host "[OK] Ollama is running" -ForegroundColor Green

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction SilentlyContinue
        if ($response.models) {
            $modelNames = $response.models | ForEach-Object { $_.name }
            Write-Host "[OK] Available models: $($modelNames -join ', ')" -ForegroundColor Green
        }
    } catch {
        Write-Host "[OK] Ollama running (could not list models)" -ForegroundColor Green
    }
} else {
    Write-Host "[WARN] Ollama is not running. Starting..." -ForegroundColor Yellow
    $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (Test-Path $ollamaExe) {
        Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3
        if (Test-OllamaRunning) {
            Write-Host "[OK] Ollama started successfully" -ForegroundColor Green
        }
    } else {
        Write-Host "[INFO] Ollama not installed. Run Install-Ollama.ps1 to install." -ForegroundColor Yellow
    }
}

# Initialize cache
Write-Host "`n[Init] Initializing Few-Shot cache..." -ForegroundColor Gray
$cachePath = Join-Path $script:AIHandlerPath "cache"
if (-not (Test-Path $cachePath)) {
    New-Item -ItemType Directory -Path $cachePath -Force | Out-Null
}
Write-Host "[OK] Cache ready at $cachePath" -ForegroundColor Green

Write-Host @"

=== Advanced AI Ready ===

Unified Interface:
  Invoke-AdvancedAI    - Unified AI generation with all features
  New-AICode           - Quick code generation with self-correction
  Get-AIAnalysis       - Analysis with speculative decoding
  Get-AIQuick          - Fastest response using model racing
  Get-AdvancedAIStatus - Check system status

Self-Correction:
  Invoke-SelfCorrection       - Validate code
  Invoke-CodeWithSelfCorrection - Generate code with auto-fix

Few-Shot Learning:
  Get-SuccessfulExamples      - Get relevant examples
  Save-SuccessfulResponse     - Save successful response
  Get-FewShotStats            - View cache statistics

Speculative Decoding:
  Invoke-SpeculativeDecoding  - Parallel multi-model generation
  Invoke-CodeSpeculation      - Code-optimized speculation
  Invoke-ModelRace            - Race models for speed
  Invoke-ConsensusGeneration  - Multi-model consensus

Load Balancing:
  Get-LoadBalancedProvider    - Auto-select provider based on CPU
  Invoke-LoadBalancedBatch    - CPU-aware batch processing
  Get-LoadBalancerStatus      - View load and thresholds
  Watch-SystemLoad            - Monitor CPU/memory in real-time

Semantic File Mapping:
  Get-RelatedFiles            - Find files related by imports
  Build-DependencyGraph       - Build project dependency graph
  Get-ExpandedContext         - Get AI context with related files
  Invoke-SemanticQuery        - Query about file with full context
  Get-ProjectStructure        - Analyze project structure

Examples:
  Invoke-AdvancedAI "Write Python merge sort" -Mode code
  Invoke-LoadBalancedBatch -Prompts @("Q1","Q2","Q3") -AdaptiveBalancing
  Invoke-SemanticQuery -FilePath "app.py" -Query "How does auth work?" -IncludeRelated

"@ -ForegroundColor White
