import configPromise from '@payload-config'
import { createLocalReq, getPayload } from 'payload'

import { queueMissingTranslationJobs } from '@/jobs/translationBackfill'

const apply = process.argv.includes('--apply')

if (!apply) {
  console.log(
    'No changes made. Re-run with --apply; production also requires TRANSLATION_BACKFILL_CONFIRM=BACKFILL_TRANSLATIONS.',
  )
  process.exit(0)
}

if (
  process.env.NODE_ENV === 'production' &&
  process.env.TRANSLATION_BACKFILL_CONFIRM !== 'BACKFILL_TRANSLATIONS'
) {
  throw new Error(
    'Production backfill refused. Set TRANSLATION_BACKFILL_CONFIRM=BACKFILL_TRANSLATIONS after reviewing the pending translations.',
  )
}

const payload = await getPayload({ config: configPromise })
const req = await createLocalReq({}, payload)
const backfill = await queueMissingTranslationJobs(payload, req)
const result = await payload.jobs.run({
  limit: 10,
  overrideAccess: true,
  queue: 'translations',
  req,
  sequential: true,
  silent: true,
})

console.log(JSON.stringify({ backfill, ok: true, result }, null, 2))
