import type { PayloadRequest, TaskConfig } from 'payload'

import { type SiteLocale } from '@/i18n/config'
import { translateLexical, translateTextWithCoverage } from '@/i18n/autoTranslate'
import {
  getNextTranslationLocale,
  getTranslationLocale,
  queueTranslationTask,
  TRANSLATION_CONTEXT_KEY,
  translationLocaleOrder,
  type TranslationStatus,
  type TranslationTargetLocale,
} from '@/i18n/translationWorkflow'

export type TranslationTaskSlug = 'translateCompany' | 'translatePost' | 'translateProduct'
export type TranslationTaskInput = { documentId?: string; locale?: string; sourceHash?: string }
type CollectionTranslationSource = {
  category?: string | null
  content?: unknown
  description?: string | null
  excerpt?: string | null
  id: number | string
  meta?: {
    description?: string | null
    title?: string | null
    [key: string]: unknown
  } | null
  shortDescription: string
  specifications?: Array<Record<string, unknown>>
  title: string
  translationSourceHash?: string | null
  translationStatus?: TranslationStatus[] | null
}
type CompanyTranslationSource = {
  aboutDescription?: string | null
  aboutTitle?: string | null
  contact?: {
    address?: string | null
    [key: string]: unknown
  } | null
  heroDescription: string
  heroTitle: string
  highlights?: Array<Record<string, unknown>>
  translationSourceHash?: string | null
  translationStatus?: TranslationStatus[] | null
}

function translationStatusContext() {
  return {
    [TRANSLATION_CONTEXT_KEY]: true,
    ...(process.env.TRANSLATION_BACKFILL_ON_BUILD === 'true' ? { disableRevalidate: true } : {}),
  }
}

function translationWriteOptions() {
  return process.env.TRANSLATION_BACKFILL_ON_BUILD === 'true' ? { disableTransaction: true } : {}
}

function translationWriteContext(locale: TranslationTargetLocale) {
  return {
    ...translationStatusContext(),
    translationLocale: locale,
  }
}

const inputSchema: TaskConfig['inputSchema'] = [
  { name: 'documentId', type: 'text' },
  {
    name: 'locale',
    type: 'select',
    options: translationLocaleOrder.map((locale) => ({ label: locale, value: locale })),
  },
  { name: 'sourceHash', type: 'text', required: true },
]

const outputSchema: TaskConfig['outputSchema'] = [
  { name: 'translated', type: 'number', required: true },
  { name: 'failed', type: 'number', required: true },
  { name: 'stale', type: 'checkbox', required: true },
]

function updateStatus(
  statuses: TranslationStatus[],
  locale: SiteLocale,
  patch: Partial<TranslationStatus>,
) {
  return statuses.map((status) =>
    status.locale === locale
      ? { ...status, ...patch, updatedAt: new Date().toISOString() }
      : status,
  )
}

/**
 * Serialize every translation operation within one language task. Some
 * rich-text and specification fields are traversed with Promise.all for
 * data-shape convenience; this queue keeps the work deterministic and also
 * prevents an optional remote provider from receiving a burst of requests.
 */
function createTranslationQueue(target: TranslationTargetLocale) {
  let tail: Promise<void> = Promise.resolve()
  let failure: unknown
  let partial = false

  function translate(value: string): Promise<string>
  function translate(value?: string | null): Promise<string | null | undefined>
  function translate(value?: string | null): Promise<string | null | undefined> {
    if (!value?.trim()) return Promise.resolve(value)

    const result = tail.then(() => {
      if (failure) throw failure
      return translateTextWithCoverage(value, 'zh-CN', target).then((translated) => {
        partial ||= translated.partial
        return translated.text
      })
    })
    tail = result.then(
      () => undefined,
      (error) => {
        failure = error
        return undefined
      },
    )
    return result
  }

  return {
    hasPartial: () => partial,
    translate,
  }
}

async function queueNextLocale(
  req: PayloadRequest,
  task: TranslationTaskSlug,
  input: { documentId?: string; sourceHash: string },
  statuses: TranslationStatus[],
  currentLocale: TranslationTargetLocale,
) {
  const nextLocale = getNextTranslationLocale(statuses, input.sourceHash, currentLocale)
  if (!nextLocale) return null

  await queueTranslationTask(req, task, {
    ...input,
    locale: nextLocale,
  })
  return nextLocale
}

async function updateCollectionStatuses(
  req: PayloadRequest,
  collection: 'posts' | 'products',
  id: number | string,
  statuses: TranslationStatus[],
) {
  await req.payload.update({
    collection,
    id,
    data: { translationStatus: statuses },
    locale: 'zh-CN',
    overrideAccess: true,
    req,
    ...translationWriteOptions(),
    context: translationStatusContext(),
  })
}

type TranslationExecutionOptions = {
  queueNext?: boolean
}

async function translateCollection(
  req: PayloadRequest,
  collection: 'posts' | 'products',
  input: TranslationTaskInput,
  options: TranslationExecutionOptions = {},
) {
  const payload = req.payload
  const id = input.documentId || ''
  const sourceHash = String(input.sourceHash || '')
  const locale = getTranslationLocale(input.locale)
  const task: TranslationTaskSlug = collection === 'products' ? 'translateProduct' : 'translatePost'
  const source = (await payload.findByID({
    collection,
    id,
    locale: 'zh-CN',
    fallbackLocale: false,
    overrideAccess: true,
    req,
  })) as CollectionTranslationSource

  if (source.translationSourceHash !== sourceHash) {
    return { failed: 0, stale: true, translated: 0 }
  }

  let statuses = (source.translationStatus || []) as TranslationStatus[]
  const firstPendingLocale = getNextTranslationLocale(statuses, sourceHash)
  if (firstPendingLocale !== locale) {
    if (firstPendingLocale && options.queueNext !== false) {
      await queueTranslationTask(req, task, {
        documentId: String(source.id),
        locale: firstPendingLocale,
        sourceHash,
      })
    }
    return { failed: 0, stale: false, translated: 0 }
  }

  statuses = updateStatus(statuses, locale, { error: null, status: 'translating' })
  await updateCollectionStatuses(req, collection, source.id, statuses)

  try {
    const translationQueue = createTranslationQueue(locale)
    const translate = translationQueue.translate
    const data =
      collection === 'products'
        ? {
            title: await translate(source.title),
            shortDescription: await translate(source.shortDescription),
            category: source.category ? await translate(source.category) : source.category,
            description: source.description
              ? await translate(source.description)
              : source.description,
            specifications: await Promise.all(
              (source.specifications || []).map(async (item: Record<string, unknown>) => ({
                ...item,
                name: item.name ? await translate(String(item.name)) : item.name,
                value: item.value ? await translate(String(item.value)) : item.value,
              })),
            ),
          }
        : {
            title: await translate(source.title),
            excerpt: source.excerpt ? await translate(source.excerpt) : source.excerpt,
            content: await translateLexical(source.content, (value) => translate(value)),
            meta: {
              ...source.meta,
              title: source.meta?.title ? await translate(source.meta.title) : source.meta?.title,
              description: source.meta?.description
                ? await translate(source.meta.description)
                : source.meta?.description,
            },
          }

    await payload.update({
      collection,
      id: source.id,
      data,
      locale,
      overrideAccess: true,
      req,
      ...translationWriteOptions(),
      context: translationWriteContext(locale),
    })
    statuses = updateStatus(statuses, locale, {
      error: translationQueue.hasPartial() ? '本地字典未覆盖部分原文，未命中的内容已保留。' : null,
      sourceHash,
      status: translationQueue.hasPartial() ? 'partial' : 'complete',
    })
  } catch (error) {
    console.log(
      '[translation-task] error',
      JSON.stringify({
        collection,
        documentId: source.id,
        error: error instanceof Error ? error.message : String(error),
        locale,
      }),
    )
    statuses = updateStatus(statuses, locale, {
      error: error instanceof Error ? error.message.slice(0, 500) : '未知翻译错误',
      status: 'failed',
    })
    await updateCollectionStatuses(req, collection, source.id, statuses)
    throw error
  }

  await updateCollectionStatuses(req, collection, source.id, statuses)
  if (options.queueNext !== false) {
    await queueNextLocale(
      req,
      task,
      { documentId: String(source.id), sourceHash },
      statuses,
      locale,
    )
  }
  return { failed: 0, stale: false, translated: 1 }
}

async function translateCompany(
  req: PayloadRequest,
  input: TranslationTaskInput,
  options: TranslationExecutionOptions = {},
) {
  const payload = req.payload
  const sourceHash = String(input.sourceHash || '')
  const locale = getTranslationLocale(input.locale)
  const source = (await payload.findGlobal({
    slug: 'company',
    locale: 'zh-CN',
    fallbackLocale: false,
    overrideAccess: true,
    req,
  })) as CompanyTranslationSource
  if (source.translationSourceHash !== sourceHash) {
    return { failed: 0, stale: true, translated: 0 }
  }

  let statuses = (source.translationStatus || []) as TranslationStatus[]
  const firstPendingLocale = getNextTranslationLocale(statuses, sourceHash)
  if (firstPendingLocale !== locale) {
    if (firstPendingLocale && options.queueNext !== false) {
      await queueTranslationTask(req, 'translateCompany', {
        locale: firstPendingLocale,
        sourceHash,
      })
    }
    return { failed: 0, stale: false, translated: 0 }
  }

  statuses = updateStatus(statuses, locale, { error: null, status: 'translating' })
  await payload.updateGlobal({
    slug: 'company',
    data: { translationStatus: statuses },
    locale: 'zh-CN',
    overrideAccess: true,
    req,
    ...translationWriteOptions(),
    context: translationStatusContext(),
  })

  try {
    const translationQueue = createTranslationQueue(locale)
    const translate = translationQueue.translate
    await payload.updateGlobal({
      slug: 'company',
      data: {
        heroTitle: (await translate(source.heroTitle)) ?? undefined,
        heroDescription: (await translate(source.heroDescription)) ?? undefined,
        aboutTitle: await translate(source.aboutTitle),
        aboutDescription: await translate(source.aboutDescription),
        highlights: await Promise.all(
          (source.highlights || []).map(async (item: Record<string, unknown>) => ({
            ...item,
            title: (await translate(item.title as string)) ?? undefined,
            description: (await translate(item.description as string)) ?? undefined,
          })),
        ),
        contact: {
          ...source.contact,
          address: await translate(source.contact?.address),
        },
      },
      locale,
      overrideAccess: true,
      req,
      ...translationWriteOptions(),
      context: translationWriteContext(locale),
    })
    statuses = updateStatus(statuses, locale, {
      error: translationQueue.hasPartial() ? '本地字典未覆盖部分原文，未命中的内容已保留。' : null,
      sourceHash,
      status: translationQueue.hasPartial() ? 'partial' : 'complete',
    })
  } catch (error) {
    console.log(
      '[translation-task] error',
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        locale,
        task: 'translateCompany',
      }),
    )
    statuses = updateStatus(statuses, locale, {
      error: error instanceof Error ? error.message.slice(0, 500) : '未知翻译错误',
      status: 'failed',
    })
    await payload.updateGlobal({
      slug: 'company',
      data: { translationStatus: statuses },
      locale: 'zh-CN',
      overrideAccess: true,
      req,
      ...translationWriteOptions(),
      context: translationStatusContext(),
    })
    throw error
  }

  await payload.updateGlobal({
    slug: 'company',
    data: { translationStatus: statuses },
    locale: 'zh-CN',
    overrideAccess: true,
    req,
    ...translationWriteOptions(),
    context: translationStatusContext(),
  })
  if (options.queueNext !== false) {
    await queueNextLocale(req, 'translateCompany', { sourceHash }, statuses, locale)
  }
  return { failed: 0, stale: false, translated: 1 }
}

export async function runTranslationTaskDirect(
  req: PayloadRequest,
  task: TranslationTaskSlug,
  input: TranslationTaskInput,
) {
  if (task === 'translateCompany') return translateCompany(req, input, { queueNext: false })
  return translateCollection(req, task === 'translateProduct' ? 'products' : 'posts', input, {
    queueNext: false,
  })
}

const taskBase = {
  concurrency: {
    // One global key makes every translation task share a single worker slot,
    // even when two cron invocations overlap or multiple app instances run.
    key: () => 'translation-global',
  },
  inputSchema,
  outputSchema,
  retries: {
    attempts: 3,
    backoff: { delay: 2_000, type: 'exponential' },
  },
} as const

export const translationTasks: TaskConfig[] = [
  {
    ...taskBase,
    slug: 'translateProduct',
    label: '翻译商品',
    handler: async ({ input, req }) => {
      const output = await translateCollection(req, 'products', input as TranslationTaskInput)
      return { output }
    },
  },
  {
    ...taskBase,
    slug: 'translatePost',
    label: '翻译文章',
    handler: async ({ input, req }) => {
      const output = await translateCollection(req, 'posts', input as TranslationTaskInput)
      return { output }
    },
  },
  {
    ...taskBase,
    slug: 'translateCompany',
    label: '翻译公司资料',
    handler: async ({ input, req }) => {
      const output = await translateCompany(req, input as TranslationTaskInput)
      return { output }
    },
  },
]
