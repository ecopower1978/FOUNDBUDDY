import type { Payload, PayloadRequest } from 'payload'

import {
  buildTranslationStatuses,
  contentHash,
  queueTranslationTask,
  TRANSLATION_CONTEXT_KEY,
  type TranslationStatus,
  type TranslationTargetLocale,
} from '@/i18n/translationWorkflow'
import { locales, type SiteLocale } from '@/i18n/config'

const targetLocales = locales.filter(
  (locale): locale is TranslationTargetLocale => locale !== 'zh-CN',
)

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
  existingLocales: Set<SiteLocale>,
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

function needsMetadataBackfill(
  doc: TranslationDocument,
  sourceHash: string,
): boolean {
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

async function localizedCollectionLocales(
  payload: Payload,
  req: PayloadRequest,
  collection: 'posts' | 'products',
  id: number | string,
  hasTranslation: (doc: TranslationDocument) => boolean,
) {
  const existing = new Set<SiteLocale>()
  for (const locale of targetLocales) {
    const doc = (await payload.findByID({
      collection,
      id,
      depth: 0,
      fallbackLocale: false,
      locale,
      overrideAccess: true,
      req,
    })) as TranslationDocument
    if (hasTranslation(doc)) existing.add(locale)
  }
  return existing
}

async function localizedCompanyLocales(payload: Payload, req: PayloadRequest) {
  const existing = new Set<SiteLocale>()
  for (const locale of targetLocales) {
    const doc = (await payload.findGlobal({
      slug: 'company',
      depth: 0,
      fallbackLocale: false,
      locale,
      overrideAccess: true,
      req,
    })) as TranslationDocument
    if (hasCompanyTranslation(doc)) existing.add(locale)
  }
  return existing
}

async function backfillCollection(
  payload: Payload,
  req: PayloadRequest,
  collection: 'posts' | 'products',
  task: 'translatePost' | 'translateProduct',
  hasTranslation: (doc: TranslationDocument) => boolean,
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
    if (!needsMetadataBackfill(doc, sourceHash)) continue

    const currentStatuses = doc.translationStatus || []
    const existingLocales = await localizedCollectionLocales(
      payload,
      req,
      collection,
      doc.id,
      hasTranslation,
    )
    const statuses = mergeExistingLocalizedContent(
      buildTranslationStatuses(currentStatuses, sourceHash),
      currentStatuses,
      existingLocales,
    )

    await payload.update({
      collection,
      id: doc.id,
      data: {
        translationSourceHash: sourceHash,
        translationStatus: statuses,
      },
      locale: 'zh-CN',
      overrideAccess: true,
      req,
      context,
    })
    if (needsQueue(statuses)) {
      await queueTranslationTask(req, task, {
        documentId: String(doc.id),
        sourceHash,
      })
      queued += 1
    }
  }
  return queued
}

async function backfillCompany(payload: Payload, req: PayloadRequest) {
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
  if (!needsMetadataBackfill(doc, sourceHash)) return 0

  const currentStatuses = doc.translationStatus || []
  const existingLocales = await localizedCompanyLocales(payload, req)
  const statuses = mergeExistingLocalizedContent(
    buildTranslationStatuses(currentStatuses, sourceHash),
    currentStatuses,
    existingLocales,
  )

  await payload.updateGlobal({
    slug: 'company',
    data: {
      translationSourceHash: sourceHash,
      translationStatus: statuses,
    },
    locale: 'zh-CN',
    overrideAccess: true,
    req,
    context,
  })
  if (!needsQueue(statuses)) return 0

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
): Promise<TranslationBackfillResult> {
  return {
    company: await backfillCompany(payload, req),
    posts: await backfillCollection(payload, req, 'posts', 'translatePost', hasPostTranslation),
    products: await backfillCollection(
      payload,
      req,
      'products',
      'translateProduct',
      hasProductTranslation,
    ),
  }
}
