import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { env } from '@/config/env'
import { isSiteLocale } from '@/i18n/config'
import { isLocaleTranslationComplete } from '@/i18n/translationWorkflow'

function escapeXML(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const replacements: Record<string, string> = {
      '"': '&quot;',
      '&': '&amp;',
      "'": '&apos;',
      '<': '&lt;',
      '>': '&gt;',
    }
    return replacements[character] || character
  })
}

function entry(path: string, updatedAt?: string | null) {
  const location = escapeXML(new URL(path, env.siteURL).toString())
  return `<url><loc>${location}</loc>${updatedAt ? `<lastmod>${new Date(updatedAt).toISOString()}</lastmod>` : ''}</url>`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const file = (await params).file
  const value = file.endsWith('.xml') ? file.slice(0, -4) : ''
  if (!isSiteLocale(value)) return new Response('Not found', { status: 404 })

  const payload = await getPayload({ config: configPromise })
  const [products, posts, company] = await Promise.all([
    payload.find({
      collection: 'products',
      depth: 0,
      fallbackLocale: false,
      limit: 0,
      locale: value,
      overrideAccess: true,
      pagination: false,
      select: { slug: true, translationStatus: true, updatedAt: true },
      where: { _status: { equals: 'published' } },
    }),
    payload.find({
      collection: 'posts',
      depth: 0,
      fallbackLocale: false,
      limit: 0,
      locale: value,
      overrideAccess: true,
      pagination: false,
      select: { slug: true, translationStatus: true, updatedAt: true },
      where: { _status: { equals: 'published' } },
    }),
    payload.findGlobal({
      slug: 'company',
      fallbackLocale: false,
      locale: value,
      overrideAccess: true,
    }),
  ])

  const urls = [
    ...(isLocaleTranslationComplete(company, value) ? [entry(`/${value}`)] : []),
    entry(`/${value}/posts`),
    ...products.docs
      .filter((doc) => isLocaleTranslationComplete(doc, value))
      .map((doc) => entry(`/${value}/products/${encodeURIComponent(doc.slug)}`, doc.updatedAt)),
    ...posts.docs
      .filter((doc) => isLocaleTranslationComplete(doc, value))
      .map((doc) => entry(`/${value}/posts/${encodeURIComponent(doc.slug)}`, doc.updatedAt)),
  ].join('')

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: {
        'Cache-Control': 'public, max-age=900, stale-while-revalidate=86400',
        'Content-Type': 'application/xml; charset=utf-8',
      },
    },
  )
}
