import configPromise from '@payload-config'
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
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'

import { getMessages, isSiteLocale, localeMeta, locales, type SiteLocale } from '@/i18n/config'
import { HeroProductCarousel } from '@/components/HeroProductCarousel'
import { ProductCarousel } from '@/components/ProductCarousel'
import { demoProductImages, isDemoSite, siteBrandName, siteContactEmail } from '@/config/siteVariant'
import { isLocaleTranslationComplete } from '@/i18n/translationWorkflow'
import { getCompany } from '@/data/company'
import type { Product } from '@/payload-types'

type MediaValue = { alt?: string | null; url?: string | null }

const isPublishedProduct = (value: number | Product): value is Product =>
  typeof value === 'object' && value !== null && value._status === 'published'

const fallbackProducts: Record<
  SiteLocale,
  Array<{
    id: string
    title: string
    category: string
    shortDescription: string
    images: never[]
    slug: string
  }>
> = {
  en: [
    {
      id: 'sample-1',
      title: 'Industrial Components',
      category: 'OEM & Components',
      shortDescription:
        'Built to your drawings and quality requirements, with clear production follow-up.',
      images: [],
      slug: 'industrial-components',
    },
    {
      id: 'sample-2',
      title: 'Commercial Equipment',
      category: 'Business Supply',
      shortDescription:
        'Practical equipment options for distributors, projects and commercial buyers.',
      images: [],
      slug: 'commercial-equipment',
    },
    {
      id: 'sample-3',
      title: 'Custom Product Sourcing',
      category: 'Sourcing Service',
      shortDescription:
        'Tell us the specifications and target market; we help identify the right supply solution.',
      images: [],
      slug: 'custom-product-sourcing',
    },
  ],
  'zh-CN': [
    {
      id: 'sample-1',
      title: '工业零部件',
      category: 'OEM 与零部件',
      shortDescription: '按图纸和质量要求生产，并提供清晰透明的生产进度跟进。',
      images: [],
      slug: 'industrial-components',
    },
    {
      id: 'sample-2',
      title: '商用设备',
      category: '商业供应',
      shortDescription: '为经销商、工程项目和商业采购商提供务实的设备方案。',
      images: [],
      slug: 'commercial-equipment',
    },
    {
      id: 'sample-3',
      title: '定制产品采购',
      category: '采购服务',
      shortDescription: '告诉我们产品规格和目标市场，我们协助寻找合适的供应方案。',
      images: [],
      slug: 'custom-product-sourcing',
    },
  ],
  es: [
    {
      id: 'sample-1',
      title: 'Componentes industriales',
      category: 'OEM y componentes',
      shortDescription:
        'Fabricados según sus planos y requisitos de calidad, con seguimiento claro de la producción.',
      images: [],
      slug: 'industrial-components',
    },
    {
      id: 'sample-2',
      title: 'Equipos comerciales',
      category: 'Suministro empresarial',
      shortDescription:
        'Opciones prácticas para distribuidores, proyectos y compradores comerciales.',
      images: [],
      slug: 'commercial-equipment',
    },
    {
      id: 'sample-3',
      title: 'Abastecimiento personalizado',
      category: 'Servicio de abastecimiento',
      shortDescription:
        'Comparta las especificaciones y el mercado objetivo; le ayudaremos a encontrar la solución adecuada.',
      images: [],
      slug: 'custom-product-sourcing',
    },
  ],
  'zh-TW': [
    { id: 'sample-1', title: '工業零組件', category: 'OEM 與零組件', shortDescription: '依照圖紙和品質要求生產，並提供清晰透明的生產進度跟進。', images: [], slug: 'industrial-components' },
    { id: 'sample-2', title: '商用設備', category: '商業供應', shortDescription: '為經銷商、工程專案和商業採購商提供務實的設備方案。', images: [], slug: 'commercial-equipment' },
    { id: 'sample-3', title: '客製化產品採購', category: '採購服務', shortDescription: '告訴我們產品規格和目標市場，我們協助尋找合適的供應方案。', images: [], slug: 'custom-product-sourcing' },
  ],
  de: [
    { id: 'sample-1', title: 'Industriekomponenten', category: 'OEM & Komponenten', shortDescription: 'Fertigung nach Ihren Zeichnungen und Qualitätsanforderungen mit klarer Produktionsverfolgung.', images: [], slug: 'industrial-components' },
    { id: 'sample-2', title: 'Gewerbliche Ausrüstung', category: 'Geschäftsbedarf', shortDescription: 'Praktische Ausrüstung für Händler, Projekte und gewerbliche Einkäufer.', images: [], slug: 'commercial-equipment' },
    { id: 'sample-3', title: 'Individuelle Produktbeschaffung', category: 'Beschaffungsservice', shortDescription: 'Nennen Sie Spezifikationen und Zielmarkt; wir finden die passende Lieferlösung.', images: [], slug: 'custom-product-sourcing' },
  ],
  pt: [
    { id: 'sample-1', title: 'Componentes industriais', category: 'OEM e componentes', shortDescription: 'Produzidos segundo os seus desenhos e requisitos de qualidade, com acompanhamento claro.', images: [], slug: 'industrial-components' },
    { id: 'sample-2', title: 'Equipamento comercial', category: 'Fornecimento empresarial', shortDescription: 'Opções práticas para distribuidores, projetos e compradores comerciais.', images: [], slug: 'commercial-equipment' },
    { id: 'sample-3', title: 'Fornecimento personalizado', category: 'Serviço de fornecimento', shortDescription: 'Partilhe as especificações e o mercado-alvo; ajudamos a encontrar a solução adequada.', images: [], slug: 'custom-product-sourcing' },
  ],
  ko: [
    { id: 'sample-1', title: '산업용 부품', category: 'OEM 및 부품', shortDescription: '도면과 품질 요구 사항에 맞춰 생산하고 진행 상황을 명확하게 안내합니다.', images: [], slug: 'industrial-components' },
    { id: 'sample-2', title: '상업용 장비', category: '비즈니스 공급', shortDescription: '유통업체, 프로젝트 및 상업 구매자를 위한 실용적인 장비 옵션입니다.', images: [], slug: 'commercial-equipment' },
    { id: 'sample-3', title: '맞춤형 제품 소싱', category: '소싱 서비스', shortDescription: '사양과 목표 시장을 알려주시면 적합한 공급 솔루션을 찾아드립니다.', images: [], slug: 'custom-product-sourcing' },
  ],
  ar: [
    { id: 'sample-1', title: 'مكونات صناعية', category: 'OEM ومكونات', shortDescription: 'تصنيع وفق رسوماتك ومتطلبات الجودة مع متابعة واضحة للإنتاج.', images: [], slug: 'industrial-components' },
    { id: 'sample-2', title: 'معدات تجارية', category: 'توريد تجاري', shortDescription: 'خيارات عملية للموزعين والمشاريع والمشترين التجاريين.', images: [], slug: 'commercial-equipment' },
    { id: 'sample-3', title: 'توريد منتجات مخصصة', category: 'خدمة التوريد', shortDescription: 'شارك المواصفات والسوق المستهدف وسنساعدك في إيجاد حل التوريد المناسب.', images: [], slug: 'custom-product-sourcing' },
  ],
  he: [
    { id: 'sample-1', title: 'רכיבים תעשייתיים', category: 'OEM ורכיבים', shortDescription: 'ייצור לפי השרטוטים ודרישות האיכות שלכם, עם מעקב ייצור ברור.', images: [], slug: 'industrial-components' },
    { id: 'sample-2', title: 'ציוד מסחרי', category: 'אספקה עסקית', shortDescription: 'אפשרויות ציוד מעשיות למפיצים, לפרויקטים ולקונים מסחריים.', images: [], slug: 'commercial-equipment' },
    { id: 'sample-3', title: 'רכש מוצרים מותאם', category: 'שירות רכש', shortDescription: 'שתפו מפרט ושוק יעד ונעזור למצוא את פתרון האספקה המתאים.', images: [], slug: 'custom-product-sourcing' },
  ],
}

type HomePageProps = {
  params: Promise<{ locale: string }>
}

function resolveLocale(value: string): SiteLocale {
  return isSiteLocale(value) ? value : 'en'
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale)
  const t = getMessages(locale)
  const company = await getCompany(locale)
  return {
      title: `${company.brandName || siteBrandName} | ${t.builtFor}`,
      description: company.heroDescription || t.heroDescription,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        ...Object.fromEntries(
          locales.map((item) => [localeMeta[item].htmlLang, `/${item}`]),
        ),
        'x-default': '/en',
      },
    },
      robots: isLocaleTranslationComplete(company, locale)
        ? undefined
        : { follow: true, index: false },
      openGraph: {
        description: company.heroDescription || t.heroDescription,
        siteName: company.brandName || siteBrandName,
        title: `${company.brandName || siteBrandName} | ${t.builtFor}`,
        type: 'website',
        url: `/${locale}`,
      },
      twitter: {
        card: 'summary_large_image',
        description: company.heroDescription || t.heroDescription,
        title: `${company.brandName || siteBrandName} | ${t.builtFor}`,
      },
  }
}

function getMedia(value: unknown): MediaValue | null {
  return value && typeof value === 'object' ? (value as MediaValue) : null
}

export default async function HomePage({ params }: HomePageProps) {
  const locale = resolveLocale((await params).locale)
  const t = getMessages(locale)
  const payload = await getPayload({ config: configPromise })
  const [productResult, postResult, company, homepage] = await Promise.all([
    payload.find({
      collection: 'products',
      locale,
      fallbackLocale: ['en', 'zh-CN'],
      depth: 1,
      limit: 12,
      sort: '-createdAt',
      where: { _status: { equals: 'published' } },
    }),
    payload.find({
      collection: 'posts',
      locale,
      fallbackLocale: ['en', 'zh-CN'],
      depth: 1,
      limit: 3,
      sort: '-publishedAt',
      where: { _status: { equals: 'published' } },
    }),
    getCompany(locale),
      payload.findGlobal({
        slug: 'homepage',
        depth: 2,
        fallbackLocale: ['en', 'zh-CN'],
        locale,
      }),
  ])

  const selectedHomepageProducts = (homepage.featuredProducts || []).filter(isPublishedProduct)
  const homepageProducts = selectedHomepageProducts.length
    ? selectedHomepageProducts
    : isDemoSite
      ? fallbackProducts[locale]
      : []
  const products = productResult.docs.length
    ? productResult.docs
    : isDemoSite
      ? fallbackProducts[locale]
      : []
  const brandName = company.brandName || siteBrandName
  const email = company.contact?.email || siteContactEmail
  const highlights = company.highlights?.length
    ? company.highlights
    : [
        { title: t.clearCommunication, description: t.clearCommunicationText },
        { title: t.qualityFollowup, description: t.qualityFollowupText },
        { title: t.exportReady, description: t.exportReadyText },
      ]

  return (
    <main>
      {homepageProducts.length > 0 && <section className="hero-ad-section">
        <div className="trade-shell">
          <HeroProductCarousel
            labels={{ image: t.productImage, region: t.ourProducts, requestDetails: t.requestDetails }}
            locale={locale}
            products={homepageProducts.map((product) => {
              const firstImage = Array.isArray(product.images) ? getMedia(product.images[0]) : null
              return {
                id: product.id,
                title: product.title || t.product,
                category: product.category || t.product,
                shortDescription: product.shortDescription || t.productsIntro,
                slug: product.slug,
                image: firstImage?.url
                  ? { alt: firstImage.alt || product.title, url: firstImage.url }
                  : demoProductImages[product.slug] || null,
              }
            })}
          />
        </div>
      </section>}

      <section className="trade-hero trade-hero--moved">
        <div className="trade-shell trade-hero__grid">
          <div>
            <p className="trade-eyebrow">
              <Globe2 size={16} /> {t.builtFor}
            </p>
            <h1>{company.heroTitle || t.heroTitle}</h1>
            <p className="trade-hero__lead">{company.heroDescription || t.heroDescription}</p>
            <div className="trade-actions">
              <a className="trade-button trade-button--primary" href="#products">
                {t.exploreProducts} <ArrowRight size={18} />
              </a>
              <a className="trade-button trade-button--secondary" href={email ? `mailto:${email}` : '#contact'}>
                {t.sendEnquiry}
              </a>
            </div>
            <div className="trade-trust-row">
              <span>
                <Check size={16} /> {t.directResponse}
              </span>
              <span>
                <Check size={16} /> {t.oemSupport}
              </span>
              <span>
                <Check size={16} /> {t.worldwide}
              </span>
            </div>
          </div>
          <aside className="trade-hero__card">
            <div className="trade-hero__card-top">
              <PackageCheck size={28} />
              <span>{t.simpleProcess}</span>
            </div>
            <ol>
              <li>
                <b>01</b>
                <span>
                  <strong>{t.shareRequest}</strong>
                  <small>{t.shareRequestText}</small>
                </span>
              </li>
              <li>
                <b>02</b>
                <span>
                  <strong>{t.confirmDetails}</strong>
                  <small>{t.confirmDetailsText}</small>
                </span>
              </li>
              <li>
                <b>03</b>
                <span>
                  <strong>{t.productionDelivery}</strong>
                  <small>{t.productionDeliveryText}</small>
                </span>
              </li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="trade-section" id="products">
        <div className="trade-shell">
          <div className="trade-section__heading">
            <div>
              <p className="trade-kicker">{t.ourProducts}</p>
              <h2>{t.productsTitle}</h2>
            </div>
            <p>{t.productsIntro}</p>
          </div>
          {products.length > 0 && <ProductCarousel
            labels={{ image: t.productImage, region: t.ourProducts, requestDetails: t.requestDetails }}
            locale={locale}
            products={products.map((product) => {
              const firstImage = Array.isArray(product.images) ? getMedia(product.images[0]) : null
              return {
                id: product.id,
                title: product.title,
                category: product.category || t.product,
                shortDescription: product.shortDescription,
                slug: product.slug,
                image: firstImage?.url
                  ? { alt: firstImage.alt || product.title, url: firstImage.url }
                  : demoProductImages[product.slug] || null,
              }
            })}
          />}
        </div>
      </section>

      <section className="trade-about" id="about">
        <div className="trade-shell trade-about__grid">
          <div>
            <p className="trade-kicker">
              {t.about} {brandName}
            </p>
            <h2>{company.aboutTitle || t.aboutTitle}</h2>
            <p>{company.aboutDescription || t.aboutText}</p>
          </div>
          <div className="trade-highlights">
            {highlights.map((item, index) => (
              <article key={item.id || index}>
                <span>0{index + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {postResult.docs.length > 0 && (
        <section className="trade-section trade-blog" id="insights">
          <div className="trade-shell">
            <div className="trade-section__heading">
              <div>
                <p className="trade-kicker">{t.insights}</p>
                <h2>{t.usefulNotes}</h2>
              </div>
              <Link href={`/${locale}/posts`}>
                {t.viewAll} <ArrowRight size={16} />
              </Link>
            </div>
            <div className="trade-blog__grid">
              {postResult.docs.map((post) => (
                <Link className="trade-blog__card" href={`/${locale}/posts/${post.slug}`} key={post.id}>
                  <time>
                    {post.publishedAt
                      ? new Date(post.publishedAt).toLocaleDateString(
                          localeMeta[locale].htmlLang,
                          { month: 'short', day: 'numeric', year: 'numeric' },
                        )
                      : t.latestArticle}
                  </time>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt || post.meta?.description || t.articleFallback}</p>
                  <span>
                    {t.readArticle} <ArrowRight size={15} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="trade-contact" id="contact">
        <div className="trade-shell trade-contact__grid">
          <div>
            <p className="trade-kicker">{t.contact}</p>
            <h2>{t.contactTitle}</h2>
            <p>{t.contactIntro}</p>
          </div>
          <div className="trade-contact__details">
            {email && <a href={`mailto:${email}`}>
              <Mail size={20} />
              <span>
                <small>{t.email}</small>
                {email}
              </span>
            </a>}
            {company.contact?.phone && (
              <a href={`tel:${company.contact.phone}`}>
                <Phone size={20} />
                <span>
                  <small>{t.phone}</small>
                  {company.contact.phone}
                </span>
              </a>
            )}
            {company.contact?.address && (
              <div>
                <MapPin size={20} />
                <span>
                  <small>{t.address}</small>
                  {company.contact.address}
                </span>
              </div>
            )}
            {company.contact?.wechat && (
              <a href="weixin://">
                <MessageCircle size={20} />
                <span>
                  <small>WeChat</small>
                  {company.contact.wechat}
                </span>
              </a>
            )}
            <button data-open-chat="true" type="button">
              <MessageCircle size={20} />
              <span>
                <small>{t.aiAssistant}</small>
                {t.chatCorner}
              </span>
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
