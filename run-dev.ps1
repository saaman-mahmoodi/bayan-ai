# run-dev.ps1
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Bayan backend..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:backend" -WorkingDirectory $projectRoot

Start-Sleep -Seconds 2

Write-Host "Starting Bayan desktop app..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:desktop" -WorkingDirectory $projectRoot

Write-Host "Done. Backend and desktop are running in separate windows."