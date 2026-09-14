[CmdletBinding()]
param(
  [ValidateSet('visual', 'interaction')]
  [string]$Mode = 'visual',

  [ValidateSet('trust', 'catalog', 'solution')]
  [string]$Template = 'trust',

  [string]$Locales = 'en',
  [string]$Viewports = 'mobile,desktop',
  [string]$Route = '',

  [ValidateRange(0, 60000)]
  [int]$DelayMs = 1200,

  [ValidateRange(512, 8192)]
  [int]$MaxOldSpaceMb = 1536
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$qaScript = if ($Mode -eq 'visual') {
  'scripts/run-template-visual-qa.ts'
} else {
  'scripts/run-template-interaction-qa.ts'
}

$env:SITE_TEMPLATE = $Template
$env:QA_LOCALES = $Locales
$env:QA_VIEWPORTS = $Viewports
$env:QA_DELAY_MS = $DelayMs.ToString()
$env:QA_SETTLE_MS = '350'
$env:QA_SCROLL_STEP_MS = '120'
$env:QA_SCROLL_SETTLE_MS = '250'
$env:NODE_OPTIONS = "--max-old-space-size=$MaxOldSpaceMb --no-deprecation"
if ($Route) {
  $env:QA_ROUTE = $Route
} else {
  Remove-Item Env:QA_ROUTE -ErrorAction SilentlyContinue
}

$argumentList = @('exec', 'tsx', $qaScript, "--template=$Template")
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$process = Start-Process `
  -FilePath $pnpm `
  -ArgumentList $argumentList `
  -WorkingDirectory $repoRoot `
  -PassThru `
  -NoNewWindow

try {
  # Keep the QA process below normal priority so the desktop remains usable.
  $process.PriorityClass = 'BelowNormal'
} catch {
  Write-Warning "Could not lower QA process priority: $($_.Exception.Message)"
}

try {
  Wait-Process -Id $process.Id
} finally {
  if (!$process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
}

exit $process.ExitCode
