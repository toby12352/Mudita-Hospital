# Run the Mudita Hospital API from the repo root or scripts/.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root "server"

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

Set-Location $serverDir
Write-Host "Starting API with $go (cwd=$serverDir)"
& $go run .
