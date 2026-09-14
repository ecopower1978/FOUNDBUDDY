import type { Metadata } from 'next'

import { getCompany } from '@/data/company'
import { getCachedPublishedProducts } from '@/data/publicContent'
import { getMessages, isSiteLocale, localeMeta, locales, type SiteLocale } from '@/i18n/config'
import { siteBrandName } from '@/config/siteVariant'
import { ProductDirectory } from '@/templates/ProductDirectory'
import type { Media, Product } from '@/payload-types'

export const dynamic = 'force-dynamic'
export const revalidate = 300

type ProductPageProps = {
  params: Promise<{ locale: string }>
}

type MediaValue = Pick<Media, 'alt' | 'url' | 'sizes'>

function resolveLocale(value: string): SiteLocale {
  return isSiteLocale(value) ? value : 'en'
}

function getMedia(value: unknown): MediaValue | null {
  return value && typeof value === 'object' ? (value as MediaValue) : null
}

function getImage(product: Product, fallback: string) {
  const image = Array.isArray(product.images) ? getMedia(product.images[0]) : null
  const url = image?.sizes?.square?.url || image?.url
  return typeof url === 'string' && url
    ? { alt: image?.alt || product.title || fallback, url }
    : null
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale)
  const t = getMessages(locale)
  const company = await getCompany(locale)
  const brandName = company.brandName?.trim() || siteBrandName
  return {
    title: `${t.products} | ${brandName}`,
    description: t.productsIntro,
    alternates: {
      canonical: `/${locale}/products`,
      languages: {
        ...Object.fromEntries(locales.map((item) => [localeMeta[item].htmlLang, `/${item}/products`])),
        'x-default': '/en/products',
      },
    },
  }
}

export default async function ProductsPage({ params }: ProductPageProps) {
  const locale = resolveLocale((await params).locale)
  const t = getMessages(locale)
  const result = await getCachedPublishedProducts(locale)
  const products = result.docs.map((product) => ({
    category: product.category || t.product,
    id: product.id,
    image: getImage(product, t.productImage),
    shortDescription: product.shortDescription,
    slug: product.slug,
    title: product.title,
  }))
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))]

  return (
    <ProductDirectory
      categories={categories}
      labels={{
        back: t.backWebsite,
        category: t.products,
        empty: t.productsIntro,
        image: t.productImage,
        intro: t.productsIntro,
        requestDetails: t.requestDetails,
        title: t.productsTitle,
      }}
      locale={locale}
      products={products}
    />
  )
}
