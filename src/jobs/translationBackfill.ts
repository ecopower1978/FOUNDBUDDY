import { createLocalReq, type Payload, type PayloadRequest } from 'payload'

import {
  buildTranslationStatuses,
  contentHash,
  queueTranslationTask,
  TRANSLATION_CONTEXT_KEY,
  translationLocaleOrder,
  type TranslationStatus,
  type TranslationTargetLocale,
} from '@/i18n/translationWorkflow'

const targetLocales = translationLocaleOrder

type TranslationDocument = {
  id: number | string
  title?: unknown
  shortDescription?: unknown
  category?: unknown
  description?: unknown
  specifications?: unknown
  content?: unknown
  excerpt?: unknown
  meta?: unknown
  heroTitle?: unknown
  heroDescription?: unknown
  aboutTitle?: unknown
  aboutDescription?: unknown
  highlights?: unknown
  contact?: { address?: unknown } | null
  translationSourceHash?: string | null
  translationStatus?: TranslationStatus[] | null
}

type TranslationBackfillResult = {
  company: number
  posts: number
  products: number
}

type TranslationBackfillOptions = {
  enqueue?: boolean
  refreshAuto?: boolean
}

const context = { [TRANSLATION_CONTEXT_KEY]: true }

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasProductTranslation(doc: TranslationDocument) {
  return hasText(doc.title) && hasText(doc.shortDescription)
}

function hasPostTranslation(doc: TranslationDocument) {
  return hasText(doc.title) && Boolean(doc.content && typeof doc.content === 'object')
}

function hasCompanyTranslation(doc: TranslationDocument) {
  return hasText(doc.heroTitle) && hasText(doc.heroDescription)
}

function existingStatusLocales(statuses: TranslationStatus[] | null | undefined) {
  return new Set((statuses || []).map((status) => status.locale))
}

function mergeExistingLocalizedContent(
  statuses: TranslationStatus[],
  previous: TranslationStatus[] | null | undefined,
  existingLocales: Set<TranslationTargetLocale>,
) {
  const knownStatuses = existingStatusLocales(previous)
  return statuses.map((status) =>
    existingLocales.has(status.locale) && !knownStatuses.has(status.locale)
      ? {
          ...status,
          mode: 'manual' as const,
          sourceHash: status.sourceHash,
          status: 'complete' as const,
        }
      : status,
  )
}

function needsMetadataBackfill(doc: TranslationDocument, sourceHash: string): boolean {
  const statuses = Array.isArray(doc.translationStatus) ? doc.translationStatus : []
  return (
    doc.translationSourceHash !== sourceHash ||
    statuses.length !== targetLocales.length ||
    targetLocales.some((locale) => {
      const status = statuses.find((item) => item.locale === locale)
      return !status || status.sourceHash !== sourceHash
    })
  )
}

function needsQueue(statuses: TranslationStatus[]) {
  return statuses.some(
    (status) => status.mode === 'auto' && ['pending', 'translating'].includes(status.status),
  )
}

function hasMissingLocalizedContent(
  statuses: TranslationStatus[] | null | undefined,
  existingLocales: Set<TranslationTargetLocale>,
) {
  return targetLocales.some(
    (locale) =>
      !existingLocales.has(locale) && Boolean(statuses?.some((item) => item.locale === locale)),
  )
}

function repairMissingLocalizedContent(
  statuses: TranslationStatus[],
  existingLocales: Set<TranslationTargetLocale>,
) {
  return statuses.map((status) =>
    existingLocales.has(status.locale)
      ? status
      : {
          ...status,
          error: null,
          mode: 'auto' as const,
          status: 'pending' as const,
        },
  )
}

async function localizedCollectionLocalesByID(
  payload: Payload,
  req: PayloadRequest,
  collection: 'posts' | 'products',
  hasTranslation: (doc: TranslationDocument) => boolean,
) {
  const localizedDocs = await Promise.all(
    targetLocales.map(async (locale) => {
      const localeReq = await createLocalReq(
        { context: req.context, fallbackLocale: false, locale },
        payload,
      )
      const result = await payload.find({
        collection,
        depth: 0,
        fallbackLocale: false,
        limit: 0,
        locale,
        overrideAccess: true,
        pagination: false,
        req: localeReq,
      })
      return { docs: result.docs as unknown as TranslationDocument[], locale }
    }),
  )
  const localesByID = new Map<string, Set<TranslationTargetLocale>>()
  for (const { docs, locale } of localizedDocs) {
    for (const doc of docs) {
      if (!hasTranslation(doc)) continue
      const locales = localesByID.get(String(doc.id)) || new Set<TranslationTargetLocale>()
      locales.add(locale)
      localesByID.set(String(doc.id), locales)
    }
  }
  return localesByID
}

async function localizedCompanyLocales(payload: Payload, req: PayloadRequest) {
  const localesWithContent = await Promise.all(
    targetLocales.map(async (locale) => {
      const localeReq = await createLocalReq(
        { context: req.context, fallbackLocale: false, locale },
        payload,
      )
      const doc = (await payload.findGlobal({
        slug: 'company',
        depth: 0,
        fallbackLocale: false,
        locale,
        overrideAccess: true,
        req: localeReq,
      })) as TranslationDocument
      return hasCompanyTranslation(doc) ? locale : null
    }),
  )
  return new Set(
    localesWithContent.filter((locale): locale is TranslationTargetLocale => locale !== null),
  )
}

async function backfillCollection(
  payload: Payload,
  req: PayloadRequest,
  collection: 'posts' | 'products',
  task: 'translatePost' | 'translateProduct',
  hasTranslation: (doc: TranslationDocument) => boolean,
  options: TranslationBackfillOptions,
): Promise<number> {
  const result = await payload.find({
    collection,
    depth: 0,
    fallbackLocale: false,
    limit: 0,
    locale: 'zh-CN',
    overrideAccess: true,
    pagination: false,
    req,
  })
  let queued = 0
  const localesByID = await localizedCollectionLocalesByID(payload, req, collection, hasTranslation)

  for (const rawDoc of result.docs) {
    const doc = rawDoc as unknown as TranslationDocument
    const source =
      collection === 'products'
        ? {
            category: doc.category,
            description: doc.description,
            shortDescription: doc.shortDescription,
            specifications: doc.specifications,
            title: doc.title,
          }
        : {
            content: doc.content,
            excerpt: doc.excerpt,
            meta: doc.meta,
            title: doc.title,
          }
    const sourceHash = contentHash(source)
    const currentStatuses = doc.translationStatus || []
    const existingLocales = localesByID.get(String(doc.id)) || new Set<TranslationTargetLocale>()
    const shouldRefreshAuto =
      options.refreshAuto && currentStatuses.some((status) => status.mode === 'auto')
    const hasQueuedTranslationWork = needsQueue(currentStatuses)
    if (
      !needsMetadataBackfill(doc, sourceHash) &&
      !shouldRefreshAuto &&
      !hasMissingLocalizedContent(currentStatuses, existingLocales) &&
      !hasQueuedTranslationWork
    ) {
      continue
    }

    const statuses = mergeExistingLocalizedContent(
      buildTranslationStatuses(currentStatuses, sourceHash),
      currentStatuses,
      existingLocales,
    )
    const repairedStatuses = repairMissingLocalizedContent(statuses, existingLocales)

    await payload.update({
      collection,
      id: doc.id,
      data: {
        translationSourceHash: sourceHash,
        translationStatus: repairedStatuses,
      },
      locale: 'zh-CN',
      overrideAccess: true,
      req,
      context,
    })
    if (needsQueue(repairedStatuses) && options.enqueue !== false) {
      await queueTranslationTask(req, task, {
        documentId: String(doc.id),
        sourceHash,
      })
      queued += 1
    }
  }
  return queued
}

async function backfillCompany(
  payload: Payload,
  req: PayloadRequest,
  options: TranslationBackfillOptions,
) {
  const doc = (await payload.findGlobal({
    slug: 'company',
    depth: 0,
    fallbackLocale: false,
    locale: 'zh-CN',
    overrideAccess: true,
    req,
  })) as TranslationDocument
  const source = {
    aboutDescription: doc.aboutDescription,
    aboutTitle: doc.aboutTitle,
    address: doc.contact?.address,
    heroDescription: doc.heroDescription,
    heroTitle: doc.heroTitle,
    highlights: doc.highlights,
  }
  const sourceHash = contentHash(source)
  const currentStatuses = doc.translationStatus || []
  const existingLocales = await localizedCompanyLocales(payload, req)
  const shouldRefreshAuto =
    options.refreshAuto && currentStatuses.some((status) => status.mode === 'auto')
  const hasQueuedTranslationWork = needsQueue(currentStatuses)
  if (
    !needsMetadataBackfill(doc, sourceHash) &&
    !shouldRefreshAuto &&
    !hasMissingLocalizedContent(currentStatuses, existingLocales) &&
    !hasQueuedTranslationWork
  ) {
    return 0
  }

  const statuses = mergeExistingLocalizedContent(
    buildTranslationStatuses(currentStatuses, sourceHash),
    currentStatuses,
    existingLocales,
  )
  const repairedStatuses = repairMissingLocalizedContent(statuses, existingLocales)

  await payload.updateGlobal({
    slug: 'company',
    data: {
      translationSourceHash: sourceHash,
      translationStatus: repairedStatuses,
    },
    locale: 'zh-CN',
    overrideAccess: true,
    req,
    context,
  })
  if (!needsQueue(repairedStatuses) || options.enqueue === false) return 0

  await queueTranslationTask(req, 'translateCompany', { sourceHash })
  return 1
}

/**
 * Rehydrates translation metadata for legacy/imported records and queues only
 * records whose source metadata is missing or stale. Existing localized fields
 * without workflow metadata are treated as manual so the repair cannot erase
 * previously maintained translations.
 */
export async function queueMissingTranslationJobs(
  payload: Payload,
  req: PayloadRequest,
  options: TranslationBackfillOptions = {},
): Promise<TranslationBackfillResult> {
  return {
    company: await backfillCompany(payload, req, options),
    posts: await backfillCollection(
      payload,
      req,
      'posts',
      'translatePost',
      hasPostTranslation,
      options,
    ),
    products: await backfillCollection(
      payload,
      req,
      'products',
      'translateProduct',
      hasProductTranslation,
      options,
    ),
  }
}
