#Requires -Version 5.1
<#
.SYNOPSIS
    Dynamic Load Balancing Module - CPU-Aware Task Distribution
.DESCRIPTION
    Implements intelligent load balancing that monitors system resources
    and automatically distributes AI tasks between local (Ollama) and
    cloud providers (OpenAI, Anthropic) based on CPU utilization.

    Key Features:
    - Real-time CPU monitoring
    - Automatic failover to cloud when local resources are stressed
    - Smart batch splitting for optimal performance
    - Memory and GPU monitoring (when available)
.VERSION
    1.0.0
.AUTHOR
    HYDRA System
#>

$script:ModulePath = Split-Path -Parent $PSScriptRoot

# Load balancing thresholds
$script:Config = @{
    CpuThresholdHigh = 90      # Switch to cloud above this
    CpuThresholdMedium = 70    # Reduce local concurrency above this
    CpuThresholdLow = 50       # Full local capacity below this
    MemoryThresholdPercent = 85 # Switch to cloud if memory > 85%
    CheckIntervalMs = 1000      # How often to check resources
    CloudFallbackProvider = "openai"
    CloudFallbackModel = "gpt-4o-mini"
    LocalBatchSize = 4          # Max concurrent local requests
    CloudBatchSize = 10         # Max concurrent cloud requests
}

#region System Monitoring

function Get-SystemLoad {
    <#
    .SYNOPSIS
        Get current system load metrics
    .RETURNS
        Hashtable with CPU, Memory, and recommendation
    #>
    [CmdletBinding()]
    param()

    $metrics = @{
        Timestamp = Get-Date
        CpuPercent = 0
        MemoryPercent = 0
        MemoryAvailableGB = 0
        Recommendation = "local"
        Details = @{}
    }

    try {
        # CPU - using WMI for compatibility
        $cpu = Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average
        $metrics.CpuPercent = [math]::Round($cpu.Average, 1)

        # Alternative: Performance Counter (more accurate but slower)
        # $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
        # $metrics.CpuPercent = [math]::Round($cpu, 1)

    } catch {
        # Fallback: estimate from process
        $metrics.CpuPercent = 50  # Default assumption
        $metrics.Details.CpuError = $_.Exception.Message
    }

    try {
        # Memory
        $os = Get-WmiObject Win32_OperatingSystem
        $totalMemory = $os.TotalVisibleMemorySize / 1MB
        $freeMemory = $os.FreePhysicalMemory / 1MB
        $usedMemory = $totalMemory - $freeMemory

        $metrics.MemoryPercent = [math]::Round(($usedMemory / $totalMemory) * 100, 1)
        $metrics.MemoryAvailableGB = [math]::Round($freeMemory, 2)
        $metrics.Details.TotalMemoryGB = [math]::Round($totalMemory, 2)

    } catch {
        $metrics.MemoryPercent = 50
        $metrics.Details.MemoryError = $_.Exception.Message
    }

    # Determine recommendation
    if ($metrics.CpuPercent -gt $script:Config.CpuThresholdHigh -or
        $metrics.MemoryPercent -gt $script:Config.MemoryThresholdPercent) {
        $metrics.Recommendation = "cloud"
    } elseif ($metrics.CpuPercent -gt $script:Config.CpuThresholdMedium) {
        $metrics.Recommendation = "hybrid"
    } else {
        $metrics.Recommendation = "local"
    }

    return $metrics
}

function Get-CpuLoad {
    <#
    .SYNOPSIS
        Quick CPU load check (lightweight)
    #>
    [CmdletBinding()]
    param()

    try {
        $cpu = Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average
        return [math]::Round($cpu.Average, 1)
    } catch {
        return 50  # Default
    }
}

function Watch-SystemLoad {
    <#
    .SYNOPSIS
        Continuous system load monitoring (background)
    .PARAMETER DurationSeconds
        How long to monitor
    .PARAMETER IntervalMs
        Check interval in milliseconds
    #>
    [CmdletBinding()]
    param(
        [int]$DurationSeconds = 60,
        [int]$IntervalMs = 1000
    )

    $endTime = (Get-Date).AddSeconds($DurationSeconds)
    $samples = @()

    Write-Host "[LoadBalancer] Monitoring system load for ${DurationSeconds}s..." -ForegroundColor Cyan

    while ((Get-Date) -lt $endTime) {
        $load = Get-SystemLoad
        $samples += $load

        $cpuBar = Get-ProgressBar -Percent $load.CpuPercent -Width 20
        $memBar = Get-ProgressBar -Percent $load.MemoryPercent -Width 20

        Write-Host "`r  CPU: $cpuBar $($load.CpuPercent)%  |  MEM: $memBar $($load.MemoryPercent)%  |  Rec: $($load.Recommendation)     " -NoNewline

        Start-Sleep -Milliseconds $IntervalMs
    }

    Write-Host ""

    # Summary
    $avgCpu = ($samples | Measure-Object -Property CpuPercent -Average).Average
    $avgMem = ($samples | Measure-Object -Property MemoryPercent -Average).Average
    $maxCpu = ($samples | Measure-Object -Property CpuPercent -Maximum).Maximum

    return @{
        Samples = $samples
        AverageCpu = [math]::Round($avgCpu, 1)
        AverageMemory = [math]::Round($avgMem, 1)
        MaxCpu = [math]::Round($maxCpu, 1)
        Duration = $DurationSeconds
    }
}

function Get-ProgressBar {
    param([float]$Percent, [int]$Width = 20)

    $filled = [math]::Round(($Percent / 100) * $Width)
    $empty = $Width - $filled

    $bar = "[" + ("█" * $filled) + ("░" * $empty) + "]"

    $color = if ($Percent -gt 90) { "Red" }
             elseif ($Percent -gt 70) { "Yellow" }
             else { "Green" }

    return $bar
}

#endregion

#region Load-Balanced Provider Selection

function Get-LoadBalancedProvider {
    <#
    .SYNOPSIS
        Get optimal provider based on current system load
    .DESCRIPTION
        Checks CPU and memory utilization and returns the best
        provider/model combination for the current conditions.
    .PARAMETER Task
        Type of task (simple, complex, code, etc.)
    .PARAMETER ForceLocal
        Force local execution regardless of load
    .PARAMETER ForceCloud
        Force cloud execution regardless of load
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("simple", "complex", "code", "analysis", "batch")]
        [string]$Task = "simple",

        [switch]$ForceLocal,
        [switch]$ForceCloud
    )

    # Import main module if needed
    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    # Force overrides
    if ($ForceLocal) {
        Write-Host "[LoadBalancer] Forced local execution" -ForegroundColor Gray
        return @{
            Provider = "ollama"
            Model = "llama3.2:3b"
            Reason = "forced_local"
            Load = $null
        }
    }

    if ($ForceCloud) {
        Write-Host "[LoadBalancer] Forced cloud execution" -ForegroundColor Gray
        return @{
            Provider = $script:Config.CloudFallbackProvider
            Model = $script:Config.CloudFallbackModel
            Reason = "forced_cloud"
            Load = $null
        }
    }

    # Check system load
    $load = Get-SystemLoad

    Write-Host "[LoadBalancer] CPU: $($load.CpuPercent)% | Memory: $($load.MemoryPercent)% | " -NoNewline -ForegroundColor Gray

    switch ($load.Recommendation) {
        "cloud" {
            Write-Host "→ Cloud" -ForegroundColor Yellow

            # Check if cloud API keys are available
            $hasOpenAI = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY")
            $hasAnthropic = [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY")

            if ($hasOpenAI) {
                return @{
                    Provider = "openai"
                    Model = "gpt-4o-mini"
                    Reason = "high_load_cloud_fallback"
                    Load = $load
                    Message = "High system load ($($load.CpuPercent)% CPU). Routing to cloud."
                }
            } elseif ($hasAnthropic) {
                return @{
                    Provider = "anthropic"
                    Model = "claude-3-5-haiku-20241022"
                    Reason = "high_load_cloud_fallback"
                    Load = $load
                    Message = "High system load ($($load.CpuPercent)% CPU). Routing to cloud."
                }
            } else {
                Write-Warning "[LoadBalancer] No cloud API keys configured. Using local despite high load."
                return @{
                    Provider = "ollama"
                    Model = "llama3.2:1b"  # Smallest model for high load
                    Reason = "no_cloud_available"
                    Load = $load
                }
            }
        }

        "hybrid" {
            Write-Host "→ Hybrid (reduced local)" -ForegroundColor Cyan

            # Use smaller local model
            return @{
                Provider = "ollama"
                Model = "llama3.2:1b"  # Lighter model
                Reason = "medium_load_reduced"
                Load = $load
                MaxConcurrent = 2  # Reduce concurrency
            }
        }

        default {
            Write-Host "→ Local" -ForegroundColor Green

            # Full local capacity
            $model = switch ($Task) {
                "code" { "qwen2.5-coder:1.5b" }
                "complex" { "llama3.2:3b" }
                "analysis" { "llama3.2:3b" }
                default { "llama3.2:3b" }
            }

            return @{
                Provider = "ollama"
                Model = $model
                Reason = "normal_load_local"
                Load = $load
                MaxConcurrent = $script:Config.LocalBatchSize
            }
        }
    }
}

#endregion

#region Load-Balanced Batch Processing

function Invoke-LoadBalancedBatch {
    <#
    .SYNOPSIS
        Execute batch requests with automatic load balancing
    .DESCRIPTION
        Processes multiple AI requests while monitoring system load.
        Automatically splits work between local and cloud based on
        real-time CPU/memory utilization.
    .PARAMETER Prompts
        Array of prompts to process
    .PARAMETER SystemPrompt
        Optional system prompt for all requests
    .PARAMETER MaxTokens
        Max tokens per response
    .PARAMETER AdaptiveBalancing
        Continuously monitor and adjust during execution
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$Prompts,

        [string]$SystemPrompt,

        [int]$MaxTokens = 1024,

        [switch]$AdaptiveBalancing
    )

    # Import main module
    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    $totalPrompts = $Prompts.Count
    Write-Host "`n[LoadBalancer] Processing $totalPrompts prompts with load balancing..." -ForegroundColor Cyan

    # Initial load check
    $initialProvider = Get-LoadBalancedProvider -Task "batch"

    if ($initialProvider.Reason -eq "high_load_cloud_fallback") {
        Write-Host "[LoadBalancer] High load detected! Routing all to cloud." -ForegroundColor Yellow
    }

    $results = @()
    $startTime = Get-Date

    if ($AdaptiveBalancing) {
        # Process in smaller chunks with continuous monitoring
        $chunkSize = 3
        $chunks = Split-Array -Array $Prompts -ChunkSize $chunkSize

        $chunkIndex = 0
        foreach ($chunk in $chunks) {
            $chunkIndex++
            Write-Host "`n[Chunk $chunkIndex/$($chunks.Count)] Processing $($chunk.Count) prompts..." -ForegroundColor Gray

            # Re-check load before each chunk
            $provider = Get-LoadBalancedProvider -Task "batch"

            $chunkResults = Invoke-BatchChunk -Prompts $chunk -Provider $provider.Provider `
                -Model $provider.Model -SystemPrompt $SystemPrompt -MaxTokens $MaxTokens

            $results += $chunkResults

            # Brief pause between chunks to let system recover
            if ($chunkIndex -lt $chunks.Count) {
                Start-Sleep -Milliseconds 500
            }
        }

    } else {
        # Process all with initial provider selection
        $results = Invoke-BatchChunk -Prompts $Prompts -Provider $initialProvider.Provider `
            -Model $initialProvider.Model -SystemPrompt $SystemPrompt -MaxTokens $MaxTokens `
            -MaxConcurrent $initialProvider.MaxConcurrent
    }

    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    $successCount = ($results | Where-Object { $_.Success }).Count

    Write-Host "`n[LoadBalancer] Batch complete: $successCount/$totalPrompts successful in $([math]::Round($elapsed, 2))s" -ForegroundColor $(if ($successCount -eq $totalPrompts) { "Green" } else { "Yellow" })

    return @{
        Results = $results
        TotalPrompts = $totalPrompts
        SuccessCount = $successCount
        ElapsedSeconds = $elapsed
        InitialProvider = $initialProvider
    }
}

function Invoke-BatchChunk {
    <#
    .SYNOPSIS
        Process a chunk of prompts with specified provider
    #>
    param(
        [string[]]$Prompts,
        [string]$Provider,
        [string]$Model,
        [string]$SystemPrompt,
        [int]$MaxTokens,
        [int]$MaxConcurrent = 4
    )

    $requests = $Prompts | ForEach-Object {
        $messages = @()
        if ($SystemPrompt) {
            $messages += @{ role = "system"; content = $SystemPrompt }
        }
        $messages += @{ role = "user"; content = $_ }

        @{
            Messages = $messages
            Provider = $Provider
            Model = $Model
            MaxTokens = $MaxTokens
        }
    }

    return Invoke-AIRequestParallel -Requests $requests -MaxConcurrent $MaxConcurrent
}

function Split-Array {
    param(
        [array]$Array,
        [int]$ChunkSize
    )

    $chunks = @()
    for ($i = 0; $i -lt $Array.Count; $i += $ChunkSize) {
        $end = [math]::Min($i + $ChunkSize - 1, $Array.Count - 1)
        $chunks += ,@($Array[$i..$end])
    }
    return $chunks
}

#endregion

#region Smart Task Distribution

function Invoke-SmartDistribution {
    <#
    .SYNOPSIS
        Intelligently distribute tasks between local and cloud
    .DESCRIPTION
        Analyzes tasks and current load to optimally distribute work.
        Simple tasks go to fast local models, complex tasks may go to cloud.
    .PARAMETER Tasks
        Array of task objects with: Prompt, Complexity (simple/medium/complex)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [array]$Tasks
    )

    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    $load = Get-SystemLoad

    Write-Host "[SmartDist] Analyzing $($Tasks.Count) tasks..." -ForegroundColor Cyan
    Write-Host "[SmartDist] System load: CPU $($load.CpuPercent)% | Memory $($load.MemoryPercent)%" -ForegroundColor Gray

    # Categorize tasks
    $simple = @($Tasks | Where-Object { $_.Complexity -eq "simple" -or -not $_.Complexity })
    $medium = @($Tasks | Where-Object { $_.Complexity -eq "medium" })
    $complex = @($Tasks | Where-Object { $_.Complexity -eq "complex" })

    Write-Host "[SmartDist] Tasks: $($simple.Count) simple, $($medium.Count) medium, $($complex.Count) complex" -ForegroundColor Gray

    $distribution = @{
        Local = @()
        Cloud = @()
    }

    # Distribution logic based on load
    if ($load.Recommendation -eq "cloud") {
        # High load: all to cloud
        $distribution.Cloud = $Tasks
        Write-Host "[SmartDist] High load - all tasks to cloud" -ForegroundColor Yellow

    } elseif ($load.Recommendation -eq "hybrid") {
        # Medium load: simple local, complex to cloud
        $distribution.Local = $simple
        $distribution.Cloud = $medium + $complex
        Write-Host "[SmartDist] Medium load - simple local, complex to cloud" -ForegroundColor Cyan

    } else {
        # Normal load: all local except very complex
        $distribution.Local = $simple + $medium
        if ($complex.Count -gt 2) {
            # Too many complex tasks, split
            $distribution.Local += $complex[0..1]
            $distribution.Cloud = $complex[2..($complex.Count - 1)]
        } else {
            $distribution.Local += $complex
        }
        Write-Host "[SmartDist] Normal load - prioritizing local" -ForegroundColor Green
    }

    return $distribution
}

function Invoke-DistributedExecution {
    <#
    .SYNOPSIS
        Execute distributed tasks across providers
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [array]$Tasks,

        [string]$SystemPrompt,
        [int]$MaxTokens = 1024
    )

    $distribution = Invoke-SmartDistribution -Tasks $Tasks

    $allResults = @()
    $startTime = Get-Date

    # Execute local tasks
    if ($distribution.Local.Count -gt 0) {
        Write-Host "`n[Executing] $($distribution.Local.Count) local tasks..." -ForegroundColor Green

        $localPrompts = $distribution.Local | ForEach-Object { $_.Prompt }
        $localResults = Invoke-BatchChunk -Prompts $localPrompts -Provider "ollama" `
            -Model "llama3.2:3b" -SystemPrompt $SystemPrompt -MaxTokens $MaxTokens

        $allResults += $localResults
    }

    # Execute cloud tasks
    if ($distribution.Cloud.Count -gt 0) {
        Write-Host "`n[Executing] $($distribution.Cloud.Count) cloud tasks..." -ForegroundColor Yellow

        $hasCloud = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY") -or
                    [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY")

        if ($hasCloud) {
            $cloudPrompts = $distribution.Cloud | ForEach-Object { $_.Prompt }
            $provider = if ([Environment]::GetEnvironmentVariable("OPENAI_API_KEY")) { "openai" } else { "anthropic" }
            $model = if ($provider -eq "openai") { "gpt-4o-mini" } else { "claude-3-5-haiku-20241022" }

            $cloudResults = Invoke-BatchChunk -Prompts $cloudPrompts -Provider $provider `
                -Model $model -SystemPrompt $SystemPrompt -MaxTokens $MaxTokens -MaxConcurrent 10

            $allResults += $cloudResults
        } else {
            Write-Warning "[SmartDist] No cloud API keys. Running complex tasks locally (may be slow)."
            $cloudPrompts = $distribution.Cloud | ForEach-Object { $_.Prompt }
            $fallbackResults = Invoke-BatchChunk -Prompts $cloudPrompts -Provider "ollama" `
                -Model "llama3.2:3b" -SystemPrompt $SystemPrompt -MaxTokens $MaxTokens

            $allResults += $fallbackResults
        }
    }

    $elapsed = ((Get-Date) - $startTime).TotalSeconds

    return @{
        Results = $allResults
        Distribution = $distribution
        ElapsedSeconds = $elapsed
        LocalCount = $distribution.Local.Count
        CloudCount = $distribution.Cloud.Count
    }
}

#endregion

#region Configuration

function Set-LoadBalancerConfig {
    <#
    .SYNOPSIS
        Update load balancer configuration
    #>
    [CmdletBinding()]
    param(
        [int]$CpuThresholdHigh,
        [int]$CpuThresholdMedium,
        [int]$MemoryThreshold,
        [string]$CloudProvider,
        [string]$CloudModel,
        [int]$LocalBatchSize,
        [int]$CloudBatchSize
    )

    if ($CpuThresholdHigh) { $script:Config.CpuThresholdHigh = $CpuThresholdHigh }
    if ($CpuThresholdMedium) { $script:Config.CpuThresholdMedium = $CpuThresholdMedium }
    if ($MemoryThreshold) { $script:Config.MemoryThresholdPercent = $MemoryThreshold }
    if ($CloudProvider) { $script:Config.CloudFallbackProvider = $CloudProvider }
    if ($CloudModel) { $script:Config.CloudFallbackModel = $CloudModel }
    if ($LocalBatchSize) { $script:Config.LocalBatchSize = $LocalBatchSize }
    if ($CloudBatchSize) { $script:Config.CloudBatchSize = $CloudBatchSize }

    Write-Host "[LoadBalancer] Configuration updated" -ForegroundColor Green
    return $script:Config
}

function Get-LoadBalancerConfig {
    <#
    .SYNOPSIS
        Get current load balancer configuration
    #>
    return $script:Config
}

function Get-LoadBalancerStatus {
    <#
    .SYNOPSIS
        Get current load balancer status
    #>
    [CmdletBinding()]
    param()

    $load = Get-SystemLoad
    $config = Get-LoadBalancerConfig

    Write-Host "`n=== Load Balancer Status ===" -ForegroundColor Cyan

    # Current load
    $cpuColor = if ($load.CpuPercent -gt 90) { "Red" } elseif ($load.CpuPercent -gt 70) { "Yellow" } else { "Green" }
    $memColor = if ($load.MemoryPercent -gt 85) { "Red" } elseif ($load.MemoryPercent -gt 70) { "Yellow" } else { "Green" }

    Write-Host "`nCurrent Load:" -ForegroundColor White
    Write-Host "  CPU: $($load.CpuPercent)%" -ForegroundColor $cpuColor
    Write-Host "  Memory: $($load.MemoryPercent)% ($($load.MemoryAvailableGB) GB free)" -ForegroundColor $memColor
    Write-Host "  Recommendation: $($load.Recommendation)" -ForegroundColor $(if ($load.Recommendation -eq "cloud") { "Yellow" } else { "Green" })

    Write-Host "`nThresholds:" -ForegroundColor White
    Write-Host "  CPU High (→ cloud): $($config.CpuThresholdHigh)%"
    Write-Host "  CPU Medium (→ reduced): $($config.CpuThresholdMedium)%"
    Write-Host "  Memory (→ cloud): $($config.MemoryThresholdPercent)%"

    Write-Host "`nFallback:" -ForegroundColor White
    Write-Host "  Provider: $($config.CloudFallbackProvider)"
    Write-Host "  Model: $($config.CloudFallbackModel)"

    Write-Host "`nBatch Sizes:" -ForegroundColor White
    Write-Host "  Local: $($config.LocalBatchSize) concurrent"
    Write-Host "  Cloud: $($config.CloudBatchSize) concurrent"

    return @{
        Load = $load
        Config = $config
    }
}

#endregion

#region Exports

Export-ModuleMember -Function @(
    'Get-SystemLoad',
    'Get-CpuLoad',
    'Watch-SystemLoad',
    'Get-LoadBalancedProvider',
    'Invoke-LoadBalancedBatch',
    'Invoke-SmartDistribution',
    'Invoke-DistributedExecution',
    'Set-LoadBalancerConfig',
    'Get-LoadBalancerConfig',
    'Get-LoadBalancerStatus'
)

#endregion
