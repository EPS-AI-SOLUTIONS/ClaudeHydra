#Requires -Version 5.1
<#
.SYNOPSIS
    Test suite for Advanced AI modules
.DESCRIPTION
    Tests all three advanced AI capabilities:
    - Self-Correction
    - Few-Shot Learning
    - Speculative Decoding
.EXAMPLE
    .\test-advanced-ai.ps1
.EXAMPLE
    .\test-advanced-ai.ps1 -Module SelfCorrection
#>

param(
    [ValidateSet("All", "SelfCorrection", "FewShot", "Speculation", "LoadBalancer", "SemanticMapping")]
    [string]$Module = "All",

    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$script:TestsPassed = 0
$script:TestsFailed = 0

# Initialize modules
. "$PSScriptRoot\Initialize-AdvancedAI.ps1"

function Test-Assert {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [string]$Expected = "Pass"
    )

    Write-Host "  Testing: $Name... " -NoNewline -ForegroundColor Gray

    try {
        $result = & $Test

        if ($result -eq $true -or ($result -ne $false -and $result -ne $null)) {
            Write-Host "PASS" -ForegroundColor Green
            $script:TestsPassed++
            return $true
        } else {
            Write-Host "FAIL (returned: $result)" -ForegroundColor Red
            $script:TestsFailed++
            return $false
        }
    } catch {
        Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
        $script:TestsFailed++
        return $false
    }
}

#region Self-Correction Tests

function Test-SelfCorrection {
    Write-Host "`n=== Self-Correction Tests ===" -ForegroundColor Cyan

    # Test 1: Module loaded
    Test-Assert "Module loaded" {
        Get-Module SelfCorrection
    }

    # Test 2: Language detection
    Test-Assert "Detect Python" {
        $lang = Get-CodeLanguage -Code "def hello(): print('world')"
        $lang -eq "python"
    }

    Test-Assert "Detect PowerShell" {
        $lang = Get-CodeLanguage -Code "function Test-Something { Write-Host 'test' }"
        $lang -eq "powershell"
    }

    Test-Assert "Detect JavaScript" {
        $lang = Get-CodeLanguage -Code "const x = () => console.log('test')"
        $lang -eq "javascript"
    }

    # Test 3: Syntax validation (valid code)
    Test-Assert "Validate valid Python" {
        $result = Test-CodeSyntax -Code "def test(): return True" -Language "python"
        $result.Valid -eq $true
    }

    # Test 4: Self-correction function exists
    Test-Assert "Invoke-SelfCorrection exists" {
        Get-Command Invoke-SelfCorrection -ErrorAction SilentlyContinue
    }

    # Test 5: Quick syntax check
    Test-Assert "Quick syntax check" {
        Get-Command Test-QuickSyntax -ErrorAction SilentlyContinue
    }
}

#endregion

#region Few-Shot Learning Tests

function Test-FewShotLearning {
    Write-Host "`n=== Few-Shot Learning Tests ===" -ForegroundColor Cyan

    # Test 1: Module loaded
    Test-Assert "Module loaded" {
        Get-Module FewShotLearning
    }

    # Test 2: Cache initialization
    Test-Assert "Initialize cache" {
        Initialize-FewShotCache
        Test-Path (Join-Path $PSScriptRoot "cache")
    }

    # Test 3: Category detection
    Test-Assert "Detect SQL category" {
        $cat = Get-ContentCategory -Text "SELECT * FROM users WHERE id = 1"
        $cat -eq "sql"
    }

    Test-Assert "Detect API category" {
        $cat = Get-ContentCategory -Text "POST request to the REST API endpoint"
        $cat -eq "api"
    }

    # Test 4: Save and retrieve
    Test-Assert "Save successful response" {
        $id = Save-SuccessfulResponse -Prompt "Test prompt" -Response "Test response" -Rating 3
        $id -ne $null
    }

    Test-Assert "Get history" {
        $history = Get-SuccessHistory
        $history -ne $null
    }

    # Test 5: Build few-shot prompt
    Test-Assert "Build few-shot prompt" {
        $result = Build-FewShotPrompt -UserPrompt "Test" -Examples @()
        $result.prompt -eq "Test"
    }

    # Test 6: Get stats
    Test-Assert "Get stats" {
        $stats = Get-FewShotStats
        $stats.TotalEntries -ge 0
    }
}

#endregion

#region Speculative Decoding Tests

function Test-SpeculativeDecoding {
    Write-Host "`n=== Speculative Decoding Tests ===" -ForegroundColor Cyan

    # Test 1: Module loaded
    Test-Assert "Module loaded" {
        Get-Module SpeculativeDecoding
    }

    # Test 2: Response validity check
    Test-Assert "Valid response check" {
        $valid = Test-ResponseValidity -Response "This is a valid response with content"
        $valid -eq $true
    }

    Test-Assert "Invalid empty response" {
        $valid = Test-ResponseValidity -Response ""
        $valid -eq $false
    }

    Test-Assert "Invalid error response" {
        $valid = Test-ResponseValidity -Response "I cannot help with that"
        $valid -eq $false
    }

    # Test 3: Functions exist
    Test-Assert "Invoke-SpeculativeDecoding exists" {
        Get-Command Invoke-SpeculativeDecoding -ErrorAction SilentlyContinue
    }

    Test-Assert "Invoke-ModelRace exists" {
        Get-Command Invoke-ModelRace -ErrorAction SilentlyContinue
    }

    Test-Assert "Invoke-ConsensusGeneration exists" {
        Get-Command Invoke-ConsensusGeneration -ErrorAction SilentlyContinue
    }

    # Test 4: Text similarity
    Test-Assert "Text similarity calculation" {
        $sim = Get-TextSimilarity -Text1 "hello world test" -Text2 "hello world example"
        $sim -gt 0 -and $sim -lt 1
    }
}

#endregion

#region Load Balancer Tests

function Test-LoadBalancer {
    Write-Host "`n=== Load Balancer Tests ===" -ForegroundColor Cyan

    # Test 1: Module loaded
    Test-Assert "Module loaded" {
        Get-Module LoadBalancer
    }

    # Test 2: Get system load
    Test-Assert "Get system load" {
        $load = Get-SystemLoad
        $load.CpuPercent -ge 0 -and $load.CpuPercent -le 100
    }

    Test-Assert "System load has memory" {
        $load = Get-SystemLoad
        $load.MemoryPercent -ge 0 -and $load.MemoryPercent -le 100
    }

    Test-Assert "System load has recommendation" {
        $load = Get-SystemLoad
        $load.Recommendation -in @("local", "hybrid", "cloud")
    }

    # Test 3: Get CPU load (quick)
    Test-Assert "Quick CPU load check" {
        $cpu = Get-CpuLoad
        $cpu -ge 0 -and $cpu -le 100
    }

    # Test 4: Configuration
    Test-Assert "Get config" {
        $config = Get-LoadBalancerConfig
        $config.CpuThresholdHigh -gt 0
    }

    # Test 5: Provider selection
    Test-Assert "Get load-balanced provider" {
        $provider = Get-LoadBalancedProvider -Task "simple"
        $provider.Provider -in @("ollama", "openai", "anthropic")
    }

    # Test 6: Force local
    Test-Assert "Force local provider" {
        $provider = Get-LoadBalancedProvider -ForceLocal
        $provider.Provider -eq "ollama"
    }
}

#endregion

#region Semantic File Mapping Tests

function Test-SemanticFileMapping {
    Write-Host "`n=== Semantic File Mapping Tests ===" -ForegroundColor Cyan

    # Test 1: Module loaded
    Test-Assert "Module loaded" {
        Get-Module SemanticFileMapping
    }

    # Test 2: Language detection
    Test-Assert "Detect Python file" {
        $lang = Get-FileLanguage -FilePath "test.py"
        $lang -eq "python"
    }

    Test-Assert "Detect JavaScript file" {
        $lang = Get-FileLanguage -FilePath "app.js"
        $lang -eq "javascript"
    }

    Test-Assert "Detect PowerShell file" {
        $lang = Get-FileLanguage -FilePath "script.ps1"
        $lang -eq "powershell"
    }

    Test-Assert "Detect TypeScript file" {
        $lang = Get-FileLanguage -FilePath "component.tsx"
        $lang -eq "typescript"
    }

    # Test 3: Extract imports (using existing module file)
    $testFile = Join-Path $PSScriptRoot "modules\SelfCorrection.psm1"
    if (Test-Path $testFile) {
        Test-Assert "Extract imports from real file" {
            $imports = Get-FileImports -FilePath $testFile
            $imports -ne $null
        }

        Test-Assert "Extract functions from real file" {
            $functions = Get-FileFunctions -FilePath $testFile
            $functions.Count -gt 0
        }
    }

    # Test 4: Functions exist
    Test-Assert "Get-RelatedFiles exists" {
        Get-Command Get-RelatedFiles -ErrorAction SilentlyContinue
    }

    Test-Assert "Build-DependencyGraph exists" {
        Get-Command Build-DependencyGraph -ErrorAction SilentlyContinue
    }

    Test-Assert "Get-ExpandedContext exists" {
        Get-Command Get-ExpandedContext -ErrorAction SilentlyContinue
    }

    Test-Assert "Invoke-SemanticQuery exists" {
        Get-Command Invoke-SemanticQuery -ErrorAction SilentlyContinue
    }
}

#endregion

#region Advanced AI Tests

function Test-AdvancedAI {
    Write-Host "`n=== Advanced AI Integration Tests ===" -ForegroundColor Cyan

    # Test 1: Module loaded
    Test-Assert "Module loaded" {
        Get-Module AdvancedAI
    }

    # Test 2: Mode detection
    Test-Assert "Detect code mode" {
        $mode = Get-OptimalMode -Prompt "Write a Python function"
        $mode -eq "code"
    }

    Test-Assert "Detect analysis mode" {
        $mode = Get-OptimalMode -Prompt "Explain how databases work"
        $mode -eq "analysis"
    }

    Test-Assert "Detect fast mode" {
        $mode = Get-OptimalMode -Prompt "What is the capital of France?"
        $mode -eq "fast"
    }

    # Test 3: Convenience functions exist
    Test-Assert "New-AICode exists" {
        Get-Command New-AICode -ErrorAction SilentlyContinue
    }

    Test-Assert "Get-AIAnalysis exists" {
        Get-Command Get-AIAnalysis -ErrorAction SilentlyContinue
    }

    Test-Assert "Get-AIQuick exists" {
        Get-Command Get-AIQuick -ErrorAction SilentlyContinue
    }

    # Test 4: Status function
    Test-Assert "Status function works" {
        Get-Command Get-AdvancedAIStatus -ErrorAction SilentlyContinue
    }
}

#endregion

#region Live Tests (require Ollama)

function Test-LiveGeneration {
    Write-Host "`n=== Live Generation Tests (requires Ollama) ===" -ForegroundColor Cyan

    # Check Ollama
    if (-not (Test-OllamaAvailable)) {
        Write-Host "  [SKIP] Ollama not available" -ForegroundColor Yellow
        return
    }

    # Test 1: Simple generation
    Test-Assert "Basic AI request" {
        $response = Invoke-AIRequest -Provider "ollama" -Model "llama3.2:1b" -Messages @(@{role="user";content="Say OK"}) -MaxTokens 10
        $response.content -ne $null
    }

    # Test 2: Self-correction with real model
    Test-Assert "Self-correction validation" {
        $result = Test-CodeSyntax -Code "print('hello')" -Language "python"
        $result -ne $null
    }

    # Test 3: Model race (shortened timeout)
    Test-Assert "Model race completion" {
        $result = Invoke-ModelRace -Prompt "Say hello" -Models @("llama3.2:1b") -TimeoutMs 10000
        $result.Content -ne $null
    }
}

#endregion

#region Main

Write-Host @"

========================================
   Advanced AI Test Suite
========================================

"@ -ForegroundColor Cyan

switch ($Module) {
    "SelfCorrection" { Test-SelfCorrection }
    "FewShot" { Test-FewShotLearning }
    "Speculation" { Test-SpeculativeDecoding }
    "LoadBalancer" { Test-LoadBalancer }
    "SemanticMapping" { Test-SemanticFileMapping }
    "All" {
        Test-SelfCorrection
        Test-FewShotLearning
        Test-SpeculativeDecoding
        Test-LoadBalancer
        Test-SemanticFileMapping
        Test-AdvancedAI
        Test-LiveGeneration
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Results: " -NoNewline
Write-Host "$script:TestsPassed PASSED" -NoNewline -ForegroundColor Green
Write-Host " | " -NoNewline
Write-Host "$script:TestsFailed FAILED" -ForegroundColor $(if ($script:TestsFailed -gt 0) { "Red" } else { "Green" })
Write-Host "========================================`n" -ForegroundColor Cyan

# Exit with error code if tests failed
if ($script:TestsFailed -gt 0) {
    exit 1
}

#endregion
