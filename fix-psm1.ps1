# Fix .psm1 file association - prevent ISE from opening
# Run as Administrator for best results

Write-Host "=== Naprawa skojarzenia plikow .psm1 ===" -ForegroundColor Cyan

# 1. Check current association
Write-Host "`n[1] Sprawdzanie aktualnego skojarzenia..." -ForegroundColor Yellow

$userChoicePath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.psm1\UserChoice'
$openWithPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.psm1\OpenWithList'

if (Test-Path $userChoicePath) {
    Write-Host "UserChoice dla .psm1:" -ForegroundColor Green
    Get-ItemProperty $userChoicePath | Select-Object ProgId, Hash | Format-List
} else {
    Write-Host "Brak UserChoice dla .psm1" -ForegroundColor Gray
}

if (Test-Path $openWithPath) {
    Write-Host "OpenWithList dla .psm1:" -ForegroundColor Green
    Get-ItemProperty $openWithPath | Format-List
}

# 2. Remove problematic user association
Write-Host "`n[2] Usuwanie problematycznego skojarzenia..." -ForegroundColor Yellow

$extPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.psm1'
if (Test-Path $extPath) {
    try {
        # Remove UserChoice (this is what causes ISE to open)
        if (Test-Path $userChoicePath) {
            # UserChoice is protected, we need to take ownership first
            $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(
                'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.psm1\UserChoice',
                [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree,
                [System.Security.AccessControl.RegistryRights]::TakeOwnership
            )
            if ($key) {
                $acl = $key.GetAccessControl()
                $rule = New-Object System.Security.AccessControl.RegistryAccessRule(
                    [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
                    "FullControl",
                    "Allow"
                )
                $acl.SetAccessRule($rule)
                $key.SetAccessControl($acl)
                $key.Close()

                Remove-Item $userChoicePath -Force -ErrorAction SilentlyContinue
                Write-Host "Usunieto UserChoice" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "Nie mozna usunac UserChoice (wymaga restartu Explorer): $_" -ForegroundColor Red
    }
}

# 3. Set correct system association (as text file, not executable)
Write-Host "`n[3] Ustawianie poprawnego skojarzenia systemowego..." -ForegroundColor Yellow

# Associate .psm1 with txtfile (text) instead of executable
cmd /c "assoc .psm1=txtfile" 2>$null
Write-Host "Ustawiono .psm1 jako plik tekstowy (nie wykonywalny)" -ForegroundColor Green

# 4. Restart Explorer to apply changes
Write-Host "`n[4] Czy zrestartowac Explorer.exe? (zalecane)" -ForegroundColor Yellow
$restart = Read-Host "Wpisz 'tak' aby zrestartowac"

if ($restart -eq 'tak') {
    Write-Host "Restartowanie Explorer..." -ForegroundColor Cyan
    Stop-Process -Name explorer -Force
    Start-Sleep -Seconds 2
    Start-Process explorer
    Write-Host "Explorer zrestartowany!" -ForegroundColor Green
}

Write-Host "`n=== Gotowe! ===" -ForegroundColor Cyan
Write-Host "Pliki .psm1 nie beda juz otwierac ISE automatycznie." -ForegroundColor Green
Write-Host "Aby importowac modul, uzyj: Import-Module sciezka\do\modulu.psm1" -ForegroundColor Gray
