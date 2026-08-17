import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache.js'
import { getPayload } from 'payload'

import { locales } from '@/i18n/config'

const DASHBOARD_REVALIDATE_SECONDS = 30
const dashboardContentTags = locales.flatMap((locale) => [
  `product:${locale}`,
  `post:${locale}`,
  `company:${locale}`,
])

export const getCachedDashboardOverview = () =>
  unstable_cache(
    async () => {
      const payload = await getPayload({ config: configPromise })
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

      return {
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
        stats: {
          draftProducts: draftProducts.totalDocs,
          failedTranslations: failedProducts.totalDocs + failedPosts.totalDocs,
          publishedPosts: publishedPosts.totalDocs,
          publishedProducts: publishedProducts.totalDocs,
          unlistedProducts: unlistedProducts.totalDocs,
        },
      }
    },
    ['admin-dashboard-overview'],
    {
      revalidate: DASHBOARD_REVALIDATE_SECONDS,
      tags: dashboardContentTags,
    },
  )()

export const getCachedDashboardAudits = () =>
  unstable_cache(
    async () => {
      const payload = await getPayload({ config: configPromise })
      const audits = await payload.find({
        collection: 'audit-events',
        depth: 0,
        limit: 6,
        overrideAccess: true,
        sort: '-createdAt',
      })

      return audits.docs.map((item) => ({
        action: item.action,
        at: item.createdAt,
        id: item.id,
        summary: item.summary,
      }))
    },
    ['admin-dashboard-audits'],
    {
      revalidate: DASHBOARD_REVALIDATE_SECONDS,
      tags: ['audit-events'],
    },
  )()
