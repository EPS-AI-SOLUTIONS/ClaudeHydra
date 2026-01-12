# Real-world test of AI Handler Decision Matrix
$ErrorActionPreference = "Stop"
Import-Module "$PSScriptRoot\AIModelHandler.psm1" -Force

Write-Host @"

  ============================================================
       REAL TASK: Code Analysis with Decision Matrix
  ============================================================

"@ -ForegroundColor Cyan

# Step 1: Check Ollama (Rule #1)
Write-Host "[RULE 1] Checking if Ollama is available..." -ForegroundColor Yellow
$ollamaOK = Test-OllamaAvailable
if ($ollamaOK) {
    Write-Host "  [OK] Ollama running - will use LOCAL models" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Ollama down - will fallback to CLOUD" -ForegroundColor Red
}
Write-Host ""

# Real code sample to analyze
$codeToAnalyze = @'
function Get-UserData {
    param([string]$UserId)
    $connection = New-Object System.Data.SqlClient.SqlConnection
    $connection.ConnectionString = "Server=localhost;Database=Users;Trusted_Connection=True;"
    $query = "SELECT * FROM Users WHERE Id = '$UserId'"
    $command = New-Object System.Data.SqlClient.SqlCommand($query, $connection)
    $connection.Open()
    $result = $command.ExecuteReader()
    $connection.Close()
    return $result
}
'@

Write-Host "[TASK] Analyzing this PowerShell code:" -ForegroundColor Cyan
Write-Host "---------------------------------------" -ForegroundColor Gray
Write-Host $codeToAnalyze -ForegroundColor White
Write-Host ""

# Step 2: Multiple independent prompts -> Use Batch Parallel (Rule #3)
Write-Host "[RULE 3] Multiple prompts detected -> Using Invoke-AIBatch (parallel)" -ForegroundColor Yellow
Write-Host ""

$analysisPrompts = @(
    "Analyze this code for SQL injection vulnerabilities. Be brief (2-3 sentences): $codeToAnalyze",
    "What are the resource management issues in this code? Be brief (2-3 sentences): $codeToAnalyze",
    "Suggest a better connection handling pattern. Be brief (2-3 sentences): $codeToAnalyze",
    "Rate this code 1-10 and explain why in one sentence: $codeToAnalyze"
)

Write-Host "[DECISION] 4 independent analysis tasks -> PARALLEL execution" -ForegroundColor Magenta
Write-Host "[MODEL] llama3.2:3b (standard tasks, local)" -ForegroundColor Magenta
Write-Host ""

$startTime = Get-Date
$analysisResults = Invoke-AIBatch -Prompts $analysisPrompts -MaxTokens 200
$parallelTime = ((Get-Date) - $startTime).TotalSeconds

Write-Host ""
Write-Host "=== ANALYSIS RESULTS ===" -ForegroundColor Green
Write-Host ""

$labels = @("Security Analysis", "Resource Issues", "Better Pattern", "Code Rating")
for ($i = 0; $i -lt $analysisResults.Count; $i++) {
    $r = $analysisResults[$i]
    Write-Host "[$($labels[$i])]" -ForegroundColor Cyan
    if ($r.Success) {
        Write-Host $r.Content.Trim() -ForegroundColor White
    } else {
        Write-Host "ERROR: $($r.Error)" -ForegroundColor Red
    }
    Write-Host ""
}

# Step 3: Code generation task -> Use code-specific model (Rule #5)
Write-Host "[RULE 5] Code generation task -> Using qwen2.5-coder:1.5b" -ForegroundColor Yellow
Write-Host ""

$codeGenPrompt = @"
Fix the SQL injection vulnerability in this code. Return ONLY the corrected function, no explanation:
$codeToAnalyze
"@

Write-Host "[DECISION] Code generation -> SPECIALIST model (qwen2.5-coder)" -ForegroundColor Magenta
Write-Host ""

$startCodeGen = Get-Date
$codeGenResult = Invoke-AIRequest -Provider "ollama" -Model "qwen2.5-coder:1.5b" -Messages @(
    @{ role = "system"; content = "You are a code assistant. Return only code, no explanations." }
    @{ role = "user"; content = $codeGenPrompt }
) -MaxTokens 500
$codeGenTime = ((Get-Date) - $startCodeGen).TotalSeconds

Write-Host "=== FIXED CODE ===" -ForegroundColor Green
Write-Host $codeGenResult.content -ForegroundColor White
Write-Host ""

# Summary
Write-Host @"
  ============================================================
                       TEST SUMMARY
  ============================================================
"@ -ForegroundColor Cyan

Write-Host ""
Write-Host "Decision Matrix Applied:" -ForegroundColor Yellow
Write-Host "  [1] Ollama check: $ollamaOK -> Used LOCAL" -ForegroundColor Gray
Write-Host "  [3] 4 analysis prompts -> PARALLEL (llama3.2:3b)" -ForegroundColor Gray
Write-Host "  [5] Code generation -> SPECIALIST (qwen2.5-coder:1.5b)" -ForegroundColor Gray
Write-Host ""
Write-Host "Performance:" -ForegroundColor Yellow
Write-Host "  Parallel analysis (4 tasks): $([math]::Round($parallelTime, 2))s" -ForegroundColor White
Write-Host "  Code generation (1 task):    $([math]::Round($codeGenTime, 2))s" -ForegroundColor White
Write-Host "  Total time:                  $([math]::Round($parallelTime + $codeGenTime, 2))s" -ForegroundColor Green
Write-Host ""
Write-Host "Cost: `$0.00 (all local)" -ForegroundColor Green
Write-Host ""
