#Requires -Version 5.1
<#
.SYNOPSIS
    Agentic Self-Correction Module - Automated Code Review Loop
.DESCRIPTION
    Implements a self-correction pipeline where generated code is automatically
    validated by a fast, lightweight model (phi3:mini) before being presented
    to the user. If issues are found, the system regenerates with corrections.
.VERSION
    1.0.0
.AUTHOR
    HYDRA System
#>

$script:ModulePath = Split-Path -Parent $PSScriptRoot
$script:CachePath = Join-Path $script:ModulePath "cache"
$script:ValidationModel = "phi3:mini"
$script:MaxCorrectionAttempts = 3

#region Validation Functions

function Test-CodeSyntax {
    <#
    .SYNOPSIS
        Quick syntax validation using the fastest local model
    .PARAMETER Code
        Code string to validate
    .PARAMETER Language
        Programming language (auto-detected if not specified)
    .RETURNS
        Hashtable with: Valid (bool), Issues (array), Language (string)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Code,

        [ValidateSet("powershell", "python", "javascript", "typescript", "rust", "go", "sql", "csharp", "java", "html", "css", "text", "auto")]
        [string]$Language = "auto"
    )

    # Import main module if not loaded
    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    # Auto-detect language
    if ($Language -eq "auto") {
        $Language = Get-CodeLanguage -Code $Code
    }

    # Build validation prompt
    $validationPrompt = @"
Analyze the following $Language code for syntax errors ONLY.
Respond in this EXACT format:
SYNTAX_VALID: [YES/NO]
ISSUES: [comma-separated list of issues, or "none"]

Code:
``````$Language
$Code
``````
"@

    try {
        # Use phi3:mini for fast validation
        $messages = @(
            @{ role = "system"; content = "You are a code syntax validator. Only check for syntax errors, not style or logic. Be extremely concise." }
            @{ role = "user"; content = $validationPrompt }
        )

        $response = Invoke-AIRequest -Provider "ollama" -Model $script:ValidationModel -Messages $messages -MaxTokens 256 -Temperature 0.1

        $result = Parse-ValidationResponse -Response $response.content
        $result.Language = $Language
        $result.RawResponse = $response.content

        return $result

    } catch {
        Write-Warning "[SelfCorrection] Validation failed: $($_.Exception.Message)"
        return @{
            Valid = $true  # Fail open - don't block on validation errors
            Issues = @()
            Language = $Language
            Error = $_.Exception.Message
        }
    }
}

function Get-CodeLanguage {
    <#
    .SYNOPSIS
        Auto-detect programming language from code
    #>
    param([string]$Code)

    $patterns = @{
        "powershell" = @('^\s*function\s+\w+', '\$\w+\s*=', '\|\s*ForEach-Object', 'Write-Host', 'param\s*\(', '\[CmdletBinding\(\)\]')
        "python" = @('^\s*def\s+\w+', '^\s*import\s+', '^\s*from\s+\w+\s+import', 'print\s*\(', '^\s*class\s+\w+:', '__init__')
        "javascript" = @('^\s*const\s+', '^\s*let\s+', '^\s*function\s+\w+\s*\(', '=>\s*\{', 'console\.log', '\.then\s*\(')
        "typescript" = @(':\s*(string|number|boolean|any)\b', '^\s*interface\s+', '^\s*type\s+\w+\s*=', '<\w+>')
        "rust" = @('^\s*fn\s+\w+', '^\s*let\s+mut\s+', '^\s*impl\s+', '^\s*struct\s+', '^\s*enum\s+', '&str', 'Vec<')
        "go" = @('^\s*func\s+', '^\s*package\s+', ':=', 'fmt\.Print')
        "sql" = @('^\s*SELECT\s+', '^\s*INSERT\s+', '^\s*UPDATE\s+', '^\s*CREATE\s+TABLE', '^\s*FROM\s+')
        "csharp" = @('^\s*using\s+System', '^\s*namespace\s+', '^\s*public\s+class', '^\s*private\s+', '^\s*void\s+', 'Console\.Write')
        "java" = @('^\s*public\s+class', '^\s*import\s+java\.', '^\s*private\s+', 'System\.out\.print', '^\s*package\s+\w+;')
        "html" = @('^\s*<!DOCTYPE', '<html', '<head>', '<body>', '<div', '<script', '<style')
        "css" = @('^\s*\.\w+\s*\{', '^\s*#\w+\s*\{', 'font-size:', 'background-color:', 'margin:', 'padding:')
    }

    $scores = @{}
    foreach ($lang in $patterns.Keys) {
        $scores[$lang] = 0
        foreach ($pattern in $patterns[$lang]) {
            if ($Code -match $pattern) {
                $scores[$lang]++
            }
        }
    }

    $detected = $scores.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1

    if ($detected.Value -gt 0) {
        return $detected.Key
    }

    return "text"  # Default fallback
}

function Parse-ValidationResponse {
    <#
    .SYNOPSIS
        Parse the validation model's response
    #>
    param([string]$Response)

    $result = @{
        Valid = $true
        Issues = @()
    }

    # Check for YES/NO pattern
    if ($Response -match "SYNTAX_VALID:\s*(YES|NO|TAK|NIE)") {
        $answer = $Matches[1].ToUpper()
        $result.Valid = ($answer -eq "YES" -or $answer -eq "TAK")
    }

    # Extract issues
    if ($Response -match "ISSUES:\s*(.+?)(?:\n|$)") {
        $issuesText = $Matches[1].Trim()
        if ($issuesText -ne "none" -and $issuesText -ne "brak") {
            $result.Issues = $issuesText -split ",\s*" | Where-Object { $_.Trim() }
        }
    }

    # Alternative: check for error keywords
    $errorKeywords = @("error", "invalid", "missing", "unexpected", "unclosed", "undefined", "syntax")
    foreach ($keyword in $errorKeywords) {
        if ($Response -match "\b$keyword\b" -and $Response -notmatch "no\s+$keyword|without\s+$keyword") {
            $result.Valid = $false
            break
        }
    }

    return $result
}

#endregion

#region Self-Correction Pipeline

function Invoke-SelfCorrection {
    <#
    .SYNOPSIS
        Main self-correction entry point
    .DESCRIPTION
        Validates generated code and returns correction status.
        Returns $true if code needs regeneration, $false if valid.
    .PARAMETER GeneratedCode
        The code to validate
    .PARAMETER Language
        Programming language (auto-detected if not specified)
    .RETURNS
        $true if code has issues and needs regeneration
        $false if code is valid
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$GeneratedCode,

        [string]$Language = "auto"
    )

    $validation = Test-CodeSyntax -Code $GeneratedCode -Language $Language

    if (-not $validation.Valid) {
        Write-Host "[Self-Correction] Detected issues in $($validation.Language) code:" -ForegroundColor Yellow
        foreach ($issue in $validation.Issues) {
            Write-Host "  - $issue" -ForegroundColor Yellow
        }
        return $true
    }

    return $false
}

function Invoke-CodeWithSelfCorrection {
    <#
    .SYNOPSIS
        Generate code with automatic self-correction loop
    .DESCRIPTION
        Generates code using the primary model, validates it with phi3:mini,
        and automatically regenerates if issues are found. Maximum 3 attempts.
    .PARAMETER Prompt
        The user's code generation request
    .PARAMETER Model
        Primary model for generation (default: qwen2.5-coder:1.5b)
    .PARAMETER MaxAttempts
        Maximum correction attempts (default: 3)
    .RETURNS
        Hashtable with: Code, Language, Attempts, Valid, CorrectionHistory
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [string]$Model = "qwen2.5-coder:1.5b",

        [int]$MaxAttempts = 3,

        [string]$SystemPrompt,

        [int]$MaxTokens = 2048
    )

    # Import main module
    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    $attempt = 0
    $correctionHistory = @()
    $currentPrompt = $Prompt
    $finalCode = $null
    $isValid = $false

    # Default system prompt for code generation
    if (-not $SystemPrompt) {
        $SystemPrompt = @"
You are an expert programmer. Generate clean, correct code.
IMPORTANT: Output ONLY the code, no explanations or markdown formatting.
If you need to explain something, use code comments.
"@
    }

    while ($attempt -lt $MaxAttempts -and -not $isValid) {
        $attempt++

        Write-Host "[Self-Correction] Attempt $attempt/$MaxAttempts" -ForegroundColor Cyan

        # Generate code
        $messages = @(
            @{ role = "system"; content = $SystemPrompt }
            @{ role = "user"; content = $currentPrompt }
        )

        try {
            $response = Invoke-AIRequest -Provider "ollama" -Model $Model -Messages $messages -MaxTokens $MaxTokens -Temperature 0.3
            $generatedCode = $response.content

            # Extract code from markdown if present
            $generatedCode = Extract-CodeFromResponse -Response $generatedCode

            # Validate
            $needsCorrection = Invoke-SelfCorrection -GeneratedCode $generatedCode

            if ($needsCorrection) {
                $validation = Test-CodeSyntax -Code $generatedCode

                $correctionHistory += @{
                    Attempt = $attempt
                    Code = $generatedCode
                    Issues = $validation.Issues
                    Language = $validation.Language
                }

                # Build correction prompt
                $issuesList = $validation.Issues -join "; "
                $currentPrompt = @"
The previous code had syntax issues: $issuesList

Original request: $Prompt

Please fix these issues and generate corrected code. Output ONLY the code.

Previous (broken) code for reference:
$generatedCode
"@

                Write-Host "[Self-Correction] Regenerating with fixes..." -ForegroundColor Yellow

            } else {
                $finalCode = $generatedCode
                $isValid = $true
                Write-Host "[Self-Correction] Code validated successfully!" -ForegroundColor Green
            }

        } catch {
            Write-Warning "[Self-Correction] Generation failed: $($_.Exception.Message)"
            $correctionHistory += @{
                Attempt = $attempt
                Error = $_.Exception.Message
            }
        }
    }

    # If still not valid after all attempts, return last attempt
    if (-not $isValid -and $correctionHistory.Count -gt 0) {
        $finalCode = $correctionHistory[-1].Code
        Write-Warning "[Self-Correction] Max attempts reached. Returning best effort code."
    }

    return @{
        Code = $finalCode
        Language = (Get-CodeLanguage -Code $finalCode)
        Attempts = $attempt
        Valid = $isValid
        CorrectionHistory = $correctionHistory
    }
}

function Extract-CodeFromResponse {
    <#
    .SYNOPSIS
        Extract code from markdown code blocks if present
    #>
    param([string]$Response)

    # Try to extract from markdown code block
    if ($Response -match '```(?:\w+)?\s*\n([\s\S]*?)\n```') {
        return $Matches[1].Trim()
    }

    # Return as-is if no markdown
    return $Response.Trim()
}

#endregion

#region Quick Validation API

function Test-QuickSyntax {
    <#
    .SYNOPSIS
        Ultra-fast syntax check (binary YES/NO response)
    .DESCRIPTION
        Optimized for speed - only returns whether code is valid or not.
        Uses llama3.2:1b for fastest response.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Code
    )

    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    $prompt = "Is this code syntactically correct? Answer only YES or NO:`n$Code"

    try {
        $messages = @(@{ role = "user"; content = $prompt })
        $response = Invoke-AIRequest -Provider "ollama" -Model "llama3.2:1b" -Messages $messages -MaxTokens 10 -Temperature 0

        return ($response.content -match "YES|TAK|CORRECT|VALID")

    } catch {
        return $true  # Fail open
    }
}

#endregion

#region Exports

Export-ModuleMember -Function @(
    'Test-CodeSyntax',
    'Get-CodeLanguage',
    'Invoke-SelfCorrection',
    'Invoke-CodeWithSelfCorrection',
    'Test-QuickSyntax'
)

#endregion
