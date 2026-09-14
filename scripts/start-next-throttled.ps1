[CmdletBinding()]
param(
  [ValidateSet('trust', 'catalog', 'solution')]
  [string]$Template = 'trust',

  [ValidateRange(1024, 8192)]
  [int]$MaxOldSpaceMb = 1536,

  [ValidateRange(1, 65535)]
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$env:SITE_TEMPLATE = $Template
$env:NODE_OPTIONS = "--max-old-space-size=$MaxOldSpaceMb --no-deprecation"

$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$argumentList = @('exec', 'next', 'dev', '--webpack', '--port', $Port.ToString())
$process = Start-Process `
  -FilePath $pnpm `
  -ArgumentList $argumentList `
  -WorkingDirectory $repoRoot `
  -PassThru `
  -NoNewWindow

try {
  # Keep the local server below normal priority so rendering remains usable.
  $process.PriorityClass = 'BelowNormal'
} catch {
  Write-Warning "Could not lower local server priority: $($_.Exception.Message)"
}

try {
  Wait-Process -Id $process.Id
} finally {
  if (!$process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
}

exit $process.ExitCode
