# Dodaj menu kontekstowe dla plikow .psm1
# Uruchom jako Administrator!

Write-Host "=== Dodawanie menu kontekstowego dla .psm1 ===" -ForegroundColor Cyan

# Utworz PSDrive dla HKCR
if (-not (Get-PSDrive -Name HKCR -ErrorAction SilentlyContinue)) {
    New-PSDrive -Name HKCR -PSProvider Registry -Root HKEY_CLASSES_ROOT | Out-Null
}

# 1. Utworz dedykowany typ pliku dla .psm1
Write-Host "`n[1] Tworzenie typu pliku PowerShellModule..." -ForegroundColor Yellow

$fileType = "PowerShell.Module.1"

# Skojarz .psm1 z nowym typem
Set-ItemProperty -Path "HKCR:\.psm1" -Name "(Default)" -Value $fileType -Force -ErrorAction SilentlyContinue
if (-not (Test-Path "HKCR:\.psm1")) {
    New-Item -Path "HKCR:\.psm1" -Force | Out-Null
    Set-ItemProperty -Path "HKCR:\.psm1" -Name "(Default)" -Value $fileType
}

# Utworz definicje typu
if (-not (Test-Path "HKCR:\$fileType")) {
    New-Item -Path "HKCR:\$fileType" -Force | Out-Null
}
Set-ItemProperty -Path "HKCR:\$fileType" -Name "(Default)" -Value "PowerShell Module"

# Ikona
New-Item -Path "HKCR:\$fileType\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "HKCR:\$fileType\DefaultIcon" -Name "(Default)" -Value "powershell.exe,0"

# 2. Dodaj menu kontekstowe - Importuj modul
Write-Host "[2] Dodawanie 'Importuj modul PowerShell'..." -ForegroundColor Yellow

$shellPath = "HKCR:\$fileType\shell"
New-Item -Path "$shellPath\ImportModule" -Force | Out-Null
Set-ItemProperty -Path "$shellPath\ImportModule" -Name "(Default)" -Value "Importuj modul PowerShell"
Set-ItemProperty -Path "$shellPath\ImportModule" -Name "Icon" -Value "powershell.exe"

New-Item -Path "$shellPath\ImportModule\command" -Force | Out-Null
$importCmd = 'powershell.exe -NoExit -ExecutionPolicy Bypass -Command "Import-Module \"%1\" -Verbose"'
Set-ItemProperty -Path "$shellPath\ImportModule\command" -Name "(Default)" -Value $importCmd

# 3. Dodaj menu kontekstowe - Edytuj w PowerShell ISE
Write-Host "[3] Dodawanie 'Edytuj w PowerShell ISE'..." -ForegroundColor Yellow

New-Item -Path "$shellPath\EditISE" -Force | Out-Null
Set-ItemProperty -Path "$shellPath\EditISE" -Name "(Default)" -Value "Edytuj w PowerShell ISE"
Set-ItemProperty -Path "$shellPath\EditISE" -Name "Icon" -Value "powershell_ise.exe"

New-Item -Path "$shellPath\EditISE\command" -Force | Out-Null
$iseCmd = 'powershell_ise.exe "%1"'
Set-ItemProperty -Path "$shellPath\EditISE\command" -Name "(Default)" -Value $iseCmd

# 4. Dodaj menu kontekstowe - Edytuj w VS Code (jesli zainstalowany)
$vscodePath = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe"
if (Test-Path $vscodePath) {
    Write-Host "[4] Dodawanie 'Edytuj w VS Code'..." -ForegroundColor Yellow

    New-Item -Path "$shellPath\EditVSCode" -Force | Out-Null
    Set-ItemProperty -Path "$shellPath\EditVSCode" -Name "(Default)" -Value "Edytuj w VS Code"
    Set-ItemProperty -Path "$shellPath\EditVSCode" -Name "Icon" -Value "`"$vscodePath`""

    New-Item -Path "$shellPath\EditVSCode\command" -Force | Out-Null
    $vscodeCmd = "`"$vscodePath`" `"%1`""
    Set-ItemProperty -Path "$shellPath\EditVSCode\command" -Name "(Default)" -Value $vscodeCmd
} else {
    Write-Host "[4] VS Code nie znaleziony - pomijam" -ForegroundColor Gray
}

# 5. Ustaw domyslna akcje (dwuklik = Notatnik)
Write-Host "[5] Ustawianie domyslnej akcji (Notatnik)..." -ForegroundColor Yellow

New-Item -Path "$shellPath\open" -Force | Out-Null
Set-ItemProperty -Path "$shellPath\open" -Name "(Default)" -Value "Otworz w Notatniku"
New-Item -Path "$shellPath\open\command" -Force | Out-Null
Set-ItemProperty -Path "$shellPath\open\command" -Name "(Default)" -Value 'notepad.exe "%1"'

# Usun user override
$userOverride = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.psm1"
if (Test-Path $userOverride) {
    Remove-Item -Path $userOverride -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Usunieto user override" -ForegroundColor Green
}

Write-Host "`n=== Gotowe! ===" -ForegroundColor Cyan
Write-Host "Menu kontekstowe dla .psm1:" -ForegroundColor Green
Write-Host "  - Importuj modul PowerShell" -ForegroundColor White
Write-Host "  - Edytuj w PowerShell ISE" -ForegroundColor White
Write-Host "  - Edytuj w VS Code" -ForegroundColor White
Write-Host "  - Otworz w Notatniku (domyslnie)" -ForegroundColor White
