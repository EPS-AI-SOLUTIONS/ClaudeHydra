function Test-Network {
    try {
        if (Get-Command Test-Connection -ErrorAction SilentlyContinue) {
            return Test-Connection -ComputerName "1.1.1.1" -Count 1 -Quiet -ErrorAction SilentlyContinue
        }
    } catch {
        return $false
    }

    return $false
}

function Get-RequiredEnvVars {
    @(
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GOOGLE_API_KEY",
        "MISTRAL_API_KEY",
        "GROQ_API_KEY",
        "CLAUDECLI_ENCRYPTION_KEY"
    )
}

function Check-Requirements {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Profile,
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    Write-Host "Checking requirements..." -ForegroundColor Gray
    Write-Log "Running preflight checks for profile: $Profile"

    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        Write-Panel -Title "PowerShell Version" -Color Yellow -Lines @(
            "PowerShell 7+ recommended for full parallel features.",
            "Install: https://learn.microsoft.com/powershell/"
        )
        Write-Log "PowerShell version below 7 detected." "WARN"
    }

    # Check Environment Variables
    $requiredVars = Get-RequiredEnvVars
    $missingVars = $requiredVars | Where-Object { -not $env:$_ }
    if ($missingVars.Count -gt 0) {
        Write-Panel -Title "Missing Environment Variables" -Color Yellow -Lines @(
            ($missingVars -join ", "),
            "Copy fix command:",
            "  [Environment]::SetEnvironmentVariable('<NAME>', '<VALUE>', 'User')"
        )
        Write-Log ("Missing environment variables: {0}" -f ($missingVars -join ", ")) "WARN"
    }

    if ($Profile -eq "Offline") {
        $env:HYDRA_OFFLINE = "1"
        Write-Log "Offline profile selected; HYDRA_OFFLINE=1"
    } else {
        $online = Test-Network
        if (-not $online) {
            $env:HYDRA_OFFLINE = "1"
            Write-Panel -Title "Offline Mode" -Color Yellow -Lines @(
                "Network check failed. Switching to offline mode.",
                "Set Profile Offline to skip this check."
            )
            Write-Log "Network check failed; switching to offline mode." "WARN"
        }
    }

    $aiInit = Join-Path $Root "ai-handler\Initialize-AIHandler.ps1"
    if (-not (Test-Path $aiInit)) {
        Write-Panel -Title "Missing AI Handler" -Color Red -Lines @(
            "Expected: $aiInit",
            "Reinstall or restore ai-handler directory."
        )
        Write-Log "AI handler init script missing at $aiInit" "ERROR"
        throw "AI handler init script not found."
    }
}

Export-ModuleMember -Function Test-Network, Get-RequiredEnvVars, Check-Requirements
