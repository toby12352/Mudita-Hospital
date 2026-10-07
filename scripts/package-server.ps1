# Build mudita-api.exe and stage a deployable server folder under dist/server-package.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root "server"
$outDir = Join-Path $root "dist\server-package"

# Wrap in @() so a single match stays an array (else [0] is the char "C").
$goCandidates = @(
  @(
    (Get-Command go -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    "C:\Mudita_Software\tools\go\bin\go.exe",
    "C:\Program Files\Go\bin\go.exe"
  ) | Where-Object { $_ -and (Test-Path $_) }
)
if ($goCandidates.Count -eq 0) {
  Write-Error "Go not found. Install Go or place it at C:\Mudita_Software\tools\go"
}
$go = $goCandidates[0]
$env:Path = "$(Split-Path $go);$env:Path"

Write-Host "Building mudita-api.exe..."
New-Item -ItemType Directory -Force -Path (Join-Path $root "bin") | Out-Null
Push-Location $serverDir
try {
  & $go build -o (Join-Path $root "bin\mudita-api.exe") .
  if ($LASTEXITCODE -ne 0) { throw "go build failed" }
} finally {
  Pop-Location
}

if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Copy-Item (Join-Path $root "bin\mudita-api.exe") $outDir
Copy-Item (Join-Path $root "deploy\server\config.json") $outDir
Copy-Item (Join-Path $root "deploy\server\run-watchdog.cmd") $outDir
Copy-Item (Join-Path $root "deploy\server\README.txt") $outDir
Copy-Item (Join-Path $root "scripts\install-server.ps1") $outDir
Copy-Item (Join-Path $root "scripts\uninstall-server.ps1") $outDir
if (Test-Path (Join-Path $root "docs\DEPLOY.md")) {
  Copy-Item (Join-Path $root "docs\DEPLOY.md") $outDir
}

Write-Host "Server package ready: $outDir"
Write-Host "Copy that folder to the server PC and run install-server.ps1 as Administrator."
