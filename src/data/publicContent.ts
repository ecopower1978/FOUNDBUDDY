import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache.js'
import { getPayload } from 'payload'

import type { SiteLocale } from '@/i18n/config'

const PUBLIC_CONTENT_REVALIDATE_SECONDS = 300
// Bump when a local server snapshot or a content-shape migration changes the
// media URLs returned to the public pages. This prevents a stale Next data
// cache from masking the current server-backed content during QA.
const PUBLIC_CONTENT_CACHE_VERSION = 'server-data-v2'

export const getCachedPublishedProducts = (locale: SiteLocale) =>
  unstable_cache(
    async () => {
      const payload = await getPayload({ config: configPromise })
      return payload.find({
        collection: 'products',
        locale,
        fallbackLocale: ['en', 'zh-CN'],
        depth: 1,
        limit: 12,
        sort: '-createdAt',
        where: { _status: { equals: 'published' } },
      })
    },
    ['published-products', PUBLIC_CONTENT_CACHE_VERSION, locale],
    {
      revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
      tags: [`product:${locale}`],
    },
  )()

export const getCachedPublishedPosts = (locale: SiteLocale, limit = 3, page = 1) =>
  unstable_cache(
    async () => {
      const payload = await getPayload({ config: configPromise })
      return payload.find({
        collection: 'posts',
        locale,
        fallbackLocale: ['en', 'zh-CN'],
        depth: 1,
        limit,
        page,
        sort: '-publishedAt',
        where: { _status: { equals: 'published' } },
      })
    },
    ['published-posts', PUBLIC_CONTENT_CACHE_VERSION, locale, String(limit), String(page)],
    {
      revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
      tags: [`post:${locale}`],
    },
  )()

export const getCachedHomepage = (locale: SiteLocale) =>
  unstable_cache(
    async () => {
      const payload = await getPayload({ config: configPromise })
      return payload.findGlobal({
        slug: 'homepage',
        depth: 2,
        fallbackLocale: ['en', 'zh-CN'],
        locale,
      })
    },
    ['homepage', PUBLIC_CONTENT_CACHE_VERSION, locale],
    {
      revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
      tags: [`homepage:${locale}`],
    },
  )()

export const getCachedPublishedProduct = (locale: SiteLocale, slug: string) =>
  unstable_cache(
    async () => {
      const payload = await getPayload({ config: configPromise })
      const result = await payload.find({
        collection: 'products',
        depth: 1,
        draft: false,
        fallbackLocale: ['en', 'zh-CN'],
        limit: 1,
        locale,
        pagination: false,
        where: {
          and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }],
        },
      })

      return result.docs[0] || null
    },
    ['published-product', PUBLIC_CONTENT_CACHE_VERSION, locale, slug],
    {
      revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
      tags: [`product:${locale}`],
    },
  )()

export const getCachedRelatedProducts = (
  locale: SiteLocale,
  productId: number,
  category?: string | null,
) =>
  unstable_cache(
    async () => {
      const payload = await getPayload({ config: configPromise })
      return payload.find({
        collection: 'products',
        depth: 1,
        fallbackLocale: ['en', 'zh-CN'],
        limit: 4,
        locale,
        where: {
          and: [
            { _status: { equals: 'published' } },
            { id: { not_equals: productId } },
            ...(category ? [{ category: { equals: category } }] : []),
          ],
        },
      })
    },
    ['related-products', PUBLIC_CONTENT_CACHE_VERSION, locale, String(productId), category || 'all'],
    {
      revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
      tags: [`product:${locale}`],
    },
  )()

export const getCachedPublishedPost = (locale: SiteLocale, slug: string) =>
  unstable_cache(
    async () => {
      const payload = await getPayload({ config: configPromise })
      const result = await payload.find({
        collection: 'posts',
        locale,
        fallbackLocale: ['en', 'zh-CN'],
        draft: false,
        limit: 1,
        overrideAccess: false,
        pagination: false,
        where: {
          slug: { equals: slug },
        },
      })

      return result.docs[0] || null
    },
    ['published-post', PUBLIC_CONTENT_CACHE_VERSION, locale, slug],
    {
      revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
      tags: [`post:${locale}`],
    },
  )()
