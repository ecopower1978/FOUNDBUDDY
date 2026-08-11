import configPromise from '@payload-config'
import { randomBytes } from 'node:crypto'
import { getPayload } from 'payload'
import sharp from 'sharp'

import { contentHash, TRANSLATION_CONTEXT_KEY } from '@/i18n/translationWorkflow'
import { locales, type SiteLocale } from '@/i18n/config'

if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo seed is disabled in production.')
}
if (process.env.SITE_VARIANT !== 'demo') {
  throw new Error('Demo seed requires SITE_VARIANT=demo.')
}

const databaseURL = process.env.DATABASE_URL || ''
if (!/^postgres(?:ql)?:\/\//.test(databaseURL)) {
  throw new Error('Demo seed requires an explicit PostgreSQL DATABASE_URL.')
}
const databaseName = decodeURIComponent(new URL(databaseURL).pathname.replace(/^\//, ''))
if (!databaseName.toLowerCase().includes('demo')) {
  throw new Error(
    `Refusing to seed database "${databaseName}". The database name must contain "demo".`,
  )
}

const payload = await getPayload({ config: configPromise })
const existingCounts = await Promise.all(
  ['users', 'products', 'posts', 'media'].map((collection) =>
    payload.count({ collection: collection as never, overrideAccess: true }),
  ),
)
if (existingCounts.some((result) => result.totalDocs > 0)) {
  throw new Error('Demo seed only runs against an empty demo database.')
}

const email = process.env.DEMO_OWNER_EMAIL || 'owner@demo.local'
const password = randomBytes(30).toString('base64url')
const context = {
  demoSeed: true,
  disableRevalidate: true,
  [TRANSLATION_CONTEXT_KEY]: true,
}

await payload.create({
  collection: 'users',
  data: {
    email,
    name: 'Demo Owner',
    password,
    role: 'owner',
  },
  context,
  overrideAccess: true,
})

const productDefinitions = [
  {
    color: '#1f7a62',
    description: '适用于国际采购询盘演示，可由后台修改规格、图片和发布状态。',
    enDescription:
      'A demonstration product for international sourcing enquiries. Edit its specifications, images and publication status in the admin.',
    enTitle: 'Export-ready product sample',
    sku: 'DEMO-001',
    title: '外贸商品示例',
  },
  {
    color: '#345995',
    description: '展示多图片、首页排序以及多语言回退的商品内容。',
    enDescription:
      'Demonstrates product imagery, homepage ordering and multilingual fallbacks.',
    enTitle: 'Custom manufacturing sample',
    sku: 'DEMO-002',
    title: '定制生产示例',
  },
  {
    color: '#b56b45',
    description: '用于测试移动端商品卡片、详情页和邮件询价流程。',
    enDescription:
      'Use this item to test mobile cards, product details and email enquiries.',
    enTitle: 'Global delivery sample',
    sku: 'DEMO-003',
    title: '全球交付示例',
  },
] as const

const productIDs: number[] = []

for (const [index, definition] of productDefinitions.entries()) {
  const image = await sharp({
    create: {
      background: definition.color,
      channels: 4,
      height: 900,
      width: 1200,
    },
  })
    .webp({ quality: 86 })
    .toBuffer()

  const media = await payload.create({
    collection: 'media',
    data: { alt: definition.title },
    file: {
      data: image,
      mimetype: 'image/webp',
      name: `demo-product-${index + 1}.webp`,
      size: image.length,
    },
    locale: 'zh-CN',
    context,
    overrideAccess: true,
  })
  await payload.update({
    collection: 'media',
    id: media.id,
    data: { alt: definition.enTitle },
    locale: 'en',
    context,
    overrideAccess: true,
  })

  const sourceHash = contentHash({
    category: '演示商品',
    description: definition.description,
    shortDescription: definition.description,
    specifications: [
      { name: '最小起订量', value: '请询价' },
      { name: '交付方式', value: '全球配送' },
    ],
    title: definition.title,
  })
  const translationStatus = locales
    .filter((locale): locale is Exclude<SiteLocale, 'zh-CN'> => locale !== 'zh-CN')
    .map((locale) => ({
      error: null,
      locale,
      mode: locale === 'en' ? ('manual' as const) : ('auto' as const),
      sourceHash,
      status: locale === 'en' ? ('complete' as const) : ('pending' as const),
      updatedAt: new Date().toISOString(),
    }))

  let product = await payload.create({
    collection: 'products',
    data: {
      category: '演示商品',
      description: definition.description,
      images: [media.id],
      shortDescription: definition.description,
      sku: definition.sku,
      slug: `demo-product-${index + 1}`,
      specifications: [
        { name: '最小起订量', value: '请询价' },
        { name: '交付方式', value: '全球配送' },
      ],
      title: definition.title,
      translationSourceHash: sourceHash,
      translationStatus,
      workflowState: 'draft',
    },
    draft: false,
    locale: 'zh-CN',
    context,
    overrideAccess: true,
  })
  const specificationIDs = product.specifications?.map((item) => item.id)
  product = await payload.update({
    collection: 'products',
    id: product.id,
    data: {
      category: 'Demo product',
      description: definition.enDescription,
      shortDescription: definition.enDescription,
      specifications: [
        {
          ...(specificationIDs?.[0] ? { id: specificationIDs[0] } : {}),
          name: 'Minimum order',
          value: 'Contact us',
        },
        {
          ...(specificationIDs?.[1] ? { id: specificationIDs[1] } : {}),
          name: 'Delivery',
          value: 'Worldwide',
        },
      ],
      title: definition.enTitle,
    },
    draft: false,
    locale: 'en',
    context,
    overrideAccess: true,
  })
  productIDs.push(product.id)
}

await payload.updateGlobal({
  slug: 'homepage',
  data: { featuredProducts: productIDs },
  context,
  overrideAccess: true,
})

const companyHash = contentHash({
  aboutDescription: '一个用于安全测试后台工作流的本地演示环境。',
  aboutTitle: '外贸网站演示',
  address: null,
  heroDescription: '体验商品发布、多语言内容、首页排序和联系流程。',
  heroTitle: '可靠产品，清晰沟通，交付全球。',
  highlights: [],
})
const companyStatus = locales
  .filter((locale): locale is Exclude<SiteLocale, 'zh-CN'> => locale !== 'zh-CN')
  .map((locale) => ({
    error: null,
    locale,
    mode: locale === 'en' ? ('manual' as const) : ('auto' as const),
    sourceHash: companyHash,
    status: locale === 'en' ? ('complete' as const) : ('pending' as const),
    updatedAt: new Date().toISOString(),
  }))

await payload.updateGlobal({
  slug: 'company',
  data: {
    aboutDescription: '一个用于安全测试后台工作流的本地演示环境。',
    aboutTitle: '外贸网站演示',
    brandName: 'Trade Demo',
    contact: { email },
    heroDescription: '体验商品发布、多语言内容、首页排序和联系流程。',
    heroTitle: '可靠产品，清晰沟通，交付全球。',
    translationSourceHash: companyHash,
    translationStatus: companyStatus,
  },
  locale: 'zh-CN',
  context,
  overrideAccess: true,
})
await payload.updateGlobal({
  slug: 'company',
  data: {
    aboutDescription: 'A local demo environment for safely testing merchant workflows.',
    aboutTitle: 'International trade website demo',
    brandName: 'Trade Demo',
    contact: { email },
    heroDescription:
      'Try product publishing, multilingual content, homepage ordering and contact flows.',
    heroTitle: 'Reliable products. Clear communication. Global delivery.',
  },
  locale: 'en',
  context,
  overrideAccess: true,
})

console.log(`
Demo data created.
Admin: ${email}
One-time local password: ${password}

This password was generated at runtime and is not stored in source control.
Change it after the first login.
`)
