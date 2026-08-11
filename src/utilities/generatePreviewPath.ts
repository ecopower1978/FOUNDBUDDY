import { PreviewSearchParams } from '@/app/(frontend)/next/preview/route'
import { getRequestLocale } from '@/i18n/translationWorkflow'
import type { PayloadRequest } from 'payload'

type Props = {
  collection: 'posts'
  slug: string
  req: PayloadRequest
}

export const generatePreviewPath = ({ collection, req, slug }: Props) => {
  if (slug === undefined || slug === null) {
    return null
  }

  // Encode to support slugs with special characters
  const encodedSlug = encodeURIComponent(slug)
  const locale = getRequestLocale(req)

  const encodedParams = new URLSearchParams({
    path: `/${locale}/${collection}/${encodedSlug}`,
    previewSecret: process.env.PREVIEW_SECRET || '',
  } satisfies PreviewSearchParams)

  const url = `/next/preview?${encodedParams.toString()}`

  return url
}
