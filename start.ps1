# Bloomberg Terminal — clean start script
# Run from the bloomberg-terminal folder: .\start.ps1

Write-Host "Stopping any existing Next.js dev servers..." -ForegroundColor Yellow

# Kill anything on port 3000 or 3001
$ports = @(3000, 3001)
foreach ($port in $ports) {
    $pids = (netstat -ano | Select-String ":$port\s.*LISTENING") |
            ForEach-Object { ($_ -split '\s+')[-1] } |
            Where-Object { $_ -match '^\d+$' }
    foreach ($p in $pids) {
        try { taskkill /F /PID $p /T 2>$null | Out-Null; Write-Host "  Killed PID $p (port $port)" -ForegroundColor Gray } catch {}
    }
}

# Also kill any stray node processes running next dev
Get-Process -Name "node" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*next*" } |
    ForEach-Object { $_.Kill(); Write-Host "  Killed node PID $($_.Id)" -ForegroundColor Gray }

Start-Sleep -Seconds 1

Write-Host "Starting Bloomberg Terminal on http://localhost:3000 ..." -ForegroundColor Green
Set-Location $PSScriptRoot
npm run dev
