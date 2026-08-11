import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLocalReq, getPayload } from 'payload'

import { isEditorOrOwner, isOwner } from '@/access/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user: user || undefined }, payload)
  if (!isEditorOrOwner(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [
    draftProducts,
    publishedProducts,
    unlistedProducts,
    publishedPosts,
    failedProducts,
    failedPosts,
    missingImages,
    company,
    recentProducts,
    recentPosts,
  ] = await Promise.all([
    payload.count({
      collection: 'products',
      overrideAccess: true,
      where: { and: [{ _status: { equals: 'draft' } }, { workflowState: { equals: 'draft' } }] },
    }),
    payload.count({
      collection: 'products',
      overrideAccess: true,
      where: { _status: { equals: 'published' } },
    }),
    payload.count({
      collection: 'products',
      overrideAccess: true,
      where: { and: [{ _status: { equals: 'draft' } }, { workflowState: { equals: 'unlisted' } }] },
    }),
    payload.count({
      collection: 'posts',
      overrideAccess: true,
      where: { _status: { equals: 'published' } },
    }),
    payload.count({
      collection: 'products',
      overrideAccess: true,
      where: { 'translationStatus.status': { equals: 'failed' } },
    }),
    payload.count({
      collection: 'posts',
      overrideAccess: true,
      where: { 'translationStatus.status': { equals: 'failed' } },
    }),
    payload.count({
      collection: 'products',
      overrideAccess: true,
      where: { images: { exists: false } },
    }),
    payload.findGlobal({ slug: 'company', locale: 'zh-CN', overrideAccess: true }),
    payload.find({
      collection: 'products',
      depth: 0,
      limit: 4,
      locale: 'zh-CN',
      overrideAccess: true,
      sort: '-updatedAt',
      where: { _status: { equals: 'published' } },
    }),
    payload.find({
      collection: 'posts',
      depth: 0,
      limit: 4,
      locale: 'zh-CN',
      overrideAccess: true,
      sort: '-updatedAt',
      where: { _status: { equals: 'published' } },
    }),
  ])

  const audits = isOwner(req)
    ? await payload.find({
        collection: 'audit-events',
        depth: 0,
        limit: 6,
        overrideAccess: true,
        sort: '-createdAt',
      })
    : null

  return NextResponse.json({
    audits: audits?.docs.map((item) => ({
      action: item.action,
      at: item.createdAt,
      id: item.id,
      summary: item.summary,
    })),
    quality: {
      contactMissing: !company.contact?.email,
      missingImages: missingImages.totalDocs,
    },
    recent: [
      ...recentProducts.docs.map((item) => ({
        at: item.updatedAt,
        href: `/admin/collections/products/${item.id}`,
        title: item.title,
        type: '商品',
      })),
      ...recentPosts.docs.map((item) => ({
        at: item.updatedAt,
        href: `/admin/collections/posts/${item.id}`,
        title: item.title,
        type: '文章',
      })),
    ]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 6),
    role: user?.role,
    stats: {
      draftProducts: draftProducts.totalDocs,
      failedTranslations: failedProducts.totalDocs + failedPosts.totalDocs,
      publishedPosts: publishedPosts.totalDocs,
      publishedProducts: publishedProducts.totalDocs,
      unlistedProducts: unlistedProducts.totalDocs,
    },
  })
}
