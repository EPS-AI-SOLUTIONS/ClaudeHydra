<#
.SYNOPSIS
    Display AI Health Dashboard (providers, status, tokens, cost).
#>

[CmdletBinding()]
param(
    [switch]$Json
)

$ErrorActionPreference = "Stop"
$ModulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"

Import-Module $ModulePath -Force

$health = Get-AIHealth

if ($Json) {
    $health | ConvertTo-Json -Depth 10
    return
}

Write-Host "`n=== Panel zdrowia AI ===" -ForegroundColor Cyan
foreach ($provider in $health.providers) {
    $status = if ($provider.enabled -and $provider.hasKey) { "OK" } else { "BRAK KLUCZA / WYŁĄCZONY" }
    $color = if ($provider.enabled -and $provider.hasKey) { "Green" } else { "Yellow" }
    Write-Host "`n[$($provider.name)] $status" -ForegroundColor $color

    foreach ($model in $provider.models) {
        $tokenText = "$($model.tokens.percent)%"
        $costText = "`$" + $model.usage.totalCost
        Write-Host "  $($model.name) [$($model.tier)] tokeny: $tokenText, koszt: $costText" -ForegroundColor Gray
    }
}
