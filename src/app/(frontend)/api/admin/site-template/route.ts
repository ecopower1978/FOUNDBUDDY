import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'

import { isOwner } from '@/access/roles'
import { isSiteTemplate, siteTemplate } from '@/config/siteTemplate'

export const dynamic = 'force-dynamic'

async function getOwnerContext() {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user: user || undefined }, payload)
  return isOwner(req) ? { payload, req } : null
}

export async function GET() {
  const context = await getOwnerContext()
  if (!context) return NextResponse.json({ error: '只有所有者可以切换前台模板。' }, { status: 403 })

  try {
    const settings = await context.payload.findGlobal({
      depth: 0,
      overrideAccess: true,
      req: context.req,
      slug: 'site-settings',
    })
    return NextResponse.json({
      templateKey: isSiteTemplate(settings.templateKey) ? settings.templateKey : siteTemplate,
    })
  } catch {
    return NextResponse.json({ templateKey: siteTemplate })
  }
}

export async function PATCH(request: Request) {
  const context = await getOwnerContext()
  if (!context) return NextResponse.json({ error: '只有所有者可以切换前台模板。' }, { status: 403 })

  let body: { templateKey?: unknown }
  try {
    body = (await request.json()) as { templateKey?: unknown }
  } catch {
    return NextResponse.json({ error: '请求格式无效。' }, { status: 400 })
  }

  if (!isSiteTemplate(body.templateKey)) {
    return NextResponse.json(
      { error: '模板只能选择 trust、catalog 或 solution。' },
      { status: 400 },
    )
  }

  try {
    const updated = await context.payload.updateGlobal({
      data: { templateKey: body.templateKey },
      req: context.req,
      slug: 'site-settings',
    })
    return NextResponse.json({ templateKey: updated.templateKey })
  } catch {
    return NextResponse.json({ error: '模板切换失败，请稍后重试。' }, { status: 500 })
  }
}
