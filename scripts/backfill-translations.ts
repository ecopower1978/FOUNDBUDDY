import configPromise from '@payload-config'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'

import {
  translationLocaleOrder,
  type TranslationStatus,
  type TranslationTargetLocale,
} from '@/i18n/translationWorkflow'
import { queueMissingTranslationJobs } from '@/jobs/translationBackfill'
import {
  runTranslationTaskDirect,
  type TranslationTaskInput,
  type TranslationTaskSlug,
} from '@/jobs/translationTasks'

const translationTaskSlugs = ['translateProduct', 'translatePost', 'translateCompany'] as const
const apply = process.argv.includes('--apply')
type BackfillScope = 'all' | 'company' | 'posts' | 'products'
const backfillScopeInput = process.env.TRANSLATION_BACKFILL_SCOPE || 'all'
const backfillScopes: readonly BackfillScope[] = ['all', 'company', 'posts', 'products']

if (!(backfillScopes as readonly string[]).includes(backfillScopeInput)) {
  throw new Error(`Unsupported TRANSLATION_BACKFILL_SCOPE: ${backfillScopeInput}`)
}
const backfillScope = backfillScopeInput as BackfillScope

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

const backfill = await queueMissingTranslationJobs(payload, req, {
  enqueue: false,
  refreshAuto: process.env.TRANSLATION_BACKFILL_REFRESH_AUTO === 'true',
})

async function completeObsoleteTranslationJobs(payload: Payload, req: PayloadRequest) {
  const result = await payload.find({
    collection: 'payload-jobs',
    depth: 0,
    limit: 0,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [{ completedAt: { exists: false } }, { taskSlug: { in: [...translationTaskSlugs] } }],
    },
  })

  for (const job of result.docs) {
    await payload.update({
      collection: 'payload-jobs',
      id: job.id,
      data: {
        completedAt: new Date().toISOString(),
        error: null,
        hasError: false,
        processing: false,
        waitUntil: null,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
  }

  return result.docs.length
}

type DirectTranslationDocument = {
  id: number | string
  translationSourceHash?: string | null
  translationStatus?: TranslationStatus[] | null
}

type DirectTranslationStats = {
  attempted: number
  failed: number
  stale: number
  translated: number
}

function resetStatuses(statuses: DirectTranslationDocument['translationStatus']) {
  return (statuses || []).map((status) =>
    status.mode === 'auto' ? { ...status, error: null, status: 'pending' as const } : status,
  )
}

async function resetScopedStatuses(payload: Payload, req: PayloadRequest) {
  if (backfillScope === 'all') return

  if (backfillScope === 'company') {
    const company = (await payload.findGlobal({
      slug: 'company',
      depth: 0,
      fallbackLocale: false,
      locale: 'zh-CN',
      overrideAccess: true,
      req,
    })) as DirectTranslationDocument
    await payload.updateGlobal({
      slug: 'company',
      data: { translationStatus: resetStatuses(company.translationStatus) },
      locale: 'zh-CN',
      overrideAccess: true,
      req,
      context: { translationWorkflow: true, disableRevalidate: true },
    })
    return
  }

  const result = await payload.find({
    collection: backfillScope,
    depth: 0,
    fallbackLocale: false,
    limit: 0,
    locale: 'zh-CN',
    overrideAccess: true,
    pagination: false,
    req,
  })
  for (const rawDoc of result.docs as unknown as DirectTranslationDocument[]) {
    await payload.update({
      collection: backfillScope,
      id: rawDoc.id,
      data: { translationStatus: resetStatuses(rawDoc.translationStatus) },
      locale: 'zh-CN',
      overrideAccess: true,
      req,
      disableTransaction: true,
      context: { translationWorkflow: true, disableRevalidate: true },
    })
  }
}

async function runDirectTranslations(payload: Payload, req: PayloadRequest) {
  const company =
    backfillScope === 'all' || backfillScope === 'company'
      ? ((await payload.findGlobal({
          slug: 'company',
          depth: 0,
          fallbackLocale: false,
          locale: 'zh-CN',
          overrideAccess: true,
          req,
        })) as DirectTranslationDocument)
      : null
  const posts =
    backfillScope === 'all' || backfillScope === 'posts'
      ? ((
          await payload.find({
            collection: 'posts',
            depth: 0,
            fallbackLocale: false,
            limit: 0,
            locale: 'zh-CN',
            overrideAccess: true,
            pagination: false,
            req,
          })
        ).docs as unknown as DirectTranslationDocument[])
      : []
  const products =
    backfillScope === 'all' || backfillScope === 'products'
      ? ((
          await payload.find({
            collection: 'products',
            depth: 0,
            fallbackLocale: false,
            limit: 0,
            locale: 'zh-CN',
            overrideAccess: true,
            pagination: false,
            req,
          })
        ).docs as unknown as DirectTranslationDocument[])
      : []

  const stats: DirectTranslationStats = { attempted: 0, failed: 0, stale: 0, translated: 0 }
  const errors: string[] = []

  async function run(
    task: TranslationTaskSlug,
    input: TranslationTaskInput,
    locale: TranslationTargetLocale,
  ) {
    stats.attempted += 1
    try {
      const result = await runTranslationTaskDirect(req, task, { ...input, locale })
      stats.failed += result.failed
      stats.stale += result.stale ? 1 : 0
      stats.translated += result.translated
    } catch (error) {
      stats.failed += 1
      errors.push(
        `${task}:${input.documentId || 'company'}:${locale}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  for (const locale of translationLocaleOrder) {
    if (company) {
      await run(
        'translateCompany',
        { sourceHash: String(company.translationSourceHash || '') },
        locale,
      )
    }
    for (const doc of posts) {
      await run(
        'translatePost',
        {
          documentId: String(doc.id),
          sourceHash: String(doc.translationSourceHash || ''),
        },
        locale,
      )
    }
    for (const doc of products) {
      await run(
        'translateProduct',
        {
          documentId: String(doc.id),
          sourceHash: String(doc.translationSourceHash || ''),
        },
        locale,
      )
    }
  }

  return { errors, stats }
}

await resetScopedStatuses(payload, req)
const direct = await runDirectTranslations(payload, req)
const cleanedJobs = await completeObsoleteTranslationJobs(payload, req)
if (direct.errors.length > 0) {
  throw new Error(`Dictionary translation backfill failed:\n${direct.errors.join('\n')}`)
}

console.log(JSON.stringify({ backfill, cleanedJobs, direct: direct.stats, ok: true }, null, 2))

// The Vercel build invokes this script as a child process. Payload's Postgres
// destroy hook can wait indefinitely for an internal jobs connection after the
// work has completed, which prevents the parent build from continuing. The
// child process boundary closes those handles safely when it exits.
process.exit(0)
