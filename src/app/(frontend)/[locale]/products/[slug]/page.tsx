import configPromise from '@payload-config'
import { ArrowLeft, ArrowRight, Check, Mail, MessageCircle, PackageCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Media, Product } from '@/payload-types'
import { isSiteLocale, localeMeta, locales, type SiteLocale } from '@/i18n/config'
import { env } from '@/config/env'
import { isLocaleTranslationComplete } from '@/i18n/translationWorkflow'
import { siteBrandName, siteContactEmail } from '@/config/siteVariant'

import { ProductGallery } from './ProductGallery'
import { getCompany } from '@/data/company'

export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{ locale: string; slug?: string }>
}

const detailCopy = {
  en: {
    back: 'Back to all products',
    category: 'Product',
    enquiry: 'Request a quotation',
    email: 'Email our team',
    image: 'Product image',
    details: 'Product details',
    specifications: 'Specifications',
    process: 'What happens next',
    processIntro:
      'Share your target quantity, specifications and destination. We will reply with the practical next step.',
    related: 'Related products',
    relatedIntro: 'Explore other products and sourcing solutions for international buyers.',
    stepOne: 'Requirements confirmed',
    stepOneText: 'We check the product, quantity, specifications and destination.',
    stepTwo: 'Quotation and sample',
    stepTwoText: 'Pricing, lead time and sample arrangements are clearly confirmed.',
    stepThree: 'Production follow-up',
    stepThreeText: 'One contact keeps you updated through production and delivery.',
    viewProduct: 'View product',
  },
  'zh-CN': {
    back: '返回全部商品',
    category: '商品',
    enquiry: '获取报价',
    email: '邮件联系我们',
    image: '商品图片',
    details: '商品详情',
    specifications: '规格参数',
    process: '接下来的流程',
    processIntro: '请告诉我们预计数量、规格要求和目的地，我们会尽快回复明确的下一步方案。',
    related: '相关商品',
    relatedIntro: '查看更多面向国际采购商的商品与采购方案。',
    stepOne: '确认采购需求',
    stepOneText: '核对商品、数量、规格和目的地信息。',
    stepTwo: '报价与样品',
    stepTwoText: '明确确认价格、交期和样品安排。',
    stepThree: '生产与交付跟进',
    stepThreeText: '由固定联系人持续同步生产和交付进度。',
    viewProduct: '查看商品',
  },
  es: {
    back: 'Volver a todos los productos',
    category: 'Producto',
    enquiry: 'Solicitar cotización',
    email: 'Enviar un correo',
    image: 'Imagen del producto',
    details: 'Detalles del producto',
    specifications: 'Especificaciones',
    process: 'Próximos pasos',
    processIntro:
      'Comparta la cantidad, las especificaciones y el destino. Le responderemos con el siguiente paso.',
    related: 'Productos relacionados',
    relatedIntro: 'Explore otros productos y soluciones para compradores internacionales.',
    stepOne: 'Confirmación de requisitos',
    stepOneText: 'Confirmamos el producto, la cantidad, las especificaciones y el destino.',
    stepTwo: 'Cotización y muestra',
    stepTwoText: 'Confirmamos claramente el precio, el plazo y la preparación de muestras.',
    stepThree: 'Seguimiento de producción',
    stepThreeText: 'Un contacto le mantiene informado durante la producción y la entrega.',
    viewProduct: 'Ver producto',
  },
  'zh-TW': {
    back: '返回全部產品', category: '產品', enquiry: '取得報價', email: '傳送郵件', image: '產品圖片', details: '產品詳情', specifications: '規格參數', process: '接下來的流程', processIntro: '請告訴我們預計數量、規格要求和目的地，我們會回覆明確的下一步方案。', related: '相關產品', relatedIntro: '查看更多面向國際採購商的產品與採購方案。', stepOne: '確認採購需求', stepOneText: '核對產品、數量、規格和目的地資訊。', stepTwo: '報價與樣品', stepTwoText: '明確確認價格、交期和樣品安排。', stepThree: '生產與交付跟進', stepThreeText: '由固定聯絡人持續同步生產和交付進度。', viewProduct: '查看產品',
  },
  de: {
    back: 'Zurück zu allen Produkten', category: 'Produkt', enquiry: 'Angebot anfordern', email: 'E-Mail senden', image: 'Produktbild', details: 'Produktdetails', specifications: 'Spezifikationen', process: 'Wie es weitergeht', processIntro: 'Teilen Sie Menge, Spezifikationen und Zielort mit. Wir antworten mit dem nächsten konkreten Schritt.', related: 'Ähnliche Produkte', relatedIntro: 'Entdecken Sie weitere Produkte und Beschaffungslösungen.', stepOne: 'Anforderungen bestätigen', stepOneText: 'Wir prüfen Produkt, Menge, Spezifikationen und Zielort.', stepTwo: 'Angebot und Muster', stepTwoText: 'Preis, Lieferzeit und Muster werden klar bestätigt.', stepThree: 'Produktionsbegleitung', stepThreeText: 'Ein Ansprechpartner informiert Sie über Produktion und Lieferung.', viewProduct: 'Produkt ansehen',
  },
  pt: {
    back: 'Voltar a todos os produtos', category: 'Produto', enquiry: 'Pedir cotação', email: 'Enviar e-mail', image: 'Imagem do produto', details: 'Detalhes do produto', specifications: 'Especificações', process: 'Próximos passos', processIntro: 'Partilhe a quantidade, as especificações e o destino. Indicaremos o próximo passo.', related: 'Produtos relacionados', relatedIntro: 'Explore outros produtos e soluções de fornecimento.', stepOne: 'Requisitos confirmados', stepOneText: 'Confirmamos o produto, a quantidade, as especificações e o destino.', stepTwo: 'Cotação e amostra', stepTwoText: 'Preço, prazo e amostras são confirmados com clareza.', stepThree: 'Acompanhamento da produção', stepThreeText: 'Um contacto mantém-no informado durante a produção e a entrega.', viewProduct: 'Ver produto',
  },
  ko: {
    back: '전체 제품으로 돌아가기', category: '제품', enquiry: '견적 요청', email: '이메일 문의', image: '제품 이미지', details: '제품 상세', specifications: '사양', process: '다음 절차', processIntro: '목표 수량, 사양 및 목적지를 알려주시면 다음 단계를 안내합니다.', related: '관련 제품', relatedIntro: '해외 구매자를 위한 다른 제품과 소싱 솔루션을 확인하세요.', stepOne: '요구 사항 확인', stepOneText: '제품, 수량, 사양 및 목적지를 확인합니다.', stepTwo: '견적 및 샘플', stepTwoText: '가격, 납기 및 샘플 일정을 명확히 확인합니다.', stepThree: '생산 진행 관리', stepThreeText: '한 명의 담당자가 생산과 배송 진행 상황을 안내합니다.', viewProduct: '제품 보기',
  },
  ar: {
    back: 'العودة إلى كل المنتجات', category: 'منتج', enquiry: 'طلب عرض سعر', email: 'مراسلة فريقنا', image: 'صورة المنتج', details: 'تفاصيل المنتج', specifications: 'المواصفات', process: 'الخطوات التالية', processIntro: 'شارك الكمية المستهدفة والمواصفات والوجهة وسنرد بالخطوة العملية التالية.', related: 'منتجات ذات صلة', relatedIntro: 'استكشف منتجات وحلول توريد أخرى للمشترين الدوليين.', stepOne: 'تأكيد المتطلبات', stepOneText: 'نتحقق من المنتج والكمية والمواصفات والوجهة.', stepTwo: 'عرض السعر والعينة', stepTwoText: 'يتم تأكيد السعر والمهلة وترتيبات العينة بوضوح.', stepThree: 'متابعة الإنتاج', stepThreeText: 'تبقيك جهة اتصال واحدة على اطلاع أثناء الإنتاج والتسليم.', viewProduct: 'عرض المنتج',
  },
  he: {
    back: 'חזרה לכל המוצרים', category: 'מוצר', enquiry: 'בקשת הצעת מחיר', email: 'שליחת דוא״ל', image: 'תמונת מוצר', details: 'פרטי מוצר', specifications: 'מפרט', process: 'השלבים הבאים', processIntro: 'שתפו כמות יעד, מפרט ויעד ונשיב עם הצעד המעשי הבא.', related: 'מוצרים קשורים', relatedIntro: 'גלו מוצרים ופתרונות רכש נוספים לקונים בינלאומיים.', stepOne: 'אישור דרישות', stepOneText: 'אנו בודקים מוצר, כמות, מפרט ויעד.', stepTwo: 'הצעת מחיר ודוגמה', stepTwoText: 'המחיר, זמן האספקה והדוגמה מאושרים בבירור.', stepThree: 'מעקב ייצור', stepThreeText: 'איש קשר אחד מעדכן לאורך הייצור והמשלוח.', viewProduct: 'הצגת מוצר',
  },
} as const

function isMedia(value: number | Media): value is Media {
  return typeof value === 'object' && value !== null
}

function getImages(product: Product) {
  return (product.images || [])
    .filter(isMedia)
    .filter(
      (image): image is Media & { url: string } =>
        typeof image.url === 'string' && image.url.length > 0,
    )
    .map((image) => ({ alt: image.alt || product.title, url: image.url }))
}

const queryProduct = cache(async ({ locale, slug }: { locale: SiteLocale; slug: string }) => {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'products',
    depth: 1,
    draft: false,
    fallbackLocale: ['en', 'zh-CN'],
    limit: 1,
    locale,
    pagination: false,
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }],
    },
  })

  return result.docs[0] || null
})

export default async function ProductDetailPage({ params }: Args) {
  const { locale: localeParam, slug = '' } = await params
  const decodedSlug = decodeURIComponent(slug)
  const locale = isSiteLocale(localeParam) ? localeParam : 'en'
  const product = await queryProduct({ locale, slug: decodedSlug })

  if (!product) notFound()

  const payload = await getPayload({ config: configPromise })
  const [company, relatedResult] = await Promise.all([
    getCompany(locale),
    payload.find({
      collection: 'products',
      depth: 1,
      fallbackLocale: ['en', 'zh-CN'],
      limit: 4,
      locale,
      where: {
        and: [
          { _status: { equals: 'published' } },
          { id: { not_equals: product.id } },
          ...(product.category ? [{ category: { equals: product.category } }] : []),
        ],
      },
    }),
  ])
  const text = detailCopy[locale]
  const images = getImages(product)
  const email = company.contact?.email || siteContactEmail
  const enquiryHref = email
    ? `mailto:${email}?subject=${encodeURIComponent(`${text.enquiry}: ${product.title}`)}`
    : `/${locale}#contact`
  const canonical = new URL(
    `/${locale}/products/${encodeURIComponent(product.slug)}`,
    env.siteURL,
  ).toString()
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        brand: { '@type': 'Organization', name: company.brandName || siteBrandName },
        description: product.shortDescription,
        image: images.map((image) => new URL(image.url, env.siteURL).toString()),
        name: product.title,
        url: canonical,
      },
      {
        '@type': 'Organization',
        email: email || undefined,
        name: company.brandName || siteBrandName,
        url: new URL(`/${locale}`, env.siteURL).toString(),
      },
    ],
  }

  return (
    <main className="product-detail">
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
        type="application/ld+json"
      />
      <section className="product-detail__hero">
        <div className="trade-shell">
          <Link className="product-detail__back" href={`/${locale}#products`}>
            <ArrowLeft size={16} /> {text.back}
          </Link>

          <div className="product-detail__hero-grid">
            <ProductGallery images={images} placeholder={text.image} />

            <div className="product-detail__summary">
              <p className="trade-kicker">{product.category || text.category}</p>
              <h1>{product.title}</h1>
              <p className="product-detail__description">{product.shortDescription}</p>
              <div className="product-detail__actions">
                <a className="trade-button trade-button--primary" href={enquiryHref}>
                  <MessageCircle size={18} /> {text.enquiry}
                </a>
                {email && <a className="trade-button trade-button--secondary" href={`mailto:${email}`}>
                  <Mail size={18} /> {text.email}
                </a>}
              </div>
              <div className="product-detail__contact-note">
                <Check size={17} /> <span>{text.processIntro}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {(product.description || product.specifications?.length) && (
        <section className="product-detail__information">
          <div className="trade-shell product-detail__information-grid">
            {product.description && (
              <article>
                <p className="trade-kicker">{text.details}</p>
                <h2>{text.details}</h2>
                <p className="product-detail__long-description">{product.description}</p>
              </article>
            )}
            {product.specifications?.length ? (
              <article>
                <p className="trade-kicker">{text.specifications}</p>
                <h2>{text.specifications}</h2>
                <dl className="product-detail__specifications">
                  {product.specifications.map((item) => (
                    <div key={item.id || `${item.name}-${item.value}`}>
                      <dt>{item.name}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ) : null}
          </div>
        </section>
      )}

      <section className="product-detail__process">
        <div className="trade-shell">
          <div className="product-detail__section-heading">
            <p className="trade-kicker">{text.process}</p>
            <h2>{text.processIntro}</h2>
          </div>
          <div className="product-detail__steps">
            {[
              [text.stepOne, text.stepOneText],
              [text.stepTwo, text.stepTwoText],
              [text.stepThree, text.stepThreeText],
            ].map(([title, description], index) => (
              <article key={title}>
                <span>0{index + 1}</span>
                <PackageCheck size={24} />
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {relatedResult.docs.length > 0 && (
        <section className="trade-section product-detail__related">
          <div className="trade-shell">
            <div className="trade-section__heading">
              <div>
                <p className="trade-kicker">{text.related}</p>
                <h2>{text.relatedIntro}</h2>
              </div>
            </div>
            <div className="product-grid">
              {relatedResult.docs.slice(0, 3).map((relatedProduct) => {
                const image = getImages(relatedProduct)[0]
                return (
                  <Link
                    className="product-card"
                    href={`/${locale}/products/${encodeURIComponent(relatedProduct.slug)}`}
                    key={relatedProduct.id}
                  >
                    <div className="product-card__media">
                      {image ? (
                        <Image
                          alt={image.alt}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          src={image.url}
                        />
                      ) : (
                        <div className="product-card__placeholder">
                          <PackageCheck size={34} />
                          <span>{text.image}</span>
                        </div>
                      )}
                    </div>
                    <div className="product-card__body">
                      <p>{relatedProduct.category || text.category}</p>
                      <h3>{relatedProduct.title}</h3>
                      <span>{relatedProduct.shortDescription}</span>
                      <strong>
                        {text.viewProduct} <ArrowRight size={16} />
                      </strong>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { locale: localeParam, slug = '' } = await params
  const locale = isSiteLocale(localeParam) ? localeParam : 'en'
  const product = await queryProduct({ locale, slug: decodeURIComponent(slug) })

  if (!product) return {}

  const company = await getCompany(locale)
  const brandName = company.brandName || siteBrandName
  const images = getImages(product)
  const canonical = `/${locale}/products/${encodeURIComponent(product.slug)}`
  const complete = isLocaleTranslationComplete(product, locale)
  return {
    title: `${product.title} | ${brandName}`,
    description: product.shortDescription,
    alternates: {
      canonical,
      languages: {
        ...Object.fromEntries(
          locales.map((item) => [
            localeMeta[item].htmlLang,
            `/${item}/products/${encodeURIComponent(product.slug)}`,
          ]),
        ),
        'x-default': `/en/products/${encodeURIComponent(product.slug)}`,
      },
    },
    openGraph: {
      title: product.title,
      description: product.shortDescription,
      images: images[0] ? [{ alt: images[0].alt, url: images[0].url }] : undefined,
      siteName: brandName,
      type: 'website',
      url: canonical,
    },
    robots: complete ? undefined : { follow: true, index: false },
    twitter: {
      card: 'summary_large_image',
      description: product.shortDescription,
      images: images[0] ? [images[0].url] : undefined,
      title: `${product.title} | ${brandName}`,
    },
  }
}
