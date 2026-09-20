import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'

import { isOwner } from '@/access/roles'
import { getTranslationQueueOrder } from '@/i18n/translationWorkflow'
import { queueMissingTranslationJobs } from '@/jobs/translationBackfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_JOBS_PER_RUN = 500

async function drainTranslations(payload: Payload, req: PayloadRequest) {
  let processed = 0
  let progress = true

  while (progress && processed < MAX_JOBS_PER_RUN) {
    progress = false
    for (const queue of getTranslationQueueOrder()) {
      const result = await payload.jobs.run({
        limit: 1,
        overrideAccess: true,
        queue,
        req,
        sequential: true,
        silent: true,
      })
      if (Object.keys(result.jobStatus || {}).length === 0) continue
      processed += Object.keys(result.jobStatus || {}).length
      progress = true
      break
    }
  }

  return { complete: !progress, processed }
}

export async function POST() {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user: user || undefined }, payload)
  if (!isOwner(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const backfill = await queueMissingTranslationJobs(payload, req)
    const drained = await drainTranslations(payload, req)
    return NextResponse.json({ backfill, ...drained, ok: true })
  } catch (error) {
    payload.logger.error({ err: error, message: 'Dictionary translation backfill failed' })
    return NextResponse.json({ error: 'Translation backfill unavailable' }, { status: 503 })
  }
}
