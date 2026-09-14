import {
  ArrowRight,
  Check,
  Globe2,
  Mail,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { HeroProductCarousel } from '@/components/HeroProductCarousel'
import { ProductCarousel } from '@/components/ProductCarousel'
import type { SiteLocale } from '@/i18n/config'
import { isLocalMediaURL } from '@/utilities/isLocalMediaURL'

export type TemplateProduct = {
  id: number | string
  title: string
  category: string
  shortDescription: string
  slug: string
  image: { alt: string; url: string } | null
}

export type TemplatePost = {
  id: number | string
  slug: string
  title: string
  excerpt?: string | null
  metaDescription?: string | null
  publishedAt?: string | null
}

export type HomeTemplateLabels = {
  about: string
  aboutText: string
  aboutTitle: string
  address: string
  aiAssistant: string
  articleFallback: string
  builtFor: string
  chatCorner: string
  clearCommunication: string
  clearCommunicationText: string
  company: string
  confirmDetails: string
  confirmDetailsText: string
  contact: string
  contactIntro: string
  contactTitle: string
  directResponse: string
  email: string
  exploreProducts: string
  exportReady: string
  exportReadyText: string
  image: string
  insights: string
  latestArticle: string
  oemSupport: string
  phone: string
  productionDelivery: string
  productionDeliveryText: string
  product: string
  products: string
  productsIntro: string
  productsTitle: string
  readArticle: string
  requestDetails: string
  rights: string
  salesEnquiry: string
  sendEnquiry: string
  shareRequest: string
  shareRequestText: string
  simpleProcess: string
  usefulNotes: string
  viewAll: string
  viewCatalog: string
  viewProduct: string
  worldwide: string
}

export type HomeTemplateData = {
  locale: SiteLocale
  brandName: string
  email: string
  phone?: string | null
  address?: string | null
  wechat?: string | null
  heroTitle: string
  heroDescription: string
  aboutTitle: string
  aboutDescription: string
  highlights: Array<{ id?: string | null; title: string; description: string }>
  homepageProducts: TemplateProduct[]
  products: TemplateProduct[]
  posts: TemplatePost[]
  labels: HomeTemplateLabels
}

export function TemplateProductCard({
  locale,
  product,
  labels,
}: {
  locale: SiteLocale
  product: TemplateProduct
  labels: Pick<HomeTemplateLabels, 'image' | 'requestDetails'>
}) {
  return (
    <Link
      className="product-card"
      href={`/${locale}/products/${encodeURIComponent(product.slug)}`}
    >
      <div className="product-card__media">
        {product.image ? (
          <Image
            alt={product.image.alt}
            fill
            sizes="(max-width: 720px) 92vw, (max-width: 1100px) 45vw, 30vw"
            src={product.image.url}
            unoptimized={isLocalMediaURL(product.image.url)}
          />
        ) : (
          <div className="product-card__placeholder">
            <PackageCheck size={34} />
            <span>{labels.image}</span>
          </div>
        )}
      </div>
      <div className="product-card__body">
        <p>{product.category}</p>
        <h3>{product.title}</h3>
        <span>{product.shortDescription}</span>
        <strong>
          {labels.requestDetails} <ArrowRight size={16} />
        </strong>
      </div>
    </Link>
  )
}

function ProductGrid({
  className = '',
  locale,
  products,
  labels,
}: {
  className?: string
  locale: SiteLocale
  products: TemplateProduct[]
  labels: HomeTemplateLabels
}) {
  return (
    <div className={`template-product-grid ${className}`.trim()}>
      {products.map((product) => (
        <TemplateProductCard key={product.id} labels={labels} locale={locale} product={product} />
      ))}
    </div>
  )
}

function ContactSection({ data }: { data: HomeTemplateData }) {
  const { address, brandName, email, labels, locale, phone, wechat } = data
  return (
    <section className="trade-contact" id="contact">
      <div className="trade-shell trade-contact__grid">
        <div>
          <p className="trade-kicker">{labels.contact}</p>
          <h2>{labels.contactTitle}</h2>
          <p>{labels.contactIntro}</p>
          <Link className="template-contact__locale-link" href={`/${locale}/products`}>
            {labels.viewCatalog} <ArrowRight size={16} />
          </Link>
        </div>
        <div className="trade-contact__details">
          {email && (
            <a href={`mailto:${email}`}>
              <Mail size={20} />
              <span>
                <small>{labels.email}</small>
                {email}
              </span>
            </a>
          )}
          {phone && (
            <a href={`tel:${phone}`}>
              <Phone size={20} />
              <span>
                <small>{labels.phone}</small>
                {phone}
              </span>
            </a>
          )}
          {address && (
            <div>
              <MapPin size={20} />
              <span>
                <small>{labels.address}</small>
                {address}
              </span>
            </div>
          )}
          {wechat && (
            <a href="weixin://">
              <MessageCircle size={20} />
              <span>
                <small>WeChat</small>
                {wechat}
              </span>
            </a>
          )}
          <button data-open-chat="true" type="button">
            <MessageCircle size={20} />
            <span>
              <small>{labels.aiAssistant}</small>
              {labels.chatCorner}
            </span>
          </button>
        </div>
      </div>
      <span className="template-contact__brand" aria-hidden="true">
        {brandName}
      </span>
    </section>
  )
}

function BlogSection({ data }: { data: HomeTemplateData }) {
  const { labels, locale, posts } = data
  if (!posts.length) return null

  return (
    <section className="trade-section trade-blog" id="insights">
      <div className="trade-shell">
        <div className="trade-section__heading">
          <div>
            <p className="trade-kicker">{labels.insights}</p>
            <h2>{labels.usefulNotes}</h2>
          </div>
          <Link href={`/${locale}/posts`}>
            {labels.viewAll} <ArrowRight size={16} />
          </Link>
        </div>
        <div className="trade-blog__grid">
          {posts.map((post) => (
            <Link className="trade-blog__card" href={`/${locale}/posts/${post.slug}`} key={post.id}>
              <time>
                {post.publishedAt
                  ? new Date(post.publishedAt).toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : labels.latestArticle}
              </time>
              <h3>{post.title}</h3>
              <p>{post.excerpt || post.metaDescription || labels.articleFallback}</p>
              <span>
                {labels.readArticle} <ArrowRight size={15} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function Highlights({ data }: { data: HomeTemplateData }) {
  const { highlights, labels } = data
  const items = highlights.length
    ? highlights
    : [
        { title: labels.clearCommunication, description: labels.clearCommunicationText },
        { title: labels.oemSupport, description: labels.productionDeliveryText },
        { title: labels.exportReady, description: labels.exportReadyText },
      ]

  return (
    <div className="trade-highlights">
      {items.map((item, index) => (
        <article key={item.id || `${item.title}-${index}`}>
          <span>0{index + 1}</span>
          <div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

export function TrustHomeTemplate(data: HomeTemplateData) {
  const { aboutDescription, aboutTitle, brandName, email, heroDescription, heroTitle, homepageProducts, labels, locale, products } = data
  return (
    <main className="template-home template-home--trust">
      {homepageProducts.length > 0 && (
        <section className="hero-ad-section">
          <div className="trade-shell">
            <HeroProductCarousel
              labels={{ image: labels.image, region: labels.products, requestDetails: labels.requestDetails }}
              locale={locale}
              products={homepageProducts.map((product) => ({ ...product }))}
            />
          </div>
        </section>
      )}

      <section className="trade-hero trade-hero--moved">
        <div className="trade-shell trade-hero__grid">
          <div>
            <p className="trade-eyebrow">
              <Globe2 size={16} /> {labels.builtFor}
            </p>
            <h1>{heroTitle}</h1>
            <p className="trade-hero__lead">{heroDescription}</p>
            <div className="trade-actions">
              <a className="trade-button trade-button--primary" href="#products">
                {labels.exploreProducts} <ArrowRight size={18} />
              </a>
              <a className="trade-button trade-button--secondary" href={email ? `mailto:${email}` : '#contact'}>
                {labels.sendEnquiry}
              </a>
            </div>
            <div className="trade-trust-row">
              <span><Check size={16} /> {labels.directResponse}</span>
              <span><Check size={16} /> {labels.oemSupport}</span>
              <span><Check size={16} /> {labels.worldwide}</span>
            </div>
          </div>
          <aside className="trade-hero__card">
            <div className="trade-hero__card-top">
              <PackageCheck size={28} />
              <span>{labels.simpleProcess}</span>
            </div>
            <ol>
              <li><b>01</b><span><strong>{labels.shareRequest}</strong><small>{labels.shareRequestText}</small></span></li>
              <li><b>02</b><span><strong>{labels.confirmDetails}</strong><small>{labels.confirmDetailsText}</small></span></li>
              <li><b>03</b><span><strong>{labels.productionDelivery}</strong><small>{labels.productionDeliveryText}</small></span></li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="trade-section" id="products">
        <div className="trade-shell">
          <div className="trade-section__heading">
            <div><p className="trade-kicker">{labels.products}</p><h2>{labels.productsTitle}</h2></div>
            <div className="template-heading__aside"><p>{labels.productsIntro}</p><Link href={`/${locale}/products`}>{labels.viewCatalog} <ArrowRight size={16} /></Link></div>
          </div>
          {products.length > 0 && (
            <ProductCarousel
              labels={{ image: labels.image, region: labels.products, requestDetails: labels.requestDetails }}
              locale={locale}
              products={products.map((product) => ({ ...product }))}
            />
          )}
        </div>
      </section>

      <section className="trade-about" id="about">
        <div className="trade-shell trade-about__grid">
          <div><p className="trade-kicker">{labels.about} {brandName}</p><h2>{aboutTitle}</h2><p>{aboutDescription}</p></div>
          <Highlights data={data} />
        </div>
      </section>
      <BlogSection data={data} />
      <ContactSection data={data} />
    </main>
  )
}

export function CatalogHomeTemplate(data: HomeTemplateData) {
  const { aboutDescription, aboutTitle, brandName, email, heroDescription, heroTitle, labels, locale, products } = data
  const featured = products[0]
  return (
    <main className="template-home template-home--catalog">
      <section className="catalog-hero">
        <div className="trade-shell catalog-hero__grid">
          <div className="catalog-hero__copy">
            <p className="trade-eyebrow"><span className="template-eyebrow-dot" /> {labels.products}</p>
            <h1>{heroTitle}</h1>
            <p>{heroDescription}</p>
            <div className="trade-actions">
              <a className="trade-button trade-button--primary" href="#products">{labels.exploreProducts} <ArrowRight size={18} /></a>
              <a className="trade-button trade-button--secondary" href={email ? `mailto:${email}` : '#contact'}>{labels.sendEnquiry}</a>
            </div>
            <div className="catalog-hero__signals">
              <span><b>{products.length}</b>{labels.products}</span>
              <span><b>{locale.toUpperCase()}</b>{labels.builtFor}</span>
              <span><b>01</b>{labels.directResponse}</span>
            </div>
          </div>
          <div className="catalog-hero__preview">
            <div className="catalog-hero__preview-media">
              {featured?.image ? <Image alt={featured.image.alt} fill priority sizes="(max-width: 860px) 92vw, 46vw" src={featured.image.url} unoptimized={isLocalMediaURL(featured.image.url)} /> : <PackageCheck size={52} />}
              <span>{labels.product}</span>
            </div>
            {featured && <div className="catalog-hero__preview-card"><span>{featured.category}</span><strong>{featured.title}</strong><p>{featured.shortDescription}</p><Link href={`/${locale}/products/${encodeURIComponent(featured.slug)}`}>{labels.requestDetails} <ArrowRight size={15} /></Link></div>}
          </div>
        </div>
      </section>

      <section className="catalog-index-strip" aria-label={labels.products}>
        <div className="trade-shell"><span>{labels.simpleProcess}</span><span><i>01</i>{labels.shareRequest}</span><span><i>02</i>{labels.confirmDetails}</span><span><i>03</i>{labels.productionDelivery}</span></div>
      </section>

      <section className="trade-section catalog-products" id="products">
        <div className="trade-shell">
          <div className="trade-section__heading"><div><p className="trade-kicker">{labels.products}</p><h2>{labels.productsTitle}</h2></div><p>{labels.productsIntro}</p></div>
          {products.length > 0 ? <ProductGrid className="catalog-product-grid" labels={labels} locale={locale} products={products} /> : <div className="catalog-empty">{labels.productsIntro}</div>}
        </div>
      </section>

      <section className="catalog-about" id="about">
        <div className="trade-shell catalog-about__grid"><div><p className="trade-kicker">{labels.about} {brandName}</p><h2>{aboutTitle}</h2><p>{aboutDescription}</p></div><Highlights data={data} /></div>
      </section>
      <BlogSection data={data} />
      <ContactSection data={data} />
    </main>
  )
}

export function SolutionHomeTemplate(data: HomeTemplateData) {
  const { aboutDescription, aboutTitle, brandName, email, heroDescription, heroTitle, labels, locale, products } = data
  const heroProduct = products[0]
  return (
    <main className="template-home template-home--solution">
      <section className="solution-hero">
        <div className="trade-shell solution-hero__grid">
          <div className="solution-hero__copy">
            <p className="trade-eyebrow"><Globe2 size={16} /> {labels.builtFor}</p>
            <h1>{heroTitle}</h1>
            <p className="solution-hero__lead">{heroDescription}</p>
            <div className="trade-actions"><a className="trade-button trade-button--light" href="#products">{labels.exploreProducts} <ArrowRight size={18} /></a><a className="solution-text-link" href={email ? `mailto:${email}` : '#contact'}>{labels.sendEnquiry} <ArrowRight size={16} /></a></div>
            <div className="solution-hero__promise"><span><Check size={16} /> {labels.directResponse}</span><span><Check size={16} /> {labels.oemSupport}</span><span><Check size={16} /> {labels.worldwide}</span></div>
          </div>
          <div className="solution-hero__visual">
            <div className="solution-hero__image">{heroProduct?.image ? <Image alt={heroProduct.image.alt} fill priority sizes="(max-width: 860px) 92vw, 48vw" src={heroProduct.image.url} unoptimized={isLocalMediaURL(heroProduct.image.url)} /> : <PackageCheck size={60} />}<span>{heroProduct?.category || labels.product}</span></div>
            <div className="solution-hero__note"><b>01</b><span>{labels.simpleProcess}</span><strong>{labels.shareRequest}</strong><p>{labels.shareRequestText}</p></div>
          </div>
        </div>
      </section>

      <section className="solution-products" id="products">
        <div className="trade-shell"><div className="solution-section-heading"><p className="trade-kicker">{labels.products}</p><h2>{labels.productsTitle}</h2><p>{labels.productsIntro}</p><Link className="trade-button trade-button--primary" href={`/${locale}/products`}>{labels.viewCatalog} <ArrowRight size={17} /></Link></div><ProductGrid className="solution-product-grid" labels={labels} locale={locale} products={products.slice(0, 4)} /></div>
      </section>

      <section className="solution-about" id="about"><div className="trade-shell solution-about__grid"><div><p className="trade-kicker">{labels.about} {brandName}</p><h2>{aboutTitle}</h2><p>{aboutDescription}</p></div><Highlights data={data} /></div></section>

      <section className="solution-process"><div className="trade-shell"><div className="solution-section-heading solution-section-heading--light"><p className="trade-kicker">{labels.simpleProcess}</p><h2>{labels.contactIntro}</h2></div><div className="solution-process__steps"><article><b>01</b><h3>{labels.shareRequest}</h3><p>{labels.shareRequestText}</p></article><article><b>02</b><h3>{labels.confirmDetails}</h3><p>{labels.confirmDetailsText}</p></article><article><b>03</b><h3>{labels.productionDelivery}</h3><p>{labels.productionDeliveryText}</p></article></div></div></section>
      <BlogSection data={data} />
      <ContactSection data={data} />
    </main>
  )
}
