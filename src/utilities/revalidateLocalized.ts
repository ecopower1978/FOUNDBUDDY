import type { PayloadRequest } from 'payload'
import { revalidatePath, revalidateTag } from 'next/cache.js'

import { getRequestLocale, TRANSLATION_CONTEXT_KEY } from '@/i18n/translationWorkflow'
import { isSiteLocale, locales, type SiteLocale } from '@/i18n/config'

function affectedLocales(req: PayloadRequest): readonly SiteLocale[] {
  const translatedLocale = req.context?.translationLocale
  if (isSiteLocale(translatedLocale)) return [translatedLocale]
  if (req.context?.[TRANSLATION_CONTEXT_KEY]) return []
  const sourceLocale = getRequestLocale(req)
  return sourceLocale === 'zh-CN' ? locales : [sourceLocale]
}

export function revalidateLocalizedContent(
  req: PayloadRequest,
  type: 'company' | 'homepage' | 'post' | 'product',
  slug?: string | null,
) {
  for (const locale of affectedLocales(req)) {
    revalidatePath(`/${locale}`)
    if (type === 'post') {
      revalidatePath(`/${locale}/posts`)
      if (slug) revalidatePath(`/${locale}/posts/${slug}`)
    }
    if (type === 'product' && slug) {
      revalidatePath(`/${locale}/products/${slug}`)
    }
    revalidateTag(`${type}:${locale}`, 'max')
    revalidateTag(`sitemap:${locale}`, 'max')
  }
}
