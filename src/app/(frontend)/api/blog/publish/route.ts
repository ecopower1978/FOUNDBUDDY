import { timingSafeEqual } from 'crypto'
import configPromise from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'
import { z } from 'zod'

import { locales } from '@/i18n/config'
import {
  articlePlainText,
  convertAgentContent,
  type AgentContentFormat,
} from '@/utilities/agentContent'
import { importAgentCoverImage } from '@/utilities/remoteImage'
import {
  claimIdempotencyKey,
  consumeRateLimit,
  releaseIdempotencyKey,
  setIdempotencyValue,
  trustedClientKey,
} from '@/utilities/rateLimit'
import { writeAuditEvent } from '@/utilities/audit'

const MAX_BODY_BYTES = 128 * 1024
const bodySchema = z
  .object({
    content: z.string().trim().min(1).max(100_000),
    contentFormat: z.enum(['auto', 'html', 'markdown', 'plain']).default('auto'),
    heroImageId: z.number().int().positive().optional(),
    heroImageUrl: z.string().url().max(2_048).optional(),
    locale: z.enum(locales).default('zh-CN'),
    slug: z.string().trim().min(1).max(180).optional(),
    status: z.enum(['draft', 'published']).default('draft'),
    summary: z.string().trim().max(260).optional(),
    title: z.string().trim().min(1).max(180),
  })
  .strict()
  .refine((value) => !(value.heroImageId && value.heroImageUrl), {
    message: 'Provide either heroImageId or heroImageUrl, not both',
    path: ['heroImageUrl'],
  })

function tokens() {
  return [
    process.env.BLOG_PUBLISH_TOKEN,
    process.env.BLOG_PUBLISH_TOKEN_PREVIOUS,
    ...(process.env.BLOG_PUBLISH_TOKENS || '').split(','),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
}

function tokenMatches(value: string | null, candidates: string[]) {
  if (!value?.startsWith('Bearer ')) return false
  const provided = Buffer.from(value.slice(7))
  return candidates.some((candidate) => {
    const expected = Buffer.from(candidate)
    return provided.length === expected.length && timingSafeEqual(provided, expected)
  })
}

function slugify(input: string) {
  const slug = input
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `article-${crypto.randomUUID().slice(0, 8)}`
}

export async function POST(request: NextRequest) {
  const configuredTokens = tokens()
  if (!configuredTokens.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const limit = await consumeRateLimit({
    key: `blog:${trustedClientKey(request.headers)}`,
    limit: 30,
    windowSeconds: 3600,
  })
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  if (!tokenMatches(request.headers.get('authorization'), configuredTokens)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    return NextResponse.json({ error: 'A valid Idempotency-Key header is required' }, { status: 400 })
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
  }
  const parsed = bodySchema.safeParse(
    (() => {
      try {
        return JSON.parse(rawBody)
      } catch {
        return null
      }
    })(),
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const requestID = crypto.randomUUID()
  const claim = await claimIdempotencyKey(idempotencyKey, requestID)
  if (!claim.acquired) {
    if (claim.value?.startsWith('pending:')) {
      return NextResponse.json({ error: 'A matching request is still processing' }, { status: 409 })
    }
    try {
      return NextResponse.json(JSON.parse(claim.value || '{}'), {
        headers: { 'Idempotency-Replayed': 'true' },
      })
    } catch {
      return NextResponse.json({ error: 'Stored idempotency result is invalid' }, { status: 500 })
    }
  }

  try {
    const payload = await getPayload({ config: configPromise })
    const {
      content,
      contentFormat,
      heroImageId,
      heroImageUrl,
      locale,
      status,
      summary,
      title,
    } = parsed.data
    const req = await createLocalReq({ fallbackLocale: false, locale }, payload)
    const baseSlug = slugify(parsed.data.slug || title)
    const existing = await payload.find({
      collection: 'posts',
      fallbackLocale: false,
      limit: 1,
      locale,
      overrideAccess: true,
      pagination: false,
      where: { slug: { equals: baseSlug } },
    })
    const slug = existing.totalDocs
      ? `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`
      : baseSlug
    const lexicalContent = await convertAgentContent({
      content,
      format: contentFormat as AgentContentFormat,
      payload,
    })
    const importedCover = heroImageUrl
      ? await importAgentCoverImage({
          alt: title,
          locale,
          payload,
          req,
          url: heroImageUrl,
        })
      : undefined
    const resolvedHeroImageID = heroImageId || importedCover?.id
    const excerpt = summary || articlePlainText(content).slice(0, 220)

    const post = await payload.create({
      collection: 'posts',
      data: {
        _status: status,
        content: lexicalContent,
        excerpt,
        heroImage: resolvedHeroImageID,
        publishedAt: status === 'published' ? new Date().toISOString() : undefined,
        slug,
        title,
      },
      draft: status === 'draft',
      locale,
      overrideAccess: true,
    })

    await writeAuditEvent(req, {
      action: 'automation.publish',
      entityId: post.id,
      entityType: 'posts',
      metadata: {
        contentFormat,
        coverImported: Boolean(importedCover),
        idempotencyKey,
        locale,
        requestID,
        status,
      },
      summary: `自动化${status === 'published' ? '发布' : '创建草稿'}：${post.title}`,
    })

    const response = {
      id: post.id,
      coverImageId: resolvedHeroImageID || null,
      locale,
      ok: true,
      requestID,
      status,
      url: `/${locale}/posts/${post.slug}`,
    }
    await setIdempotencyValue(idempotencyKey, JSON.stringify(response))
    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    await releaseIdempotencyKey(idempotencyKey)
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? { message: error.cause.message, name: error.cause.name }
        : undefined
    const validationErrors =
      error &&
      typeof error === 'object' &&
      'data' in error &&
      error.data &&
      typeof error.data === 'object' &&
      'errors' in error.data &&
      Array.isArray(error.data.errors)
        ? error.data.errors.map((item) => {
            if (!item || typeof item !== 'object') return 'unknown'
            const message =
              'message' in item && typeof item.message === 'string' ? item.message : 'invalid'
            const path = 'path' in item && typeof item.path === 'string' ? item.path : 'unknown'
            return `${path}: ${message}`
          })
        : undefined
    const errorSummary =
      error instanceof Error
        ? {
            cause,
            message: error.message.split('\n', 1)[0],
            name: error.name,
            validationErrors,
          }
        : { message: 'Unknown error', name: 'UnknownError' }
    console.error({
      error: errorSummary,
      message: 'Blog automation failed',
      requestID,
      status: 'failed',
    })
    return NextResponse.json({ error: 'Unable to publish article', requestID }, { status: 500 })
  }
}
