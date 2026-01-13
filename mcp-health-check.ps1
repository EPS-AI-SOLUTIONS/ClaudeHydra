# HYDRA 10.0 - MCP Health Check (Parallel Execution)
# Checks all MCP servers in parallel and restarts if needed
# Path: C:\Users\BIURODOM\Desktop\ClaudeCLI\mcp-health-check.ps1

#Requires -Version 5.1

[CmdletBinding()]
param(
    [int]$TimeoutSeconds = 5,
    [int]$RetryCount = 3,
    [int]$RetryBaseDelayMs = 200,
    [string]$HostName = "127.0.0.1",
    [string[]]$Server = @(),
    [switch]$NoColor,
    [switch]$Json,
    [string]$ExportJsonPath,
    [string]$ExportCsvPath,
    [string]$LogPath,
    [switch]$AutoRestart
)

# Error handling zgodnie z Protocols (CLAUDE.md sekcja 6)
$ErrorActionPreference = "Stop"

# Absolute paths zgodnie z Best Practices (CLAUDE.md sekcja 7)
# Prefer env override for portability in CI or custom installs.
$ProjectRoot = if ($env:CLAUDECLI_ROOT) {
    $env:CLAUDECLI_ROOT
} elseif ($PSScriptRoot) {
    $PSScriptRoot
} else {
    (Get-Location).Path
}

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Nie znaleziono katalogu projektu: $ProjectRoot"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path

$aiHandlerInit = Join-Path $ProjectRoot "ai-handler\\Initialize-AIHandler.ps1"
if (Test-Path -LiteralPath $aiHandlerInit) {
    # Initialize AI Handler on startup.
    . $aiHandlerInit
}

$LogDirectory = Join-Path $ProjectRoot "logs"
if (-not $LogPath) {
    if (-not (Test-Path -LiteralPath $LogDirectory)) {
        New-Item -Path $LogDirectory -ItemType Directory -Force | Out-Null
    }
$LogPath = Join-Path $LogDirectory ("mcp-health-check-{0}.log" -f (Get-Date -Format "yyyyMMdd"))
}

function Get-McpServerConfig {
    $configPath = Join-Path $ProjectRoot "mcp-servers.json"
    if (Test-Path -LiteralPath $configPath) {
        try {
            return Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        } catch {
            throw "Nieprawidłowy plik konfiguracji MCP: $configPath"
        }
    }

    return @(
        @{
            Name = "Serena"
            Port = 9000
            Type = "Port"
            HealthUrl = "http://localhost:9000/sse"
            CommandName = "serena"
            TimeoutSeconds = 5
        },
        @{
            Name = "Desktop-Commander"
            Port = 8100
            Type = "Stdio"
            ProcessName = "desktop-commander"
            CommandName = "desktop-commander"
            TimeoutSeconds = 5
        },
        @{
            Name = "Playwright"
            Port = 5200
            Type = "Stdio"
            ProcessName = "playwright"
            CommandName = "playwright"
            TimeoutSeconds = 5
        }
    )
}

# Configuration - MCP servers (CLAUDE.md sekcja 1 - MCP Tools)
$mcpServers = Get-McpServerConfig

function Write-ColorLog {
    param(
        [string]$Message,
        [ValidateSet("White", "Cyan", "Green", "Yellow", "Red", "Gray", "Magenta")]
        [string]$Color = "White",
        [ValidateSet("debug", "info", "warn", "error")]
        [string]$Level = "info"
    )

    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $prefix = "[{0}] [HYDRA] [{1}]" -f $timestamp, $Level.ToUpperInvariant()
    $line = "$prefix $Message"

    if (-not $NoColor) {
        Write-Host $line -ForegroundColor $Color
    } else {
        Write-Host $line
    }

    Add-Content -LiteralPath $LogPath -Value $line
}

function Write-JsonLog {
    param(
        [string]$Message,
        [ValidateSet("debug", "info", "warn", "error")]
        [string]$Level = "info",
        [hashtable]$Data = @{}
    )

    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        level = $Level
        message = $Message
    }

    if ($Data.Keys.Count -gt 0) {
        $payload.data = $Data
    }

    $jsonLine = $payload | ConvertTo-Json -Compress
    Write-Host $jsonLine
    Add-Content -LiteralPath $LogPath -Value $jsonLine
}

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("White", "Cyan", "Green", "Yellow", "Red", "Gray", "Magenta")]
        [string]$Color = "White",
        [ValidateSet("debug", "info", "warn", "error")]
        [string]$Level = "info",
        [hashtable]$Data = @{}
    )

    if ($Json) {
        Write-JsonLog -Message $Message -Level $Level -Data $Data
    } else {
        Write-ColorLog -Message $Message -Color $Color -Level $Level
    }
}

function Get-CommandVersion {
    param(
        [string]$CommandName
    )

    try {
        $command = Get-Command $CommandName -ErrorAction Stop
        if ($command.Version) {
            return $command.Version.ToString()
        }
        if ($command.Source -and (Test-Path -LiteralPath $command.Source)) {
            return (Get-Item -LiteralPath $command.Source).VersionInfo.FileVersion
        }
    } catch {
        return $null
    }

    return $null
}

function Get-ServerVersion {
    param(
        [psobject]$Server
    )

    if ($Server.CommandName) {
        return Get-CommandVersion -CommandName $Server.CommandName
    }

    if ($Server.ProcessName) {
        return Get-CommandVersion -CommandName $Server.ProcessName
    }

    return $null
}

function Restart-ServerProcess {
    param(
        [psobject]$Server
    )

    if (-not $AutoRestart) {
        return @{ Attempted = $false; Message = "Auto-restart wyłączony." }
    }

    if (-not $Server.ProcessName) {
        return @{ Attempted = $false; Message = "Brak skonfigurowanej nazwy procesu." }
    }

    $attempts = 0
    $maxAttempts = 3
    $delayMs = 300

    while ($attempts -lt $maxAttempts) {
        $attempts++
        try {
            $processes = Get-Process -Name $Server.ProcessName -ErrorAction SilentlyContinue
            if ($processes) {
                $processes | Stop-Process -Force
            }
            Start-Sleep -Milliseconds $delayMs
            Start-Process $Server.ProcessName | Out-Null
            return @{ Attempted = $true; Message = "Wydano polecenie restartu (próba $attempts)." }
        } catch {
            $delayMs = [Math]::Min($delayMs * 2, 2000)
            if ($attempts -ge $maxAttempts) {
                return @{ Attempted = $true; Message = $_.Exception.Message }
            }
            Start-Sleep -Milliseconds $delayMs
        }
    }
}

function Resolve-Servers {
    param(
        [array]$Servers,
        [string[]]$Names
    )

    if (-not $Names -or $Names.Count -eq 0) {
        return $Servers
    }

    $filtered = $Servers | Where-Object { $Names -contains $_.Name }
    if (-not $filtered) {
        throw "Brak pasujących serwerów: $($Names -join ', ')"
    }

    return $filtered
}

$jobInit = {
    function Test-Port {
        param(
            [string]$TargetHost,
            [int]$Port,
            [int]$TimeoutSeconds,
            [int]$RetryCount,
            [int]$RetryBaseDelayMs
        )

        $attempt = 0
        $latencyMs = $null
        while ($attempt -lt $RetryCount) {
            $attempt++
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            try {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $asyncResult = $tcp.BeginConnect($TargetHost, $Port, $null, $null)
                $success = $asyncResult.AsyncWaitHandle.WaitOne($TimeoutSeconds * 1000, $false)

                if ($success) {
                    $tcp.EndConnect($asyncResult)
                    $tcp.Close()
                    $stopwatch.Stop()
                    $latencyMs = [Math]::Round($stopwatch.Elapsed.TotalMilliseconds, 2)
                    return @{ Success = $true; LatencyMs = $latencyMs; Attempts = $attempt }
                }

                $tcp.Close()
                $stopwatch.Stop()
            } catch {
                $stopwatch.Stop()
            }

            if ($attempt -lt $RetryCount) {
                $delay = [Math]::Min($RetryBaseDelayMs * [Math]::Pow(2, $attempt - 1), 2000)
                Start-Sleep -Milliseconds $delay
            }
        }

        return @{ Success = $false; LatencyMs = $null; Attempts = $attempt }
    }

    function Test-HttpHealth {
        param(
            [string]$Url,
            [int]$TimeoutSeconds
        )

        try {
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -Method Get
            $stopwatch.Stop()
            return @{ Success = $true; StatusCode = $response.StatusCode; LatencyMs = [Math]::Round($stopwatch.Elapsed.TotalMilliseconds, 2) }
        } catch {
            return @{ Success = $false; StatusCode = $null; LatencyMs = $null; Error = $_.Exception.Message }
        }
    }
}

$psVersion = $PSVersionTable.PSVersion.Major
if ($psVersion -lt 7) {
    Write-Log -Message "Wykryto PowerShell $psVersion. Zalecany PowerShell 7+ dla lepszej kompatybilności." -Color "Yellow" -Level "warn"
}

# Header
Write-Host ""
Write-Log -Message "=============================================================" -Color "Cyan"
Write-Log -Message "     HYDRA MCP Health Check (Parallel Mode)                " -Color "Cyan"
Write-Log -Message "=============================================================" -Color "Cyan"
Write-Log -Message "Katalog projektu: $ProjectRoot" -Color "Gray"
Write-Host ""

try {
    # PARALLEL EXECUTION (CLAUDE.md sekcja 1 - Zasada Nadrzedna)
    # "Kazda operacja, ktora moze byc wykonana rownolegle, MUSI byc wykonana rownolegle."

    Write-Log -Message "Uruchamiam równoległe sprawdzenie wszystkich serwerów MCP..." -Color "Cyan"
    Write-Host ""

    $targets = Resolve-Servers -Servers $mcpServers -Names $Server

    # Start parallel jobs for all servers
    $jobs = @()

    foreach ($server in $targets) {
        $job = Start-Job -InitializationScript $jobInit -ArgumentList $server, $TimeoutSeconds, $RetryCount, $RetryBaseDelayMs, $HostName -ScriptBlock {
            param($server, $defaultTimeout, $retryCount, $retryBaseDelayMs, $hostName)

            $timeout = if ($server.TimeoutSeconds) { $server.TimeoutSeconds } else { $defaultTimeout }
            $result = @{
                Name = $server.Name
                Port = $server.Port
                Type = $server.Type
                Status = "Unknown"
                Message = ""
                Attempts = 0
                LatencyMs = $null
                HttpStatus = $null
                Error = $null
            }

            if ($server.Type -eq "Port" -and $server.Port) {
                if ($server.HealthUrl) {
                    $healthUrl = $server.HealthUrl -replace "localhost", $hostName -replace "127.0.0.1", $hostName
                    $healthResult = Test-HttpHealth -Url $healthUrl -TimeoutSeconds $timeout
                    $result.Attempts = 1
                    if ($healthResult.Success) {
                        $result.Status = "Healthy"
                        $result.Message = "HTTP OK"
                        $result.LatencyMs = $healthResult.LatencyMs
                        $result.HttpStatus = $healthResult.StatusCode
                    } else {
                        $result.Status = "Down"
                        $result.Message = "Błąd sprawdzenia HTTP"
                        $result.Error = $healthResult.Error
                    }
                } else {
                    $portResult = Test-Port -TargetHost $hostName -Port $server.Port -TimeoutSeconds $timeout -RetryCount $retryCount -RetryBaseDelayMs $retryBaseDelayMs
                    $result.Attempts = $portResult.Attempts
                    if ($portResult.Success) {
                        $result.Status = "Healthy"
                        $result.Message = "Działa na porcie $($server.Port)"
                        $result.LatencyMs = $portResult.LatencyMs
                    } else {
                        $result.Status = "Down"
                        $result.Message = "Brak odpowiedzi na porcie $($server.Port)"
                    }
                }
            } else {
                # Stdio server - starts with Claude automatically
                $result.Status = "Stdio"
                $result.Message = "Transport stdio (uruchamia się z Claude)"
            }

            return $result
        }

        $jobs += $job
        Write-Log -Message "  > Rozpoczęto sprawdzenie: $($server.Name)" -Color "Gray" -Level "debug"
    }

    Write-Host ""
    Write-Log -Message "Czekam na zakończenie sprawdzeń równoległych..." -Color "Yellow"

    # Wait for all jobs to complete (parallel wait)
    $results = $jobs | Wait-Job | Receive-Job
    $jobs | Remove-Job

    Write-Host ""
    Write-Log -Message "=============================================================" -Color "Gray"
    Write-Log -Message "WYNIKI:" -Color "Cyan"
    Write-Log -Message "=============================================================" -Color "Gray"
    Write-Host ""

    # Display results
    $healthyCount = 0
    $downCount = 0
    $stdioCount = 0

    foreach ($result in $results) {
        $statusIcon = switch ($result.Status) {
            "Healthy" { "[OK]"; $healthyCount++ }
            "Down"    { "[XX]"; $downCount++ }
            "Stdio"   { "[--]"; $stdioCount++ }
            "Error"   { "[ER]"; $downCount++ }
            default   { "[??]" }
        }

        $color = switch ($result.Status) {
            "Healthy" { "Green" }
            "Down"    { "Red" }
            "Stdio"   { "Gray" }
            "Error"   { "Red" }
            default   { "Yellow" }
        }

        $data = @{
            name = $result.Name
            status = $result.Status
            port = $result.Port
            attempts = $result.Attempts
            latency_ms = $result.LatencyMs
            http_status = $result.HttpStatus
            error = $result.Error
        }

        Write-Log -Message "$statusIcon $($result.Name)" -Color $color -Data $data
        Write-Log -Message "    $($result.Message)" -Color "Gray" -Data $data

        if ($result.Port) {
            Write-Log -Message "    Port: $($result.Port)" -Color "Gray" -Data $data
        }

        if ($result.LatencyMs) {
            Write-Log -Message "    Opóźnienie: $($result.LatencyMs) ms" -Color "Gray" -Data $data
        }

        if ($result.HttpStatus) {
            Write-Log -Message "    HTTP: $($result.HttpStatus)" -Color "Gray" -Data $data
        }

        if ($result.Error) {
            Write-Log -Message "    Błąd: $($result.Error)" -Color "Red" -Level "error" -Data $data
        }

        $serverConfig = $targets | Where-Object { $_.Name -eq $result.Name }
        $serverVersion = if ($serverConfig) { Get-ServerVersion -Server $serverConfig } else { $null }
        if ($serverVersion) {
            Write-Log -Message "    Wersja: $serverVersion" -Color "Gray" -Data $data
        }

        if ($result.Status -eq "Down") {
            $restartResult = Restart-ServerProcess -Server ($targets | Where-Object { $_.Name -eq $result.Name })
            if ($restartResult.Attempted) {
                Write-Log -Message "    Restart: $($restartResult.Message)" -Color "Yellow" -Level "warn" -Data $data
            }
        }

        Write-Host ""
    }

    # Summary
    Write-Log -Message "=============================================================" -Color "Gray"
    Write-Log -Message "PODSUMOWANIE:" -Color "Cyan"
    Write-Log -Message "  * Zdrowe: $healthyCount" -Color "Green"
    Write-Log -Message "  * Niedostępne: $downCount" -Color "Red"
    Write-Log -Message "  * Stdio: $stdioCount" -Color "Gray"
    Write-Log -Message "  * Razem: $($results.Count)" -Color "Cyan"
    Write-Host ""

    if ($downCount -gt 0) {
        Write-Log -Message "UWAGA: część serwerów MCP jest niedostępna. Może być potrzebny ręczny restart." -Color "Yellow" -Level "warn"
    } else {
        Write-Log -Message "SUKCES: wszystkie serwery MCP działają lub są zarządzane przez Claude." -Color "Green"
    }

    if ($ExportJsonPath) {
        $results | ConvertTo-Json -Depth 5 | Out-File -FilePath $ExportJsonPath -Encoding utf8
        Write-Log -Message "Wyeksportowano wyniki do JSON: $ExportJsonPath" -Color "Gray"
    }

    if ($ExportCsvPath) {
        $results | Export-Csv -Path $ExportCsvPath -NoTypeInformation
        Write-Log -Message "Wyeksportowano wyniki do CSV: $ExportCsvPath" -Color "Gray"
    }

    Write-Host ""

} catch {
    Write-Host ""
    Write-Log -Message "=============================================================" -Color "Red" -Level "error"
    Write-Log -Message "BŁĄD: $($_.Exception.Message)" -Color "Red" -Level "error"
    Write-Log -Message "Ślad stosu: $($_.ScriptStackTrace)" -Color "Gray" -Level "error"
    Write-Host ""
    exit 1
}
