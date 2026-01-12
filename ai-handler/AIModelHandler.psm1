#Requires -Version 5.1
<#
.SYNOPSIS
    AI Model Handler with Auto Fallback, Rate Limiting, Cost Optimization & Multi-Provider Support
.DESCRIPTION
    Comprehensive AI model management system for ClaudeCLI featuring:
    - Auto-retry with model downgrade (Opus → Sonnet → Haiku)
    - Rate limit aware switching
    - Cost optimizer for model selection
    - Multi-provider fallback (Anthropic → OpenAI → Local)
.VERSION
    1.0.0
.AUTHOR
    HYDRA System
#>

$script:ConfigPath = Join-Path $PSScriptRoot "ai-config.json"
$script:StatePath = Join-Path $PSScriptRoot "ai-state.json"

#region Helper Functions for PS 5.1 Compatibility

function ConvertTo-Hashtable {
    param([Parameter(ValueFromPipeline)]$InputObject)
    process {
        if ($null -eq $InputObject) { return $null }
        if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
            $collection = @(foreach ($object in $InputObject) { ConvertTo-Hashtable $object })
            return ,$collection
        } elseif ($InputObject -is [psobject]) {
            $hash = @{}
            foreach ($property in $InputObject.PSObject.Properties) {
                $hash[$property.Name] = ConvertTo-Hashtable $property.Value
            }
            return $hash
        } else {
            return $InputObject
        }
    }
}

#endregion

#region Configuration

$script:DefaultConfig = @{
    providers = @{
        anthropic = @{
            name = "Anthropic"
            baseUrl = "https://api.anthropic.com/v1"
            apiKeyEnv = "ANTHROPIC_API_KEY"
            priority = 1
            enabled = $true
            models = @{
                "claude-opus-4-5-20251101" = @{
                    tier = "pro"
                    contextWindow = 200000
                    maxOutput = 32000
                    inputCost = 15.00
                    outputCost = 75.00
                    tokensPerMinute = 40000
                    requestsPerMinute = 50
                    capabilities = @("vision", "code", "analysis", "creative")
                }
                "claude-sonnet-4-5-20250929" = @{
                    tier = "standard"
                    contextWindow = 200000
                    maxOutput = 16000
                    inputCost = 3.00
                    outputCost = 15.00
                    tokensPerMinute = 80000
                    requestsPerMinute = 100
                    capabilities = @("vision", "code", "analysis")
                }
                "claude-haiku-4-20250604" = @{
                    tier = "lite"
                    contextWindow = 200000
                    maxOutput = 8000
                    inputCost = 0.80
                    outputCost = 4.00
                    tokensPerMinute = 100000
                    requestsPerMinute = 200
                    capabilities = @("code", "analysis")
                }
            }
        }
        openai = @{
            name = "OpenAI"
            baseUrl = "https://api.openai.com/v1"
            apiKeyEnv = "OPENAI_API_KEY"
            priority = 2
            enabled = $true
            models = @{
                "gpt-4o" = @{
                    tier = "pro"
                    contextWindow = 128000
                    maxOutput = 16384
                    inputCost = 2.50
                    outputCost = 10.00
                    tokensPerMinute = 30000
                    requestsPerMinute = 500
                    capabilities = @("vision", "code", "analysis")
                }
                "gpt-4o-mini" = @{
                    tier = "lite"
                    contextWindow = 128000
                    maxOutput = 16384
                    inputCost = 0.15
                    outputCost = 0.60
                    tokensPerMinute = 200000
                    requestsPerMinute = 500
                    capabilities = @("code", "analysis")
                }
            }
        }
        ollama = @{
            name = "Ollama (Local)"
            baseUrl = "http://localhost:11434/api"
            apiKeyEnv = $null
            priority = 3
            enabled = $true
            models = @{
                "llama3.3:70b" = @{
                    tier = "standard"
                    contextWindow = 128000
                    maxOutput = 8000
                    inputCost = 0.00
                    outputCost = 0.00
                    tokensPerMinute = 999999
                    requestsPerMinute = 999999
                    capabilities = @("code", "analysis")
                }
                "qwen2.5-coder:32b" = @{
                    tier = "lite"
                    contextWindow = 32000
                    maxOutput = 8000
                    inputCost = 0.00
                    outputCost = 0.00
                    tokensPerMinute = 999999
                    requestsPerMinute = 999999
                    capabilities = @("code")
                }
            }
        }
    }
    fallbackChain = @{
        anthropic = @("claude-opus-4-5-20251101", "claude-sonnet-4-5-20250929", "claude-haiku-4-20250604")
        openai = @("gpt-4o", "gpt-4o-mini")
        ollama = @("llama3.3:70b", "qwen2.5-coder:32b")
    }
    providerFallbackOrder = @("anthropic", "openai", "ollama")
    settings = @{
        maxRetries = 3
        retryDelayMs = 1000
        rateLimitThreshold = 0.85
        costOptimization = $true
        autoFallback = $true
        logLevel = "info"
    }
}

#endregion

#region State Management

$script:RuntimeState = @{
    currentProvider = "anthropic"
    currentModel = "claude-sonnet-4-5-20250929"
    usage = @{}
    errors = @()
    lastRequest = $null
}

function Get-AIConfig {
    [CmdletBinding()]
    param()

    if (Test-Path $script:ConfigPath) {
        try {
            $config = Get-Content $script:ConfigPath -Raw | ConvertFrom-Json | ConvertTo-Hashtable
            return $config
        } catch {
            Write-Warning "Failed to load config, using defaults: $_"
        }
    }
    return $script:DefaultConfig
}

function Save-AIConfig {
    [CmdletBinding()]
    param([hashtable]$Config)

    $Config | ConvertTo-Json -Depth 10 | Set-Content $script:ConfigPath -Encoding UTF8
    Write-Host "[AI] Config saved to $script:ConfigPath" -ForegroundColor Green
}

function Get-AIState {
    [CmdletBinding()]
    param()

    if (Test-Path $script:StatePath) {
        try {
            return Get-Content $script:StatePath -Raw | ConvertFrom-Json | ConvertTo-Hashtable
        } catch {
            Write-Warning "Failed to load state, using runtime state"
        }
    }
    return $script:RuntimeState
}

function Save-AIState {
    [CmdletBinding()]
    param([hashtable]$State)

    $State | ConvertTo-Json -Depth 10 | Set-Content $script:StatePath -Encoding UTF8
}

function Initialize-AIState {
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    $state = Get-AIState

    # Initialize usage tracking per provider/model
    foreach ($providerName in $config.providers.Keys) {
        if (-not $state.usage[$providerName]) {
            $state.usage[$providerName] = @{}
        }
        foreach ($modelName in $config.providers[$providerName].models.Keys) {
            if (-not $state.usage[$providerName][$modelName]) {
                $state.usage[$providerName][$modelName] = @{
                    tokensThisMinute = 0
                    requestsThisMinute = 0
                    lastMinuteReset = (Get-Date).ToString("o")
                    totalTokens = 0
                    totalRequests = 0
                    totalCost = 0.0
                    errors = 0
                }
            }
        }
    }

    $script:RuntimeState = $state
    Save-AIState $state
    return $state
}

#endregion

#region Rate Limiting

function Update-UsageTracking {
    [CmdletBinding()]
    param(
        [string]$Provider,
        [string]$Model,
        [int]$InputTokens = 0,
        [int]$OutputTokens = 0,
        [bool]$IsError = $false
    )

    $config = Get-AIConfig
    $state = Get-AIState
    $now = Get-Date

    # Ensure nested hashtables exist
    if (-not $state.usage[$Provider]) {
        $state.usage[$Provider] = @{}
    }
    if (-not $state.usage[$Provider][$Model]) {
        $state.usage[$Provider][$Model] = @{
            tokensThisMinute = 0
            requestsThisMinute = 0
            lastMinuteReset = $now.ToString("o")
            totalTokens = 0
            totalRequests = 0
            totalCost = 0.0
            errors = 0
        }
    }

    $usage = $state.usage[$Provider][$Model]
    $lastReset = [DateTime]::Parse($usage.lastMinuteReset)

    # Reset minute counters if a minute has passed
    if (($now - $lastReset).TotalMinutes -ge 1) {
        $usage.tokensThisMinute = 0
        $usage.requestsThisMinute = 0
        $usage.lastMinuteReset = $now.ToString("o")
    }

    # Update counters
    $totalTokens = $InputTokens + $OutputTokens
    $usage.tokensThisMinute += $totalTokens
    $usage.requestsThisMinute += 1
    $usage.totalTokens += $totalTokens
    $usage.totalRequests += 1

    if ($IsError) {
        $usage.errors += 1
    }

    # Calculate cost
    $modelConfig = $config.providers[$Provider].models[$Model]
    if ($modelConfig) {
        $cost = (($InputTokens / 1000000) * $modelConfig.inputCost) +
                (($OutputTokens / 1000000) * $modelConfig.outputCost)
        $usage.totalCost += $cost
    }

    $state.usage[$Provider][$Model] = $usage
    $script:RuntimeState = $state
    Save-AIState $state

    return $usage
}

function Get-RateLimitStatus {
    [CmdletBinding()]
    param(
        [string]$Provider,
        [string]$Model
    )

    $config = Get-AIConfig
    $state = Get-AIState

    $modelConfig = $config.providers[$Provider].models[$Model]
    if (-not $modelConfig) {
        return @{ available = $false; reason = "Model not found" }
    }

    $usage = $state.usage[$Provider][$Model]
    if (-not $usage) {
        return @{ available = $true; tokensPercent = 0; requestsPercent = 0 }
    }

    # Check if minute has reset
    $now = Get-Date
    $lastReset = [DateTime]::Parse($usage.lastMinuteReset)
    if (($now - $lastReset).TotalMinutes -ge 1) {
        return @{ available = $true; tokensPercent = 0; requestsPercent = 0 }
    }

    $tokensPercent = if ($modelConfig.tokensPerMinute -gt 0) {
        ($usage.tokensThisMinute / $modelConfig.tokensPerMinute) * 100
    } else { 0 }

    $requestsPercent = if ($modelConfig.requestsPerMinute -gt 0) {
        ($usage.requestsThisMinute / $modelConfig.requestsPerMinute) * 100
    } else { 0 }

    $threshold = $config.settings.rateLimitThreshold * 100

    return @{
        available = ($tokensPercent -lt $threshold) -and ($requestsPercent -lt $threshold)
        tokensPercent = [math]::Round($tokensPercent, 1)
        requestsPercent = [math]::Round($requestsPercent, 1)
        tokensRemaining = $modelConfig.tokensPerMinute - $usage.tokensThisMinute
        requestsRemaining = $modelConfig.requestsPerMinute - $usage.requestsThisMinute
        threshold = $threshold
    }
}

#endregion

#region Model Selection

function Get-OptimalModel {
    <#
    .SYNOPSIS
        Selects the optimal model based on task requirements and constraints
    .PARAMETER Task
        Type of task: "simple", "complex", "creative", "code", "vision"
    .PARAMETER EstimatedTokens
        Estimated input tokens for cost calculation
    .PARAMETER RequiredCapabilities
        Array of required capabilities
    .PARAMETER PreferCheapest
        Force selection of cheapest suitable model
    .PARAMETER PreferredProvider
        Preferred provider to start with
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("simple", "complex", "creative", "code", "vision", "analysis")]
        [string]$Task = "simple",
        [int]$EstimatedTokens = 1000,
        [string[]]$RequiredCapabilities = @(),
        [switch]$PreferCheapest,
        [string]$PreferredProvider = "anthropic"
    )

    $config = Get-AIConfig
    $candidates = @()

    # Task to tier mapping
    $taskTierMap = @{
        "simple" = @("lite", "standard", "pro")
        "code" = @("standard", "lite", "pro")
        "analysis" = @("standard", "pro", "lite")
        "complex" = @("pro", "standard")
        "creative" = @("pro", "standard")
        "vision" = @("pro", "standard")
    }

    $preferredTiers = $taskTierMap[$Task]

    # Build candidate list from all providers
    foreach ($providerName in $config.providerFallbackOrder) {
        $provider = $config.providers[$providerName]
        if (-not $provider.enabled) { continue }

        # Check API key availability
        if ($provider.apiKeyEnv -and -not [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)) {
            continue
        }

        foreach ($modelName in $provider.models.Keys) {
            $model = $provider.models[$modelName]

            # Check capabilities
            $hasCapabilities = $true
            foreach ($cap in $RequiredCapabilities) {
                if ($cap -notin $model.capabilities) {
                    $hasCapabilities = $false
                    break
                }
            }
            if (-not $hasCapabilities) { continue }

            # Check rate limits
            $rateStatus = Get-RateLimitStatus -Provider $providerName -Model $modelName
            if (-not $rateStatus.available) { continue }

            # Calculate estimated cost
            $estimatedCost = ($EstimatedTokens / 1000000) * $model.inputCost +
                            ($EstimatedTokens / 1000000 * 0.5) * $model.outputCost

            # Calculate score
            $tierScore = switch ($model.tier) {
                "pro" { 3 }
                "standard" { 2 }
                "lite" { 1 }
            }

            $tierPreference = $preferredTiers.IndexOf($model.tier)
            if ($tierPreference -eq -1) { $tierPreference = 99 }

            $providerPreference = $config.providerFallbackOrder.IndexOf($providerName)

            $candidates += @{
                provider = $providerName
                model = $modelName
                tier = $model.tier
                cost = $estimatedCost
                tierScore = $tierScore
                tierPreference = $tierPreference
                providerPreference = $providerPreference
                rateStatus = $rateStatus
            }
        }
    }

    if ($candidates.Count -eq 0) {
        Write-Warning "[AI] No suitable models available"
        return $null
    }

    # Sort candidates
    if ($PreferCheapest -or $config.settings.costOptimization) {
        $sorted = $candidates | Sort-Object cost, tierPreference, providerPreference
    } else {
        $sorted = $candidates | Sort-Object tierPreference, providerPreference, cost
    }

    $selected = $sorted[0]

    Write-Host "[AI] Selected: $($selected.provider)/$($selected.model) " -NoNewline -ForegroundColor Cyan
    Write-Host "(tier: $($selected.tier), est. cost: `$$([math]::Round($selected.cost, 4)))" -ForegroundColor Gray

    return $selected
}

function Get-FallbackModel {
    <#
    .SYNOPSIS
        Gets the next fallback model in the chain
    #>
    [CmdletBinding()]
    param(
        [string]$CurrentProvider,
        [string]$CurrentModel,
        [switch]$CrossProvider
    )

    $config = Get-AIConfig

    # Try same provider first
    $chain = $config.fallbackChain[$CurrentProvider]
    if ($chain) {
        $currentIndex = $chain.IndexOf($CurrentModel)
        if ($currentIndex -ge 0 -and $currentIndex -lt ($chain.Count - 1)) {
            $nextModel = $chain[$currentIndex + 1]
            $rateStatus = Get-RateLimitStatus -Provider $CurrentProvider -Model $nextModel
            if ($rateStatus.available) {
                return @{ provider = $CurrentProvider; model = $nextModel }
            }
        }
    }

    # Try other providers if allowed
    if ($CrossProvider) {
        foreach ($providerName in $config.providerFallbackOrder) {
            if ($providerName -eq $CurrentProvider) { continue }

            $provider = $config.providers[$providerName]
            if (-not $provider.enabled) { continue }

            # Check API key
            if ($provider.apiKeyEnv -and -not [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)) {
                continue
            }

            $providerChain = $config.fallbackChain[$providerName]
            if ($providerChain -and $providerChain.Count -gt 0) {
                $firstModel = $providerChain[0]
                $rateStatus = Get-RateLimitStatus -Provider $providerName -Model $firstModel
                if ($rateStatus.available) {
                    Write-Host "[AI] Switching to provider: $providerName" -ForegroundColor Yellow
                    return @{ provider = $providerName; model = $firstModel }
                }
            }
        }
    }

    return $null
}

#endregion

#region API Invocation with Retry

function Invoke-AIRequest {
    <#
    .SYNOPSIS
        Invokes an AI request with automatic retry and fallback
    .PARAMETER Messages
        Array of message objects
    .PARAMETER Provider
        Provider name (anthropic, openai, ollama)
    .PARAMETER Model
        Model identifier
    .PARAMETER MaxTokens
        Maximum output tokens
    .PARAMETER Temperature
        Sampling temperature
    .PARAMETER AutoFallback
        Enable automatic fallback on errors
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [array]$Messages,
        [string]$Provider = "anthropic",
        [string]$Model,
        [int]$MaxTokens = 4096,
        [float]$Temperature = 0.7,
        [switch]$AutoFallback,
        [switch]$Stream
    )

    $config = Get-AIConfig
    $maxRetries = $config.settings.maxRetries
    $retryDelay = $config.settings.retryDelayMs

    # Auto-select model if not specified
    if (-not $Model) {
        $optimal = Get-OptimalModel -Task "simple" -EstimatedTokens ($Messages | ConvertTo-Json | Measure-Object -Character).Characters
        if ($optimal) {
            $Provider = $optimal.provider
            $Model = $optimal.model
        } else {
            throw "No available models"
        }
    }

    $currentProvider = $Provider
    $currentModel = $Model
    $attempt = 0
    $lastError = $null

    while ($attempt -lt $maxRetries) {
        $attempt++

        try {
            Write-Host "[AI] Request #$attempt to $currentProvider/$currentModel" -ForegroundColor Cyan

            # Check rate limits before request
            $rateStatus = Get-RateLimitStatus -Provider $currentProvider -Model $currentModel
            if (-not $rateStatus.available) {
                Write-Warning "[AI] Rate limit threshold reached (tokens: $($rateStatus.tokensPercent)%, requests: $($rateStatus.requestsPercent)%)"

                if ($AutoFallback -or $config.settings.autoFallback) {
                    $fallback = Get-FallbackModel -CurrentProvider $currentProvider -CurrentModel $currentModel -CrossProvider
                    if ($fallback) {
                        $currentProvider = $fallback.provider
                        $currentModel = $fallback.model
                        Write-Host "[AI] Falling back to $currentProvider/$currentModel" -ForegroundColor Yellow
                        continue
                    }
                }

                throw "Rate limit exceeded and no fallback available"
            }

            # Make the actual API call
            $result = Invoke-ProviderAPI -Provider $currentProvider -Model $currentModel `
                -Messages $Messages -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream

            # Update usage tracking
            $inputTokens = $result.usage.input_tokens
            $outputTokens = $result.usage.output_tokens
            Update-UsageTracking -Provider $currentProvider -Model $currentModel `
                -InputTokens $inputTokens -OutputTokens $outputTokens

            # Add metadata to result
            $result | Add-Member -NotePropertyName "_meta" -NotePropertyValue @{
                provider = $currentProvider
                model = $currentModel
                attempt = $attempt
                timestamp = (Get-Date).ToString("o")
            } -Force

            return $result

        } catch {
            $lastError = $_
            Write-Warning "[AI] Error on attempt $attempt`: $($_.Exception.Message)"

            # Update error tracking
            Update-UsageTracking -Provider $currentProvider -Model $currentModel -IsError $true

            # Determine if we should retry or fallback
            $errorType = Get-ErrorType $_.Exception

            if ($errorType -eq "RateLimit" -or $errorType -eq "Overloaded") {
                # Wait and retry same model, or fallback
                if ($AutoFallback -or $config.settings.autoFallback) {
                    $fallback = Get-FallbackModel -CurrentProvider $currentProvider -CurrentModel $currentModel -CrossProvider
                    if ($fallback) {
                        $currentProvider = $fallback.provider
                        $currentModel = $fallback.model
                        Write-Host "[AI] Falling back to $currentProvider/$currentModel" -ForegroundColor Yellow
                        continue
                    }
                }
                Start-Sleep -Milliseconds ($retryDelay * $attempt)

            } elseif ($errorType -eq "ServerError") {
                # Server error - try fallback provider
                if ($AutoFallback -or $config.settings.autoFallback) {
                    $fallback = Get-FallbackModel -CurrentProvider $currentProvider -CurrentModel $currentModel -CrossProvider
                    if ($fallback) {
                        $currentProvider = $fallback.provider
                        $currentModel = $fallback.model
                        continue
                    }
                }
                Start-Sleep -Milliseconds ($retryDelay * $attempt)

            } elseif ($errorType -eq "AuthError") {
                # Auth error - try different provider immediately
                if ($AutoFallback -or $config.settings.autoFallback) {
                    $fallback = Get-FallbackModel -CurrentProvider $currentProvider -CurrentModel $currentModel -CrossProvider
                    if ($fallback) {
                        $currentProvider = $fallback.provider
                        $currentModel = $fallback.model
                        continue
                    }
                }
                throw "Authentication failed for $currentProvider and no fallback available"

            } else {
                # Unknown error - standard retry
                Start-Sleep -Milliseconds ($retryDelay * $attempt)
            }
        }
    }

    throw "All retry attempts failed. Last error: $lastError"
}

function Get-ErrorType {
    param($Exception)

    $message = $Exception.Message.ToLower()

    if ($message -match "rate.?limit|429|too many requests") {
        return "RateLimit"
    } elseif ($message -match "overloaded|503|capacity") {
        return "Overloaded"
    } elseif ($message -match "401|403|unauthorized|forbidden|invalid.*key") {
        return "AuthError"
    } elseif ($message -match "500|502|504|server error") {
        return "ServerError"
    } else {
        return "Unknown"
    }
}

function Invoke-ProviderAPI {
    [CmdletBinding()]
    param(
        [string]$Provider,
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $config = Get-AIConfig
    $providerConfig = $config.providers[$Provider]

    switch ($Provider) {
        "anthropic" {
            return Invoke-AnthropicAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        "openai" {
            return Invoke-OpenAIAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        "ollama" {
            return Invoke-OllamaAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        default {
            throw "Unknown provider: $Provider"
        }
    }
}

function Invoke-AnthropicAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:ANTHROPIC_API_KEY
    if (-not $apiKey) {
        throw "ANTHROPIC_API_KEY not set"
    }

    # Convert messages to Anthropic format
    $systemMessage = ($Messages | Where-Object { $_.role -eq "system" } | Select-Object -First 1).content
    $chatMessages = $Messages | Where-Object { $_.role -ne "system" } | ForEach-Object {
        @{ role = $_.role; content = $_.content }
    }

    $body = @{
        model = $Model
        max_tokens = $MaxTokens
        temperature = $Temperature
        messages = @($chatMessages)
    }

    if ($systemMessage) {
        $body.system = $systemMessage
    }

    $headers = @{
        "x-api-key" = $apiKey
        "anthropic-version" = "2023-06-01"
        "content-type" = "application/json"
    }

    $response = Invoke-RestMethod -Uri "https://api.anthropic.com/v1/messages" `
        -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)

    return @{
        content = $response.content[0].text
        usage = @{
            input_tokens = $response.usage.input_tokens
            output_tokens = $response.usage.output_tokens
        }
        model = $response.model
        stop_reason = $response.stop_reason
    }
}

function Invoke-OpenAIAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:OPENAI_API_KEY
    if (-not $apiKey) {
        throw "OPENAI_API_KEY not set"
    }

    $body = @{
        model = $Model
        max_tokens = $MaxTokens
        temperature = $Temperature
        messages = @($Messages | ForEach-Object {
            @{ role = $_.role; content = $_.content }
        })
    }

    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Uri "https://api.openai.com/v1/chat/completions" `
        -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)

    return @{
        content = $response.choices[0].message.content
        usage = @{
            input_tokens = $response.usage.prompt_tokens
            output_tokens = $response.usage.completion_tokens
        }
        model = $response.model
        stop_reason = $response.choices[0].finish_reason
    }
}

function Test-OllamaAvailable {
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

function Install-OllamaAuto {
    <#
    .SYNOPSIS
        Auto-install Ollama in silent mode
    #>
    [CmdletBinding()]
    param(
        [switch]$Force,
        [string]$DefaultModel = "llama3.2:3b"
    )

    $installerScript = Join-Path $PSScriptRoot "Install-Ollama.ps1"

    if (Test-Path $installerScript) {
        Write-Host "[AI] Auto-installing Ollama..." -ForegroundColor Yellow
        & $installerScript -SkipModelPull
        return Test-OllamaAvailable
    } else {
        # Inline minimal installer
        Write-Host "[AI] Downloading and installing Ollama (silent)..." -ForegroundColor Yellow

        $tempInstaller = Join-Path $env:TEMP "OllamaSetup.exe"
        $downloadUrl = "https://ollama.com/download/OllamaSetup.exe"

        try {
            $ProgressPreference = "SilentlyContinue"
            Invoke-WebRequest -Uri $downloadUrl -OutFile $tempInstaller -UseBasicParsing

            $process = Start-Process -FilePath $tempInstaller `
                -ArgumentList "/SP- /VERYSILENT /NORESTART /SUPPRESSMSGBOXES" `
                -Wait -PassThru

            if ($process.ExitCode -eq 0) {
                Write-Host "[AI] Ollama installed successfully" -ForegroundColor Green

                # Start service
                $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
                if (Test-Path $ollamaExe) {
                    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
                    Start-Sleep -Seconds 5
                }

                Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
                return Test-OllamaAvailable
            }
        } catch {
            Write-Warning "[AI] Ollama auto-install failed: $($_.Exception.Message)"
        }

        return $false
    }
}

function Invoke-OllamaAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    # Check if Ollama is running, try to start or install if not
    if (-not (Test-OllamaAvailable)) {
        Write-Host "[AI] Ollama not running, attempting to start..." -ForegroundColor Yellow

        # Try to start existing installation
        $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
        if (Test-Path $ollamaExe) {
            Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 3

            if (-not (Test-OllamaAvailable)) {
                throw "Ollama installed but failed to start"
            }
        } else {
            # Offer to auto-install
            $config = Get-AIConfig
            if ($config.settings.autoInstallOllama) {
                if (Install-OllamaAuto) {
                    Write-Host "[AI] Ollama auto-installed and running" -ForegroundColor Green
                } else {
                    throw "Ollama auto-installation failed"
                }
            } else {
                throw "Ollama not installed. Run Install-Ollama.ps1 or set autoInstallOllama=true"
            }
        }
    }

    $body = @{
        model = $Model
        messages = @($Messages | ForEach-Object {
            @{ role = $_.role; content = $_.content }
        })
        options = @{
            num_predict = $MaxTokens
            temperature = $Temperature
        }
        stream = $false
    }

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/chat" `
            -Method Post -Body ($body | ConvertTo-Json -Depth 10) -ContentType "application/json"

        return @{
            content = $response.message.content
            usage = @{
                input_tokens = $response.prompt_eval_count
                output_tokens = $response.eval_count
            }
            model = $response.model
            stop_reason = "stop"
        }
    } catch {
        throw "Ollama API error: $_"
    }
}

#endregion

#region Utility Functions

function Get-AIStatus {
    <#
    .SYNOPSIS
        Gets current AI system status including all providers and rate limits
    #>
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    $state = Get-AIState

    Write-Host "`n=== AI Model Handler Status ===" -ForegroundColor Cyan

    foreach ($providerName in $config.providerFallbackOrder) {
        $provider = $config.providers[$providerName]
        $hasKey = -not $provider.apiKeyEnv -or [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)
        $keyStatus = if ($hasKey) { "[OK]" } else { "[NO KEY]" }
        $enabledStatus = if ($provider.enabled) { "Enabled" } else { "Disabled" }

        $color = if ($hasKey -and $provider.enabled) { "Green" } else { "Yellow" }
        Write-Host "`n[$providerName] $keyStatus $enabledStatus" -ForegroundColor $color

        foreach ($modelName in $provider.models.Keys) {
            $model = $provider.models[$modelName]
            $rateStatus = Get-RateLimitStatus -Provider $providerName -Model $modelName
            $usage = $state.usage[$providerName][$modelName]

            $statusIcon = if ($rateStatus.available) { "+" } else { "!" }
            $tierLabel = $model.tier.ToUpper().PadRight(8)

            Write-Host "  $statusIcon $modelName" -ForegroundColor White -NoNewline
            Write-Host " [$tierLabel] " -ForegroundColor Gray -NoNewline
            Write-Host "Tokens: $($rateStatus.tokensPercent)% " -NoNewline -ForegroundColor $(if ($rateStatus.tokensPercent -gt 85) { "Red" } else { "Green" })
            Write-Host "Reqs: $($rateStatus.requestsPercent)%" -ForegroundColor $(if ($rateStatus.requestsPercent -gt 85) { "Red" } else { "Green" })

            if ($usage -and $usage.totalCost -gt 0) {
                Write-Host "    Total: $($usage.totalRequests) requests, `$$([math]::Round($usage.totalCost, 4))" -ForegroundColor Gray
            }
        }
    }

    Write-Host "`n=== Settings ===" -ForegroundColor Cyan
    Write-Host "  Auto Fallback: $($config.settings.autoFallback)" -ForegroundColor Gray
    Write-Host "  Cost Optimization: $($config.settings.costOptimization)" -ForegroundColor Gray
    Write-Host "  Rate Limit Threshold: $($config.settings.rateLimitThreshold * 100)%" -ForegroundColor Gray
    Write-Host "  Max Retries: $($config.settings.maxRetries)" -ForegroundColor Gray
}

function Reset-AIState {
    <#
    .SYNOPSIS
        Resets all usage tracking and error counts
    #>
    [CmdletBinding()]
    param([switch]$Force)

    if (-not $Force) {
        $confirm = Read-Host "Reset all AI usage data? (y/N)"
        if ($confirm -ne "y") {
            Write-Host "Cancelled" -ForegroundColor Yellow
            return
        }
    }

    $script:RuntimeState = @{
        currentProvider = "anthropic"
        currentModel = "claude-sonnet-4-5-20250929"
        usage = @{}
        errors = @()
        lastRequest = $null
    }

    Initialize-AIState
    Write-Host "[AI] State reset complete" -ForegroundColor Green
}

function Test-AIProviders {
    <#
    .SYNOPSIS
        Tests connectivity to all configured providers
    #>
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    $results = @()

    Write-Host "`nTesting AI Providers..." -ForegroundColor Cyan

    foreach ($providerName in $config.providerFallbackOrder) {
        $provider = $config.providers[$providerName]

        Write-Host "`n[$providerName] " -NoNewline

        if (-not $provider.enabled) {
            Write-Host "DISABLED" -ForegroundColor Gray
            $results += @{ provider = $providerName; status = "disabled" }
            continue
        }

        # Check API key
        if ($provider.apiKeyEnv) {
            $key = [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)
            if (-not $key) {
                Write-Host "NO API KEY ($($provider.apiKeyEnv))" -ForegroundColor Red
                $results += @{ provider = $providerName; status = "no_key" }
                continue
            }
        }

        # Test connectivity
        try {
            $testMessages = @(
                @{ role = "user"; content = "Say 'OK' and nothing else." }
            )

            $firstModel = $config.fallbackChain[$providerName][0]
            $response = Invoke-ProviderAPI -Provider $providerName -Model $firstModel `
                -Messages $testMessages -MaxTokens 10 -Temperature 0

            Write-Host "OK " -ForegroundColor Green -NoNewline
            Write-Host "($firstModel responded)" -ForegroundColor Gray
            $results += @{ provider = $providerName; status = "ok"; model = $firstModel }

        } catch {
            Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
            $results += @{ provider = $providerName; status = "error"; error = $_.Exception.Message }
        }
    }

    return $results
}

#endregion

#region Parallel Execution

function Invoke-AIRequestParallel {
    <#
    .SYNOPSIS
        Execute multiple AI requests in parallel using runspaces
    .DESCRIPTION
        Runs multiple AI requests concurrently, optimal for local Ollama execution.
        Uses PowerShell runspaces for true multi-threaded execution.
    .PARAMETER Requests
        Array of request objects with: Messages, Provider, Model, MaxTokens, Temperature
    .PARAMETER MaxConcurrent
        Maximum concurrent requests (default: from config or 4)
    .PARAMETER TimeoutMs
        Timeout per request in milliseconds (default: 30000)
    .EXAMPLE
        $requests = @(
            @{ Messages = @(@{role="user";content="Task 1"}); Model = "llama3.2:3b" },
            @{ Messages = @(@{role="user";content="Task 2"}); Model = "llama3.2:3b" }
        )
        $results = Invoke-AIRequestParallel -Requests $requests
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [array]$Requests,

        [int]$MaxConcurrent,

        [int]$TimeoutMs
    )

    $config = Get-AIConfig
    $parallelConfig = $config.settings.parallelExecution

    if (-not $MaxConcurrent) {
        $MaxConcurrent = if ($parallelConfig.maxConcurrent) { $parallelConfig.maxConcurrent } else { 4 }
    }
    if (-not $TimeoutMs) {
        $TimeoutMs = if ($parallelConfig.timeoutMs) { $parallelConfig.timeoutMs } else { 30000 }
    }

    Write-Host "[AI] Executing $($Requests.Count) requests in parallel (max: $MaxConcurrent)..." -ForegroundColor Cyan

    # Create InitialSessionState with module pre-loaded
    $modulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"
    $iss = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
    $iss.ImportPSModule($modulePath)

    # Create runspace pool with pre-loaded module
    $runspacePool = [runspacefactory]::CreateRunspacePool(1, $MaxConcurrent, $iss, $Host)
    $runspacePool.Open()

    $jobs = @()
    $results = @()

    foreach ($i in 0..($Requests.Count - 1)) {
        $request = $Requests[$i]

        $powershell = [powershell]::Create()
        $powershell.RunspacePool = $runspacePool

        [void]$powershell.AddScript({
            param($Request, $Index)

            try {
                $params = @{
                    Messages = $Request.Messages
                    MaxTokens = if ($Request.MaxTokens) { $Request.MaxTokens } else { 1024 }
                    Temperature = if ($Request.Temperature) { $Request.Temperature } else { 0.7 }
                }

                if ($Request.Provider) { $params.Provider = $Request.Provider }
                if ($Request.Model) { $params.Model = $Request.Model }

                $response = Invoke-AIRequest @params

                return @{
                    Index = $Index
                    Success = $true
                    Response = $response
                    Error = $null
                }
            } catch {
                return @{
                    Index = $Index
                    Success = $false
                    Response = $null
                    Error = $_.Exception.Message
                }
            }
        })

        [void]$powershell.AddArgument($request)
        [void]$powershell.AddArgument($i)

        $jobs += @{
            PowerShell = $powershell
            Handle = $powershell.BeginInvoke()
            Index = $i
        }
    }

    # Collect results with timeout
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    foreach ($job in $jobs) {
        $remainingTime = $TimeoutMs - $stopwatch.ElapsedMilliseconds
        if ($remainingTime -lt 0) { $remainingTime = 0 }

        try {
            if ($job.Handle.AsyncWaitHandle.WaitOne($remainingTime)) {
                $result = $job.PowerShell.EndInvoke($job.Handle)
                $results += $result
            } else {
                $results += @{
                    Index = $job.Index
                    Success = $false
                    Response = $null
                    Error = "Timeout after ${TimeoutMs}ms"
                }
            }
        } catch {
            $results += @{
                Index = $job.Index
                Success = $false
                Response = $null
                Error = $_.Exception.Message
            }
        } finally {
            $job.PowerShell.Dispose()
        }
    }

    $runspacePool.Close()
    $runspacePool.Dispose()

    # Sort by original index
    $results = $results | Sort-Object { $_.Index }

    $successCount = ($results | Where-Object { $_.Success }).Count
    Write-Host "[AI] Completed: $successCount/$($Requests.Count) successful in $($stopwatch.ElapsedMilliseconds)ms" -ForegroundColor $(if ($successCount -eq $Requests.Count) { "Green" } else { "Yellow" })

    return $results
}

function Invoke-AIBatch {
    <#
    .SYNOPSIS
        Process a batch of prompts with the same settings
    .DESCRIPTION
        Simplified interface for batch processing multiple prompts.
        Automatically uses local Ollama if available and configured.
    .PARAMETER Prompts
        Array of prompt strings
    .PARAMETER SystemPrompt
        Optional system prompt applied to all requests
    .PARAMETER Model
        Model to use (default: from config)
    .PARAMETER MaxConcurrent
        Max concurrent requests
    .EXAMPLE
        $prompts = @("Summarize X", "Translate Y", "Explain Z")
        $results = Invoke-AIBatch -Prompts $prompts -Model "llama3.2:3b"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$Prompts,

        [string]$SystemPrompt,

        [string]$Model,

        [string]$Provider,

        [int]$MaxTokens = 1024,

        [int]$MaxConcurrent
    )

    $config = Get-AIConfig

    # Auto-select provider based on config
    if (-not $Provider) {
        if ($config.settings.preferLocal -and (Test-OllamaAvailable)) {
            $Provider = "ollama"
            if (-not $Model) {
                $Model = $config.settings.ollamaDefaultModel
            }
        } else {
            $Provider = $config.providerFallbackOrder[0]
            if (-not $Model) {
                $Model = $config.fallbackChain[$Provider][0]
            }
        }
    }

    Write-Host "[AI] Batch processing $($Prompts.Count) prompts with $Provider/$Model" -ForegroundColor Cyan

    # Build requests
    $requests = @()
    foreach ($prompt in $Prompts) {
        $messages = @()
        if ($SystemPrompt) {
            $messages += @{ role = "system"; content = $SystemPrompt }
        }
        $messages += @{ role = "user"; content = $prompt }

        $requests += @{
            Messages = $messages
            Provider = $Provider
            Model = $Model
            MaxTokens = $MaxTokens
        }
    }

    # Execute in parallel
    $results = Invoke-AIRequestParallel -Requests $requests -MaxConcurrent $MaxConcurrent

    # Simplify output
    return $results | ForEach-Object {
        @{
            Prompt = $Prompts[$_.Index]
            Success = $_.Success
            Content = if ($_.Success) { $_.Response.content } else { $null }
            Error = $_.Error
            Tokens = if ($_.Success) { $_.Response.usage } else { $null }
        }
    }
}

function Get-LocalModels {
    <#
    .SYNOPSIS
        Get list of available local Ollama models
    #>
    [CmdletBinding()]
    param()

    if (-not (Test-OllamaAvailable)) {
        Write-Warning "Ollama is not running"
        return @()
    }

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get
        return $response.models | ForEach-Object {
            @{
                Name = $_.name
                Size = [math]::Round($_.size / 1GB, 2)
                Modified = $_.modified_at
            }
        }
    } catch {
        return @()
    }
}

#endregion

#region Exports

Export-ModuleMember -Function @(
    'Get-AIConfig',
    'Save-AIConfig',
    'Initialize-AIState',
    'Get-OptimalModel',
    'Get-FallbackModel',
    'Get-RateLimitStatus',
    'Update-UsageTracking',
    'Invoke-AIRequest',
    'Invoke-AIRequestParallel',
    'Invoke-AIBatch',
    'Get-LocalModels',
    'Get-AIStatus',
    'Reset-AIState',
    'Test-AIProviders',
    'Test-OllamaAvailable',
    'Install-OllamaAuto'
)

#endregion

# Auto-initialize on module load
Initialize-AIState | Out-Null
