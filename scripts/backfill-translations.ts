import configPromise from '@payload-config'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'

import { getTranslationQueueOrder } from '@/i18n/translationWorkflow'
import { queueMissingTranslationJobs } from '@/jobs/translationBackfill'

const MAX_JOBS_PER_RUN = 500
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

async function drainTranslations(payload: Payload, req: PayloadRequest) {
  let processed = 0

  while (processed < MAX_JOBS_PER_RUN) {
    let ranJob = false

    for (const queue of getTranslationQueueOrder()) {
      const result = await payload.jobs.run({
        limit: 1,
        overrideAccess: true,
        queue,
        req,
        sequential: true,
        silent: true,
      })
      const count = Object.keys(result.jobStatus || {}).length
      if (count === 0) continue

      processed += count
      ranJob = true
      break
    }

    if (!ranJob) return { complete: true, processed }
  }

  return { complete: false, processed }
}

const drained = await drainTranslations(payload, req)

console.log(JSON.stringify({ backfill, drained, ok: true }, null, 2))
await payload.destroy()
