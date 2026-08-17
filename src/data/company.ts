import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'
import { unstable_cache } from 'next/cache.js'

import type { SiteLocale } from '@/i18n/config'

export const getCompany = cache(async (locale: SiteLocale) =>
  unstable_cache(
    async () => {
      const payload = await getPayload({ config: configPromise })
      return payload.findGlobal({
        slug: 'company',
        depth: 1,
        fallbackLocale: ['en', 'zh-CN'],
        locale,
        overrideAccess: true,
      })
    },
    ['company', locale],
    {
      revalidate: 300,
      tags: [`company:${locale}`],
    },
  )(),
)
