#Requires -Version 5.1
<#
.SYNOPSIS
    HYDRA 10.0 - Model Discovery Module
.DESCRIPTION
    Fetches available models from AI providers (Anthropic, OpenAI, Google, Mistral, Groq, Ollama)
    at startup based on API keys
.NOTES
    Author: HYDRA System
    Version: 1.0.0
#>

# Module-level variables
$script:ModelCache = @{}
$script:CacheExpiry = @{}
$script:CacheDurationMinutes = 60

#region Anthropic Models

function Get-AnthropicModels {
    <#
    .SYNOPSIS
        Fetches available models from Anthropic API
    .PARAMETER ApiKey
        Anthropic API key (defaults to env var)
    .PARAMETER Force
        Bypass cache and fetch fresh data
    #>
    [CmdletBinding()]
    param(
        [string]$ApiKey = $env:ANTHROPIC_API_KEY,
        [switch]$Force,
        [switch]$SkipValidation
    )

    if (-not $ApiKey) {
        Write-Verbose "No Anthropic API key found"
        return @{
            Success = $false
            Provider = "anthropic"
            Error = "API key not configured"
            Models = @()
        }
    }

    # Check cache
    if (-not $Force -and $script:ModelCache['anthropic'] -and $script:CacheExpiry['anthropic'] -gt (Get-Date)) {
        Write-Verbose "Returning cached Anthropic models"
        return $script:ModelCache['anthropic']
    }

    try {
        Write-Verbose "Fetching Anthropic models..."

        # Anthropic doesn't have a public /models endpoint yet
        # We'll use a known models list and verify with a test request
        $knownModels = @(
            @{
                id = "claude-opus-4-20250514"
                name = "Claude Opus 4"
                tier = "flagship"
                contextWindow = 200000
                maxOutput = 32000
                inputCost = 15.00
                outputCost = 75.00
                capabilities = @("vision", "code", "analysis", "creative", "extended_thinking")
            },
            @{
                id = "claude-sonnet-4-20250514"
                name = "Claude Sonnet 4"
                tier = "pro"
                contextWindow = 200000
                maxOutput = 16000
                inputCost = 3.00
                outputCost = 15.00
                capabilities = @("vision", "code", "analysis", "creative")
            },
            @{
                id = "claude-3-5-sonnet-20241022"
                name = "Claude 3.5 Sonnet"
                tier = "standard"
                contextWindow = 200000
                maxOutput = 8192
                inputCost = 3.00
                outputCost = 15.00
                capabilities = @("vision", "code", "analysis")
            },
            @{
                id = "claude-3-5-haiku-20241022"
                name = "Claude 3.5 Haiku"
                tier = "lite"
                contextWindow = 200000
                maxOutput = 8192
                inputCost = 0.80
                outputCost = 4.00
                capabilities = @("code", "analysis")
            }
        )

        if (-not $SkipValidation) {
            # Verify API key works with a minimal request
            $headers = @{
                "x-api-key" = $ApiKey
                "anthropic-version" = "2023-06-01"
                "Content-Type" = "application/json"
            }

            $testBody = @{
                model = "claude-3-5-haiku-20241022"
                max_tokens = 1
                messages = @(@{ role = "user"; content = "Hi" })
            } | ConvertTo-Json

            $response = Invoke-RestMethod -Uri "https://api.anthropic.com/v1/messages" `
                -Method Post -Headers $headers -Body $testBody -ErrorAction Stop
        }

        # API key is valid
        $result = @{
            Success = $true
            Provider = "anthropic"
            Error = $null
            Models = $knownModels
            FetchedAt = (Get-Date).ToString('o')
            ApiKeyValid = $true
        }

        # Cache result
        $script:ModelCache['anthropic'] = $result
        $script:CacheExpiry['anthropic'] = (Get-Date).AddMinutes($script:CacheDurationMinutes)

        return $result

    } catch {
        $errorMsg = $_.Exception.Message

        # Check if it's a rate limit or auth error
        if ($errorMsg -match "401|unauthorized|invalid.*key") {
            return @{
                Success = $false
                Provider = "anthropic"
                Error = "Invalid API key"
                Models = @()
                ApiKeyValid = $false
            }
        }

        # Rate limit - key is valid but we hit limits
        if ($errorMsg -match "429|rate.*limit") {
            return @{
                Success = $true
                Provider = "anthropic"
                Error = "Rate limited (key is valid)"
                Models = $knownModels
                ApiKeyValid = $true
            }
        }

        return @{
            Success = $false
            Provider = "anthropic"
            Error = $errorMsg
            Models = @()
        }
    }
}

#endregion

#region OpenAI Models

function Get-OpenAIModels {
    <#
    .SYNOPSIS
        Fetches available models from OpenAI API
    .PARAMETER ApiKey
        OpenAI API key (defaults to env var)
    .PARAMETER Force
        Bypass cache and fetch fresh data
    #>
    [CmdletBinding()]
    param(
        [string]$ApiKey = $env:OPENAI_API_KEY,
        [switch]$Force
    )

    if (-not $ApiKey) {
        Write-Verbose "No OpenAI API key found"
        return @{
            Success = $false
            Provider = "openai"
            Error = "API key not configured"
            Models = @()
        }
    }

    # Check cache
    if (-not $Force -and $script:ModelCache['openai'] -and $script:CacheExpiry['openai'] -gt (Get-Date)) {
        Write-Verbose "Returning cached OpenAI models"
        return $script:ModelCache['openai']
    }

    try {
        Write-Verbose "Fetching OpenAI models..."

        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type" = "application/json"
        }

        $response = Invoke-RestMethod -Uri "https://api.openai.com/v1/models" `
            -Method Get -Headers $headers -ErrorAction Stop

        # Filter and enrich relevant models
        $relevantModels = $response.data | Where-Object {
            $_.id -match "^(gpt-4|gpt-3\.5|o1|o3)" -and $_.id -notmatch "instruct|vision|realtime|audio"
        } | ForEach-Object {
            $modelId = $_.id

            # Determine tier and pricing
            $tier = "standard"
            $inputCost = 0.50
            $outputCost = 1.50
            $contextWindow = 128000
            $maxOutput = 16384
            $capabilities = @("code", "analysis")

            switch -Regex ($modelId) {
                "gpt-4o-mini" {
                    $tier = "lite"
                    $inputCost = 0.15
                    $outputCost = 0.60
                }
                "gpt-4o(?!-mini)" {
                    $tier = "pro"
                    $inputCost = 2.50
                    $outputCost = 10.00
                    $capabilities = @("vision", "code", "analysis")
                }
                "gpt-4-turbo" {
                    $tier = "pro"
                    $inputCost = 10.00
                    $outputCost = 30.00
                    $capabilities = @("vision", "code", "analysis")
                }
                "o1-preview" {
                    $tier = "flagship"
                    $inputCost = 15.00
                    $outputCost = 60.00
                    $contextWindow = 128000
                    $capabilities = @("code", "analysis", "reasoning")
                }
                "o1-mini" {
                    $tier = "standard"
                    $inputCost = 3.00
                    $outputCost = 12.00
                    $capabilities = @("code", "analysis", "reasoning")
                }
                "o3-mini" {
                    $tier = "standard"
                    $inputCost = 1.10
                    $outputCost = 4.40
                    $capabilities = @("code", "analysis", "reasoning")
                }
            }

            @{
                id = $modelId
                name = $modelId
                tier = $tier
                contextWindow = $contextWindow
                maxOutput = $maxOutput
                inputCost = $inputCost
                outputCost = $outputCost
                capabilities = $capabilities
                created = $_.created
                ownedBy = $_.owned_by
            }
        } | Sort-Object {
            switch ($_.tier) { "flagship" { 0 } "pro" { 1 } "standard" { 2 } "lite" { 3 } default { 4 } }
        }

        $result = @{
            Success = $true
            Provider = "openai"
            Error = $null
            Models = @($relevantModels)
            FetchedAt = (Get-Date).ToString('o')
            TotalModelsInAPI = $response.data.Count
            ApiKeyValid = $true
        }

        # Cache result
        $script:ModelCache['openai'] = $result
        $script:CacheExpiry['openai'] = (Get-Date).AddMinutes($script:CacheDurationMinutes)

        return $result

    } catch {
        $errorMsg = $_.Exception.Message

        if ($errorMsg -match "401|unauthorized|invalid.*key") {
            return @{
                Success = $false
                Provider = "openai"
                Error = "Invalid API key"
                Models = @()
                ApiKeyValid = $false
            }
        }

        return @{
            Success = $false
            Provider = "openai"
            Error = $errorMsg
            Models = @()
        }
    }
}

#region Google Models

function Get-GoogleModels {
    <#
    .SYNOPSIS
        Fetches available models from Google Generative Language API
    .PARAMETER ApiKey
        Google API key (defaults to env var)
    .PARAMETER Force
        Bypass cache and fetch fresh data
    #>
    [CmdletBinding()]
    param(
        [string]$ApiKey = $env:GOOGLE_API_KEY,
        [switch]$Force
    )

    if (-not $ApiKey) {
        Write-Verbose "No Google API key found"
        return @{
            Success = $false
            Provider = "google"
            Error = "API key not configured"
            Models = @()
        }
    }

    if (-not $Force -and $script:ModelCache['google'] -and $script:CacheExpiry['google'] -gt (Get-Date)) {
        Write-Verbose "Returning cached Google models"
        return $script:ModelCache['google']
    }

    try {
        $response = Invoke-RestMethod -Uri "https://generativelanguage.googleapis.com/v1beta/models?key=$ApiKey" `
            -Method Get -ErrorAction Stop

        $models = $response.models | Where-Object { $_.name -match "gemini" } | ForEach-Object {
            @{
                id = $_.name -replace "^models/", ""
                name = $_.displayName
                tier = if ($_.name -match "pro") { "pro" } else { "standard" }
                contextWindow = 128000
                maxOutput = 8192
                inputCost = 0.0
                outputCost = 0.0
                capabilities = @("vision", "code", "analysis")
            }
        }

        $result = @{
            Success = $true
            Provider = "google"
            Error = $null
            Models = @($models)
            FetchedAt = (Get-Date).ToString('o')
        }

        $script:ModelCache['google'] = $result
        $script:CacheExpiry['google'] = (Get-Date).AddMinutes($script:CacheDurationMinutes)

        return $result
    } catch {
        return @{
            Success = $false
            Provider = "google"
            Error = $_.Exception.Message
            Models = @()
        }
    }
}

#endregion

#region Mistral Models

function Get-MistralModels {
    <#
    .SYNOPSIS
        Fetches available models from Mistral API
    #>
    [CmdletBinding()]
    param(
        [string]$ApiKey = $env:MISTRAL_API_KEY,
        [switch]$Force
    )

    if (-not $ApiKey) {
        Write-Verbose "No Mistral API key found"
        return @{
            Success = $false
            Provider = "mistral"
            Error = "API key not configured"
            Models = @()
        }
    }

    if (-not $Force -and $script:ModelCache['mistral'] -and $script:CacheExpiry['mistral'] -gt (Get-Date)) {
        Write-Verbose "Returning cached Mistral models"
        return $script:ModelCache['mistral']
    }

    try {
        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type" = "application/json"
        }

        $response = Invoke-RestMethod -Uri "https://api.mistral.ai/v1/models" -Method Get -Headers $headers -ErrorAction Stop

        $models = $response.data | ForEach-Object {
            @{
                id = $_.id
                name = $_.id
                tier = if ($_.id -match "large") { "pro" } else { "standard" }
                contextWindow = 128000
                maxOutput = 8192
                inputCost = 0.0
                outputCost = 0.0
                capabilities = @("code", "analysis")
            }
        }

        $result = @{
            Success = $true
            Provider = "mistral"
            Error = $null
            Models = @($models)
            FetchedAt = (Get-Date).ToString('o')
        }

        $script:ModelCache['mistral'] = $result
        $script:CacheExpiry['mistral'] = (Get-Date).AddMinutes($script:CacheDurationMinutes)

        return $result
    } catch {
        return @{
            Success = $false
            Provider = "mistral"
            Error = $_.Exception.Message
            Models = @()
        }
    }
}

#endregion

#region Groq Models

function Get-GroqModels {
    <#
    .SYNOPSIS
        Fetches available models from Groq API
    #>
    [CmdletBinding()]
    param(
        [string]$ApiKey = $env:GROQ_API_KEY,
        [switch]$Force
    )

    if (-not $ApiKey) {
        Write-Verbose "No Groq API key found"
        return @{
            Success = $false
            Provider = "groq"
            Error = "API key not configured"
            Models = @()
        }
    }

    if (-not $Force -and $script:ModelCache['groq'] -and $script:CacheExpiry['groq'] -gt (Get-Date)) {
        Write-Verbose "Returning cached Groq models"
        return $script:ModelCache['groq']
    }

    try {
        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type" = "application/json"
        }

        $response = Invoke-RestMethod -Uri "https://api.groq.com/openai/v1/models" -Method Get -Headers $headers -ErrorAction Stop

        $models = $response.data | ForEach-Object {
            @{
                id = $_.id
                name = $_.id
                tier = if ($_.id -match "70b") { "pro" } else { "standard" }
                contextWindow = 128000
                maxOutput = 8192
                inputCost = 0.0
                outputCost = 0.0
                capabilities = @("code", "analysis")
            }
        }

        $result = @{
            Success = $true
            Provider = "groq"
            Error = $null
            Models = @($models)
            FetchedAt = (Get-Date).ToString('o')
        }

        $script:ModelCache['groq'] = $result
        $script:CacheExpiry['groq'] = (Get-Date).AddMinutes($script:CacheDurationMinutes)

        return $result
    } catch {
        return @{
            Success = $false
            Provider = "groq"
            Error = $_.Exception.Message
            Models = @()
        }
    }
}

#endregion
#endregion

#region Ollama Models

function Get-OllamaModels {
    <#
    .SYNOPSIS
        Fetches available models from local Ollama instance
    .PARAMETER BaseUrl
        Ollama API base URL (default: http://localhost:11434)
    .PARAMETER Force
        Bypass cache and fetch fresh data
    #>
    [CmdletBinding()]
    param(
        [string]$BaseUrl = "http://localhost:11434",
        [switch]$Force
    )

    # Check cache
    if (-not $Force -and $script:ModelCache['ollama'] -and $script:CacheExpiry['ollama'] -gt (Get-Date)) {
        Write-Verbose "Returning cached Ollama models"
        return $script:ModelCache['ollama']
    }

    try {
        Write-Verbose "Fetching Ollama models from $BaseUrl..."

        $response = Invoke-RestMethod -Uri "$BaseUrl/api/tags" -Method Get -TimeoutSec 5 -ErrorAction Stop

        $models = $response.models | ForEach-Object {
            $modelName = $_.name
            $size = $_.size
            $sizeGB = [math]::Round($size / 1GB, 2)

            # Determine tier based on parameter size
            $paramSize = $_.details.parameter_size
            $tier = "standard"
            if ($paramSize -match "(\d+)") {
                $params = [int]$Matches[1]
                if ($params -le 3) { $tier = "lite" }
                elseif ($params -ge 30) { $tier = "pro" }
            }

            # Determine capabilities
            $capabilities = @("code", "analysis")
            if ($modelName -match "coder|code") {
                $capabilities = @("code")
            }
            if ($modelName -match "vision|llava") {
                $capabilities += "vision"
            }

            @{
                id = $modelName
                name = $modelName
                tier = $tier
                contextWindow = 128000  # Default, varies by model
                maxOutput = 4096
                inputCost = 0.00
                outputCost = 0.00
                sizeBytes = $size
                sizeGB = $sizeGB
                parameterSize = $paramSize
                quantization = $_.details.quantization_level
                family = $_.details.family
                capabilities = $capabilities
                modifiedAt = $_.modified_at
            }
        } | Sort-Object { $_.sizeBytes } -Descending

        $totalSize = 0
        if ($models -and $models.Count -gt 0) {
            try {
                $withSize = @($models | Where-Object { $null -ne $_.sizeBytes -and $_.sizeBytes -gt 0 })
                if ($withSize.Count -gt 0) {
                    $sizeSum = ($withSize | Measure-Object -Property sizeBytes -Sum -ErrorAction SilentlyContinue).Sum
                    if ($sizeSum) { $totalSize = [math]::Round($sizeSum / 1GB, 2) }
                }
            } catch { $totalSize = 0 }
        }

        $result = @{
            Success = $true
            Provider = "ollama"
            Error = $null
            Models = @($models)
            FetchedAt = (Get-Date).ToString('o')
            BaseUrl = $BaseUrl
            TotalModels = $models.Count
            TotalSizeGB = $totalSize
        }

        # Cache result
        $script:ModelCache['ollama'] = $result
        $script:CacheExpiry['ollama'] = (Get-Date).AddMinutes($script:CacheDurationMinutes)

        return $result

    } catch {
        $errorMsg = $_.Exception.Message

        if ($errorMsg -match "Unable to connect|Connection refused|timeout") {
            return @{
                Success = $false
                Provider = "ollama"
                Error = "Ollama not running. Start with: ollama serve"
                Models = @()
                BaseUrl = $BaseUrl
            }
        }

        return @{
            Success = $false
            Provider = "ollama"
            Error = $errorMsg
            Models = @()
        }
    }
}

#endregion

#region Discovery Functions

function Get-AllAvailableModels {
    <#
    .SYNOPSIS
        Fetches models from all configured providers
    .PARAMETER Force
        Bypass cache for all providers
    .PARAMETER Parallel
        Fetch from all providers in parallel (requires PS 7+)
    #>
    [CmdletBinding()]
    param(
        [switch]$Force,
        [switch]$Parallel,
        [switch]$SkipValidation
    )

    $startTime = Get-Date

    if ($Parallel -and $PSVersionTable.PSVersion.Major -ge 7) {
        # Parallel fetch (PS 7+)
        $results = @("anthropic", "openai", "google", "mistral", "groq", "ollama") | ForEach-Object -Parallel {
            switch ($_) {
                "anthropic" { Get-AnthropicModels -Force:$using:Force -SkipValidation:$using:SkipValidation }
                "openai" { Get-OpenAIModels -Force:$using:Force }
                "google" { Get-GoogleModels -Force:$using:Force }
                "mistral" { Get-MistralModels -Force:$using:Force }
                "groq" { Get-GroqModels -Force:$using:Force }
                "ollama" { Get-OllamaModels -Force:$using:Force }
            }
        } -ThrottleLimit 3
    } else {
        # Sequential fetch
        $results = @(
            Get-OllamaModels -Force:$Force      # Local first (fastest)
            Get-OpenAIModels -Force:$Force
            Get-GoogleModels -Force:$Force
            Get-MistralModels -Force:$Force
            Get-GroqModels -Force:$Force
            Get-AnthropicModels -Force:$Force -SkipValidation:$SkipValidation
        )
    }

    $duration = (Get-Date) - $startTime

    # Aggregate results
    $allModels = @()
    $summary = @{}

    foreach ($r in $results) {
        if ($r.Success) {
            $allModels += $r.Models | ForEach-Object {
                $_ | Add-Member -NotePropertyName "provider" -NotePropertyValue $r.Provider -PassThru -Force
            }
        }
        $summary[$r.Provider] = @{
            Success = $r.Success
            ModelCount = $r.Models.Count
            Error = $r.Error
        }
    }

    return @{
        Models = $allModels
        Summary = $summary
        TotalModels = $allModels.Count
        FetchDurationMs = [int]$duration.TotalMilliseconds
        FetchedAt = (Get-Date).ToString('o')
    }
}

function Update-ModelConfig {
    <#
    .SYNOPSIS
        Updates ai-config.json with discovered models
    .PARAMETER ConfigPath
        Path to ai-config.json
    .PARAMETER BackupOriginal
        Create backup before updating
    #>
    [CmdletBinding()]
    param(
        [string]$ConfigPath = (Join-Path $PSScriptRoot "..\ai-config.json"),
        [switch]$BackupOriginal
    )

    if (-not (Test-Path $ConfigPath)) {
        Write-Error "Config file not found: $ConfigPath"
        return
    }

    # Fetch current models
    Write-Host "[ModelDiscovery] Fetching models from all providers..." -ForegroundColor Cyan
    $discovery = Get-AllAvailableModels -Force

    # Backup if requested
    if ($BackupOriginal) {
        $backupPath = $ConfigPath -replace '\.json$', ".backup.$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
        Copy-Item $ConfigPath $backupPath
        Write-Host "[ModelDiscovery] Backup created: $backupPath" -ForegroundColor Gray
    }

    # Load current config
    $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

    foreach ($providerName in $discovery.Summary.Keys) {
        if (-not $discovery.Summary[$providerName].Success) { continue }
        $providerModels = @{}
        $discovery.Models | Where-Object { $_.provider -eq $providerName } | ForEach-Object {
            $providerModels[$_.id] = @{
                tier = $_.tier
                contextWindow = $_.contextWindow
                maxOutput = $_.maxOutput
                inputCost = if ($_.inputCost) { $_.inputCost } else { 0.0 }
                outputCost = if ($_.outputCost) { $_.outputCost } else { 0.0 }
                tokensPerMinute = 999999
                requestsPerMinute = 999999
                capabilities = $_.capabilities
                sizeGB = $_.sizeGB
                parameterSize = $_.parameterSize
            }
        }

        if ($config.providers.$providerName) {
            $config.providers.$providerName.models = $providerModels
            $config.fallbackChain.$providerName = @($providerModels.Keys)
        }
    }

    # Add discovery metadata
    if (-not $config.PSObject.Properties['discovery']) {
        $config | Add-Member -NotePropertyName 'discovery' -NotePropertyValue @{} -Force
    }
    $config.discovery = @{
        lastFetch = (Get-Date).ToString('o')
        summary = $discovery.Summary
        totalModels = $discovery.TotalModels
        fetchDurationMs = $discovery.FetchDurationMs
    }

    # Save updated config
    $config | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8

    Write-Host "[ModelDiscovery] Config updated with $($discovery.TotalModels) models" -ForegroundColor Green

    return $discovery
}

function Show-AvailableModels {
    <#
    .SYNOPSIS
        Displays available models in a formatted table
    .PARAMETER Provider
        Filter by provider (anthropic, openai, google, mistral, groq, ollama)
    .PARAMETER Tier
        Filter by tier (flagship, pro, standard, lite)
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("anthropic", "openai", "google", "mistral", "groq", "ollama", "all")]
        [string]$Provider = "all",
        [ValidateSet("flagship", "pro", "standard", "lite", "all")]
        [string]$Tier = "all"
    )

    $discovery = Get-AllAvailableModels

    Write-Host "`n=== Available AI Models ===" -ForegroundColor Cyan
    Write-Host "Fetched in $($discovery.FetchDurationMs)ms`n" -ForegroundColor Gray

    # Summary by provider
    foreach ($p in $discovery.Summary.GetEnumerator()) {
        $status = if ($p.Value.Success) { "[OK]" } else { "[FAIL]" }
        $color = if ($p.Value.Success) { "Green" } else { "Red" }
        $count = $p.Value.ModelCount
        $error = if ($p.Value.Error) { " - $($p.Value.Error)" } else { "" }
        Write-Host "$status $($p.Key): $count models$error" -ForegroundColor $color
    }

    Write-Host ""

    # Filter models
    $models = $discovery.Models
    if ($Provider -ne "all") {
        $models = $models | Where-Object { $_.provider -eq $Provider }
    }
    if ($Tier -ne "all") {
        $models = $models | Where-Object { $_.tier -eq $Tier }
    }

    # Display table
    $models | Sort-Object provider, {
        switch ($_.tier) { "flagship" { 0 } "pro" { 1 } "standard" { 2 } "lite" { 3 } default { 4 } }
    } | Format-Table -AutoSize @(
        @{ Label = "Provider"; Expression = { $_.provider } }
        @{ Label = "Model"; Expression = { $_.id } }
        @{ Label = "Tier"; Expression = { $_.tier } }
        @{ Label = "Context"; Expression = { "{0:N0}K" -f ($_.contextWindow / 1000) } }
        @{ Label = "In $/1M"; Expression = { if ($_.inputCost -eq 0) { "FREE" } else { "$" + $_.inputCost } } }
        @{ Label = "Out $/1M"; Expression = { if ($_.outputCost -eq 0) { "FREE" } else { "$" + $_.outputCost } } }
        @{ Label = "Size"; Expression = { if ($_.sizeGB) { "$($_.sizeGB) GB" } else { "-" } } }
    )

    return $discovery
}

function Initialize-ModelDiscovery {
    <#
    .SYNOPSIS
        Initialize model discovery on module load
    .DESCRIPTION
        Called automatically when AI Handler starts
    #>
    [CmdletBinding()]
    param(
        [switch]$UpdateConfig,
        [switch]$Silent,
        [switch]$SkipValidation,
        [switch]$Parallel
    )

    if (-not $Silent) {
        Write-Host "[ModelDiscovery] Discovering available models..." -ForegroundColor Cyan
    }

    $discovery = Get-AllAvailableModels -SkipValidation:$SkipValidation -Parallel:$Parallel

    if (-not $Silent) {
        foreach ($p in $discovery.Summary.GetEnumerator()) {
            $status = if ($p.Value.Success) { "+" } else { "-" }
            $color = if ($p.Value.Success) { "Green" } else { "Yellow" }
            Write-Host "  [$status] $($p.Key): $($p.Value.ModelCount) models" -ForegroundColor $color
        }
    }

    if ($UpdateConfig) {
        Update-ModelConfig | Out-Null
    }

    return $discovery
}

#endregion

#region Exports

Export-ModuleMember -Function @(
    'Get-AnthropicModels',
    'Get-OpenAIModels',
    'Get-GoogleModels',
    'Get-MistralModels',
    'Get-GroqModels',
    'Get-OllamaModels',
    'Get-AllAvailableModels',
    'Update-ModelConfig',
    'Show-AvailableModels',
    'Initialize-ModelDiscovery'
)

#endregion
