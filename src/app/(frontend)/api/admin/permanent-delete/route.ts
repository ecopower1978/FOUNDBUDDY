import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'
import { z } from 'zod'

import { isOwner } from '@/access/roles'

const schema = z.object({
  collection: z.enum(['posts', 'products']),
  id: z.coerce.number().int().positive(),
  title: z.string().min(1).max(500),
})

export async function POST(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user: user || undefined }, payload)
  if (!isOwner(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '删除确认信息无效。' }, { status: 400 })
  }

  const doc = await payload.findByID({
    collection: parsed.data.collection,
    id: parsed.data.id,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (doc.title !== parsed.data.title) {
    return NextResponse.json({ error: '名称不一致，未执行删除。' }, { status: 409 })
  }

  await payload.delete({
    collection: parsed.data.collection,
    id: parsed.data.id,
    context: { permanentDeleteConfirmed: true },
    overrideAccess: true,
    req,
  })
  return NextResponse.json({ deleted: true })
}
