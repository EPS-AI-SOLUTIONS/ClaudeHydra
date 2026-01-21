#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Konfiguruje menu kontekstowe dla plikow .psm1 (moduly PowerShell)
.DESCRIPTION
    Dodaje opcje:
    - Otworz w Notepad++ (domyslnie)
    - Importuj modul PowerShell
    - Edytuj w PowerShell ISE
    - Edytuj w VS Code
.NOTES
    Wymaga uprawnien administratora
    Kompatybilny z Windows 10/11
    Zrodlo: https://www.tomshardware.com/software/windows/how-to-add-custom-shortcuts-to-the-windows-11-or-10-context-menu
#>

param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# Kolory
function Write-Step { param($msg) Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-OK { param($msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "[-] $msg" -ForegroundColor Red }

Write-Host "`n=== Konfiguracja menu kontekstowego .psm1 ===" -ForegroundColor Magenta
Write-Host "Kompatybilny z Windows 10/11`n" -ForegroundColor Gray

# Stale
$FileType = "PowerShell.Module.1"
$Extension = ".psm1"

# Sciezki do edytorow
$Editors = @{
    NotepadPP = @(
        "$env:ProgramFiles\Notepad++\notepad++.exe"
        "${env:ProgramFiles(x86)}\Notepad++\notepad++.exe"
    )
    VSCode = @(
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe"
        "$env:ProgramFiles\Microsoft VS Code\Code.exe"
    )
    ISE = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell_ise.exe"
    PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
}

function Find-Editor {
    param([string[]]$Paths)
    foreach ($p in $Paths) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Set-RegistryValue {
    param(
        [string]$Path,
        [string]$Name = "(Default)",
        [string]$Value
    )

    if (-not (Test-Path $Path)) {
        New-Item -Path $Path -Force | Out-Null
    }

    if ($Name -eq "(Default)") {
        Set-ItemProperty -Path $Path -Name "(Default)" -Value $Value
    } else {
        Set-ItemProperty -Path $Path -Name $Name -Value $Value -Type String
    }
}

# === UNINSTALL ===
if ($Uninstall) {
    Write-Step "Usuwanie konfiguracji..."

    $paths = @(
        "Registry::HKEY_CLASSES_ROOT\$Extension"
        "Registry::HKEY_CLASSES_ROOT\$FileType"
    )

    foreach ($p in $paths) {
        if (Test-Path $p) {
            Remove-Item -Path $p -Recurse -Force
            Write-OK "Usunieto: $p"
        }
    }

    # Usun user override
    $userPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$Extension"
    if (Test-Path $userPath) {
        Remove-Item -Path $userPath -Recurse -Force
        Write-OK "Usunieto user override"
    }

    Write-Host "`nOdinstalowano!" -ForegroundColor Green
    exit 0
}

# === INSTALL ===

# 1. Znajdz edytory
Write-Step "Szukanie edytorow..."

$NotepadPP = Find-Editor $Editors.NotepadPP
$VSCode = Find-Editor $Editors.VSCode
$ISE = if (Test-Path $Editors.ISE) { $Editors.ISE } else { $null }
$PowerShell = $Editors.PowerShell

if ($NotepadPP) { Write-OK "Notepad++: $NotepadPP" } else { Write-Warn "Notepad++ nie znaleziony" }
if ($VSCode) { Write-OK "VS Code: $VSCode" } else { Write-Warn "VS Code nie znaleziony" }
if ($ISE) { Write-OK "PowerShell ISE: $ISE" }

# 2. Utworz skojarzenie rozszerzenia
Write-Step "Tworzenie skojarzenia $Extension -> $FileType"

$extPath = "Registry::HKEY_CLASSES_ROOT\$Extension"
Set-RegistryValue -Path $extPath -Value $FileType
Set-RegistryValue -Path $extPath -Name "Content Type" -Value "text/plain"
Set-RegistryValue -Path $extPath -Name "PerceivedType" -Value "text"
Write-OK "Skojarzenie utworzone"

# 3. Utworz definicje typu pliku
Write-Step "Tworzenie definicji typu pliku"

$typePath = "Registry::HKEY_CLASSES_ROOT\$FileType"
Set-RegistryValue -Path $typePath -Value "PowerShell Module"

# Ikona (uzyj ikony PowerShell)
Set-RegistryValue -Path "$typePath\DefaultIcon" -Value "$PowerShell,0"

# FriendlyTypeName (wymagane w Windows 11)
Set-RegistryValue -Path $typePath -Name "FriendlyTypeName" -Value "PowerShell Module"

Write-OK "Typ pliku utworzony"

# 4. Dodaj opcje menu kontekstowego
Write-Step "Dodawanie menu kontekstowego..."

$shellPath = "$typePath\shell"

# --- Opcja 1: Otworz w Notepad++ (domyslna) ---
if ($NotepadPP) {
    $openPath = "$shellPath\open"
    Set-RegistryValue -Path $openPath -Value "Otworz w Notepad++"
    Set-RegistryValue -Path $openPath -Name "Icon" -Value "`"$NotepadPP`""
    Set-RegistryValue -Path "$openPath\command" -Value "`"$NotepadPP`" `"%1`""
    Write-OK "Dodano: Otworz w Notepad++ (domyslna akcja)"
} else {
    # Fallback do Notatnika
    $openPath = "$shellPath\open"
    Set-RegistryValue -Path $openPath -Value "Otworz w Notatniku"
    Set-RegistryValue -Path $openPath -Name "Icon" -Value "notepad.exe"
    Set-RegistryValue -Path "$openPath\command" -Value "notepad.exe `"%1`""
    Write-OK "Dodano: Otworz w Notatniku (domyslna akcja)"
}

# --- Opcja 2: Importuj modul PowerShell ---
$importPath = "$shellPath\ImportModule"
Set-RegistryValue -Path $importPath -Value "Importuj modul PowerShell"
Set-RegistryValue -Path $importPath -Name "Icon" -Value "$PowerShell,0"
# Komenda: otwiera PowerShell, importuje modul z Verbose i zostaje otwarte
$importCmd = "`"$PowerShell`" -NoExit -ExecutionPolicy Bypass -Command `"Import-Module '%1' -Verbose; Write-Host ''; Write-Host 'Modul zaimportowany. Mozesz teraz uzywac jego funkcji.' -ForegroundColor Green`""
Set-RegistryValue -Path "$importPath\command" -Value $importCmd
Write-OK "Dodano: Importuj modul PowerShell"

# --- Opcja 3: Edytuj w PowerShell ISE ---
if ($ISE) {
    $isePath = "$shellPath\EditISE"
    Set-RegistryValue -Path $isePath -Value "Edytuj w PowerShell ISE"
    Set-RegistryValue -Path $isePath -Name "Icon" -Value "$ISE,0"
    Set-RegistryValue -Path "$isePath\command" -Value "`"$ISE`" `"%1`""
    Write-OK "Dodano: Edytuj w PowerShell ISE"
}

# --- Opcja 4: Edytuj w VS Code ---
if ($VSCode) {
    $vscodePath = "$shellPath\EditVSCode"
    Set-RegistryValue -Path $vscodePath -Value "Edytuj w VS Code"
    Set-RegistryValue -Path $vscodePath -Name "Icon" -Value "`"$VSCode`""
    Set-RegistryValue -Path "$vscodePath\command" -Value "`"$VSCode`" `"%1`""
    Write-OK "Dodano: Edytuj w VS Code"
}

# --- Opcja 5: Uruchom w PowerShell (jako skrypt) ---
$runPath = "$shellPath\RunInPowerShell"
Set-RegistryValue -Path $runPath -Value "Uruchom w PowerShell"
Set-RegistryValue -Path $runPath -Name "Icon" -Value "$PowerShell,0"
$runCmd = "`"$PowerShell`" -NoExit -ExecutionPolicy Bypass -File `"%1`""
Set-RegistryValue -Path "$runPath\command" -Value $runCmd
Write-OK "Dodano: Uruchom w PowerShell"

# 5. Usun user override (zeby nowe ustawienia zadzialaly)
Write-Step "Usuwanie user override..."

$userPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$Extension"
if (Test-Path $userPath) {
    Remove-Item -Path $userPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-OK "Usunieto user override"
} else {
    Write-OK "Brak user override do usuniecia"
}

# 6. Podsumowanie
Write-Host "`n=== Konfiguracja zakonczona ===" -ForegroundColor Magenta
Write-Host "`nMenu kontekstowe dla plikow .psm1:" -ForegroundColor White

$menuItems = @(
    @{ Name = "Otworz w Notepad++"; Desc = "Domyslna akcja (dwuklik)" }
    @{ Name = "Importuj modul PowerShell"; Desc = "Import-Module z Verbose" }
    @{ Name = "Edytuj w PowerShell ISE"; Desc = "Otwiera w ISE" }
    @{ Name = "Edytuj w VS Code"; Desc = "Otwiera w VS Code" }
    @{ Name = "Uruchom w PowerShell"; Desc = "Wykonuje jako skrypt" }
)

foreach ($item in $menuItems) {
    Write-Host "  - $($item.Name)" -ForegroundColor Cyan -NoNewline
    Write-Host " ($($item.Desc))" -ForegroundColor Gray
}

Write-Host "`nAby zmiany weszly w zycie, moze byc potrzebny restart Explorer:" -ForegroundColor Yellow
Write-Host "  Stop-Process -Name explorer -Force; Start-Process explorer" -ForegroundColor Gray

Write-Host "`nAby odinstalowac: .\setup-psm1-context-menu.ps1 -Uninstall" -ForegroundColor Gray
