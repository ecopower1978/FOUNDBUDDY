import type { Metadata } from 'next'

import { env } from '@/config/env'
import { getCompany } from '@/data/company'
import { siteBrandName } from '@/config/siteVariant'
import { localeMeta, locales, type SiteLocale } from '@/i18n/config'
import { isLocaleTranslationComplete } from '@/i18n/translationWorkflow'
import type { Config, Media, Post } from '@/payload-types'

function getImageURL(image?: Config['db']['defaultIDType'] | Media | null) {
  if (!image || typeof image !== 'object') return undefined
  const url = image.sizes?.og?.url || image.url
  if (!url) return undefined
  return url.startsWith('http') ? url : new URL(url, env.siteURL).toString()
}

export async function generateMeta({
  doc,
  locale,
}: {
  doc: null | Partial<Post>
  locale: SiteLocale
}): Promise<Metadata> {
  if (!doc) return {}

  const company = await getCompany(locale)
  const brandName = company.brandName || siteBrandName
  const title = doc.meta?.title
    ? `${doc.meta.title} | ${brandName}`
    : `${doc.title || brandName} | ${brandName}`
  const description = doc.meta?.description || doc.excerpt || ''
  const canonical = new URL(`/${locale}/posts/${doc.slug || ''}`, env.siteURL).toString()
  const image = getImageURL(doc.meta?.image)
  const languages = Object.fromEntries(
    locales.map((item) => [
      localeMeta[item].htmlLang,
      new URL(`/${item}/posts/${doc.slug || ''}`, env.siteURL).toString(),
    ]),
  )
  const complete = isLocaleTranslationComplete(doc as Record<string, unknown>, locale)

  return {
    alternates: {
      canonical,
      languages: {
        ...languages,
        'x-default': new URL(`/en/posts/${doc.slug || ''}`, env.siteURL).toString(),
      },
    },
    description,
    openGraph: {
      description,
      images: image ? [{ url: image }] : undefined,
      siteName: brandName,
      title,
      type: 'article',
      url: canonical,
    },
    robots: complete ? undefined : { follow: true, index: false },
    title,
    twitter: {
      card: 'summary_large_image',
      description,
      images: image ? [image] : undefined,
      title,
    },
  }
}
