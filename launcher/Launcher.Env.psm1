function Import-EnvFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    $envFile = Join-Path $Root ".env"
    if (-not (Test-Path $envFile)) {
        return
    }

    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*#") { return }
        if ($_ -match "^\s*$") { return }
        $pair = $_ -split "=", 2
        if ($pair.Count -eq 2) {
            $name = $pair[0].Trim()
            $value = $pair[1].Trim().Trim('"')
            if (-not $env:$name) {
                $env:$name = $value
            }
        }
    }
}

Export-ModuleMember -Function Import-EnvFile
