# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI CLI - CUSTOM PROFILE
# Isolated profile for GeminiCLI (does not load user's default profile)
# ═══════════════════════════════════════════════════════════════════════════════

# === PSReadLine Configuration ===
if (Get-Module -Name PSReadLine -ErrorAction SilentlyContinue) {
    # Double-Escape as interrupt
    $script:lastEscapeTime = [DateTime]::MinValue
    Set-PSReadLineKeyHandler -Key Escape -ScriptBlock {
        $now = [DateTime]::Now
        $diff = ($now - $script:lastEscapeTime).TotalMilliseconds
        if ($diff -lt 400) {
            [Microsoft.PowerShell.PSConsoleReadLine]::CancelLine()
            [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
        } else {
            [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
        }
        $script:lastEscapeTime = $now
    }

    # Ctrl+C trap
    Set-PSReadLineKeyHandler -Key Ctrl+c -ScriptBlock {
        $line = $null
        $cursor = $null
        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
        if ($line.Length -gt 0) {
            [Microsoft.PowerShell.PSConsoleReadLine]::CancelLine()
        } else {
            Write-Host "`n[Ctrl+C] Use 'exit' to quit or Double-Escape to interrupt" -ForegroundColor Yellow
            [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
        }
    }

    # Alt+t to toggle Deep Thinking
    Set-PSReadLineKeyHandler -Chord 'Alt+t' -ScriptBlock {
        $current = $env:GEMINI_DEEP_THINKING
        if ($current -eq '1') {
            $env:GEMINI_DEEP_THINKING = '0'
            Write-Host "`n[Deep Thinking: OFF]" -ForegroundColor DarkGray
        } else {
            $env:GEMINI_DEEP_THINKING = '1'
            Write-Host "`n[Deep Thinking: ON]" -ForegroundColor Magenta
        }
        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
    }

    # F1 for tooltip
    Set-PSReadLineKeyHandler -Key F1 -BriefDescription 'Show tooltip' -ScriptBlock {
        [Microsoft.PowerShell.PSConsoleReadLine]::InvokePrompt()
    }
}

# === Gemini Function (direct, no wrapper) ===
function Start-Gemini {
    param([Parameter(ValueFromRemainingArguments)]$Arguments)
    
    $key = $env:GOOGLE_API_KEY
    if (-not $key) {
        $key = [System.Environment]::GetEnvironmentVariable('GOOGLE_API_KEY', 'User')
    }
    if (-not $key) {
        $key = [System.Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')
    }
    if ($key) { $env:GOOGLE_API_KEY = $key }
    
    $model = if ($key) { "gemini-1.5-pro" } else { "gemini-1.5-flash" }
    
    $geminiPath = (Get-Command gemini -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if ($geminiPath) {
        & $geminiPath -m $model @Arguments
    } else {
        npx @google/gemini-cli -m $model @Arguments
    }
}

Set-Alias -Name g -Value Start-Gemini

# === Prompt ===
if (Get-Command oh-my-posh -ErrorAction SilentlyContinue) {
    oh-my-posh init pwsh --config "$PSScriptRoot\gemini-hydra.omp.json" --transient | Invoke-Expression
} else {
    function prompt {
        Write-Host "Gemini > " -NoNewline -ForegroundColor Cyan
        return " "
    }
}
