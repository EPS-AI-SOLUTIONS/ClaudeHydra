# ======================================================================
# GEMINI CLI - HYDRA LAUNCHER
# Enhanced terminal experience with Ollama integration
# ======================================================================

param(
    [switch]$Yolo
)

$script:YoloEnabled = $false

# === FUNCTION: Get API Key with fallback chain ===
function Get-APIKey {
    param([string]$KeyName)

    # 1. Check .env file first
    $envFile = Join-Path $PSScriptRoot '.env'
    if (Test-Path $envFile) {
        $match = Get-Content $envFile | Where-Object { $_ -match "^$KeyName=" }
        if ($match) {
            $value = ($match -split '=', 2)[1].Trim().Trim([char]34, [char]39)
            if ($value) { return @{ Value = $value; Source = '.env' } }
        }
    }

    # 2. Check Process scope (current session)
    $processVal = [Environment]::GetEnvironmentVariable($KeyName, 'Process')
    if ($processVal) { return @{ Value = $processVal; Source = 'Process' } }

    # 3. Check User scope
    $userVal = [Environment]::GetEnvironmentVariable($KeyName, 'User')
    if ($userVal) { return @{ Value = $userVal; Source = 'User' } }

    # 4. Check Machine scope
    $machineVal = [Environment]::GetEnvironmentVariable($KeyName, 'Machine')
    if ($machineVal) { return @{ Value = $machineVal; Source = 'Machine' } }

    return $null
}

# === LOAD ENVIRONMENT ===
function Initialize-Environment
     {
    $envFile = Join-Path $PSScriptRoot '.env'
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim().Trim([char]34, [char]39)
                [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
        }
    }
}

function Get-OllamaHost {
    $ollamaHost = $env:OLLAMA_HOST
    if (-not $ollamaHost) { $ollamaHost = 'http://localhost:11434' }
    return $ollamaHost.TrimEnd('/')
}

function Test-LocalOllamaHost {
    param([string]$HostUrl)
    try {
        $uri = [Uri]$HostUrl
    } catch {
        return $false
    }
    $uriHost = $uri.Host.ToLowerInvariant()
    return $uriHost -in @('localhost', '127.0.0.1', '::1')
}

function Test-OllamaReady {
    param([string]$HostUrl)
    try {
        Invoke-RestMethod -Uri "$HostUrl/api/tags" -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Start-OllamaIfNeeded {
    $ollamaHost = Get-OllamaHost
    if (-not (Test-LocalOllamaHost -HostUrl $ollamaHost)) {
        return
    }

    if (Test-OllamaReady -HostUrl $ollamaHost) {
        return
    }

    $ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
    if (-not $ollamaCmd) {
        $script:MockOllama = Start-MockOllama
        return
    }

    $ollamaRunning = Get-Process -Name 'ollama' -ErrorAction SilentlyContinue
    if (-not $ollamaRunning) {
        Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
        Start-Sleep -Milliseconds 800
    }
}

# === MOCK OLLAMA ===
function Start-MockOllama {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:11434/")
    $listener.Start()
    Write-Host "Started mock Ollama server on localhost:11434" -ForegroundColor Green

    $job = Start-Job -ScriptBlock {
        param($listener)
        try {
            while ($listener.IsListening) {
                $context = $listener.GetContext()
                $reqPath = $context.Request.Url.AbsolutePath
                $response = $context.Response
                $response.ContentType = 'application/json'
                if ($reqPath -eq '/api/tags') {
                    $models = @(
                        @{
                            id = "mock:llama3"
                            object = "model"
                            created_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                            last_modified = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                            message = $null
                            name = "mock:llama3"
                            size = 8000000000
                            digest = "sha256:mock"
                            details = @{
                                format = "gguf"
                                family = "llama"
                                families = @("llama")
                                parameter_size = "8B"
                                quantization_level = "Q4_0"
                            }
                        }
                    )
                    $body = @{ models = $models } | ConvertTo-Json -Depth 10
                } else {
                    $body = @{ } | ConvertTo-Json
                }
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($body)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.Close()
            }
        } catch {
            Write-Error $_.Exception.Message
        } finally {
            $listener.Stop()
        }
    } -ArgumentList $listener

    Start-Sleep -Milliseconds 500
    return @{ Listener = $listener; Job = $job }
}

function Stop-MockOllama {
    param($MockData)
    if ($MockData) {
        if ($MockData.Job -and $MockData.Job.State -ne 'Completed') {
            Stop-Job $MockData.Job -PassThru | Remove-Job -Force
        }
        if ($MockData.Listener) {
            $MockData.Listener.Stop()
        }
    }
}

function Enable-YoloMode {
    $script:YoloEnabled = $true
    $env:HYDRA_YOLO = 'true'
    $env:QUEUE_MAX_CONCURRENT = '10'
    $env:QUEUE_MAX_RETRIES = '1'
    $env:QUEUE_TIMEOUT_MS = '15000'
    $env:HYDRA_RISK_BLOCKING = 'false'
}

function Resolve-StatusShell {
    $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
    if ($pwsh) { return $pwsh.Source }
    $powershell = Get-Command powershell -ErrorAction SilentlyContinue
    if ($powershell) { return $powershell.Source }
    return $null
}

function Start-StatusMonitor {
    param(
        [string]$OllamaHost,
        [string]$ApiKeyMask
    )

    $shell = Resolve-StatusShell
    if (-not $shell) {
        return $null
    }

    if (-not $OllamaHost) { $OllamaHost = 'http://localhost:11434' }
    if (-not $ApiKeyMask) { $ApiKeyMask = 'missing' }

    $env:HYDRA_STATUS_HOST = $OllamaHost
    $env:HYDRA_STATUS_API_MASK = $ApiKeyMask

    $statusScript = @'
$ErrorActionPreference = 'SilentlyContinue'
$Host.UI.RawUI.WindowTitle = 'HYDRA Status'
$ollamaHost = $env:HYDRA_STATUS_HOST
$apiMask = $env:HYDRA_STATUS_API_MASK
while ($true) {
    $models = 0
    try {
        $resp = Invoke-RestMethod -Uri "$ollamaHost/api/tags" -TimeoutSec 2
        if ($resp.models) { $models = $resp.models.Count }
    } catch {
        $models = 0
    }
    $time = (Get-Date).ToString('HH:mm:ss')
    if ($models -gt 0) { $ollamaText = "$models models" } else { $ollamaText = 'down' }
    $line = "[{0}] Ollama: {1} | API: {2}" -f $time, $ollamaText, $apiMask
    if ($line.Length -lt 80) { $line = $line.PadRight(80) }
    Write-Host -NoNewline "`r$line"
    Start-Sleep -Seconds 5
}
'@

    return Start-Process -FilePath $shell -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        $statusScript
    ) -PassThru
}

function Stop-StatusMonitor {
    param([System.Diagnostics.Process]$Process)
    if ($Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-GeminiCli {
    param([string[]]$Arguments)

    try {
        npm exec --yes --package @google/gemini-cli --package @google/gemini-cli-core -- gemini @Arguments
        $script:GeminiExitCode = $LASTEXITCODE
    } catch {
        $script:GeminiExitCode = 1
    }
}

function Start-GeminiCli {
    param([string[]]$Arguments)

    $attempt = 0
    $maxRestarts = if ($script:YoloEnabled) { 5 } else { 3 }
    $delaySeconds = if ($script:YoloEnabled) { 1 } else { 3 }



    while ($true) {
        $attempt++
        Write-Host "  Starting Gemini CLI (attempt $attempt/$maxRestarts)..." -ForegroundColor $colors.Secondary
        Invoke-GeminiCli -Arguments $Arguments | Out-Host
        $exitCode = $script:GeminiExitCode
        if ($exitCode -eq 0 -or $exitCode -eq 42 -or $exitCode -eq 130) {
            return $exitCode
        }
        if ($attempt -ge $maxRestarts) {
            return $exitCode
        }
        Write-Host "  Gemini CLI exited with code $exitCode. Auto-resume in $delaySeconds s..." -ForegroundColor $colors.Warning
        Start-Sleep -Seconds $delaySeconds
    }
}

# === COLORS ===
$colors = @{
    Primary   = 'Blue'
    Secondary = 'Cyan'
    Accent    = 'Yellow'
    Success   = 'Green'
    Warning   = 'DarkYellow'
    Error     = 'Red'
    Muted     = 'DarkGray'
    Text      = 'White'
}

# === SPLASH SCREEN ===
function Show-SplashScreen {
    Clear-Host
    $modeLabel = if ($script:YoloEnabled) { 'YOLO MODE: ON' } else { 'Standard Mode' }
    $splash = @"

    GEMINI CLI (HYDRA)
    Ollama + Prompt Optimizer
    Speculative Decoding Engine
    v2.2.0 | MCP Server
    $modeLabel

"@
    Write-Host $splash
    Write-Host ""
}

# === STATUS BAR ===
function Show-StatusBar {
    Write-Host "  +-------------------------------------------------------------+" -ForegroundColor $colors.Muted

    # Working Directory
    $dir = (Get-Location).Path
    if ($dir.Length -gt 45) { $dir = "..." + $dir.Substring($dir.Length - 42) }
    Write-Host "  | " -NoNewline -ForegroundColor $colors.Muted
    Write-Host "DIR " -NoNewline
    Write-Host $dir.PadRight(56) -NoNewline -ForegroundColor $colors.Text
    Write-Host " |" -ForegroundColor $colors.Muted

    Write-Host "  +-------------------------------------------------------------+" -ForegroundColor $colors.Muted

    # Ollama Status
    Write-Host "  | " -NoNewline -ForegroundColor $colors.Muted
    $ollamaHost = Get-OllamaHost
    $ollamaStatus = try {
        $response = Invoke-RestMethod -Uri "$ollamaHost/api/tags" -TimeoutSec 2
        $response.models.Count
    } catch { 0 }

    if ($ollamaStatus -gt 0) {
        Write-Host "Ollama: " -NoNewline
        Write-Host "$ollamaStatus models ready".PadRight(44) -NoNewline -ForegroundColor $colors.Success
    } else {
        Write-Host "Ollama: " -NoNewline
        Write-Host "Not responding".PadRight(44) -NoNewline -ForegroundColor $colors.Error
    }
    Write-Host " |" -ForegroundColor $colors.Muted

    # API Key Status
    Write-Host "  | " -NoNewline -ForegroundColor $colors.Muted
    $apiKey = Get-APIKey -KeyName 'GEMINI_API_KEY'
    if ($apiKey) {
        $masked = $apiKey.Value.Substring(0, [Math]::Min(12, $apiKey.Value.Length)) + "..."
        Write-Host "API Key: " -NoNewline
        Write-Host "$masked ($($apiKey.Source))".PadRight(44) -NoNewline -ForegroundColor $colors.Success
    } else {
        Write-Host "API Key: " -NoNewline
        Write-Host "Not found".PadRight(44) -NoNewline -ForegroundColor $colors.Warning
    }
    Write-Host " |" -ForegroundColor $colors.Muted

    # Mode
    Write-Host "  | " -NoNewline -ForegroundColor $colors.Muted
    $modeText = if ($script:YoloEnabled) { 'YOLO' } else { 'STANDARD' }
    Write-Host "Mode: " -NoNewline
    Write-Host $modeText.PadRight(47) -NoNewline -ForegroundColor $colors.Accent
    Write-Host " |" -ForegroundColor $colors.Muted

    # MCP Status
    Write-Host "  | " -NoNewline -ForegroundColor $colors.Muted
    Write-Host "MCP: " -NoNewline
    Write-Host "ollama-hydra, serena, desktop-commander, playwright".PadRight(47) -NoNewline -ForegroundColor $colors.Secondary
    Write-Host " |" -ForegroundColor $colors.Muted

    Write-Host "  +-------------------------------------------------------------+" -ForegroundColor $colors.Muted
    Write-Host ""
}

# === TIPS ===
function Show-Tips {
    $tips = @(
        "TIP: Use /help to see available commands",
        "TIP: Type /ollama to switch to local Ollama models",
        "TIP: Use /gemini:models to list available Gemini models",
        "TIP: Try /queue:status to check prompt queue",
        "TIP: Press Ctrl+C to cancel current generation"
    )
    $tip = $tips | Get-Random
    Write-Host "  $tip" -ForegroundColor $colors.Muted
    Write-Host ""
}

# === MAIN ===
Initialize-Environment
if ($Yolo) { Enable-YoloMode }
Start-OllamaIfNeeded

Set-Location $PSScriptRoot
$Host.UI.RawUI.WindowTitle = 'Gemini CLI (HYDRA)'

Show-SplashScreen
Show-StatusBar
Show-Tips

$apiKey = Get-APIKey -KeyName 'GEMINI_API_KEY'
$apiMask = if ($apiKey) { $apiKey.Value.Substring(0, [Math]::Min(12, $apiKey.Value.Length)) + "..." } else { 'missing' }
$statusProcess = Start-StatusMonitor -OllamaHost (Get-OllamaHost) -ApiKeyMask $apiMask

Write-Host "  Starting Gemini CLI..." -ForegroundColor $colors.Secondary
Write-Host ""

$exitCode = Start-GeminiCli -Arguments $args

Stop-MockOllama -MockData $script:MockOllama
Stop-StatusMonitor -Process $statusProcess

Write-Host ""
Write-Host "  -------------------------------------------------------------" -ForegroundColor $colors.Muted
Write-Host "  Gemini CLI session ended (code: $exitCode)." -ForegroundColor $colors.Accent
Write-Host ""
Write-Host "  ================================" -ForegroundColor $colors.Muted
Write-Host "  THE END" -ForegroundColor $colors.Accent
Write-Host ""
Read-Host "Press Enter to exit..."
Write-Host "  ================================" -ForegroundColor $colors.Muted
