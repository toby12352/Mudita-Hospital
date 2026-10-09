# Build the Tauri dashboard installer/bundle into dist/dashboard-package.
# Prepends verified .cargo\bin (and VsDevCmd) so tauri build can find cargo + MSVC linker.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dashDir = Join-Path $root "dashboard"
$outDir = Join-Path $root "dist\dashboard-package"

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
$cargoExe = Join-Path $cargoBin "cargo.exe"
if (-not (Test-Path -LiteralPath $cargoExe)) {
  Write-Error @"
cargo.exe not found at $cargoExe
Install Rust (rustup), then run .\scripts\setup-dev-path.ps1 and reopen the terminal.
"@
}
# Session PATH only (does not change System PATH).
$env:Path = "$cargoBin;$env:Path"

$vsDev = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vsPath = $null
if (Test-Path $vsDev) {
  $vsPath = & $vsDev -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
$vsCmd = if ($vsPath) { Join-Path $vsPath "Common7\Tools\VsDevCmd.bat" } else { $null }

Push-Location $dashDir
try {
  if (-not (Test-Path "node_modules")) {
    Write-Host "npm install..."
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  }
  Write-Host "tauri build (this can take several minutes)..."
  Write-Host "Using cargo: $cargoExe"
  if ($vsCmd -and (Test-Path $vsCmd)) {
    cmd /c "`"$vsCmd`" -arch=x64 && set `"PATH=$cargoBin;%PATH%`" && cd /d `"$dashDir`" && npm run tauri:build"
  } else {
    Write-Warning "MSVC VsDevCmd not found; tauri build may fail without Visual Studio C++ tools."
    npm run tauri:build
  }
  if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
} finally {
  Pop-Location
}

$bundleRoot = Join-Path $dashDir "src-tauri\target\release\bundle"
if (-not (Test-Path $bundleRoot)) {
  Write-Error "No Tauri bundle at $bundleRoot"
}

if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Copy NSIS / MSI / exe bundles if present
Get-ChildItem $bundleRoot -Recurse -Include *.msi,*.exe,*.nsis.zip -ErrorAction SilentlyContinue |
  ForEach-Object { Copy-Item $_.FullName $outDir -Force }

# Also copy the portable .exe for USB installs
$releaseExe = Join-Path $dashDir "src-tauri\target\release\mudita-dashboard.exe"
if (Test-Path $releaseExe) {
  Copy-Item $releaseExe (Join-Path $outDir "MuditaDashboard.exe") -Force
}

@"
Mudita Hospital - Dashboard package
====================================
Admin analytics only (not for Reception / Pharmacy desks).

1. Install the .msi / NSIS setup if present, OR copy MuditaDashboard.exe to the director PC.
2. First launch: enter the Server LAN IP (e.g. 192.168.1.10). Port 8080 is assumed.
3. Sign in with an Admin account. Non-Admin logins are rejected.

Sessions use mudita_dash_* keys so this app can coexist with the clinic client on one PC.
Dashboard never opens SQLite; hospital data stays on the server.

If the badge says Server offline: check cable, server power, firewall port 8080, and IP.
"@ | Set-Content (Join-Path $outDir "README.txt") -Encoding UTF8

Write-Host "Dashboard package ready: $outDir"
