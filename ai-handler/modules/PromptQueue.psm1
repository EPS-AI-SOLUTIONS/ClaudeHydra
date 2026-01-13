#Requires -Version 5.1
<#
.SYNOPSIS
    HYDRA 10.0 - Advanced Prompt Queue System
.DESCRIPTION
    Comprehensive prompt queuing with:
    - Priority queuing (high/normal/low)
    - Rate limiting per provider
    - Retry queue with exponential backoff
    - Persistent storage (survives restarts)
.VERSION
    1.0.0
.AUTHOR
    HYDRA System
#>

#region Module Variables

$script:QueuePath = Join-Path $PSScriptRoot "..\queue"
$script:QueueFile = Join-Path $script:QueuePath "prompt-queue.json"
$script:StateFile = Join-Path $script:QueuePath "queue-state.json"
$script:HistoryFile = Join-Path $script:QueuePath "queue-history.json"
$script:SecureStoragePath = Join-Path $PSScriptRoot "SecureStorage.psm1"

if (Test-Path $script:SecureStoragePath) {
    Import-Module $script:SecureStoragePath -Force -ErrorAction SilentlyContinue
}

# In-memory queue
$script:Queue = [System.Collections.ArrayList]::new()
$script:RetryQueue = [System.Collections.ArrayList]::new()
$script:ProcessingQueue = [System.Collections.ArrayList]::new()

# Rate limiting state
$script:RateLimits = @{}

# Queue state
$script:QueueState = @{
    isRunning = $false
    isPaused = $false
    processedCount = 0
    failedCount = 0
    retryCount = 0
    startTime = $null
    lastProcessed = $null
}

# Configuration
$script:QueueConfig = @{
    maxRetries = 3
    baseRetryDelayMs = 1000
    maxRetryDelayMs = 30000
    batchSize = 10
    processingIntervalMs = 100
    persistIntervalSec = 30
    historyMaxItems = 1000
}

#endregion

#region Initialization

function Initialize-PromptQueue {
    <#
    .SYNOPSIS
        Initialize the prompt queue system
    .PARAMETER LoadPersisted
        Load queue from disk if exists
    #>
    [CmdletBinding()]
    param(
        [switch]$LoadPersisted
    )

    # Create queue directory
    if (-not (Test-Path $script:QueuePath)) {
        New-Item -ItemType Directory -Path $script:QueuePath -Force | Out-Null
    }

    # Load persisted queue
    if ($LoadPersisted -and (Test-Path $script:QueueFile)) {
        try {
            if (Get-Command Read-EncryptedJson -ErrorAction SilentlyContinue) {
                $persisted = Read-EncryptedJson -Path $script:QueueFile
            } else {
                $persisted = Get-Content $script:QueueFile -Raw | ConvertFrom-Json
            }
            $script:Queue = [System.Collections.ArrayList]@($persisted.queue)
            $script:RetryQueue = [System.Collections.ArrayList]@($persisted.retryQueue)
            Write-Host "[Queue] Loaded $($script:Queue.Count) items from disk" -ForegroundColor Cyan
        } catch {
            Write-Warning "Failed to load persisted queue: $_"
        }
    }

    # Load state
    if (Test-Path $script:StateFile) {
        try {
            if (Get-Command Read-EncryptedJson -ErrorAction SilentlyContinue) {
                $script:QueueState = Read-EncryptedJson -Path $script:StateFile
            } else {
                $script:QueueState = Get-Content $script:StateFile -Raw | ConvertFrom-Json | ConvertTo-Hashtable
            }
        } catch { }
    }

    Sync-RateLimits

    return @{
        QueueCount = $script:Queue.Count
        RetryCount = $script:RetryQueue.Count
        State = $script:QueueState
    }
}

#endregion

#region Queue Management Cmdlets

function Add-AIPrompt {
    <#
    .SYNOPSIS
        Add a prompt to the queue
    .PARAMETER Prompt
        The prompt text
    .PARAMETER Priority
        Priority level: high, normal, low (default: normal)
    .PARAMETER Provider
        Target provider (anthropic, openai, google, mistral, groq, ollama, auto)
    .PARAMETER Model
        Specific model to use
    .PARAMETER SystemPrompt
        System prompt to prepend
    .PARAMETER MaxTokens
        Maximum tokens in response
    .PARAMETER Callback
        ScriptBlock to execute on completion
    .PARAMETER Tags
        Tags for filtering/grouping
    .EXAMPLE
        Add-AIPrompt -Prompt "Explain quantum computing" -Priority high
    .EXAMPLE
        "Task 1", "Task 2" | Add-AIPrompt -Provider ollama
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$Prompt,

        [ValidateSet("high", "normal", "low")]
        [string]$Priority = "normal",

        [ValidateSet("anthropic", "openai", "google", "mistral", "groq", "ollama", "auto")]
        [string]$Provider = "auto",

        [string]$Model,

        [string]$SystemPrompt,

        [int]$MaxTokens = 1024,

        [scriptblock]$Callback,

        [string[]]$Tags = @(),

        [string]$Id
    )

    process {
        $item = @{
            id = if ($Id) { $Id } else { [guid]::NewGuid().ToString() }
            prompt = $Prompt
            priority = $Priority
            priorityValue = switch ($Priority) { "high" { 0 } "normal" { 1 } "low" { 2 } }
            provider = $Provider
            model = $Model
            systemPrompt = $SystemPrompt
            maxTokens = $MaxTokens
            callback = if ($Callback) { $Callback.ToString() } else { $null }
            tags = $Tags
            status = "pending"
            createdAt = (Get-Date).ToString('o')
            attempts = 0
            lastError = $null
        }

        # Insert based on priority
        $inserted = $false
        for ($i = 0; $i -lt $script:Queue.Count; $i++) {
            if ($script:Queue[$i].priorityValue -gt $item.priorityValue) {
                $script:Queue.Insert($i, $item) | Out-Null
                $inserted = $true
                break
            }
        }
        if (-not $inserted) {
            $script:Queue.Add($item) | Out-Null
        }

        Write-Verbose "[Queue] Added: $($item.id) (priority: $Priority, position: $($script:Queue.IndexOf($item) + 1))"

        return $item
    }
}

function Get-AIQueue {
    <#
    .SYNOPSIS
        Get current queue status and items
    .PARAMETER Status
        Filter by status (pending, processing, completed, failed, retry)
    .PARAMETER Priority
        Filter by priority
    .PARAMETER Provider
        Filter by provider
    .PARAMETER Tags
        Filter by tags
    .PARAMETER First
        Return only first N items
    .PARAMETER Summary
        Return summary only, not individual items
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("pending", "processing", "completed", "failed", "retry", "all")]
        [string]$Status = "all",

        [ValidateSet("high", "normal", "low", "all")]
        [string]$Priority = "all",

        [string]$Provider,

        [string[]]$Tags,

        [int]$First,

        [switch]$Summary
    )

    $items = @()

    # Combine queues based on status filter
    switch ($Status) {
        "pending" { $items = @($script:Queue | Where-Object { $_.status -eq "pending" }) }
        "processing" { $items = @($script:ProcessingQueue) }
        "retry" { $items = @($script:RetryQueue) }
        "all" { $items = @($script:Queue) + @($script:RetryQueue) + @($script:ProcessingQueue) }
        default { $items = @($script:Queue | Where-Object { $_.status -eq $Status }) }
    }

    # Apply filters
    if ($Priority -ne "all") {
        $items = $items | Where-Object { $_.priority -eq $Priority }
    }
    if ($Provider) {
        $items = $items | Where-Object { $_.provider -eq $Provider }
    }
    if ($Tags) {
        $items = $items | Where-Object {
            $itemTags = $_.tags
            $Tags | ForEach-Object { $itemTags -contains $_ } | Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count
        } | Where-Object { $_ -gt 0 }
    }

    if ($Summary) {
        return @{
            TotalPending = ($script:Queue | Where-Object { $_.status -eq "pending" }).Count
            TotalProcessing = $script:ProcessingQueue.Count
            TotalRetry = $script:RetryQueue.Count
            ByPriority = @{
                high = ($script:Queue | Where-Object { $_.priority -eq "high" }).Count
                normal = ($script:Queue | Where-Object { $_.priority -eq "normal" }).Count
                low = ($script:Queue | Where-Object { $_.priority -eq "low" }).Count
            }
            ByProvider = @{
                anthropic = ($script:Queue | Where-Object { $_.provider -eq "anthropic" }).Count
                openai = ($script:Queue | Where-Object { $_.provider -eq "openai" }).Count
                google = ($script:Queue | Where-Object { $_.provider -eq "google" }).Count
                mistral = ($script:Queue | Where-Object { $_.provider -eq "mistral" }).Count
                groq = ($script:Queue | Where-Object { $_.provider -eq "groq" }).Count
                ollama = ($script:Queue | Where-Object { $_.provider -eq "ollama" }).Count
                auto = ($script:Queue | Where-Object { $_.provider -eq "auto" }).Count
            }
            State = $script:QueueState
            RateLimits = $script:RateLimits
        }
    }

    if ($First -and $First -gt 0) {
        $items = $items | Select-Object -First $First
    }

    return $items
}

function Remove-AIPrompt {
    <#
    .SYNOPSIS
        Remove a prompt from the queue
    .PARAMETER Id
        Prompt ID to remove
    .PARAMETER All
        Remove all prompts
    .PARAMETER Status
        Remove all prompts with specific status
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(ValueFromPipelineByPropertyName)]
        [string]$Id,

        [switch]$All,

        [ValidateSet("pending", "failed", "retry")]
        [string]$Status
    )

    process {
        if ($All) {
            if ($PSCmdlet.ShouldProcess("All prompts", "Remove")) {
                $count = $script:Queue.Count
                $script:Queue.Clear()
                $script:RetryQueue.Clear()
                Write-Host "[Queue] Removed $count items" -ForegroundColor Yellow
            }
            return
        }

        if ($Status) {
            $toRemove = @($script:Queue | Where-Object { $_.status -eq $Status })
            foreach ($item in $toRemove) {
                $script:Queue.Remove($item) | Out-Null
            }
            Write-Host "[Queue] Removed $($toRemove.Count) $Status items" -ForegroundColor Yellow
            return
        }

        if ($Id) {
            $item = $script:Queue | Where-Object { $_.id -eq $Id } | Select-Object -First 1
            if ($item) {
                $script:Queue.Remove($item) | Out-Null
                Write-Verbose "[Queue] Removed: $Id"
            } else {
                # Check retry queue
                $item = $script:RetryQueue | Where-Object { $_.id -eq $Id } | Select-Object -First 1
                if ($item) {
                    $script:RetryQueue.Remove($item) | Out-Null
                    Write-Verbose "[Queue] Removed from retry: $Id"
                }
            }
        }
    }
}

function Set-AIPromptPriority {
    <#
    .SYNOPSIS
        Change priority of a queued prompt
    .PARAMETER Id
        Prompt ID
    .PARAMETER Priority
        New priority level
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Id,

        [Parameter(Mandatory)]
        [ValidateSet("high", "normal", "low")]
        [string]$Priority
    )

    $item = $script:Queue | Where-Object { $_.id -eq $Id } | Select-Object -First 1
    if (-not $item) {
        Write-Warning "Item not found: $Id"
        return
    }

    # Remove and re-add with new priority
    $script:Queue.Remove($item) | Out-Null
    $item.priority = $Priority
    $item.priorityValue = switch ($Priority) { "high" { 0 } "normal" { 1 } "low" { 2 } }

    # Re-insert in correct position
    $inserted = $false
    for ($i = 0; $i -lt $script:Queue.Count; $i++) {
        if ($script:Queue[$i].priorityValue -gt $item.priorityValue) {
            $script:Queue.Insert($i, $item) | Out-Null
            $inserted = $true
            break
        }
    }
    if (-not $inserted) {
        $script:Queue.Add($item) | Out-Null
    }

    Write-Host "[Queue] Updated priority: $Id -> $Priority" -ForegroundColor Cyan
}

#endregion

#region Rate Limiting

function Test-RateLimit {
    <#
    .SYNOPSIS
        Check if a provider is within rate limits
    .PARAMETER Provider
        Provider to check
    .PARAMETER EstimatedTokens
        Estimated tokens for the request
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Provider,

        [int]$EstimatedTokens = 1000
    )

    $limit = $script:RateLimits[$Provider]
    if (-not $limit) { return $true }

    $now = Get-Date

    # Reset window if expired (1 minute)
    if (-not $limit.windowStart -or ($now - $limit.windowStart).TotalSeconds -ge 60) {
        $limit.windowStart = $now
        $limit.currentRequests = 0
        $limit.currentTokens = 0
    }

    # Check limits
    $requestsOk = $limit.currentRequests -lt $limit.requestsPerMinute
    $tokensOk = ($limit.currentTokens + $EstimatedTokens) -lt $limit.tokensPerMinute

    return $requestsOk -and $tokensOk
}

function Update-RateLimit {
    <#
    .SYNOPSIS
        Update rate limit counters after a request
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Provider,

        [int]$TokensUsed = 0
    )

    $limit = $script:RateLimits[$Provider]
    if (-not $limit) { return }

    $limit.currentRequests++
    $limit.currentTokens += $TokensUsed
}

function Get-RateLimitWaitTime {
    <#
    .SYNOPSIS
        Get time to wait before rate limit resets
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Provider
    )

    $limit = $script:RateLimits[$Provider]
    if (-not $limit -or -not $limit.windowStart) { return 0 }

    $elapsed = ((Get-Date) - $limit.windowStart).TotalSeconds
    $remaining = [Math]::Max(0, 60 - $elapsed)

    return [int]($remaining * 1000)  # Return milliseconds
}

#endregion

#region Retry Logic

function Add-ToRetryQueue {
    <#
    .SYNOPSIS
        Add a failed item to retry queue with backoff
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [hashtable]$Item,

        [string]$Error
    )

    $item.attempts++
    $item.lastError = $Error
    $item.status = "retry"

    # Calculate next retry time with exponential backoff
    $delay = [Math]::Min(
        $script:QueueConfig.baseRetryDelayMs * [Math]::Pow(2, $item.attempts - 1),
        $script:QueueConfig.maxRetryDelayMs
    )
    $jitter = [int]($delay * 0.2)
    $delay = [int]($delay + (Get-Random -Minimum (-$jitter) -Maximum $jitter))
    $item.nextRetryAt = (Get-Date).AddMilliseconds($delay).ToString('o')

    if ($item.attempts -ge $script:QueueConfig.maxRetries) {
        $item.status = "failed"
        Write-Host "[Queue] Max retries reached for: $($item.id)" -ForegroundColor Red
    } else {
        $script:RetryQueue.Add($item) | Out-Null
        Write-Verbose "[Queue] Added to retry queue: $($item.id) (attempt $($item.attempts), delay ${delay}ms)"
    }

    $script:QueueState.retryCount++
}

function Get-ReadyRetries {
    <#
    .SYNOPSIS
        Get retry items ready for processing
    #>
    [CmdletBinding()]
    param()

    $now = Get-Date
    $ready = @($script:RetryQueue | Where-Object {
        $nextRetry = [DateTime]::Parse($_.nextRetryAt)
        $nextRetry -le $now
    })

    return $ready
}

#endregion

#region Queue Processing

function Start-AIQueue {
    <#
    .SYNOPSIS
        Start processing the queue
    .PARAMETER MaxConcurrent
        Maximum concurrent requests
    .PARAMETER ProcessRetries
        Also process retry queue
    .PARAMETER Continuous
        Keep running and process new items as they arrive
    #>
    [CmdletBinding()]
    param(
        [int]$MaxConcurrent = 4,

        [switch]$ProcessRetries,

        [switch]$Continuous
    )

    if ($script:QueueState.isRunning) {
        Write-Warning "Queue is already running"
        return
    }

    $script:QueueState.isRunning = $true
    $script:QueueState.isPaused = $false
    $script:QueueState.startTime = (Get-Date).ToString('o')

    Write-Host "[Queue] Starting queue processor (concurrent: $MaxConcurrent)..." -ForegroundColor Cyan

    # Import AI Handler if not loaded
    if (-not (Get-Command 'Invoke-AIRequest' -ErrorAction SilentlyContinue)) {
        $modulePath = Join-Path $PSScriptRoot "..\AIModelHandler.psm1"
        Import-Module $modulePath -Force
    }

    $processed = 0
    $failed = 0
    $startTime = Get-Date

    do {
        # Check for pause
        if ($script:QueueState.isPaused) {
            Start-Sleep -Milliseconds 500
            continue
        }

        # Get pending items (respecting rate limits)
        $batch = @()
        $providerCounts = @{}

        # First, check retry queue
        if ($ProcessRetries) {
            $retries = Get-ReadyRetries
            foreach ($r in $retries) {
                if ($batch.Count -ge $MaxConcurrent) { break }
                if (Test-RateLimit -Provider $r.provider) {
                    $script:RetryQueue.Remove($r) | Out-Null
                    $batch += $r
                }
            }
        }

        # Then add pending items
        for ($i = 0; $i -lt $script:Queue.Count -and $batch.Count -lt $MaxConcurrent; $i++) {
            $item = $script:Queue[$i]
            if ($item.status -ne "pending") { continue }

            $provider = $item.provider
            if ($provider -eq "auto") {
                # Determine provider
                $config = Get-AIConfig
                if ($config.settings.preferLocal -and (Test-OllamaAvailable -ErrorAction SilentlyContinue)) {
                    $provider = "ollama"
                } else {
                    $provider = $config.providerFallbackOrder[0]
                }
                $item.resolvedProvider = $provider
            }

            if (Test-RateLimit -Provider $provider) {
                $item.status = "processing"
                $script:ProcessingQueue.Add($item) | Out-Null
                $batch += $item
            }
        }

        if ($batch.Count -eq 0) {
            if (-not $Continuous) { break }
            Start-Sleep -Milliseconds $script:QueueConfig.processingIntervalMs
            continue
        }

        # Process batch
        Write-Host "[Queue] Processing batch of $($batch.Count) items..." -ForegroundColor Gray

        foreach ($item in $batch) {
            try {
                $provider = if ($item.resolvedProvider) { $item.resolvedProvider } else { $item.provider }
                $model = $item.model

                # Build messages
                $messages = @()
                if ($item.systemPrompt) {
                    $messages += @{ role = "system"; content = $item.systemPrompt }
                }
                $messages += @{ role = "user"; content = $item.prompt }

                # Execute request
                $response = Invoke-AIRequest -Messages $messages -Provider $provider -Model $model `
                    -MaxTokens $item.maxTokens -AutoFallback

                # Success
                $item.status = "completed"
                $item.response = $response.Content
                $item.completedAt = (Get-Date).ToString('o')
                $item.tokensUsed = $response.Usage

                Update-RateLimit -Provider $provider -TokensUsed ($response.Usage.input_tokens + $response.Usage.output_tokens)

                # Execute callback if defined
                if ($item.callback) {
                    try {
                        $cb = [scriptblock]::Create($item.callback)
                        & $cb $item
                    } catch {
                        Write-Warning "Callback failed for $($item.id): $_"
                    }
                }

                $processed++
                $script:QueueState.processedCount++
                Write-Verbose "[Queue] Completed: $($item.id)"
                Add-QueueHistoryItem -Item $item

            } catch {
                Write-Warning "[Queue] Failed: $($item.id) - $_"
                Add-ToRetryQueue -Item $item -Error $_.Exception.Message
                $failed++
                $script:QueueState.failedCount++
                Add-QueueHistoryItem -Item $item
            } finally {
                # Remove from processing queue
                $script:ProcessingQueue.Remove($item) | Out-Null
                $script:Queue.Remove($item) | Out-Null
            }
        }

        $script:QueueState.lastProcessed = (Get-Date).ToString('o')

        # Save state periodically
        Save-QueueState

    } while ($Continuous -or $script:Queue.Count -gt 0 -or ($ProcessRetries -and $script:RetryQueue.Count -gt 0))

    $script:QueueState.isRunning = $false
    $duration = (Get-Date) - $startTime

    Write-Host "[Queue] Completed: $processed processed, $failed failed in $([int]$duration.TotalSeconds)s" -ForegroundColor Green

    return @{
        Processed = $processed
        Failed = $failed
        Duration = $duration
        Remaining = $script:Queue.Count
        RetryRemaining = $script:RetryQueue.Count
    }
}

function Stop-AIQueue {
    <#
    .SYNOPSIS
        Stop the queue processor
    .PARAMETER Force
        Stop immediately without waiting for current batch
    #>
    [CmdletBinding()]
    param(
        [switch]$Force
    )

    if (-not $script:QueueState.isRunning) {
        Write-Host "[Queue] Queue is not running" -ForegroundColor Yellow
        return
    }

    Write-Host "[Queue] Stopping..." -ForegroundColor Yellow
    $script:QueueState.isRunning = $false

    if ($Force) {
        # Move processing items back to queue
        foreach ($item in $script:ProcessingQueue) {
            $item.status = "pending"
            $script:Queue.Insert(0, $item) | Out-Null
        }
        $script:ProcessingQueue.Clear()
    }

    Save-QueueState
}

function Suspend-AIQueue {
    <#
    .SYNOPSIS
        Pause queue processing
    #>
    [CmdletBinding()]
    param()

    $script:QueueState.isPaused = $true
    Write-Host "[Queue] Paused" -ForegroundColor Yellow
}

function Resume-AIQueue {
    <#
    .SYNOPSIS
        Resume queue processing
    #>
    [CmdletBinding()]
    param()

    $script:QueueState.isPaused = $false
    Write-Host "[Queue] Resumed" -ForegroundColor Green
}

#endregion

#region Persistence

function Save-QueueState {
    <#
    .SYNOPSIS
        Save queue to disk
    #>
    [CmdletBinding()]
    param()

    try {
        # Save queue
        $payload = @{
            queue = @($script:Queue)
            retryQueue = @($script:RetryQueue)
            savedAt = (Get-Date).ToString('o')
        }
        if (Get-Command Write-EncryptedJson -ErrorAction SilentlyContinue) {
            Write-EncryptedJson -Data $payload -Path $script:QueueFile
            Write-EncryptedJson -Data $script:QueueState -Path $script:StateFile
        } else {
            $payload | ConvertTo-Json -Depth 10 | Set-Content $script:QueueFile -Encoding UTF8
            $script:QueueState | ConvertTo-Json -Depth 5 | Set-Content $script:StateFile -Encoding UTF8
        }

    } catch {
        Write-Warning "Failed to save queue: $_"
    }
}

function Sync-RateLimits {
    <#
    .SYNOPSIS
        Sync rate limits from AI config.
    #>
    [CmdletBinding()]
    param()

    if (-not (Get-Command Get-AIConfig -ErrorAction SilentlyContinue)) {
        return
    }

    $config = Get-AIConfig
    foreach ($providerName in $config.providers.Keys) {
        $models = $config.providers[$providerName].models.Values
        if (-not $models) { continue }

        $maxRequests = ($models | Measure-Object -Property requestsPerMinute -Maximum).Maximum
        $maxTokens = ($models | Measure-Object -Property tokensPerMinute -Maximum).Maximum

        if (-not $script:RateLimits[$providerName]) {
            $script:RateLimits[$providerName] = @{
                requestsPerMinute = $maxRequests
                tokensPerMinute = $maxTokens
                currentRequests = 0
                currentTokens = 0
                windowStart = $null
            }
        } else {
            $script:RateLimits[$providerName].requestsPerMinute = $maxRequests
            $script:RateLimits[$providerName].tokensPerMinute = $maxTokens
        }
    }
}

function Add-QueueHistoryItem {
    <#
    .SYNOPSIS
        Append a queue item to history and trim to limit.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [hashtable]$Item
    )

    $history = @()
    if (Test-Path $script:HistoryFile) {
        try {
            if (Get-Command Read-EncryptedJson -ErrorAction SilentlyContinue) {
                $history = Read-EncryptedJson -Path $script:HistoryFile
            } else {
                $history = Get-Content $script:HistoryFile -Raw | ConvertFrom-Json
            }
        } catch { $history = @() }
    }

    $history = @($history) + @($Item)
    if ($history.Count -gt $script:QueueConfig.historyMaxItems) {
        $history = $history | Select-Object -Last $script:QueueConfig.historyMaxItems
    }

    if (Get-Command Write-EncryptedJson -ErrorAction SilentlyContinue) {
        Write-EncryptedJson -Data $history -Path $script:HistoryFile
    } else {
        $history | ConvertTo-Json -Depth 10 | Set-Content $script:HistoryFile -Encoding UTF8
    }
}

function Clear-QueueHistory {
    <#
    .SYNOPSIS
        Clear completed items from history
    .PARAMETER OlderThan
        Remove items older than specified timespan
    #>
    [CmdletBinding()]
    param(
        [TimeSpan]$OlderThan = [TimeSpan]::FromDays(7)
    )

    if (Test-Path $script:HistoryFile) {
        try {
            $history = Get-Content $script:HistoryFile -Raw | ConvertFrom-Json
            $cutoff = (Get-Date).Add(-$OlderThan)
            $history = $history | Where-Object {
                [DateTime]::Parse($_.completedAt) -gt $cutoff
            }
            $history | ConvertTo-Json -Depth 10 | Set-Content $script:HistoryFile -Encoding UTF8
        } catch { }
    }
}

#endregion

#region Display/Info

function Show-AIQueue {
    <#
    .SYNOPSIS
        Display formatted queue status
    #>
    [CmdletBinding()]
    param()

    $summary = Get-AIQueue -Summary

    Write-Host "`n=== AI Prompt Queue ===" -ForegroundColor Cyan

    # State
    $stateColor = if ($summary.State.isRunning) { "Green" } elseif ($summary.State.isPaused) { "Yellow" } else { "Gray" }
    $stateText = if ($summary.State.isRunning) { "RUNNING" } elseif ($summary.State.isPaused) { "PAUSED" } else { "STOPPED" }
    Write-Host "Status: $stateText" -ForegroundColor $stateColor

    # Counts
    Write-Host "`nQueue Status:" -ForegroundColor White
    Write-Host "  Pending:    $($summary.TotalPending)" -ForegroundColor $(if ($summary.TotalPending -gt 0) { "Yellow" } else { "Gray" })
    Write-Host "  Processing: $($summary.TotalProcessing)" -ForegroundColor $(if ($summary.TotalProcessing -gt 0) { "Cyan" } else { "Gray" })
    Write-Host "  Retry:      $($summary.TotalRetry)" -ForegroundColor $(if ($summary.TotalRetry -gt 0) { "Red" } else { "Gray" })

    # By priority
    Write-Host "`nBy Priority:" -ForegroundColor White
    Write-Host "  High:   $($summary.ByPriority.high)" -ForegroundColor Red
    Write-Host "  Normal: $($summary.ByPriority.normal)" -ForegroundColor Yellow
    Write-Host "  Low:    $($summary.ByPriority.low)" -ForegroundColor Gray

    # By provider
    Write-Host "`nBy Provider:" -ForegroundColor White
    foreach ($p in @("anthropic", "openai", "google", "mistral", "groq", "ollama", "auto")) {
        $count = $summary.ByProvider[$p]
        if ($count -gt 0) {
            Write-Host "  ${p}: $count" -ForegroundColor White
        }
    }

    # Rate limits
    Write-Host "`nRate Limits:" -ForegroundColor White
    foreach ($p in @("ollama", "anthropic", "openai", "google", "mistral", "groq")) {
        $limit = $summary.RateLimits[$p]
        if ($limit.windowStart) {
            $pct = [int](($limit.currentRequests / $limit.requestsPerMinute) * 100)
            $color = if ($pct -gt 80) { "Red" } elseif ($pct -gt 50) { "Yellow" } else { "Green" }
            Write-Host "  ${p}: $($limit.currentRequests)/$($limit.requestsPerMinute) req/min ($pct%)" -ForegroundColor $color
        }
    }

    # Stats
    if ($summary.State.processedCount -gt 0 -or $summary.State.failedCount -gt 0) {
        Write-Host "`nStatistics:" -ForegroundColor White
        Write-Host "  Processed: $($summary.State.processedCount)" -ForegroundColor Green
        Write-Host "  Failed:    $($summary.State.failedCount)" -ForegroundColor Red
        Write-Host "  Retries:   $($summary.State.retryCount)" -ForegroundColor Yellow
    }

    Write-Host ""
}

#endregion

#region Exports

Export-ModuleMember -Function @(
    # Initialization
    'Initialize-PromptQueue',

    # Queue Management
    'Add-AIPrompt',
    'Get-AIQueue',
    'Remove-AIPrompt',
    'Set-AIPromptPriority',

    # Processing
    'Start-AIQueue',
    'Stop-AIQueue',
    'Suspend-AIQueue',
    'Resume-AIQueue',

    # Rate Limiting
    'Test-RateLimit',
    'Get-RateLimitWaitTime',

    # Persistence
    'Save-QueueState',
    'Clear-QueueHistory',

    # Display
    'Show-AIQueue'
)

#endregion

# Auto-initialize
Initialize-PromptQueue -LoadPersisted | Out-Null
