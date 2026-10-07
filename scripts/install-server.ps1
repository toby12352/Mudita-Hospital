# Install Mudita Hospital API: copy files, firewall rule, startup scheduled task.
# Run as Administrator from the server-package folder (or repo scripts/ with -PackageDir).
#Requires -RunAsAdministrator
param(
  [string]$InstallDir = "C:\MuditaHospital\Server",
  [string]$PackageDir = "",
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

if (-not $PackageDir) {
  $PackageDir = $PSScriptRoot
  # When run from repo scripts/, use dist\server-package if present.
  $repoRoot = Split-Path -Parent $PSScriptRoot
  $staged = Join-Path $repoRoot "dist\server-package"
  if ((Test-Path (Join-Path $PackageDir "mudita-api.exe")) -eq $false -and (Test-Path (Join-Path $staged "mudita-api.exe"))) {
    $PackageDir = $staged
  }
}

$exeSrc = Join-Path $PackageDir "mudita-api.exe"
if (-not (Test-Path $exeSrc)) {
  Write-Error "mudita-api.exe not found in $PackageDir. Run package-server.ps1 first, or run this script from the package folder."
}

Write-Host "Installing to $InstallDir …"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "backups") | Out-Null

Copy-Item $exeSrc (Join-Path $InstallDir "mudita-api.exe") -Force
Copy-Item (Join-Path $PackageDir "run-watchdog.cmd") (Join-Path $InstallDir "run-watchdog.cmd") -Force

$cfgDest = Join-Path $InstallDir "config.json"
if (-not (Test-Path $cfgDest)) {
  $cfgSrc = Join-Path $PackageDir "config.json"
  if (Test-Path $cfgSrc) {
    Copy-Item $cfgSrc $cfgDest
  } else {
    @"
{
  "host": "0.0.0.0",
  "port": $Port,
  "db_path": "data/mudita.db",
  "backup_dir": "backups",
  "backup_interval_hours": 24
}
"@ | Set-Content -Path $cfgDest -Encoding UTF8
  }
} else {
  Write-Host "Keeping existing config.json"
}

# Firewall: inbound TCP 8080
$ruleName = "Mudita Hospital API"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
Write-Host "Firewall rule OK: TCP $Port inbound"

# Startup task (watchdog so restore exit restarts the API)
$taskName = "MuditaHospitalAPI"
$watchdog = Join-Path $InstallDir "run-watchdog.cmd"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$watchdog`"" -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Scheduled task '$taskName' registered (At startup, SYSTEM)"

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "Install complete."
Write-Host "  Folder:  $InstallDir"
Write-Host "  Health:  http://127.0.0.1:$Port/api/health"
foreach ($ip in $ips) {
  Write-Host "  LAN:     http://${ip}:$Port/api/health"
}
Write-Host ""
Write-Host "Set a static IPv4 on this PC, then point clinic clients at that IP."
Write-Host "See DEPLOY.md for switch / USB backup steps."
