import configPromise from '@payload-config'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'

import { env } from '@/config/env'
import { queueMissingTranslationJobs } from '@/jobs/translationBackfill'
import { sendSystemAlert } from '@/utilities/systemAlert'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function runJobs(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const payload = await getPayload({ config: configPromise })
  const req = await createLocalReq({}, payload)
  try {
    const backfill = await queueMissingTranslationJobs(payload, req)
    // Image derivatives are deliberately processed in a small, serial batch
    // so a Vercel invocation cannot saturate the Sharp worker pool. Translation
    // jobs keep their existing queue and behavior.
    const media = await payload.jobs.run({
      limit: 5,
      overrideAccess: true,
      queue: 'media',
      req,
      sequential: true,
      silent: true,
    })
    const translations = await payload.jobs.run({
      limit: 10,
      overrideAccess: true,
      queue: 'translations',
      req,
      sequential: true,
      silent: true,
    })

    // Keep `result` compatible with the previous translation-only response;
    // expose media stats alongside it for observability.
    return NextResponse.json({ backfill, media, ok: true, result: translations })
  } catch (error) {
    payload.logger.error({ err: error, message: 'Media and translation job runner failed' })
    await sendSystemAlert(payload, 'Media and translation job runner failed', error)
    return NextResponse.json({ error: 'Job runner unavailable' }, { status: 503 })
  }
}

// Vercel Cron invokes Route Handlers with GET. Keep POST for external schedulers
// and manual operational runs documented by the self-hosted deployment guide.
export async function GET(request: Request) {
  return runJobs(request)
}

export async function POST(request: Request) {
  return runJobs(request)
}
