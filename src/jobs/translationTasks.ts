import type { Payload, TaskConfig } from 'payload'

import { locales, type SiteLocale } from '@/i18n/config'
import { translateLexical, translateText } from '@/i18n/autoTranslate'
import {
  TRANSLATION_CONTEXT_KEY,
  type TranslationStatus,
} from '@/i18n/translationWorkflow'

type TaskInput = { documentId?: string; sourceHash?: string }
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
  payload: Payload,
  collection: 'posts' | 'products',
  input: TaskInput,
) {
  const id = input.documentId || ''
  const source = (await payload.findByID({
    collection,
    id,
    locale: 'zh-CN',
    fallbackLocale: false,
    overrideAccess: true,
  })) as CollectionTranslationSource

  if (source.translationSourceHash !== input.sourceHash) {
    return { failed: 0, stale: true, translated: 0 }
  }

  let statuses = (source.translationStatus || []) as TranslationStatus[]
  let translated = 0
  let failed = 0

  for (const locale of locales.filter((item) => item !== 'zh-CN')) {
    const status = statuses.find((item) => item.locale === locale)
    if (status?.mode === 'manual') continue
    if (status?.status === 'complete' && status.sourceHash === input.sourceHash) continue
    statuses = updateStatus(statuses, locale, { error: null, status: 'translating' })
    await updateCollectionStatuses(payload, collection, source.id, statuses)

    try {
      const data =
        collection === 'products'
          ? {
              title: await translateText(source.title, 'zh-CN', locale),
              shortDescription: await translateText(
                source.shortDescription,
                'zh-CN',
                locale,
              ),
              category: source.category
                ? await translateText(source.category, 'zh-CN', locale)
                : source.category,
              description: source.description
                ? await translateText(source.description, 'zh-CN', locale)
                : source.description,
              specifications: await Promise.all(
                (source.specifications || []).map(
                  async (item: Record<string, unknown>) => ({
                    ...item,
                    name: item.name
                      ? await translateText(String(item.name), 'zh-CN', locale)
                      : item.name,
                    value: item.value
                      ? await translateText(String(item.value), 'zh-CN', locale)
                      : item.value,
                  }),
                ),
              ),
            }
          : {
              title: await translateText(source.title, 'zh-CN', locale),
              excerpt: source.excerpt
                ? await translateText(source.excerpt, 'zh-CN', locale)
                : source.excerpt,
              content: await translateLexical(source.content, (value) =>
                value ? translateText(value, 'zh-CN', locale) : Promise.resolve(value),
              ),
              meta: {
                ...source.meta,
                title: source.meta?.title
                  ? await translateText(source.meta.title, 'zh-CN', locale)
                  : source.meta?.title,
                description: source.meta?.description
                  ? await translateText(source.meta.description, 'zh-CN', locale)
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
        sourceHash: input.sourceHash,
        status: 'complete',
      })
      translated += 1
    } catch (error) {
      statuses = updateStatus(statuses, locale, {
        error: error instanceof Error ? error.message.slice(0, 500) : '未知翻译错误',
        status: 'failed',
      })
      failed += 1
    }
    await updateCollectionStatuses(payload, collection, source.id, statuses)
  }

  if (failed > 0) throw new Error(`${failed} locale translations failed`)
  return { failed, stale: false, translated }
}

async function translateCompany(payload: Payload, input: TaskInput) {
  const source = (await payload.findGlobal({
    slug: 'company',
    locale: 'zh-CN',
    fallbackLocale: false,
    overrideAccess: true,
  })) as CompanyTranslationSource
  if (source.translationSourceHash !== input.sourceHash) {
    return { failed: 0, stale: true, translated: 0 }
  }

  let statuses = (source.translationStatus || []) as TranslationStatus[]
  let translated = 0
  let failed = 0

  for (const locale of locales.filter((item) => item !== 'zh-CN')) {
    const status = statuses.find((item) => item.locale === locale)
    if (status?.mode === 'manual') continue
    if (status?.status === 'complete' && status.sourceHash === input.sourceHash) continue
    statuses = updateStatus(statuses, locale, { error: null, status: 'translating' })
    await payload.updateGlobal({
      slug: 'company',
      data: { translationStatus: statuses },
      locale: 'zh-CN',
      overrideAccess: true,
      context: { [TRANSLATION_CONTEXT_KEY]: true },
    })

    try {
      const translate = (value?: string | null) =>
        value ? translateText(value, 'zh-CN', locale) : Promise.resolve(value)
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
        sourceHash: input.sourceHash,
        status: 'complete',
      })
      translated += 1
    } catch (error) {
      statuses = updateStatus(statuses, locale, {
        error: error instanceof Error ? error.message.slice(0, 500) : '未知翻译错误',
        status: 'failed',
      })
      failed += 1
    }
    await payload.updateGlobal({
      slug: 'company',
      data: { translationStatus: statuses },
      locale: 'zh-CN',
      overrideAccess: true,
      context: { [TRANSLATION_CONTEXT_KEY]: true },
    })
  }
  if (failed > 0) throw new Error(`${failed} company locale translations failed`)
  return { failed, stale: false, translated }
}

const taskBase = {
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
      output: await translateCollection(req.payload, 'products', input as TaskInput),
    }),
  },
  {
    ...taskBase,
    slug: 'translatePost',
    label: '翻译文章',
    handler: async ({ input, req }) => ({
      output: await translateCollection(req.payload, 'posts', input as TaskInput),
    }),
  },
  {
    ...taskBase,
    slug: 'translateCompany',
    label: '翻译公司资料',
    handler: async ({ input, req }) => ({
      output: await translateCompany(req.payload, input as TaskInput),
    }),
  },
]
