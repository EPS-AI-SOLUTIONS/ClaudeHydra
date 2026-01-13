#Requires -Version 5.1
<#
.SYNOPSIS
    Secure storage helpers for ClaudeCLI.
.DESCRIPTION
    Provides AES-256 encryption, atomic writes, and JSON logging utilities.
.NOTES
    Author: HYDRA System
    Version: 1.0.0
#>

$script:LogDirectory = Join-Path (Split-Path $PSScriptRoot) "..\logs"

function ConvertTo-Hashtable {
    param([Parameter(ValueFromPipeline)]$InputObject)
    process {
        if ($null -eq $InputObject) { return $null }
        if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
            $collection = @(foreach ($object in $InputObject) { ConvertTo-Hashtable $object })
            return ,$collection
        } elseif ($InputObject -is [psobject]) {
            $hash = @{}
            foreach ($property in $InputObject.PSObject.Properties) {
                $hash[$property.Name] = ConvertTo-Hashtable $property.Value
            }
            return $hash
        } else {
            return $InputObject
        }
    }
}

function Initialize-LogDirectory {
    if (-not (Test-Path -LiteralPath $script:LogDirectory)) {
        New-Item -Path $script:LogDirectory -ItemType Directory -Force | Out-Null
    }
}

function Write-AILog {
    <#
    .SYNOPSIS
        Write a structured JSON log line for AI operations.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,
        [ValidateSet("debug", "info", "warn", "error")]
        [string]$Level = "info",
        [hashtable]$Data = @{}
    )

    Initialize-LogDirectory
    $logPath = Join-Path $script:LogDirectory ("ai-handler-{0}.log" -f (Get-Date -Format "yyyyMMdd"))

    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        level = $Level
        message = $Message
    }

    if ($Data.Keys.Count -gt 0) {
        $payload.data = $Data
    }

    $payload | ConvertTo-Json -Compress | Add-Content -LiteralPath $logPath
}

function Get-EncryptionKey {
    <#
    .SYNOPSIS
        Returns a 32-byte AES key derived from CLAUDECLI_ENCRYPTION_KEY.
    #>
    [CmdletBinding()]
    param()

    $rawKey = $env:CLAUDECLI_ENCRYPTION_KEY
    if (-not $rawKey) {
        Write-AILog -Level "error" -Message "Missing CLAUDECLI_ENCRYPTION_KEY environment variable."
        throw "Brak zmiennej CLAUDECLI_ENCRYPTION_KEY w środowisku. Ustaw klucz szyfrowania."
    }

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($rawKey)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    return $sha.ComputeHash($bytes)
}

function Protect-JsonPayload {
    <#
    .SYNOPSIS
        Encrypt a JSON payload using AES-256-CBC.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Json
    )

    $key = Get-EncryptionKey
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Key = $key
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.GenerateIV()

    $encryptor = $aes.CreateEncryptor()
    $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
    $cipherBytes = $encryptor.TransformFinalBlock($plainBytes, 0, $plainBytes.Length)

    return @{
        encrypted = $true
        algorithm = "AES-256-CBC"
        iv = [Convert]::ToBase64String($aes.IV)
        data = [Convert]::ToBase64String($cipherBytes)
    }
}

function Unprotect-JsonPayload {
    <#
    .SYNOPSIS
        Decrypt a JSON payload using AES-256-CBC.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [hashtable]$Payload
    )

    $key = Get-EncryptionKey
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Key = $key
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.IV = [Convert]::FromBase64String($Payload.iv)

    $decryptor = $aes.CreateDecryptor()
    $cipherBytes = [Convert]::FromBase64String($Payload.data)
    $plainBytes = $decryptor.TransformFinalBlock($cipherBytes, 0, $cipherBytes.Length)

    return [System.Text.Encoding]::UTF8.GetString($plainBytes)
}

function Write-AtomicFile {
    <#
    .SYNOPSIS
        Write a file atomically with exclusive access.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string]$Content
    )

    $directory = Split-Path $Path
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -Path $directory -ItemType Directory -Force | Out-Null
    }

    $tempPath = "$Path.tmp"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Content)

    $stream = [System.IO.File]::Open($tempPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
        $stream.Write($bytes, 0, $bytes.Length)
    } finally {
        $stream.Close()
    }

    Move-Item -LiteralPath $tempPath -Destination $Path -Force
}

function Read-EncryptedJson {
    <#
    .SYNOPSIS
        Read a JSON file that may be encrypted.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $raw = Get-Content -LiteralPath $Path -Raw
    if (-not $raw) { return $null }

    $parsed = $raw | ConvertFrom-Json
    if ($parsed.PSObject.Properties['encrypted'] -and $parsed.encrypted -eq $true) {
        $decryptedJson = Unprotect-JsonPayload -Payload (ConvertTo-Hashtable $parsed)
        return $decryptedJson | ConvertFrom-Json | ConvertTo-Hashtable
    }

    return $parsed | ConvertTo-Hashtable
}

function Write-EncryptedJson {
    <#
    .SYNOPSIS
        Write a JSON file encrypted with AES-256-CBC.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$Data,
        [Parameter(Mandatory)]
        [string]$Path
    )

    $json = $Data | ConvertTo-Json -Depth 10
    $payload = Protect-JsonPayload -Json $json
    Write-AtomicFile -Path $Path -Content ($payload | ConvertTo-Json -Depth 6)
    Write-AILog -Message "Encrypted JSON written." -Level "info" -Data @{ path = $Path }
}

Export-ModuleMember -Function @(
    'Write-AILog',
    'Write-AtomicFile',
    'Read-EncryptedJson',
    'Write-EncryptedJson',
    'Get-EncryptionKey'
)
