import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import { type SiteLocale } from '@/i18n/config'
import { translateLexical, translateText } from '@/i18n/autoTranslate'
import {
  getNextTranslationLocale,
  getTranslationLocale,
  queueTranslationTask,
  TRANSLATION_CONTEXT_KEY,
  translationLocaleOrder,
  type TranslationStatus,
  type TranslationTargetLocale,
} from '@/i18n/translationWorkflow'

type TranslationTaskSlug = 'translateCompany' | 'translatePost' | 'translateProduct'
type TaskInput = { documentId?: string; locale?: string; sourceHash?: string }
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
 * Serialize every upstream translation request within one language task.
 * Some rich-text and specification fields are traversed with Promise.all for
 * data-shape convenience; this queue keeps the actual HTTP calls one at a
 * time so those traversals cannot burst the LibreTranslate process.
 */
function createTranslationQueue(target: TranslationTargetLocale) {
  let tail: Promise<void> = Promise.resolve()
  let failure: unknown

  function translate(value: string): Promise<string>
  function translate(value?: string | null): Promise<string | null | undefined>
  function translate(value?: string | null): Promise<string | null | undefined> {
    if (!value?.trim()) return Promise.resolve(value)

    const result = tail.then(() => {
      if (failure) throw failure
      return translateText(value, 'zh-CN', target)
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

  return translate
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
  payload: Payload,
  collection: 'posts' | 'products',
  id: number | string,
  statuses: TranslationStatus[],
) {
  await payload.update({
    collection,
    id,
    data: { translationStatus: statuses },
    locale: 'zh-CN',
    overrideAccess: true,
    context: { [TRANSLATION_CONTEXT_KEY]: true },
  })
}

async function translateCollection(
  req: PayloadRequest,
  collection: 'posts' | 'products',
  input: TaskInput,
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
  })) as CollectionTranslationSource

  if (source.translationSourceHash !== sourceHash) {
    return { failed: 0, stale: true, translated: 0 }
  }

  let statuses = (source.translationStatus || []) as TranslationStatus[]
  const firstPendingLocale = getNextTranslationLocale(statuses, sourceHash)
  if (firstPendingLocale !== locale) {
    if (firstPendingLocale) {
      await queueTranslationTask(req, task, {
        documentId: String(source.id),
        locale: firstPendingLocale,
        sourceHash,
      })
    }
    return { failed: 0, stale: false, translated: 0 }
  }

  statuses = updateStatus(statuses, locale, { error: null, status: 'translating' })
  await updateCollectionStatuses(payload, collection, source.id, statuses)

  try {
    const translate = createTranslationQueue(locale)
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
      context: { [TRANSLATION_CONTEXT_KEY]: true, translationLocale: locale },
    })
    statuses = updateStatus(statuses, locale, {
      error: null,
      sourceHash,
      status: 'complete',
    })
  } catch (error) {
    statuses = updateStatus(statuses, locale, {
      error: error instanceof Error ? error.message.slice(0, 500) : '未知翻译错误',
      status: 'failed',
    })
    await updateCollectionStatuses(payload, collection, source.id, statuses)
    throw error
  }

  await updateCollectionStatuses(payload, collection, source.id, statuses)
  await queueNextLocale(req, task, { documentId: String(source.id), sourceHash }, statuses, locale)
  return { failed: 0, stale: false, translated: 1 }
}

async function translateCompany(req: PayloadRequest, input: TaskInput) {
  const payload = req.payload
  const sourceHash = String(input.sourceHash || '')
  const locale = getTranslationLocale(input.locale)
  const source = (await payload.findGlobal({
    slug: 'company',
    locale: 'zh-CN',
    fallbackLocale: false,
    overrideAccess: true,
  })) as CompanyTranslationSource
  if (source.translationSourceHash !== sourceHash) {
    return { failed: 0, stale: true, translated: 0 }
  }

  let statuses = (source.translationStatus || []) as TranslationStatus[]
  const firstPendingLocale = getNextTranslationLocale(statuses, sourceHash)
  if (firstPendingLocale !== locale) {
    if (firstPendingLocale) {
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
    context: { [TRANSLATION_CONTEXT_KEY]: true },
  })

  try {
    const translate = createTranslationQueue(locale)
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
      context: { [TRANSLATION_CONTEXT_KEY]: true, translationLocale: locale },
    })
    statuses = updateStatus(statuses, locale, {
      error: null,
      sourceHash,
      status: 'complete',
    })
  } catch (error) {
    statuses = updateStatus(statuses, locale, {
      error: error instanceof Error ? error.message.slice(0, 500) : '未知翻译错误',
      status: 'failed',
    })
    await payload.updateGlobal({
      slug: 'company',
      data: { translationStatus: statuses },
      locale: 'zh-CN',
      overrideAccess: true,
      context: { [TRANSLATION_CONTEXT_KEY]: true },
    })
    throw error
  }

  await payload.updateGlobal({
    slug: 'company',
    data: { translationStatus: statuses },
    locale: 'zh-CN',
    overrideAccess: true,
    context: { [TRANSLATION_CONTEXT_KEY]: true },
  })
  await queueNextLocale(req, 'translateCompany', { sourceHash }, statuses, locale)
  return { failed: 0, stale: false, translated: 1 }
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
    handler: async ({ input, req }) => ({
      output: await translateCollection(req, 'products', input as TaskInput),
    }),
  },
  {
    ...taskBase,
    slug: 'translatePost',
    label: '翻译文章',
    handler: async ({ input, req }) => ({
      output: await translateCollection(req, 'posts', input as TaskInput),
    }),
  },
  {
    ...taskBase,
    slug: 'translateCompany',
    label: '翻译公司资料',
    handler: async ({ input, req }) => ({
      output: await translateCompany(req, input as TaskInput),
    }),
  },
]
