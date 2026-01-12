#Requires -Version 5.1
<#
.SYNOPSIS
    Speculative Decoding Module - Parallel Multi-Model Speculation
.DESCRIPTION
    Implements parallel speculation where two models generate responses simultaneously:
    - Fast model (llama3.2:1b): Quick draft response
    - Accurate model (llama3.2:3b): More thorough response

    The system returns whichever response passes validation first, or the
    more accurate one if both complete. This optimizes for both speed and quality.
.VERSION
    1.0.0
.AUTHOR
    HYDRA System
#>

$script:ModulePath = Split-Path -Parent $PSScriptRoot
$script:FastModel = "llama3.2:1b"
$script:AccurateModel = "llama3.2:3b"
$script:CodeModel = "qwen2.5-coder:1.5b"

#region Parallel Speculation

function Invoke-SpeculativeDecoding {
    <#
    .SYNOPSIS
        Generate response using parallel speculation
    .DESCRIPTION
        Runs two models in parallel (fast + accurate) and returns the best
        result based on validation and timing. Optimizes for speed while
        maintaining quality through validation.
    .PARAMETER Prompt
        The user prompt
    .PARAMETER FastModel
        Model for fast/draft generation (default: llama3.2:1b)
    .PARAMETER AccurateModel
        Model for accurate generation (default: llama3.2:3b)
    .PARAMETER ValidateCode
        If true, validates code responses before returning
    .PARAMETER PreferFast
        If true, returns fast model result immediately if valid
    .PARAMETER TimeoutMs
        Timeout for speculation in milliseconds
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [string]$FastModel = $script:FastModel,

        [string]$AccurateModel = $script:AccurateModel,

        [switch]$ValidateCode,

        [switch]$PreferFast,

        [int]$TimeoutMs = 30000,

        [string]$SystemPrompt,

        [int]$MaxTokens = 2048
    )

    # Import main module
    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    Write-Host "[Speculative] Starting parallel speculation..." -ForegroundColor Cyan
    Write-Host "  Fast: $FastModel | Accurate: $AccurateModel" -ForegroundColor Gray

    $startTime = Get-Date

    # Create runspace pool for parallel execution
    $iss = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
    $iss.ImportPSModule((Join-Path $script:ModulePath "AIModelHandler.psm1"))

    $runspacePool = [runspacefactory]::CreateRunspacePool(1, 2, $iss, $Host)
    $runspacePool.Open()

    # Script block for AI request
    $requestScript = {
        param($Model, $Prompt, $SystemPrompt, $MaxTokens, $ModelType)

        try {
            $messages = @()
            if ($SystemPrompt) {
                $messages += @{ role = "system"; content = $SystemPrompt }
            }
            $messages += @{ role = "user"; content = $Prompt }

            $response = Invoke-AIRequest -Provider "ollama" -Model $Model -Messages $messages -MaxTokens $MaxTokens -Temperature 0.3

            return @{
                Success = $true
                Model = $Model
                ModelType = $ModelType
                Content = $response.content
                Tokens = $response.usage
                Error = $null
            }
        } catch {
            return @{
                Success = $false
                Model = $Model
                ModelType = $ModelType
                Content = $null
                Tokens = $null
                Error = $_.Exception.Message
            }
        }
    }

    # Launch fast model
    $fastPS = [powershell]::Create()
    $fastPS.RunspacePool = $runspacePool
    [void]$fastPS.AddScript($requestScript)
    [void]$fastPS.AddArgument($FastModel)
    [void]$fastPS.AddArgument($Prompt)
    [void]$fastPS.AddArgument($SystemPrompt)
    [void]$fastPS.AddArgument($MaxTokens)
    [void]$fastPS.AddArgument("fast")
    $fastHandle = $fastPS.BeginInvoke()

    # Launch accurate model
    $accuratePS = [powershell]::Create()
    $accuratePS.RunspacePool = $runspacePool
    [void]$accuratePS.AddScript($requestScript)
    [void]$accuratePS.AddArgument($AccurateModel)
    [void]$accuratePS.AddArgument($Prompt)
    [void]$accuratePS.AddArgument($SystemPrompt)
    [void]$accuratePS.AddArgument($MaxTokens)
    [void]$accuratePS.AddArgument("accurate")
    $accurateHandle = $accuratePS.BeginInvoke()

    # Wait for results with strategy
    $fastResult = $null
    $accurateResult = $null
    $selectedResult = $null
    $selectionReason = ""

    try {
        if ($PreferFast) {
            # Strategy: Return fast result as soon as it's valid

            # Wait for fast model first (with shorter timeout)
            $fastTimeout = [math]::Min($TimeoutMs / 2, 10000)
            if ($fastHandle.AsyncWaitHandle.WaitOne($fastTimeout)) {
                $fastResult = $fastPS.EndInvoke($fastHandle)

                if ($fastResult.Success) {
                    $isValid = $true

                    # Validate if code
                    if ($ValidateCode) {
                        $isValid = Test-ResponseValidity -Response $fastResult.Content
                    }

                    if ($isValid) {
                        $fastElapsed = ((Get-Date) - $startTime).TotalSeconds
                        Write-Host "[Speculative] Fast model completed in $([math]::Round($fastElapsed, 2))s" -ForegroundColor Green
                        $selectedResult = $fastResult
                        $selectionReason = "fast_valid"
                    }
                }
            }

            # If fast wasn't good enough, wait for accurate
            if (-not $selectedResult) {
                $remainingTime = $TimeoutMs - ((Get-Date) - $startTime).TotalMilliseconds
                if ($remainingTime -gt 0 -and $accurateHandle.AsyncWaitHandle.WaitOne($remainingTime)) {
                    $accurateResult = $accuratePS.EndInvoke($accurateHandle)

                    if ($accurateResult.Success) {
                        $accurateElapsed = ((Get-Date) - $startTime).TotalSeconds
                        Write-Host "[Speculative] Accurate model completed in $([math]::Round($accurateElapsed, 2))s" -ForegroundColor Green
                        $selectedResult = $accurateResult
                        $selectionReason = "accurate_fallback"
                    }
                }
            }

        } else {
            # Strategy: Wait for both, choose best

            $waitHandles = @($fastHandle.AsyncWaitHandle, $accurateHandle.AsyncWaitHandle)
            $timeout = $TimeoutMs

            # Wait for first completion
            $firstIndex = [System.Threading.WaitHandle]::WaitAny($waitHandles, $timeout)

            if ($firstIndex -eq 0) {
                # Fast completed first
                $fastResult = $fastPS.EndInvoke($fastHandle)
                $fastElapsed = ((Get-Date) - $startTime).TotalSeconds
                Write-Host "[Speculative] Fast model finished first ($([math]::Round($fastElapsed, 2))s)" -ForegroundColor Cyan

                # Wait a bit more for accurate model
                $waitMore = [math]::Min(5000, $TimeoutMs - ((Get-Date) - $startTime).TotalMilliseconds)
                if ($waitMore -gt 0 -and $accurateHandle.AsyncWaitHandle.WaitOne($waitMore)) {
                    $accurateResult = $accuratePS.EndInvoke($accurateHandle)
                }

            } elseif ($firstIndex -eq 1) {
                # Accurate completed first (unusual but possible)
                $accurateResult = $accuratePS.EndInvoke($accurateHandle)
                $accurateElapsed = ((Get-Date) - $startTime).TotalSeconds
                Write-Host "[Speculative] Accurate model finished first ($([math]::Round($accurateElapsed, 2))s)" -ForegroundColor Cyan

                # Check if fast is also done
                if ($fastHandle.IsCompleted) {
                    $fastResult = $fastPS.EndInvoke($fastHandle)
                }
            }

            # Choose best result
            $selectedResult, $selectionReason = Select-BestResult -FastResult $fastResult -AccurateResult $accurateResult -ValidateCode:$ValidateCode
        }

    } finally {
        # Cleanup
        $fastPS.Dispose()
        $accuratePS.Dispose()
        $runspacePool.Close()
        $runspacePool.Dispose()
    }

    $totalElapsed = ((Get-Date) - $startTime).TotalSeconds

    if ($selectedResult -and $selectedResult.Success) {
        Write-Host "[Speculative] Selected: $($selectedResult.ModelType) model ($selectionReason)" -ForegroundColor Green
        Write-Host "[Speculative] Total time: $([math]::Round($totalElapsed, 2))s" -ForegroundColor Gray

        return @{
            Content = $selectedResult.Content
            Model = $selectedResult.Model
            ModelType = $selectedResult.ModelType
            SelectionReason = $selectionReason
            ElapsedSeconds = $totalElapsed
            FastResult = $fastResult
            AccurateResult = $accurateResult
            Tokens = $selectedResult.Tokens
        }

    } else {
        Write-Warning "[Speculative] Both models failed or timed out"
        return @{
            Content = $null
            Error = "Speculation failed"
            FastResult = $fastResult
            AccurateResult = $accurateResult
            ElapsedSeconds = $totalElapsed
        }
    }
}

function Select-BestResult {
    <#
    .SYNOPSIS
        Select the best result from fast and accurate models
    #>
    param(
        $FastResult,
        $AccurateResult,
        [switch]$ValidateCode
    )

    $fastValid = $false
    $accurateValid = $false

    # Check fast result validity
    if ($FastResult -and $FastResult.Success) {
        $fastValid = $true
        if ($ValidateCode) {
            $fastValid = Test-ResponseValidity -Response $FastResult.Content
        }
    }

    # Check accurate result validity
    if ($AccurateResult -and $AccurateResult.Success) {
        $accurateValid = $true
        if ($ValidateCode) {
            $accurateValid = Test-ResponseValidity -Response $AccurateResult.Content
        }
    }

    # Selection logic
    if ($accurateValid) {
        # Prefer accurate if both are valid
        return $AccurateResult, "accurate_preferred"
    } elseif ($fastValid) {
        # Use fast if accurate failed
        return $FastResult, "fast_only_valid"
    } elseif ($AccurateResult -and $AccurateResult.Success) {
        # Use accurate even if validation failed (better than nothing)
        return $AccurateResult, "accurate_unvalidated"
    } elseif ($FastResult -and $FastResult.Success) {
        # Use fast as last resort
        return $FastResult, "fast_unvalidated"
    } else {
        return $null, "both_failed"
    }
}

function Test-ResponseValidity {
    <#
    .SYNOPSIS
        Quick validation of response content
    #>
    param([string]$Response)

    if ([string]::IsNullOrWhiteSpace($Response)) {
        return $false
    }

    # Check for error indicators
    $errorPatterns = @(
        "I cannot",
        "I'm sorry",
        "Error:",
        "Exception:",
        "undefined",
        "null reference"
    )

    foreach ($pattern in $errorPatterns) {
        if ($Response -match [regex]::Escape($pattern)) {
            return $false
        }
    }

    # Check minimum length
    if ($Response.Length -lt 10) {
        return $false
    }

    return $true
}

#endregion

#region Specialized Speculation

function Invoke-CodeSpeculation {
    <#
    .SYNOPSIS
        Speculative decoding optimized for code generation
    .DESCRIPTION
        Uses qwen2.5-coder for accuracy and llama3.2:1b for speed,
        with automatic syntax validation.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [int]$MaxTokens = 2048,

        [string]$Language,

        [switch]$PreferFast
    )

    $systemPrompt = @"
You are an expert programmer. Generate clean, working code.
Output ONLY the code without explanations or markdown formatting.
Use comments for any necessary clarifications.
"@

    if ($Language) {
        $systemPrompt += "`nLanguage: $Language"
    }

    $result = Invoke-SpeculativeDecoding `
        -Prompt $Prompt `
        -FastModel $script:FastModel `
        -AccurateModel $script:CodeModel `
        -ValidateCode `
        -PreferFast:$PreferFast `
        -SystemPrompt $systemPrompt `
        -MaxTokens $MaxTokens

    # Import self-correction module for additional validation
    $selfCorrectionModule = Join-Path $script:ModulePath "modules\SelfCorrection.psm1"
    if (Test-Path $selfCorrectionModule) {
        Import-Module $selfCorrectionModule -Force

        if ($result.Content) {
            $needsCorrection = Invoke-SelfCorrection -GeneratedCode $result.Content
            $result | Add-Member -NotePropertyName "NeedsCorrection" -NotePropertyValue $needsCorrection -Force
        }
    }

    return $result
}

function Invoke-AnalysisSpeculation {
    <#
    .SYNOPSIS
        Speculative decoding for analysis/explanation tasks
    .DESCRIPTION
        Uses llama3.2:3b for thorough analysis with llama3.2:1b as fast backup.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [int]$MaxTokens = 4096
    )

    $systemPrompt = @"
You are an expert analyst. Provide clear, structured analysis.
Use bullet points and sections for readability.
Be thorough but concise.
"@

    return Invoke-SpeculativeDecoding `
        -Prompt $Prompt `
        -FastModel $script:FastModel `
        -AccurateModel $script:AccurateModel `
        -SystemPrompt $systemPrompt `
        -MaxTokens $MaxTokens
}

#endregion

#region Racing Pattern

function Invoke-ModelRace {
    <#
    .SYNOPSIS
        Race multiple models and return first successful result
    .DESCRIPTION
        Launches all specified models in parallel and returns the first
        response that completes and passes validation. Useful for
        maximizing speed when you have multiple capable models.
    .PARAMETER Prompt
        User prompt
    .PARAMETER Models
        Array of model names to race
    .PARAMETER TimeoutMs
        Maximum wait time
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [string[]]$Models = @("llama3.2:1b", "llama3.2:3b", "qwen2.5-coder:1.5b"),

        [int]$TimeoutMs = 20000,

        [string]$SystemPrompt,

        [int]$MaxTokens = 1024
    )

    # Import main module
    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    Write-Host "[Race] Starting model race with $($Models.Count) models..." -ForegroundColor Cyan

    $startTime = Get-Date

    # Create runspace pool
    $iss = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
    $iss.ImportPSModule((Join-Path $script:ModulePath "AIModelHandler.psm1"))

    $runspacePool = [runspacefactory]::CreateRunspacePool(1, $Models.Count, $iss, $Host)
    $runspacePool.Open()

    $jobs = @()

    # Script for each model
    $raceScript = {
        param($Model, $Prompt, $SystemPrompt, $MaxTokens)

        try {
            $messages = @()
            if ($SystemPrompt) {
                $messages += @{ role = "system"; content = $SystemPrompt }
            }
            $messages += @{ role = "user"; content = $Prompt }

            $response = Invoke-AIRequest -Provider "ollama" -Model $Model -Messages $messages -MaxTokens $MaxTokens -Temperature 0.3

            return @{
                Success = $true
                Model = $Model
                Content = $response.content
                Tokens = $response.usage
            }
        } catch {
            return @{
                Success = $false
                Model = $Model
                Error = $_.Exception.Message
            }
        }
    }

    # Launch all models
    foreach ($model in $Models) {
        $ps = [powershell]::Create()
        $ps.RunspacePool = $runspacePool

        [void]$ps.AddScript($raceScript)
        [void]$ps.AddArgument($model)
        [void]$ps.AddArgument($Prompt)
        [void]$ps.AddArgument($SystemPrompt)
        [void]$ps.AddArgument($MaxTokens)

        $jobs += @{
            PowerShell = $ps
            Handle = $ps.BeginInvoke()
            Model = $model
        }
    }

    # Wait for first successful completion
    $winner = $null
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)

    while ((Get-Date) -lt $deadline -and -not $winner) {
        foreach ($job in $jobs) {
            if ($job.Handle.IsCompleted -and -not $winner) {
                $result = $job.PowerShell.EndInvoke($job.Handle)

                if ($result.Success -and $result.Content) {
                    $winner = $result
                    $elapsed = ((Get-Date) - $startTime).TotalSeconds
                    Write-Host "[Race] Winner: $($result.Model) in $([math]::Round($elapsed, 2))s" -ForegroundColor Green
                    break
                }
            }
        }

        if (-not $winner) {
            Start-Sleep -Milliseconds 50
        }
    }

    # Cleanup
    foreach ($job in $jobs) {
        $job.PowerShell.Dispose()
    }
    $runspacePool.Close()
    $runspacePool.Dispose()

    $totalElapsed = ((Get-Date) - $startTime).TotalSeconds

    if ($winner) {
        return @{
            Content = $winner.Content
            Model = $winner.Model
            ElapsedSeconds = $totalElapsed
            Tokens = $winner.Tokens
        }
    } else {
        Write-Warning "[Race] No model completed successfully within timeout"
        return @{
            Content = $null
            Error = "All models failed or timed out"
            ElapsedSeconds = $totalElapsed
        }
    }
}

#endregion

#region Consensus Pattern

function Invoke-ConsensusGeneration {
    <#
    .SYNOPSIS
        Generate response using consensus from multiple models
    .DESCRIPTION
        Runs multiple models and compares outputs. If outputs are similar,
        returns the consensus. If divergent, uses the most thorough model's
        response or asks for clarification.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [string[]]$Models = @("llama3.2:3b", "qwen2.5-coder:1.5b"),

        [float]$SimilarityThreshold = 0.7,

        [int]$MaxTokens = 2048,

        [string]$SystemPrompt
    )

    # Import main module
    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    Write-Host "[Consensus] Generating with $($Models.Count) models for consensus..." -ForegroundColor Cyan

    # Generate responses in parallel
    $requests = $Models | ForEach-Object {
        $messages = @()
        if ($SystemPrompt) {
            $messages += @{ role = "system"; content = $SystemPrompt }
        }
        $messages += @{ role = "user"; content = $Prompt }

        @{
            Messages = $messages
            Provider = "ollama"
            Model = $_
            MaxTokens = $MaxTokens
        }
    }

    $results = Invoke-AIRequestParallel -Requests $requests

    # Collect successful responses
    $responses = $results | Where-Object { $_.Success } | ForEach-Object {
        @{
            Model = $_.Response._meta.model
            Content = $_.Response.content
        }
    }

    if ($responses.Count -eq 0) {
        return @{
            Content = $null
            Error = "All models failed"
            Consensus = $false
        }
    }

    if ($responses.Count -eq 1) {
        return @{
            Content = $responses[0].Content
            Model = $responses[0].Model
            Consensus = $false
            Reason = "single_response"
        }
    }

    # Check similarity between responses
    $similarities = @()
    for ($i = 0; $i -lt $responses.Count; $i++) {
        for ($j = $i + 1; $j -lt $responses.Count; $j++) {
            $sim = Get-TextSimilarity -Text1 $responses[$i].Content -Text2 $responses[$j].Content
            $similarities += $sim
        }
    }

    $avgSimilarity = ($similarities | Measure-Object -Average).Average

    Write-Host "[Consensus] Average similarity: $([math]::Round($avgSimilarity * 100, 1))%" -ForegroundColor Gray

    if ($avgSimilarity -ge $SimilarityThreshold) {
        # High consensus - return longest response (usually most thorough)
        $best = $responses | Sort-Object { $_.Content.Length } -Descending | Select-Object -First 1

        return @{
            Content = $best.Content
            Model = $best.Model
            Consensus = $true
            Similarity = $avgSimilarity
            AllResponses = $responses
        }

    } else {
        # Low consensus - return all and let user decide
        Write-Host "[Consensus] Low agreement - returning all responses" -ForegroundColor Yellow

        return @{
            Content = $responses[0].Content  # Return first as default
            Model = $responses[0].Model
            Consensus = $false
            Similarity = $avgSimilarity
            AllResponses = $responses
            Reason = "low_consensus"
        }
    }
}

function Get-TextSimilarity {
    <#
    .SYNOPSIS
        Calculate simple text similarity (Jaccard on words)
    #>
    param(
        [string]$Text1,
        [string]$Text2
    )

    $words1 = ($Text1 -split '\W+' | Where-Object { $_.Length -gt 2 }) | ForEach-Object { $_.ToLower() }
    $words2 = ($Text2 -split '\W+' | Where-Object { $_.Length -gt 2 }) | ForEach-Object { $_.ToLower() }

    $set1 = [System.Collections.Generic.HashSet[string]]::new([string[]]$words1)
    $set2 = [System.Collections.Generic.HashSet[string]]::new([string[]]$words2)

    $intersection = [System.Collections.Generic.HashSet[string]]::new($set1)
    $intersection.IntersectWith($set2)

    $union = [System.Collections.Generic.HashSet[string]]::new($set1)
    $union.UnionWith($set2)

    if ($union.Count -eq 0) { return 0 }

    return $intersection.Count / $union.Count
}

#endregion

#region Exports

Export-ModuleMember -Function @(
    'Invoke-SpeculativeDecoding',
    'Invoke-CodeSpeculation',
    'Invoke-AnalysisSpeculation',
    'Invoke-ModelRace',
    'Invoke-ConsensusGeneration',
    'Test-ResponseValidity'
)

#endregion
