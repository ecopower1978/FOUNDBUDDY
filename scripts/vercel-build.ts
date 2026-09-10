import { spawnSync } from 'node:child_process'

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function runPnpm(args: string[], env = process.env) {
  const result = spawnSync(pnpmCommand, args, {
    env,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

runPnpm(['run', 'db:migrate'])

if (process.env.TRANSLATION_BACKFILL_ON_BUILD === 'true') {
  console.log('[vercel-build] Running the requested one-off dictionary translation backfill.')
  runPnpm(['run', 'translations:backfill', '--', '--apply'], {
    ...process.env,
    TRANSLATION_BACKFILL_CONFIRM: 'BACKFILL_TRANSLATIONS',
    TRANSLATION_BACKFILL_REFRESH_AUTO: 'true',
  })
}

runPnpm(['run', 'build'])
