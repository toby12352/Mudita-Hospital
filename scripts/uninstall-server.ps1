# Remove Mudita Hospital API startup task and firewall rule. Does not delete the DB by default.
#Requires -RunAsAdministrator
param(
  [string]$InstallDir = "C:\MuditaHospital\Server",
  [switch]$RemoveData
)

$ErrorActionPreference = "Stop"

$taskName = "MuditaHospitalAPI"
$ruleName = "Mudita Hospital API"

Write-Host "Stopping scheduled task…"
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Stop any leftover processes started by the watchdog
Get-CimInstance Win32_Process -Filter "Name = 'mudita-api.exe'" -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*run-watchdog.cmd*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

if ($RemoveData) {
  if (Test-Path $InstallDir) {
    Write-Host "Removing $InstallDir …"
    Remove-Item -Recurse -Force $InstallDir
  }
} else {
  Write-Host "Left files in $InstallDir (use -RemoveData to delete DB/backups)."
}

Write-Host "Uninstall complete."
