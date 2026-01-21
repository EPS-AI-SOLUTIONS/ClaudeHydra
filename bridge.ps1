<#
.SYNOPSIS
    Bridge IPC - Bidirectional communication between CLI and GUI

.DESCRIPTION
    Creates approval requests that can be approved/rejected from the GUI.
    Supports auto-approve mode for trusted scenarios.

.PARAMETER Message
    The approval message to display

.PARAMETER Type
    Request type: 'command', 'file', 'network', 'system'

.PARAMETER Timeout
    Timeout in seconds (default: 300)

.EXAMPLE
    .\bridge.ps1 -Message "Execute: rm -rf /tmp/cache" -Type "command"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Message,

    [ValidateSet('command', 'file', 'network', 'system')]
    [string]$Type = 'command',

    [int]$Timeout = 300
)

$BridgeFile = Join-Path $PSScriptRoot "bridge.json"

function Get-BridgeData {
    if (Test-Path $BridgeFile) {
        try {
            return Get-Content $BridgeFile -Raw | ConvertFrom-Json
        }
        catch {
            return @{
                auto_approve = $false
                requests     = @()
                settings     = @{
                    poll_interval_ms    = 2000
                    max_pending_requests = 10
                    timeout_ms          = 300000
                }
            }
        }
    }
    return @{
        auto_approve = $false
        requests     = @()
        settings     = @{
            poll_interval_ms    = 2000
            max_pending_requests = 10
            timeout_ms          = 300000
        }
    }
}

function Set-BridgeData {
    param($Data)
    $Data | ConvertTo-Json -Depth 10 | Set-Content $BridgeFile -Encoding UTF8
}

# Main logic
$data = Get-BridgeData

# Check auto-approve mode
if ($data.auto_approve) {
    Write-Host "[Bridge] Auto-approved: $Message" -ForegroundColor Green
    exit 0
}

# Create request
$requestId = [guid]::NewGuid().ToString().Substring(0, 8)
$request = @{
    id        = $requestId
    message   = $Message
    type      = $Type
    status    = "pending"
    timestamp = (Get-Date).ToString("o")
}

# Add request
$requests = @($data.requests)
$requests += $request
$data.requests = $requests
Set-BridgeData $data

Write-Host "[Bridge] Request created: $requestId" -ForegroundColor Yellow
Write-Host "[Bridge] Waiting for approval..." -ForegroundColor Yellow

# Poll for status
$startTime = Get-Date
$pollInterval = [math]::Max(1, [math]::Floor($data.settings.poll_interval_ms / 1000))

while ($true) {
    Start-Sleep -Seconds $pollInterval

    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    if ($elapsed -gt $Timeout) {
        Write-Host "[Bridge] Request timed out after ${Timeout}s" -ForegroundColor Red

        # Clean up timed out request
        $data = Get-BridgeData
        $data.requests = @($data.requests | Where-Object { $_.id -ne $requestId })
        Set-BridgeData $data

        exit 1
    }

    $data = Get-BridgeData
    $myRequest = $data.requests | Where-Object { $_.id -eq $requestId }

    if (-not $myRequest) {
        Write-Host "[Bridge] Request not found (possibly cleared)" -ForegroundColor Red
        exit 1
    }

    switch ($myRequest.status) {
        "approved" {
            Write-Host "[Bridge] APPROVED by GUI" -ForegroundColor Green

            # Clean up approved request
            $data.requests = @($data.requests | Where-Object { $_.id -ne $requestId })
            Set-BridgeData $data

            exit 0
        }
        "rejected" {
            Write-Host "[Bridge] REJECTED by GUI" -ForegroundColor Red

            # Clean up rejected request
            $data.requests = @($data.requests | Where-Object { $_.id -ne $requestId })
            Set-BridgeData $data

            exit 1
        }
        default {
            # Still pending, continue polling
            $remaining = $Timeout - [math]::Floor($elapsed)
            Write-Host "`r[Bridge] Waiting... (${remaining}s remaining)" -NoNewline -ForegroundColor Yellow
        }
    }
}
