# Run the Mudita Dashboard Tauri shell (starts Vite + Tauri on port 1421).
# Prepends verified .cargo\bin to session PATH so tauri can find cargo after VsDevCmd.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dashDir = Join-Path $root "dashboard"

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

Set-Location $dashDir
if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dashboard dependencies..."
  npm install
}

Write-Host "Starting Mudita Dashboard (API should already be on http://127.0.0.1:8080)"
Write-Host "Admin only — Reception/Pharmacy use the clinic client."
Write-Host "Using cargo: $cargoExe"
if ($vsCmd -and (Test-Path $vsCmd)) {
  # Re-prepend cargo after VsDevCmd so MSVC PATH shuffle does not hide it.
  cmd /c "`"$vsCmd`" -arch=x64 && set `"PATH=$cargoBin;%PATH%`" && cd /d `"$dashDir`" && npm run tauri:dev"
} else {
  Write-Warning "MSVC VsDevCmd not found; tauri build may fail without Visual Studio C++ tools."
  npm run tauri:dev
}
