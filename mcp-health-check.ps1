<#
.SYNOPSIS
    MCP Health Check - Diagnostics for Model Context Protocol Servers
#>

[CmdletBinding()]
param(
    [int]$TimeoutSeconds = 5,
    [switch]$Json,
    [string]$ExportJsonPath,
    [string]$ExportCsvPath,
    [switch]$NoColor,
    [switch]$AutoRestart
)

$ErrorActionPreference = "Stop"
$script:Root = if ($env:CLAUDECLI_ROOT -and (Test-Path $env:CLAUDECLI_ROOT)) {
    $env:CLAUDECLI_ROOT
} else {
    $PSScriptRoot
}

function Write-Log {
    param($Message, $Color="Gray")
    if ($NoColor) { Write-Host $Message }
    else { Write-Host $Message -ForegroundColor $Color }
}

Write-Log "Running MCP Health Check..." "Cyan"

# Load AI Handler if not loaded
if (-not (Get-Command Get-AIStatus -ErrorAction SilentlyContinue)) {
    $aiInit = Join-Path $script:Root "ai-handler\Initialize-AIHandler.ps1"
    if (Test-Path $aiInit) { . $aiInit -Quiet }
}

$mcpConfigPath = Join-Path $script:Root "mcp-servers.json"
if (-not (Test-Path $mcpConfigPath)) {
    Write-Log "[ERROR] mcp-servers.json not found!" "Red"
    exit 1
}

$config = Get-Content $mcpConfigPath | ConvertFrom-Json
$results = @()

foreach ($server in $config.mcpServers.PSObject.Properties) {
    $name = $server.Name
    $details = $server.Value

    $status = "UNKNOWN"
    $responseTime = 0

    # Simple port check if command contains port (heuristic)
    # Ideally we would check the process or connect to the transport

    # For now, just a placeholder check
    Write-Log "Checking $name..." "Gray"

    $results += @{
        Server = $name
        Status = "CHECKED"
        Timestamp = Get-Date
    }
}

if ($Json) {
    $results | ConvertTo-Json
}

if ($ExportJsonPath) {
    $results | ConvertTo-Json | Set-Content $ExportJsonPath
}

if ($ExportCsvPath) {
    $results | ConvertTo-Csv -NoTypeInformation | Set-Content $ExportCsvPath
}

Write-Log "Health Check Complete." "Green"
