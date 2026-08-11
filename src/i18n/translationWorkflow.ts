import { createHash } from 'crypto'
import type {
  CollectionAfterChangeHook,
  Field,
  GlobalAfterChangeHook,
  PayloadRequest,
} from 'payload'

import { isSiteLocale, locales, type SiteLocale } from './config'
import { isEditorOrOwner } from '@/access/roles'

export type TranslationMode = 'auto' | 'manual'
export type TranslationTargetLocale = Exclude<SiteLocale, 'zh-CN'>
export type TranslationState =
  | 'complete'
  | 'failed'
  | 'partial'
  | 'pending'
  | 'translating'

export type TranslationStatus = {
  error?: string | null
  locale: TranslationTargetLocale
  mode: TranslationMode
  sourceHash?: string | null
  status: TranslationState
  updatedAt?: string | null
}

export const TRANSLATION_CONTEXT_KEY = 'translationWorkflow'

type TranslationHookDocument = Record<string, unknown> & {
  contact?: { address?: unknown } | null
  id?: number | string
  translationSourceHash?: string | null
  translationStatus?: TranslationStatus[] | null
}

export const translationFields: Field[] = [
  {
    name: 'translationSourceHash',
    type: 'text',
    access: {
      create: () => false,
      read: ({ req }) => isEditorOrOwner(req),
      update: () => false,
    },
    admin: { hidden: true, readOnly: true },
  },
  {
    name: 'translationStatus',
    type: 'array',
    access: {
      create: () => false,
      read: ({ req }) => isEditorOrOwner(req),
      update: () => false,
    },
    admin: {
      components: {
        Cell: '@/components/TranslationStatusCell',
      },
      description:
        '保存中文原文后系统会在后台翻译。失败语言可从编辑页右侧重新提交。',
      position: 'sidebar',
      readOnly: true,
    },
    label: '翻译状态',
    fields: [
      {
        name: 'locale',
        type: 'select',
        required: true,
        options: locales
          .filter((locale) => locale !== 'zh-CN')
          .map((locale) => ({ label: locale, value: locale })),
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        options: [
          { label: '等待翻译', value: 'pending' },
          { label: '翻译中', value: 'translating' },
          { label: '已完成', value: 'complete' },
          { label: '部分完成', value: 'partial' },
          { label: '失败', value: 'failed' },
        ],
      },
      {
        name: 'mode',
        type: 'select',
        required: true,
        options: [
          { label: '自动翻译', value: 'auto' },
          { label: '手工维护', value: 'manual' },
        ],
      },
      { name: 'sourceHash', type: 'text' },
      { name: 'updatedAt', type: 'date' },
      { name: 'error', type: 'textarea' },
    ],
  },
  {
    name: 'translationRetry',
    type: 'ui',
    admin: {
      components: {
        Field: '@/components/TranslationRetryButton',
      },
      position: 'sidebar',
    },
  },
]

export function getRequestLocale(req: PayloadRequest): SiteLocale {
  const value = (req as PayloadRequest & { locale?: string }).locale
  return isSiteLocale(value) ? value : 'zh-CN'
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function nextStatuses(
  current: TranslationStatus[] | null | undefined,
  sourceHash: string,
): TranslationStatus[] {
  const byLocale = new Map((current || []).map((item) => [item.locale, item]))
  return locales
    .filter((locale) => locale !== 'zh-CN')
    .map((locale) => {
      const previous = byLocale.get(locale)
      if (previous?.mode === 'manual') {
        return {
          ...previous,
          error:
            previous.sourceHash === sourceHash
              ? previous.error
              : '原文已更新，手工译文需要复核。',
          sourceHash,
          status:
            previous.sourceHash === sourceHash ? previous.status : ('partial' as const),
          updatedAt: new Date().toISOString(),
        }
      }
      return {
        error: null,
        locale,
        mode: 'auto' as const,
        sourceHash,
        status: 'pending' as const,
        updatedAt: new Date().toISOString(),
      }
    })
}

async function queueTask(
  req: PayloadRequest,
  task: 'translateCompany' | 'translatePost' | 'translateProduct',
  input: Record<string, unknown>,
) {
  await (req.payload.jobs.queue as (args: Record<string, unknown>) => Promise<unknown>)({
    input,
    overrideAccess: true,
    queue: 'translations',
    req,
    task,
  })
}

export function queueCollectionTranslation(
  collection: 'posts' | 'products',
  task: 'translatePost' | 'translateProduct',
  buildSource: (doc: TranslationHookDocument) => unknown,
): CollectionAfterChangeHook {
  return async ({ doc, req }) => {
    if (req.context?.[TRANSLATION_CONTEXT_KEY]) return doc
    const locale = getRequestLocale(req)

    if (locale !== 'zh-CN') {
      const statuses = (doc.translationStatus || []) as TranslationStatus[]
      const sourceHash = String(doc.translationSourceHash || '')
      const updated = statuses.map((item) =>
        item.locale === locale
          ? {
              ...item,
              error: null,
              mode: 'manual' as const,
              sourceHash,
              status: 'complete' as const,
              updatedAt: new Date().toISOString(),
            }
          : item,
      )
      await req.payload.update({
        collection,
        id: doc.id,
        data: { translationStatus: updated },
        locale: 'zh-CN',
        overrideAccess: true,
        req,
        context: { ...req.context, [TRANSLATION_CONTEXT_KEY]: true },
      })
      return doc
    }

    const sourceHash = contentHash(buildSource(doc))
    if (doc.translationSourceHash === sourceHash) return doc
    const translationStatus = nextStatuses(doc.translationStatus, sourceHash)
    await req.payload.update({
      collection,
      id: doc.id,
      data: { translationSourceHash: sourceHash, translationStatus },
      locale: 'zh-CN',
      overrideAccess: true,
      req,
      context: { ...req.context, [TRANSLATION_CONTEXT_KEY]: true },
    })
    await queueTask(req, task, { documentId: String(doc.id), sourceHash })
    return doc
  }
}

export function queueGlobalTranslation(
  global: 'company',
  task: 'translateCompany',
  buildSource: (doc: TranslationHookDocument) => unknown,
): GlobalAfterChangeHook {
  return async ({ doc, req }) => {
    if (req.context?.[TRANSLATION_CONTEXT_KEY]) return doc
    const locale = getRequestLocale(req)
    if (locale !== 'zh-CN') {
      const statuses = (doc.translationStatus || []) as TranslationStatus[]
      const sourceHash = String(doc.translationSourceHash || '')
      const updated = statuses.map((item) =>
        item.locale === locale
          ? {
              ...item,
              error: null,
              mode: 'manual' as const,
              sourceHash,
              status: 'complete' as const,
              updatedAt: new Date().toISOString(),
            }
          : item,
      )
      await req.payload.updateGlobal({
        slug: global,
        data: { translationStatus: updated },
        locale: 'zh-CN',
        overrideAccess: true,
        req,
        context: { ...req.context, [TRANSLATION_CONTEXT_KEY]: true },
      })
      return doc
    }

    const sourceHash = contentHash(buildSource(doc))
    if (doc.translationSourceHash === sourceHash) return doc
    const translationStatus = nextStatuses(doc.translationStatus, sourceHash)
    await req.payload.updateGlobal({
      slug: global,
      data: { translationSourceHash: sourceHash, translationStatus },
      locale: 'zh-CN',
      overrideAccess: true,
      req,
      context: { ...req.context, [TRANSLATION_CONTEXT_KEY]: true },
    })
    await queueTask(req, task, { sourceHash })
    return doc
  }
}

export function isLocaleTranslationComplete(
  doc: { translationStatus?: unknown } | null | undefined,
  locale: SiteLocale,
): boolean {
  if (!doc || locale === 'zh-CN') return true
  const statuses = Array.isArray(doc.translationStatus)
    ? (doc.translationStatus as TranslationStatus[])
    : []
  const item = statuses.find(
    (status: TranslationStatus) => status.locale === locale,
  )
  return item?.status === 'complete'
}
