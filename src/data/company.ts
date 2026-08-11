import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { SiteLocale } from '@/i18n/config'

export const getCompany = cache(async (locale: SiteLocale) => {
  const payload = await getPayload({ config: configPromise })
  return payload.findGlobal({
    slug: 'company',
    depth: 1,
    fallbackLocale: ['en', 'zh-CN'],
    locale,
    overrideAccess: true,
  })
})
