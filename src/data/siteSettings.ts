import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache.js'
import { getPayload } from 'payload'

import { isSiteTemplate, siteTemplate, type SiteTemplate } from '@/config/siteTemplate'

async function readPublicSiteTemplate(): Promise<SiteTemplate> {
  try {
    const payload = await getPayload({ config: configPromise })
    const settings = await payload.findGlobal({
      depth: 0,
      overrideAccess: true,
      slug: 'site-settings',
    })
    return isSiteTemplate(settings.templateKey) ? settings.templateKey : siteTemplate
  } catch {
    return siteTemplate
  }
}

export const getPublicSiteTemplate = unstable_cache(
  readPublicSiteTemplate,
  ['public-site-template'],
  {
    revalidate: 300,
    tags: ['global_site-settings'],
  },
)
