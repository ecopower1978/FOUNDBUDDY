import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'
import { z } from 'zod'

import { isEditorOrOwner } from '@/access/roles'

const schema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
})

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
      { error: '请选择 1 至 100 个商品。', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const ids = [...new Set(parsed.data.ids)]
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const updated = await payload.update({
        collection: 'products',
        id,
        data: { _status: 'draft' },
        draft: true,
        locale: 'zh-CN',
        overrideAccess: false,
        req,
      })
      return updated.id
    }),
  )

  const succeeded = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )
  const failed = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [{ id: ids[index], reason: '商品不存在或当前账号无权下架。' }]
      : [],
  )

  return NextResponse.json(
    { failed, succeeded, summary: { failed: failed.length, succeeded: succeeded.length } },
    { status: failed.length ? 207 : 200 },
  )
}
