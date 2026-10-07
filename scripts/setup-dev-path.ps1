# Safely append known Mudita/dev tool folders to the User PATH (not System).
# Only adds a folder when the expected .exe already exists. Idempotent.
$ErrorActionPreference = "Stop"

$candidates = @(
  @{
    Name   = "Go"
    Folder = "C:\Mudita_Software\tools\go\bin"
    Exe    = "C:\Mudita_Software\tools\go\bin\go.exe"
  },
  @{
    Name   = "Node.js"
    Folder = "C:\Program Files\nodejs"
    Exe    = "C:\Program Files\nodejs\node.exe"
  },
  @{
    Name   = "Rust (cargo)"
    Folder = Join-Path $env:USERPROFILE ".cargo\bin"
    Exe    = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
  }
)

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($null -eq $userPath) { $userPath = "" }

$parts = @($userPath -split ";" | Where-Object { $_ -and $_.Trim() -ne "" })
$added = @()
$already = @()
$skipped = @()

foreach ($c in $candidates) {
  if (-not (Test-Path -LiteralPath $c.Exe)) {
    $skipped += "$($c.Name): not installed ($($c.Exe))"
    continue
  }
  $folder = $c.Folder
  $exists = $parts | Where-Object { $_.TrimEnd("\") -ieq $folder.TrimEnd("\") }
  if ($exists) {
    $already += "$($c.Name): already on User PATH ($folder)"
    continue
  }
  $parts += $folder
  $added += "$($c.Name): added $folder"
}

if ($added.Count -gt 0) {
  $newPath = ($parts -join ";").TrimEnd(";")
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  # Refresh this session so the user can verify immediately.
  $env:Path = $newPath + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")
}

Write-Host ""
Write-Host "Mudita safe User PATH setup"
Write-Host "============================"
Write-Host "(User PATH only - System PATH was not changed.)"
Write-Host ""
if ($added.Count -gt 0) {
  Write-Host "Added:"
  $added | ForEach-Object { Write-Host "  + $_" }
} else {
  Write-Host "Added: (none)"
}
if ($already.Count -gt 0) {
  Write-Host "Already present:"
  $already | ForEach-Object { Write-Host "  = $_" }
}
if ($skipped.Count -gt 0) {
  Write-Host "Skipped (not installed):"
  $skipped | ForEach-Object { Write-Host "  - $_" }
}
Write-Host ""
Write-Host "Close and reopen terminals (and Cursor) so other windows pick up PATH."
Write-Host "Then verify:  go version   |   node -v   |   cargo --version"
Write-Host ""
