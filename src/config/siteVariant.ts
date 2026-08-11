export type SiteVariant = 'blank' | 'demo'

export const siteVariant: SiteVariant = process.env.SITE_VARIANT === 'demo' ? 'demo' : 'blank'

export const isDemoSite = siteVariant === 'demo'

export const demoProductImages: Record<string, { alt: string; url: string }> = {
  'commercial-equipment': {
    alt: 'Engineer working with industrial equipment',
    url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1800&q=86',
  },
  'custom-product-sourcing': {
    alt: 'Containers at an international logistics terminal',
    url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1800&q=86',
  },
  'industrial-components': {
    alt: 'Modern industrial production facility',
    url: 'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?auto=format&fit=crop&w=1800&q=86',
  },
}

export const demoCompany = {
  brandName: 'Northstar Industrial',
  email: 'hello@northstar.demo.local',
}

export const siteBrandName = isDemoSite ? demoCompany.brandName : 'Company'
export const siteContactEmail = isDemoSite ? demoCompany.email : ''
