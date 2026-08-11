import { env } from '@/config/env'
import { locales } from '@/i18n/config'

export function GET() {
  const entries = locales
    .map(
      (locale) =>
        `<sitemap><loc>${new URL(`/sitemaps/${locale}.xml`, env.siteURL)}</loc></sitemap>`,
    )
    .join('')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`,
    {
      headers: {
        'Cache-Control': 'public, max-age=900, stale-while-revalidate=86400',
        'Content-Type': 'application/xml; charset=utf-8',
      },
    },
  )
}
