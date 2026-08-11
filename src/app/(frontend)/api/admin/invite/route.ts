import { randomBytes } from 'crypto'
import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'
import { z } from 'zod'

import { isOwner } from '@/access/roles'
import { isSMTPConfigured } from '@/config/env'

const schema = z
  .object({
    email: z.string().email(),
    name: z.string().trim().min(1).max(120),
    role: z.enum(['owner', 'editor']).default('editor'),
  })
  .strict()

export async function POST(request: Request) {
  if (!isSMTPConfigured) {
    return NextResponse.json({ error: '邮件服务尚未配置。' }, { status: 503 })
  }

  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user: user || undefined }, payload)
  if (!isOwner(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const created = await payload.create({
    collection: 'users',
    data: {
      ...parsed.data,
      password: randomBytes(48).toString('base64url'),
    },
    overrideAccess: true,
    req,
  })

  try {
    await payload.forgotPassword({
      collection: 'users',
      data: { email: created.email },
      expiration: 24 * 60 * 60 * 1000,
      overrideAccess: true,
      req,
    })
  } catch {
    await payload.delete({
      collection: 'users',
      id: created.id,
      overrideAccess: true,
      req,
    })
    return NextResponse.json({ error: '邀请邮件发送失败，账号未创建。' }, { status: 502 })
  }

  return NextResponse.json(
    { email: created.email, id: created.id, ok: true, role: created.role },
    { status: 201 },
  )
}
