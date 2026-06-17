# Build the irDashies OpenXR layer (DLL + manifest).
#
# Usage:
#   pwsh -File native/build.ps1                 # build Release
#   pwsh -File native/build.ps1 -Config Debug
#   pwsh -File native/build.ps1 -Clean          # wipe build dir first
#
# The layer is registered at runtime by the app (HKCU, per-user, no admin) when
# VR is enabled — see src/app/vr/openxrLayer.ts.
#
# Requires: CMake >= 3.22, Visual Studio 2022 (C++ workload), git (FetchContent).

[CmdletBinding()]
param(
  [ValidateSet('Release', 'Debug')]
  [string]$Config = 'Release',
  [string]$Generator = 'Visual Studio 17 2022',
  [string]$Arch = 'x64',
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'openxr-layer'
$build = Join-Path $src 'build'

function Invoke-Native([string]$exe, [string[]]$cmdArgs) {
  & $exe @cmdArgs
  if ($LASTEXITCODE -ne 0) {
    throw "$exe exited with code $LASTEXITCODE"
  }
}

Write-Host "=== openxr-layer ($Config) ===" -ForegroundColor Cyan

if ($Clean -and (Test-Path $build)) {
  Write-Host "  cleaning $build"
  Remove-Item -Recurse -Force $build
}

Invoke-Native 'cmake' @('-S', $src, '-B', $build, '-G', $Generator, '-A', $Arch)
Invoke-Native 'cmake' @('--build', $build, '--config', $Config, '--target', 'irDashiesOpenXRLayer')

$outDir = Join-Path $build $Config
Write-Host "`nBuild complete." -ForegroundColor Green
Write-Host "  layer    : $(Join-Path $outDir 'irDashies-OpenXR-Layer.dll')"
Write-Host "  manifest : $(Join-Path $outDir 'irDashies-OpenXR.json')"
