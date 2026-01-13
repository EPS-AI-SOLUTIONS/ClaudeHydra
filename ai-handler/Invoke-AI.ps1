<#
.SYNOPSIS
    Quick AI invocation with automatic fallback and optimization
.DESCRIPTION
    Simple wrapper for the AI Model Handler that provides easy access
    to AI capabilities with automatic model selection and fallback.
.EXAMPLE
    .\Invoke-AI.ps1 -Prompt "Explain quantum computing"
.EXAMPLE
    .\Invoke-AI.ps1 -Prompt "Write a Python function" -Task code -PreferCheapest
.EXAMPLE
    .\Invoke-AI.ps1 -Status
.EXAMPLE
    .\Invoke-AI.ps1 -Test
#>

[CmdletBinding(DefaultParameterSetName = 'Query')]
param(
    [Parameter(ParameterSetName = 'Query', Position = 0)]
    [string]$Prompt,

    [Parameter(ParameterSetName = 'Query')]
    [ValidateSet("simple", "complex", "creative", "code", "vision", "analysis")]
    [string]$Task = "simple",

    [Parameter(ParameterSetName = 'Query')]
    [string]$SystemPrompt,

    [Parameter(ParameterSetName = 'Query')]
    [string]$Provider,

    [Parameter(ParameterSetName = 'Query')]
    [string]$Model,

    [Parameter(ParameterSetName = 'Query')]
    [int]$MaxTokens = 4096,

    [Parameter(ParameterSetName = 'Query')]
    [float]$Temperature = 0.7,

    [Parameter(ParameterSetName = 'Query')]
    [switch]$PreferCheapest,

    [Parameter(ParameterSetName = 'Query')]
    [switch]$NoFallback,

    [Parameter(ParameterSetName = 'Query')]
    [switch]$Stream,

    [Parameter(ParameterSetName = 'Status')]
    [switch]$Status,

    [Parameter(ParameterSetName = 'Test')]
    [switch]$Test,

    [Parameter(ParameterSetName = 'Reset')]
    [switch]$Reset
)

$ErrorActionPreference = "Stop"
$ModulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"

# Import module
Import-Module $ModulePath -Force

# Handle different modes
switch ($PSCmdlet.ParameterSetName) {
    'Status' {
        Get-AIStatus
        return
    }

    'Test' {
        $results = Test-AIProviders
        Write-Host "`n=== Summary ===" -ForegroundColor Cyan
        $ok = ($results | Where-Object { $_.status -eq "ok" }).Count
        $total = $results.Count
        Write-Host "Providers available: $ok / $total" -ForegroundColor $(if ($ok -gt 0) { "Green" } else { "Red" })
        return
    }

    'Reset' {
        Reset-AIState -Force
        return
    }

    'Query' {
        if (-not $Prompt) {
            Write-Host "Usage: .\Invoke-AI.ps1 -Prompt 'Your question here'" -ForegroundColor Yellow
            Write-Host "`nOptions:" -ForegroundColor Cyan
            Write-Host "  -Task          : simple, complex, creative, code, vision, analysis"
            Write-Host "  -SystemPrompt  : Custom system prompt"
            Write-Host "  -Provider      : Force specific provider (anthropic, openai, google, mistral, groq, ollama)"
            Write-Host "  -Model         : Force specific model"
            Write-Host "  -PreferCheapest: Use cheapest suitable model"
            Write-Host "  -NoFallback    : Disable automatic fallback"
            Write-Host "  -Status        : Show current status"
            Write-Host "  -Test          : Test all providers"
            Write-Host "  -Reset         : Reset usage data"
            return
        }

        # Build messages
        $messages = @()

        if ($SystemPrompt) {
            $messages += @{ role = "system"; content = $SystemPrompt }
        }

        $messages += @{ role = "user"; content = $Prompt }

        # Select model if not specified
        if (-not $Model) {
            $optimal = Get-OptimalModel -Task $Task -EstimatedTokens $Prompt.Length -PreferCheapest:$PreferCheapest
            if ($optimal) {
                $Provider = $optimal.provider
                $Model = $optimal.model
            }
        }

        $config = Get-AIConfig
        $streamEnabled = $Stream -or ($config.settings.streamResponses -eq $true)

        # Make request
        try {
            $response = Invoke-AIRequest -Messages $messages `
                -Provider $Provider -Model $Model `
                -MaxTokens $MaxTokens -Temperature $Temperature `
                -AutoFallback:(-not $NoFallback) -Stream:$streamEnabled

            # Output response
            Write-Host "`n--- Response ---" -ForegroundColor Green
            if (-not $streamEnabled) {
                Write-Host $response.content
            }

            # Show metadata
            Write-Host "`n--- Metadata ---" -ForegroundColor Gray
            Write-Host "Provider: $($response._meta.provider)" -ForegroundColor Gray
            Write-Host "Model: $($response._meta.model)" -ForegroundColor Gray
            Write-Host "Tokens: $($response.usage.input_tokens) in / $($response.usage.output_tokens) out" -ForegroundColor Gray

        } catch {
            Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }
}
