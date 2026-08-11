import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'
import { z } from 'zod'

import { isEditorOrOwner } from '@/access/roles'
import {
  TRANSLATION_CONTEXT_KEY,
  type TranslationStatus,
} from '@/i18n/translationWorkflow'
import { writeAuditEvent } from '@/utilities/audit'

const schema = z
  .object({
    collection: z.enum(['products', 'posts', 'company']),
    id: z.coerce.number().int().positive().optional(),
    unlockLocale: z
      .enum(['en', 'es', 'ar', 'de', 'he', 'ko', 'pt', 'zh-TW'])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.collection !== 'company' && !value.id) {
      context.addIssue({
        code: 'custom',
        message: '商品或文章重试必须提供 id。',
        path: ['id'],
      })
    }
  })

function resetFailed(
  statuses: TranslationStatus[] | null | undefined,
  unlockLocale?: string,
) {
  return (statuses || []).map((item) =>
    item.locale === unlockLocale
      ? {
          ...item,
          error: null,
          mode: 'auto' as const,
          status: 'pending' as const,
          updatedAt: new Date().toISOString(),
        }
      : item.mode !== 'manual' && (item.status === 'failed' || item.status === 'partial')
      ? { ...item, error: null, status: 'pending' as const, updatedAt: new Date().toISOString() }
      : item,
  )
}

export async function POST(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user: user || undefined }, payload)
  if (!isEditorOrOwner(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { collection, id, unlockLocale } = parsed.data
  const context = { [TRANSLATION_CONTEXT_KEY]: true }
  let sourceHash = ''
  let task: 'translateCompany' | 'translatePost' | 'translateProduct'

  if (collection === 'company') {
    const doc = await payload.findGlobal({
      slug: 'company',
      locale: 'zh-CN',
      overrideAccess: true,
      req,
    })
    sourceHash = doc.translationSourceHash || ''
    task = 'translateCompany'
    await payload.updateGlobal({
      slug: 'company',
      context,
      data: {
        translationStatus: resetFailed(
          doc.translationStatus as TranslationStatus[],
          unlockLocale,
        ),
      },
      locale: 'zh-CN',
      overrideAccess: true,
      req,
    })
  } else if (collection === 'products') {
    const doc = await payload.findByID({
      collection: 'products',
      id: id!,
      locale: 'zh-CN',
      overrideAccess: true,
      req,
    })
    sourceHash = doc.translationSourceHash || ''
    task = 'translateProduct'
    await payload.update({
      collection: 'products',
      context,
      data: {
        translationStatus: resetFailed(
          doc.translationStatus as TranslationStatus[],
          unlockLocale,
        ),
      },
      id: id!,
      locale: 'zh-CN',
      overrideAccess: true,
      req,
    })
  } else {
    const doc = await payload.findByID({
      collection: 'posts',
      id: id!,
      locale: 'zh-CN',
      overrideAccess: true,
      req,
    })
    sourceHash = doc.translationSourceHash || ''
    task = 'translatePost'
    await payload.update({
      collection: 'posts',
      context,
      data: {
        translationStatus: resetFailed(
          doc.translationStatus as TranslationStatus[],
          unlockLocale,
        ),
      },
      id: id!,
      locale: 'zh-CN',
      overrideAccess: true,
      req,
    })
  }

  if (!sourceHash) {
    return NextResponse.json({ error: '请先保存简体中文原文。' }, { status: 409 })
  }
  await payload.jobs.queue({
    input: collection === 'company' ? { sourceHash } : { documentId: String(id), sourceHash },
    overrideAccess: true,
    queue: 'translations',
    req,
    task,
  })
  await writeAuditEvent(req, {
    action: 'translation.retry',
    entityId: id,
    entityType: collection,
    summary: unlockLocale
      ? `解除手工译文锁定并重新翻译：${collection}${id ? ` #${id}` : ''} ${unlockLocale}`
      : `重新提交翻译：${collection}${id ? ` #${id}` : ''}`,
  })

  return NextResponse.json({ ok: true, queued: task })
}
