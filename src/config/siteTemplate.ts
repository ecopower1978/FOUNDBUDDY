export const siteTemplateKeys = ['trust', 'catalog', 'solution'] as const

export type SiteTemplate = (typeof siteTemplateKeys)[number]

export function isSiteTemplate(value: unknown): value is SiteTemplate {
  return typeof value === 'string' && siteTemplateKeys.includes(value as SiteTemplate)
}

export function resolveSiteTemplate(value = process.env.SITE_TEMPLATE): SiteTemplate {
  return isSiteTemplate(value) ? value : 'trust'
}

/**
 * The public site is intentionally limited to three fixed presentations.
 * Content, Payload collections, URLs and the admin remain shared by all of
 * them; only this presentation key changes at deployment time.
 */
export const siteTemplate = resolveSiteTemplate()

export const siteTemplateMeta: Record<SiteTemplate, { label: string; summary: string }> = {
  trust: {
    label: 'Trust & Authority',
    summary: 'Editorial company profile with a clear enquiry path.',
  },
  catalog: {
    label: 'Catalog & Supply',
    summary: 'Product-first catalogue for buyers comparing a range.',
  },
  solution: {
    label: 'Solution Partner',
    summary: 'Story-led presentation for sourcing and project enquiries.',
  },
}
