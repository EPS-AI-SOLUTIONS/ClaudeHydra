#Requires -Version 5.1
<#
.SYNOPSIS
    AI Model Handler with Auto Fallback, Rate Limiting, Cost Optimization & Multi-Provider Support
.DESCRIPTION
    Comprehensive AI model management system for ClaudeCLI featuring:
    - Auto-retry with model downgrade (Opus → Sonnet → Haiku)
    - Rate limit aware switching
    - Cost optimizer for model selection
    - Multi-provider fallback (Anthropic → OpenAI → Google → Mistral → Groq → Local)
.VERSION
    1.0.0
.AUTHOR
    HYDRA System
#>

$script:ConfigPath = Join-Path $PSScriptRoot "ai-config.json"
$script:StatePath = Join-Path $PSScriptRoot "ai-state.json"
$script:PromptOptimizerPath = Join-Path $PSScriptRoot "modules\PromptOptimizer.psm1"
$script:ModelDiscoveryPath = Join-Path $PSScriptRoot "modules\ModelDiscovery.psm1"
$script:PromptQueuePath = Join-Path $PSScriptRoot "modules\PromptQueue.psm1"
$script:SecureStoragePath = Join-Path $PSScriptRoot "modules\SecureStorage.psm1"
$script:DiscoveredModels = $null

# Auto-load PromptOptimizer if available
if (Test-Path $script:PromptOptimizerPath) {
    Import-Module $script:PromptOptimizerPath -Force -ErrorAction SilentlyContinue
}

# Auto-load ModelDiscovery if available
if (Test-Path $script:ModelDiscoveryPath) {
    Import-Module $script:ModelDiscoveryPath -Force -ErrorAction SilentlyContinue
}

# Auto-load PromptQueue if available
if (Test-Path $script:PromptQueuePath) {
    Import-Module $script:PromptQueuePath -Force -ErrorAction SilentlyContinue
}

# Auto-load SecureStorage if available
if (Test-Path $script:SecureStoragePath) {
    Import-Module $script:SecureStoragePath -Force -ErrorAction SilentlyContinue
}

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

#region Logging

function Write-AIHandlerLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,
        [ValidateSet("debug", "info", "warn", "error")]
        [string]$Level = "info",
        [hashtable]$Data = @{}
    )

    $config = Get-AIConfig
    $levels = @("debug", "info", "warn", "error")
    $currentIndex = $levels.IndexOf($config.settings.logLevel)
    $messageIndex = $levels.IndexOf($Level)
    if ($messageIndex -lt $currentIndex) { return }

    if (Get-Command Write-AILog -ErrorAction SilentlyContinue) {
        Write-AILog -Message $Message -Level $Level -Data $Data
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
        google = @{
            name = "Google"
            baseUrl = "https://generativelanguage.googleapis.com/v1beta"
            apiKeyEnv = "GOOGLE_API_KEY"
            priority = 3
            enabled = $true
            models = @{
                "gemini-1.5-pro" = @{
                    tier = "pro"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 3.50
                    outputCost = 10.50
                    tokensPerMinute = 60000
                    requestsPerMinute = 60
                    capabilities = @("vision", "code", "analysis")
                }
                "gemini-1.5-flash" = @{
                    tier = "lite"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 0.35
                    outputCost = 1.05
                    tokensPerMinute = 120000
                    requestsPerMinute = 120
                    capabilities = @("vision", "code", "analysis")
                }
            }
        }
        mistral = @{
            name = "Mistral"
            baseUrl = "https://api.mistral.ai/v1"
            apiKeyEnv = "MISTRAL_API_KEY"
            priority = 4
            enabled = $true
            models = @{
                "mistral-large-latest" = @{
                    tier = "pro"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 2.00
                    outputCost = 6.00
                    tokensPerMinute = 60000
                    requestsPerMinute = 60
                    capabilities = @("code", "analysis")
                }
                "mistral-small-latest" = @{
                    tier = "lite"
                    contextWindow = 32000
                    maxOutput = 8192
                    inputCost = 0.20
                    outputCost = 0.60
                    tokensPerMinute = 120000
                    requestsPerMinute = 120
                    capabilities = @("code", "analysis")
                }
            }
        }
        groq = @{
            name = "Groq"
            baseUrl = "https://api.groq.com/openai/v1"
            apiKeyEnv = "GROQ_API_KEY"
            priority = 5
            enabled = $true
            models = @{
                "llama-3.1-70b-versatile" = @{
                    tier = "pro"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 0.59
                    outputCost = 0.79
                    tokensPerMinute = 70000
                    requestsPerMinute = 120
                    capabilities = @("code", "analysis")
                }
                "llama-3.1-8b-instant" = @{
                    tier = "lite"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 0.05
                    outputCost = 0.08
                    tokensPerMinute = 120000
                    requestsPerMinute = 300
                    capabilities = @("code", "analysis")
                }
            }
        }
        ollama = @{
            name = "Ollama (Local)"
            baseUrl = "http://localhost:11434/api"
            apiKeyEnv = $null
            priority = 6
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
        google = @("gemini-1.5-pro", "gemini-1.5-flash")
        mistral = @("mistral-large-latest", "mistral-small-latest")
        groq = @("llama-3.1-70b-versatile", "llama-3.1-8b-instant")
        ollama = @("llama3.3:70b", "qwen2.5-coder:32b")
    }
    providerFallbackOrder = @("anthropic", "openai", "google", "mistral", "groq", "ollama")
    settings = @{
        maxRetries = 3
        retryDelayMs = 1000
        rateLimitThreshold = 0.85
        costOptimization = $true
        autoFallback = $true
        logLevel = "info"
        logFormat = "json"
        streamResponses = $true
        outputTokenRatio = 0.5
        modelDiscovery = @{
            enabled = $true
            updateConfigOnStart = $true
            parallel = $true
            skipValidation = $false
        }
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

    $json = $Config | ConvertTo-Json -Depth 10
    if (Get-Command Write-AtomicFile -ErrorAction SilentlyContinue) {
        Write-AtomicFile -Path $script:ConfigPath -Content $json
    } else {
        $json | Set-Content $script:ConfigPath -Encoding UTF8
    }
    Write-Host "[AI] Config saved to $script:ConfigPath" -ForegroundColor Green
}

function Get-AIState {
    [CmdletBinding()]
    param()

    if (Test-Path $script:StatePath) {
        try {
            if (Get-Command Read-EncryptedJson -ErrorAction SilentlyContinue) {
                $state = Read-EncryptedJson -Path $script:StatePath
                if ($state) { return $state }
            }
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

    if (Get-Command Write-EncryptedJson -ErrorAction SilentlyContinue) {
        Write-EncryptedJson -Data $State -Path $script:StatePath
    } else {
        $State | ConvertTo-Json -Depth 10 | Set-Content $script:StatePath -Encoding UTF8
    }
}

function Initialize-AIState {
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    if ($config.settings.modelDiscovery.enabled -and (Get-Command Initialize-ModelDiscovery -ErrorAction SilentlyContinue)) {
        try {
            $discovery = Initialize-ModelDiscovery -UpdateConfig:$config.settings.modelDiscovery.updateConfigOnStart `
                -Silent -SkipValidation:$config.settings.modelDiscovery.skipValidation `
                -Parallel:$config.settings.modelDiscovery.parallel -ErrorAction SilentlyContinue
            if ($discovery) {
                $script:DiscoveredModels = $discovery
            }
        } catch {
            Write-Warning "Model discovery failed: $($_.Exception.Message)"
        }
    }
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
        [int]$EstimatedOutputTokens = 0,
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
            $outputTokens = if ($EstimatedOutputTokens -gt 0) {
                $EstimatedOutputTokens
            } else {
                [math]::Round($EstimatedTokens * $config.settings.outputTokenRatio)
            }
            $estimatedCost = ($EstimatedTokens / 1000000) * $model.inputCost +
                            ($outputTokens / 1000000) * $model.outputCost

            # Calculate score
            $tierScore = switch ($model.tier) {
                "pro" { 3 }
                "standard" { 2 }
                "lite" { 1 }
            }

            $tierPreference = $preferredTiers.IndexOf($model.tier)
            if ($tierPreference -eq -1) { $tierPreference = 99 }

            $providerPreference = $config.providerFallbackOrder.IndexOf($providerName)
            if ($providerName -eq $PreferredProvider) {
                $providerPreference = -1
            }

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
        Provider name (anthropic, openai, google, mistral, groq, ollama)
    .PARAMETER Model
        Model identifier
    .PARAMETER MaxTokens
        Maximum output tokens
    .PARAMETER Temperature
        Sampling temperature
    .PARAMETER AutoFallback
        Enable automatic fallback on errors
    .PARAMETER OptimizePrompt
        Automatically enhance prompts before sending (uses PromptOptimizer module)
    .PARAMETER ShowOptimization
        Display prompt optimization details
    .PARAMETER NoOptimize
        Disable auto-optimization (send raw prompt)
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
        [switch]$Stream,
        [switch]$OptimizePrompt,
        [switch]$ShowOptimization,
        [switch]$NoOptimize
    )

    $config = Get-AIConfig
    $maxRetries = $config.settings.maxRetries
    $retryDelay = $config.settings.retryDelayMs

    # Apply prompt optimization if enabled (auto or explicit, unless -NoOptimize)
    $optimizationResult = $null
    $autoOptimize = $config.settings.advancedAI.promptOptimizer.autoOptimize -eq $true
    $shouldOptimize = (-not $NoOptimize) -and ($OptimizePrompt -or $autoOptimize)
    $showOpt = $ShowOptimization -or ($config.settings.advancedAI.promptOptimizer.showEnhancements -eq $true)

    if ($shouldOptimize -and (Get-Command Optimize-Prompt -ErrorAction SilentlyContinue)) {
        # Find user message to optimize
        for ($i = 0; $i -lt $Messages.Count; $i++) {
            if ($Messages[$i].role -eq "user") {
                $originalContent = $Messages[$i].content
                $optimizationResult = Optimize-Prompt -Prompt $originalContent -Model $Model -Detailed

                if ($optimizationResult.WasEnhanced) {
                    $Messages[$i].content = $optimizationResult.OptimizedPrompt

                    if ($showOpt) {
                        Write-Host "`n[Prompt Optimizer]" -ForegroundColor Cyan
                        Write-Host "Category: $($optimizationResult.Category)" -ForegroundColor Gray
                        Write-Host "Clarity: $($optimizationResult.ClarityScore)/100" -ForegroundColor Gray
                        Write-Host "Enhancements: $($optimizationResult.Enhancements -join ', ')" -ForegroundColor Gray
                        Write-Host ""
                    }
                }
                break  # Only optimize first user message
            }
        }
    }

    # Auto-select model if not specified
    if (-not $Model) {
        $optimal = Get-OptimalModel -Task "simple" -EstimatedTokens ($Messages | ConvertTo-Json | Measure-Object -Character).Characters
        if ($optimal) {
            $Provider = $optimal.provider
            $Model = $optimal.model
        } else {
            throw "Brak dostępnych modeli."
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
            Write-AIHandlerLog -Level "info" -Message "AI request started." -Data @{
                provider = $currentProvider
                model = $currentModel
                attempt = $attempt
            }

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

                throw "Przekroczono limit i brak dostępnego fallbacku."
            }

            # Make the actual API call
            $result = Invoke-ProviderAPI -Provider $currentProvider -Model $currentModel `
                -Messages $Messages -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream

            # Update usage tracking
            $inputTokens = if ($result.usage) { $result.usage.input_tokens } else { 0 }
            $outputTokens = if ($result.usage) { $result.usage.output_tokens } else { 0 }
            Update-UsageTracking -Provider $currentProvider -Model $currentModel `
                -InputTokens $inputTokens -OutputTokens $outputTokens

            # Add metadata to result
            $metaData = @{
                provider = $currentProvider
                model = $currentModel
                attempt = $attempt
                timestamp = (Get-Date).ToString("o")
            }

            # Include optimization info if applied
            if ($optimizationResult -and $optimizationResult.WasEnhanced) {
                $metaData.promptOptimization = @{
                    category = $optimizationResult.Category
                    clarityScore = $optimizationResult.ClarityScore
                    enhancements = $optimizationResult.Enhancements
                }
            }

            $result | Add-Member -NotePropertyName "_meta" -NotePropertyValue $metaData -Force

            Write-AIHandlerLog -Level "info" -Message "AI request completed." -Data @{
                provider = $currentProvider
                model = $currentModel
                attempt = $attempt
                inputTokens = $inputTokens
                outputTokens = $outputTokens
            }

            if (($inputTokens + $outputTokens) -eq 0 -and (Get-Command Write-AILog -ErrorAction SilentlyContinue)) {
                Write-AILog -Level "warn" -Message "Token usage unavailable for streamed response." `
                    -Data @{ provider = $currentProvider; model = $currentModel }
            }

            return $result

        } catch {
            $lastError = $_
            Write-Warning "[AI] Error on attempt $attempt`: $($_.Exception.Message)"
            Write-AIHandlerLog -Level "warn" -Message "AI request failed." -Data @{
                provider = $currentProvider
                model = $currentModel
                attempt = $attempt
                error = $_.Exception.Message
            }

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
                throw "Uwierzytelnienie nieudane dla $currentProvider i brak dostępnego fallbacku."

            } else {
                # Unknown error - standard retry
                Start-Sleep -Milliseconds ($retryDelay * $attempt)
            }
        }
    }

    throw "Wszystkie próby nieudane. Ostatni błąd: $lastError"
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
        "google" {
            return Invoke-GoogleAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        "mistral" {
            return Invoke-MistralAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        "groq" {
            return Invoke-GroqAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        "ollama" {
            return Invoke-OllamaAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        default {
            throw "Nieznany provider: $Provider"
        }
    }
}

function Invoke-StreamingRequest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Uri,
        [Parameter(Mandatory)]
        [string]$Body,
        [hashtable]$Headers = @{},
        [Parameter(Mandatory)]
        [scriptblock]$OnData
    )

    $client = New-Object System.Net.Http.HttpClient
    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $Uri)
    foreach ($header in $Headers.Keys) {
        $request.Headers.TryAddWithoutValidation($header, $Headers[$header]) | Out-Null
    }
    $request.Content = New-Object System.Net.Http.StringContent($Body, [System.Text.Encoding]::UTF8, "application/json")

    $response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
    $stream = $response.Content.ReadAsStreamAsync().Result
    $reader = New-Object System.IO.StreamReader($stream)

    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        if (-not $line) { continue }
        & $OnData $line
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
        throw "Brak zmiennej ANTHROPIC_API_KEY w środowisku."
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

    if ($Stream) {
        $contentBuffer = ""
        Invoke-StreamingRequest -Uri "https://api.anthropic.com/v1/messages" `
            -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -OnData {
                param($line)
                if ($line -notmatch "^data:") { return }
                $payload = $line -replace "^data:\s*", ""
                if ($payload -eq "[DONE]") { return }
                try {
                    $json = $payload | ConvertFrom-Json
                    if ($json.delta -and $json.delta.text) {
                        $contentBuffer += $json.delta.text
                        Write-Host $json.delta.text -NoNewline
                    } elseif ($json.content_block -and $json.content_block.text) {
                        $contentBuffer += $json.content_block.text
                        Write-Host $json.content_block.text -NoNewline
                    } elseif ($json.message -and $json.message.content) {
                        $text = $json.message.content | Select-Object -First 1
                        if ($text.text) {
                            $contentBuffer += $text.text
                            Write-Host $text.text -NoNewline
                        }
                    }
                } catch { }
            }
        Write-Host ""
        return @{
            content = $contentBuffer
            usage = @{ input_tokens = 0; output_tokens = 0 }
            model = $Model
            stop_reason = "stream"
        }
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
        throw "Brak zmiennej OPENAI_API_KEY w środowisku."
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

    if ($Stream) {
        return Invoke-OpenAICompatibleStream -Uri "https://api.openai.com/v1/chat/completions" `
            -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -Model $Model
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

function Invoke-OpenAICompatibleStream {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Uri,
        [Parameter(Mandatory)]
        [hashtable]$Headers,
        [Parameter(Mandatory)]
        [string]$Body,
        [string]$Model
    )

    $streamBody = ($Body | ConvertFrom-Json)
    $streamBody.stream = $true
    $contentBuffer = ""

    Invoke-StreamingRequest -Uri $Uri -Headers $Headers -Body ($streamBody | ConvertTo-Json -Depth 10) -OnData {
        param($line)
        if ($line -notmatch "^data:") { return }
        $payload = $line -replace "^data:\s*", ""
        if ($payload -eq "[DONE]") { return }
        try {
            $json = $payload | ConvertFrom-Json
            $delta = $json.choices[0].delta.content
            if ($delta) {
                $contentBuffer += $delta
                Write-Host $delta -NoNewline
            }
        } catch { }
    }

    Write-Host ""
    return @{
        content = $contentBuffer
        usage = @{ input_tokens = 0; output_tokens = 0 }
        model = $Model
        stop_reason = "stream"
    }
}

function Invoke-GoogleAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:GOOGLE_API_KEY
    if (-not $apiKey) {
        throw "Brak zmiennej GOOGLE_API_KEY w środowisku."
    }

    $systemMessage = ($Messages | Where-Object { $_.role -eq "system" } | Select-Object -First 1).content
    $contents = @($Messages | Where-Object { $_.role -ne "system" } | ForEach-Object {
        @{ role = $_.role; parts = @(@{ text = $_.content }) }
    })

    $body = @{
        contents = $contents
        generationConfig = @{
            maxOutputTokens = $MaxTokens
            temperature = $Temperature
        }
    }

    if ($systemMessage) {
        $body.systemInstruction = @{ parts = @(@{ text = $systemMessage }) }
    }

    $uri = "https://generativelanguage.googleapis.com/v1beta/models/$Model`:generateContent?key=$apiKey"
    $response = Invoke-RestMethod -Uri $uri -Method Post -Body ($body | ConvertTo-Json -Depth 10) `
        -ContentType "application/json"

    $text = $response.candidates[0].content.parts[0].text
    return @{
        content = $text
        usage = @{
            input_tokens = $response.usageMetadata.promptTokenCount
            output_tokens = $response.usageMetadata.candidatesTokenCount
        }
        model = $Model
        stop_reason = $response.candidates[0].finishReason
    }
}

function Invoke-MistralAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:MISTRAL_API_KEY
    if (-not $apiKey) {
        throw "Brak zmiennej MISTRAL_API_KEY w środowisku."
    }

    $body = @{
        model = $Model
        max_tokens = $MaxTokens
        temperature = $Temperature
        messages = @($Messages | ForEach-Object { @{ role = $_.role; content = $_.content } })
    }

    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Content-Type" = "application/json"
    }

    if ($Stream) {
        return Invoke-OpenAICompatibleStream -Uri "https://api.mistral.ai/v1/chat/completions" `
            -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -Model $Model
    }

    $response = Invoke-RestMethod -Uri "https://api.mistral.ai/v1/chat/completions" `
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

function Invoke-GroqAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:GROQ_API_KEY
    if (-not $apiKey) {
        throw "Brak zmiennej GROQ_API_KEY w środowisku."
    }

    $body = @{
        model = $Model
        max_tokens = $MaxTokens
        temperature = $Temperature
        messages = @($Messages | ForEach-Object { @{ role = $_.role; content = $_.content } })
    }

    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Content-Type" = "application/json"
    }

    if ($Stream) {
        return Invoke-OpenAICompatibleStream -Uri "https://api.groq.com/openai/v1/chat/completions" `
            -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -Model $Model
    }

    $response = Invoke-RestMethod -Uri "https://api.groq.com/openai/v1/chat/completions" `
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
        Write-Host "[AI] Ollama nie działa, próba uruchomienia..." -ForegroundColor Yellow

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
        stream = $Stream.IsPresent
    }

    try {
        if ($Stream) {
            $contentBuffer = ""
            Invoke-StreamingRequest -Uri "http://localhost:11434/api/chat" `
                -Headers @{ "Content-Type" = "application/json" } -Body ($body | ConvertTo-Json -Depth 10) -OnData {
                    param($line)
                    try {
                        $json = $line | ConvertFrom-Json
                        if ($json.message -and $json.message.content) {
                            $contentBuffer += $json.message.content
                            Write-Host $json.message.content -NoNewline
                        }
                    } catch { }
                }
            Write-Host ""
            return @{
                content = $contentBuffer
                usage = @{ input_tokens = 0; output_tokens = 0 }
                model = $Model
                stop_reason = "stream"
            }
        }

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

function Get-AIHealth {
    <#
    .SYNOPSIS
        Returns a health dashboard snapshot with status, tokens, and cost.
    #>
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    $state = Get-AIState
    $providers = @()

    foreach ($providerName in $config.providerFallbackOrder) {
        $provider = $config.providers[$providerName]
        $hasKey = -not $provider.apiKeyEnv -or [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)

        $models = @()
        foreach ($modelName in $provider.models.Keys) {
            $usage = $state.usage[$providerName][$modelName]
            $rate = Get-RateLimitStatus -Provider $providerName -Model $modelName
            $models += @{
                name = $modelName
                tier = $provider.models[$modelName].tier
                status = if ($rate.available) { "ok" } else { "limited" }
                tokens = @{
                    percent = $rate.tokensPercent
                    remaining = $rate.tokensRemaining
                }
                requests = @{
                    percent = $rate.requestsPercent
                    remaining = $rate.requestsRemaining
                }
                usage = @{
                    totalRequests = $usage.totalRequests
                    totalTokens = $usage.totalTokens
                    totalCost = [math]::Round($usage.totalCost, 4)
                }
            }
        }

        $providers += @{
            name = $providerName
            enabled = $provider.enabled
            hasKey = $hasKey
            models = $models
        }
    }

    return @{
        timestamp = (Get-Date).ToString("o")
        providers = $providers
    }
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

#region Model Discovery Integration

function Sync-AIModels {
    <#
    .SYNOPSIS
        Synchronize available models from all providers
    .DESCRIPTION
        Fetches current model list from Anthropic, OpenAI, Google, Mistral, Groq, and Ollama APIs
        Updates config with discovered models
    .PARAMETER Force
        Force refresh, bypass cache
    .PARAMETER UpdateConfig
        Write discovered models to ai-config.json
    .PARAMETER Silent
        Suppress output
    #>
    [CmdletBinding()]
    param(
        [switch]$Force,
        [switch]$UpdateConfig,
        [switch]$Silent
    )

    if (-not (Get-Command 'Get-AllAvailableModels' -ErrorAction SilentlyContinue)) {
        Write-Warning "ModelDiscovery module not loaded"
        return $null
    }

    if (-not $Silent) {
        Write-Host "[AI] Synchronizing models from providers..." -ForegroundColor Cyan
    }

    $config = Get-AIConfig
    $script:DiscoveredModels = Get-AllAvailableModels -Force:$Force `
        -Parallel:$config.settings.modelDiscovery.parallel `
        -SkipValidation:$config.settings.modelDiscovery.skipValidation

    if (-not $Silent) {
        foreach ($p in $script:DiscoveredModels.Summary.GetEnumerator()) {
            $icon = if ($p.Value.Success) { "+" } else { "-" }
            $color = if ($p.Value.Success) { "Green" } else { "Yellow" }
            Write-Host "  [$icon] $($p.Key): $($p.Value.ModelCount) models" -ForegroundColor $color
        }
        Write-Host "  Total: $($script:DiscoveredModels.TotalModels) models in $($script:DiscoveredModels.FetchDurationMs)ms" -ForegroundColor Gray
    }

    if ($UpdateConfig) {
        Update-ModelConfig | Out-Null
        if (-not $Silent) {
            Write-Host "[AI] Config updated with discovered models" -ForegroundColor Green
        }
    }

    return $script:DiscoveredModels
}

function Get-DiscoveredModels {
    <#
    .SYNOPSIS
        Get cached discovered models
    .PARAMETER Provider
        Filter by provider
    .PARAMETER Refresh
        Force refresh from APIs
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("anthropic", "openai", "ollama", "all")]
        [string]$Provider = "all",
        [switch]$Refresh
    )

    if ($Refresh -or -not $script:DiscoveredModels) {
        $script:DiscoveredModels = Sync-AIModels -Silent
    }

    if (-not $script:DiscoveredModels) {
        return @()
    }

    $models = $script:DiscoveredModels.Models

    if ($Provider -ne "all") {
        $models = $models | Where-Object { $_.provider -eq $Provider }
    }

    return $models
}

function Get-ModelInfo {
    <#
    .SYNOPSIS
        Get detailed info about a specific model
    .PARAMETER ModelId
        Model ID (e.g., "gpt-4o", "claude-sonnet-4-20250514", "llama3.2:3b")
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ModelId
    )

    $models = Get-DiscoveredModels

    $model = $models | Where-Object { $_.id -eq $ModelId } | Select-Object -First 1

    if (-not $model) {
        # Try partial match
        $model = $models | Where-Object { $_.id -like "*$ModelId*" } | Select-Object -First 1
    }

    return $model
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
    'Get-AIHealth',
    'Reset-AIState',
    'Test-AIProviders',
    'Test-OllamaAvailable',
    'Install-OllamaAuto',
    # Model Discovery
    'Sync-AIModels',
    'Get-DiscoveredModels',
    'Get-ModelInfo'
)

#endregion

# Auto-initialize on module load
Initialize-AIState | Out-Null

# Auto-discover models if API keys are present (background, silent)
if ($env:ANTHROPIC_API_KEY -or $env:OPENAI_API_KEY -or (Test-OllamaAvailable -ErrorAction SilentlyContinue)) {
    try {
        $script:DiscoveredModels = Sync-AIModels -Silent
    } catch {
        # Silently fail - models can be synced manually
    }
}
