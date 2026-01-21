# Ustaw Notepad++ jako domyslny dla .psm1
# Uruchom jako Administrator

Write-Host "=== Konfiguracja Notepad++ dla .psm1 ===" -ForegroundColor Cyan

# 1. Zmien skojarzenie na PowerShell.Module.1
cmd /c "assoc .psm1=PowerShell.Module.1"

# 2. Znajdz Notepad++
$nppPaths = @(
    "C:\Program Files\Notepad++\notepad++.exe",
    "C:\Program Files (x86)\Notepad++\notepad++.exe",
    "$env:LOCALAPPDATA\Notepad++\notepad++.exe"
)

$npp = $null
foreach ($path in $nppPaths) {
    if (Test-Path $path) {
        $npp = $path
        break
    }
}

if (-not $npp) {
    Write-Host "Notepad++ nie znaleziony w standardowych lokalizacjach!" -ForegroundColor Red
    Write-Host "Szukam w PATH..." -ForegroundColor Yellow
    $npp = (Get-Command notepad++ -ErrorAction SilentlyContinue).Source
}

if ($npp) {
    Write-Host "Notepad++ znaleziony: $npp" -ForegroundColor Green

    # PSDrive dla HKCR
    if (-not (Get-PSDrive -Name HKCR -ErrorAction SilentlyContinue)) {
        New-PSDrive -Name HKCR -PSProvider Registry -Root HKEY_CLASSES_ROOT | Out-Null
    }

    # Zmien domyslna akcje na Notepad++
    $cmdValue = "`"$npp`" `"%1`""
    Set-ItemProperty -Path "HKCR:\PowerShell.Module.1\shell\open\command" -Name "(Default)" -Value $cmdValue
    Set-ItemProperty -Path "HKCR:\PowerShell.Module.1\shell\open" -Name "(Default)" -Value "Otworz w Notepad++"
    Set-ItemProperty -Path "HKCR:\PowerShell.Module.1\shell\open" -Name "Icon" -Value "`"$npp`""

    Write-Host "Ustawiono Notepad++ jako domyslny edytor dla .psm1" -ForegroundColor Green
} else {
    Write-Host "Notepad++ nie znaleziony! Pozostawiam Notatnik." -ForegroundColor Red
}

# 3. Usun user override
$userOverride = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.psm1"
if (Test-Path $userOverride) {
    Remove-Item -Path $userOverride -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Usunieto user override" -ForegroundColor Green
}

Write-Host "`nGotowe! Kliknij prawym na plik .psm1 aby zobaczyc menu." -ForegroundColor Cyan
