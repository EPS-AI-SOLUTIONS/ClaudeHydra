function Initialize-LauncherLogging {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    $script:LogDir = Join-Path $Root "logs"
    $script:LogFile = Join-Path $script:LogDir "launcher.log"
    $script:LastRunFile = Join-Path $script:LogDir "last-run.json"

    if (-not (Test-Path $script:LogDir)) {
        New-Item -Path $script:LogDir -ItemType Directory -Force | Out-Null
    }

    [PSCustomObject]@{
        LogDir = $script:LogDir
        LogFile = $script:LogFile
        LastRunFile = $script:LastRunFile
    }
}

function Get-LauncherLogState {
    [PSCustomObject]@{
        LogDir = $script:LogDir
        LogFile = $script:LogFile
        LastRunFile = $script:LastRunFile
    }
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = (Get-Date).ToString("s")
    $line = "[$timestamp][$Level] $Message"
    Add-Content -Path $script:LogFile -Value $line
}

function Write-Panel {
    param(
        [string]$Title,
        [string[]]$Lines,
        [ConsoleColor]$Color = "Yellow"
    )
    Write-Host ("`n=== {0} ===" -f $Title) -ForegroundColor $Color
    foreach ($line in $Lines) {
        Write-Host (" - {0}" -f $line) -ForegroundColor $Color
    }
}

function Write-LauncherSummary {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Profile,
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$PowerShellVersion,
        [Parameter(Mandatory = $true)]
        [bool]$Offline
    )

    $summary = [PSCustomObject]@{
        timestamp = (Get-Date).ToString("s")
        profile = $Profile
        powershell = $PowerShellVersion
        offline = $Offline
        root = $Root
    }
    $summary | ConvertTo-Json -Depth 3 | Set-Content -Path $script:LastRunFile
}

Export-ModuleMember -Function Initialize-LauncherLogging, Get-LauncherLogState, Write-Log, Write-Panel, Write-LauncherSummary
