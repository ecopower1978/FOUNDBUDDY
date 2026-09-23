import type { Payload, PayloadRequest } from 'payload'

import { getTranslationQueueOrder } from '@/i18n/translationWorkflow'

type DrainTranslationQueueOptions = {
  deadline: number
  maxJobs?: number
  reserveMs?: number
}

type DrainTranslationQueueResult = {
  complete: boolean
  elapsedMs: number
  processed: number
}

/**
 * Process queued translations serially until the queue is empty or the caller's
 * function deadline is close. Each job may call a remote translation provider,
 * so reserve time for the current job to finish before starting another one.
 */
export async function drainTranslationQueue(
  payload: Payload,
  req: PayloadRequest,
  options: DrainTranslationQueueOptions,
): Promise<DrainTranslationQueueResult> {
  const startedAt = Date.now()
  const maxJobs = options.maxJobs ?? 32
  const reserveMs = options.reserveMs ?? 90_000
  let processed = 0
  let complete = false

  while (processed < maxJobs && Date.now() + reserveMs < options.deadline) {
    let foundJob = false

    for (const queue of getTranslationQueueOrder()) {
      if (Date.now() + reserveMs >= options.deadline) break

      const result = await payload.jobs.run({
        limit: 1,
        overrideAccess: true,
        queue,
        req,
        sequential: true,
        silent: true,
      })
      const count = Object.keys(result.jobStatus || {}).length
      if (!count) continue

      processed += count
      foundJob = true
      break
    }

    if (!foundJob) {
      complete = true
      break
    }
  }

  return { complete, elapsedMs: Date.now() - startedAt, processed }
}
