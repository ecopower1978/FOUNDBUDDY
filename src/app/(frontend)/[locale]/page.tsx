import type { Metadata } from 'next'

import { siteBrandName, siteContactEmail } from '@/config/siteVariant'
import { siteTemplate } from '@/config/siteTemplate'
import { getCompany } from '@/data/company'
import {
  getCachedHomepage,
  getCachedPublishedPosts,
  getCachedPublishedProducts,
} from '@/data/publicContent'
import { getMessages, isSiteLocale, localeMeta, locales, type SiteLocale } from '@/i18n/config'
import { isLocaleTranslationComplete } from '@/i18n/translationWorkflow'
import {
  CatalogHomeTemplate,
  SolutionHomeTemplate,
  TrustHomeTemplate,
  type HomeTemplateData,
  type TemplateProduct,
} from '@/templates/HomeTemplates'
import type { Media, Product } from '@/payload-types'

type HomePageProps = {
  params: Promise<{ locale: string }>
}

type MediaValue = Pick<Media, 'alt' | 'url' | 'sizes'>

export const revalidate = 300
export const dynamic = 'force-dynamic'

function resolveLocale(value: string): SiteLocale {
  return isSiteLocale(value) ? value : 'en'
}

function nonEmpty(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function getMedia(value: unknown): MediaValue | null {
  return value && typeof value === 'object' ? (value as MediaValue) : null
}

function getMediaVariant(media: MediaValue | null, variant: 'banner' | 'square') {
  const variantURL = media?.sizes?.[variant]?.url
  return typeof variantURL === 'string' && variantURL.length > 0 ? variantURL : media?.url || null
}

function toTemplateProduct(
  product: Product,
  labels: { product: string; productsIntro: string },
): TemplateProduct {
  const firstImage = Array.isArray(product.images) ? getMedia(product.images[0]) : null
  const imageURL = getMediaVariant(firstImage, 'square')
  return {
    id: product.id,
    title: nonEmpty(product.title, labels.product),
    category: nonEmpty(product.category, labels.product),
    shortDescription: nonEmpty(product.shortDescription, labels.productsIntro),
    slug: product.slug,
    image: imageURL
      ? { alt: nonEmpty(firstImage?.alt, product.title), url: imageURL }
      : null,
  }
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale)
  const t = getMessages(locale)
  const company = await getCompany(locale)
  const brandName = nonEmpty(company.brandName, siteBrandName)
  const description = nonEmpty(company.heroDescription, t.heroDescription)
  return {
    title: `${brandName} | ${t.builtFor}`,
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        ...Object.fromEntries(locales.map((item) => [localeMeta[item].htmlLang, `/${item}`])),
        'x-default': '/en',
      },
    },
    robots: isLocaleTranslationComplete(company, locale)
      ? undefined
      : { follow: true, index: false },
    openGraph: {
      description,
      siteName: brandName,
      title: `${brandName} | ${t.builtFor}`,
      type: 'website',
      url: `/${locale}`,
    },
    twitter: {
      card: 'summary_large_image',
      description,
      title: `${brandName} | ${t.builtFor}`,
    },
  }
}

export default async function HomePage({ params }: HomePageProps) {
  const locale = resolveLocale((await params).locale)
  const t = getMessages(locale)
  const [productResult, postResult, company, homepage] = await Promise.all([
    getCachedPublishedProducts(locale),
    getCachedPublishedPosts(locale),
    getCompany(locale),
    getCachedHomepage(locale),
  ])

  const labels = {
    about: t.about,
    aboutText: t.aboutText,
    aboutTitle: t.aboutTitle,
    address: t.address,
    aiAssistant: t.aiAssistant,
    articleFallback: t.articleFallback,
    builtFor: t.builtFor,
    chatCorner: t.chatCorner,
    clearCommunication: t.clearCommunication,
    clearCommunicationText: t.clearCommunicationText,
    company: t.company,
    confirmDetails: t.confirmDetails,
    confirmDetailsText: t.confirmDetailsText,
    contact: t.contact,
    contactIntro: t.contactIntro,
    contactTitle: t.contactTitle,
    directResponse: t.directResponse,
    email: t.email,
    exploreProducts: t.exploreProducts,
    exportReady: t.exportReady,
    exportReadyText: t.exportReadyText,
    image: t.productImage,
    insights: t.insights,
    latestArticle: t.latestArticle,
    oemSupport: t.oemSupport,
    phone: t.phone,
    productionDelivery: t.productionDelivery,
    productionDeliveryText: t.productionDeliveryText,
    product: t.product,
    products: t.products,
    productsIntro: t.productsIntro,
    productsTitle: t.productsTitle,
    readArticle: t.readArticle,
    requestDetails: t.requestDetails,
    rights: t.rights,
    salesEnquiry: t.salesEnquiry,
    sendEnquiry: t.sendEnquiry,
    shareRequest: t.shareRequest,
    shareRequestText: t.shareRequestText,
    simpleProcess: t.simpleProcess,
    usefulNotes: t.usefulNotes,
    viewAll: t.viewAll,
    viewCatalog: t.products,
    viewProduct: t.requestDetails,
    worldwide: t.worldwide,
  } satisfies HomeTemplateData['labels']

  const productByID = new Map(productResult.docs.map((product) => [String(product.id), product]))
  const selectedHomepageProducts = (homepage.featuredProducts || [])
    .map((value) =>
      typeof value === 'object' && value
        ? productByID.get(String(value.id)) || value
        : productByID.get(String(value)),
    )
    .filter((value): value is Product => Boolean(value && value._status === 'published'))
  const sourceProducts = productResult.docs
  const products = sourceProducts.map((product) => toTemplateProduct(product, labels))
  const homepageProducts = (
    selectedHomepageProducts.length ? selectedHomepageProducts : sourceProducts.slice(0, 3)
  ).map((product) => toTemplateProduct(product, labels))

  const brandName = nonEmpty(company.brandName, siteBrandName)
  const email = nonEmpty(company.contact?.email, siteContactEmail)
  const highlights = (company.highlights || [])
    .map((item) => ({
      id: item.id,
      title: nonEmpty(item.title, ''),
      description: nonEmpty(item.description, ''),
    }))
    .filter((item) => item.title && item.description)
  const data: HomeTemplateData = {
    aboutDescription: nonEmpty(company.aboutDescription, t.aboutText),
    aboutTitle: nonEmpty(company.aboutTitle, t.aboutTitle),
    address: nonEmpty(company.contact?.address, ''),
    brandName,
    email,
    heroDescription: nonEmpty(company.heroDescription, t.heroDescription),
    heroTitle: nonEmpty(company.heroTitle, t.heroTitle),
    highlights,
    homepageProducts,
    labels,
    locale,
    phone: nonEmpty(company.contact?.phone, ''),
    posts: postResult.docs.map((post) => ({
      excerpt: post.excerpt,
      id: post.id,
      metaDescription: post.meta?.description,
      publishedAt: post.publishedAt,
      slug: post.slug,
      title: post.title,
    })),
    products,
    wechat: nonEmpty(company.contact?.wechat, ''),
  }

  if (siteTemplate === 'catalog') return <CatalogHomeTemplate {...data} />
  if (siteTemplate === 'solution') return <SolutionHomeTemplate {...data} />
  return <TrustHomeTemplate {...data} />
}
