# Kill process using port 1420
$connections = Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue
foreach ($conn in $connections) {
    Write-Host "Killing process $($conn.OwningProcess) on port 1420"
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}
Write-Host "Done"
