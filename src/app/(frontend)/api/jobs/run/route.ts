import configPromise from '@payload-config'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'

import { env } from '@/config/env'
import { sendSystemAlert } from '@/utilities/systemAlert'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const payload = await getPayload({ config: configPromise })
  const req = await createLocalReq({}, payload)
  try {
    const result = await payload.jobs.run({
      limit: 10,
      overrideAccess: true,
      queue: 'translations',
      req,
      sequential: true,
      silent: true,
    })

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    payload.logger.error({ err: error, message: 'Translation job runner failed' })
    await sendSystemAlert(payload, 'Translation job runner failed', error)
    return NextResponse.json({ error: 'Job runner unavailable' }, { status: 503 })
  }
}
