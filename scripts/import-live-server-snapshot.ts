import 'dotenv/config'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createLocalReq, getPayload } from 'payload'

import { locales, type SiteLocale } from '@/i18n/config'
import {
  MEDIA_PROCESSING_CONTEXT_KEY,
} from '@/jobs/mediaTasks'
import { TRANSLATION_CONTEXT_KEY } from '@/i18n/translationWorkflow'

type LocaleMap = Partial<Record<SiteLocale, string | null>>

type ApiMedia = {
  id: number
  alt?: LocaleMap | string | null
  caption?: unknown
  createdAt?: string | null
  filename?: string | null
  filesize?: number | null
  height?: number | null
  mimeType?: string | null
  updatedAt?: string | null
  url?: string | null
  width?: number | null
}

type ApiProduct = {
  id: number
  title: LocaleMap | string | null
  shortDescription: LocaleMap | string | null
  category?: LocaleMap | string | null
  description?: LocaleMap | string | null
  specifications?: Array<{
    id?: string | null
    name: LocaleMap | string | null
    value: LocaleMap | string | null
  }> | null
  images?: Array<number | { id?: number | null }> | null
  slug: string
  createdAt?: string | null
  updatedAt?: string | null
}

type ApiCompany = {
  id?: number
  brandName?: string | null
  heroTitle?: LocaleMap | string | null
  heroDescription?: LocaleMap | string | null
  aboutTitle?: LocaleMap | string | null
  aboutDescription?: LocaleMap | string | null
  highlights?: Array<{
    id?: string | null
    title: LocaleMap | string | null
    description: LocaleMap | string | null
  }> | null
  contact?: {
    email?: string | null
    phone?: string | null
    wechat?: string | null
    address?: LocaleMap | string | null
  } | null
  createdAt?: string | null
  updatedAt?: string | null
}

type ApiPage<T> = { docs?: T[]; totalDocs?: number }

type AssetIndexItem = {
  mediaId: number
  kind: 'original' | 'variant'
  localPath: string
  status: string
  sha256?: string | null
  actualBytes?: number | null
  mimeType?: string | null
}

const args = new Set(process.argv.slice(2))
const valueAfter = (name: string) => {
  const argv = process.argv.slice(2)
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

const apply = args.has('--apply')
const sourcePath = path.resolve(
  valueAfter('--source') || 'deliverables/live-server-snapshot-2026-09-14',
)

if (args.has('--help')) {
  console.log(`Usage:
  pnpm data:import:server -- --source ./deliverables/live-server-snapshot-2026-09-14
  pnpm data:import:server -- --apply --source ./deliverables/live-server-snapshot-2026-09-14

The command is read-only unless --apply is supplied. Writes are refused for
production or non-local PostgreSQL databases. The source must be an export
from the current customer server, not the legacy SQLite file.`)
  process.exit(0)
}

if (!existsSync(sourcePath)) throw new Error(`Server snapshot not found: ${sourcePath}`)

const metadataPath = path.join(sourcePath, 'metadata')
const mediaPath = path.join(metadataPath, 'media-api.json')
const productsPath = path.join(metadataPath, 'products-api.json')
const companyPath = path.join(metadataPath, 'company-api.json')
const assetIndexPath = path.join(metadataPath, 'asset-index.json')

for (const requiredPath of [mediaPath, productsPath, companyPath, assetIndexPath]) {
  if (!existsSync(requiredPath)) throw new Error(`Snapshot file not found: ${requiredPath}`)
}

const mediaApi = JSON.parse(await readFile(mediaPath, 'utf8')) as ApiPage<ApiMedia>
const productsApi = JSON.parse(await readFile(productsPath, 'utf8')) as ApiPage<ApiProduct>
const company = JSON.parse(await readFile(companyPath, 'utf8')) as ApiCompany
const assetIndex = JSON.parse(await readFile(assetIndexPath, 'utf8')) as AssetIndexItem[]

const mediaDocs = Array.isArray(mediaApi.docs) ? mediaApi.docs : []
const productDocs = Array.isArray(productsApi.docs) ? productsApi.docs : []
const originalAssets = new Map(
  assetIndex
    .filter((asset) => asset.kind === 'original')
    .map((asset) => [asset.mediaId, asset]),
)

function localText(value: unknown, locale: SiteLocale): string {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const values = value as Record<string, unknown>
  const candidates = [locale, 'zh-CN', 'en', ...locales]
  for (const candidate of candidates) {
    const item = values[candidate]
    if (typeof item === 'string' && item.trim()) return item.trim()
  }
  return ''
}

function hasLocaleValue(value: unknown, locale: SiteLocale): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = (value as Record<string, unknown>)[locale]
  return typeof item === 'string' && item.trim().length > 0
}

function mediaReferenceId(value: number | { id?: number | null }): number | null {
  if (typeof value === 'number') return value
  return typeof value.id === 'number' ? value.id : null
}

function localizedValue(value: unknown, locale: SiteLocale, fallback = '') {
  const result = localText(value, locale)
  return result || fallback
}

const sourceSummary = {
  source: sourcePath,
  mediaRecords: mediaDocs.length,
  publishedProducts: productDocs.length,
  publishedPosts: 0,
  originalAssets: originalAssets.size,
  missingAssets: mediaDocs.filter((media) => {
    const asset = originalAssets.get(media.id)
    return !asset || asset.status !== 'ok'
  }).length,
}

for (const media of mediaDocs) {
  const asset = originalAssets.get(media.id)
  if (!asset || asset.status !== 'ok') {
    throw new Error(`Media ${media.id} does not have a verified original asset in the snapshot.`)
  }
  const filePath = path.resolve(sourcePath, asset.localPath)
  if (!existsSync(filePath)) throw new Error(`Media file not found: ${filePath}`)
  const fileStats = await stat(filePath)
  if (!fileStats.isFile() || fileStats.size === 0) {
    throw new Error(`Media file is empty or not a file: ${filePath}`)
  }
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...sourceSummary }, null, 2))

if (!apply) process.exit(0)

if (process.env.NODE_ENV === 'production') {
  throw new Error('Live server snapshot import is refused when NODE_ENV=production.')
}

const { env } = await import('@/config/env')
const databaseURL = env.databaseURL
const database = new URL(databaseURL)
const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(database.hostname)
const isDevelopmentDatabase = /(?:^|[-_])(dev|local)(?:$|[-_])/i.test(database.pathname)
if (!isLocalHost || !isDevelopmentDatabase) {
  throw new Error(
    `Import target is not an approved local development database: ${databaseURL}`,
  )
}

const { default: configPromise } = await import('@payload-config')
const payload = await getPayload({ config: configPromise })
const localReq = await createLocalReq({}, payload)
const storageClient = env.s3.bucket && env.s3.accessKeyId && env.s3.secretAccessKey && env.s3.endpoint
  ? new S3Client({
      credentials: {
        accessKeyId: env.s3.accessKeyId,
        secretAccessKey: env.s3.secretAccessKey,
      },
      endpoint: env.s3.endpoint,
      forcePathStyle: env.s3.forcePathStyle,
      region: env.s3.region,
    })
  : null
const context = {
  disableRevalidate: true,
  importMigration: true,
  [MEDIA_PROCESSING_CONTEXT_KEY]: true,
  [TRANSLATION_CONTEXT_KEY]: true,
}

const findByField = async (
  collection: 'media' | 'products',
  field: string,
  value: string,
) => {
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { [field]: { equals: value } },
  })
  return result.docs[0]
}

const mediaMap = new Map<number, number>()
for (const media of mediaDocs) {
  const asset = originalAssets.get(media.id)!
  const filePath = path.resolve(sourcePath, asset.localPath)
  const filename = media.filename || path.basename(filePath)
  const file = {
    data: await readFile(filePath),
    mimetype: media.mimeType || asset.mimeType || 'application/octet-stream',
    name: filename,
    size: asset.actualBytes || media.filesize || 0,
  }
  const migrationKey = `server-media:${media.id}`
  const baseAlt = localizedValue(media.alt, 'zh-CN', filename.replace(/\.[^.]+$/, ''))
  const existing = await findByField('media', 'migrationKey', migrationKey)

  const document = existing
    ? await payload.update({
        collection: 'media',
        id: existing.id,
        data: { migrationKey, alt: baseAlt } as never,
        locale: 'zh-CN',
        context,
        overrideAccess: true,
      })
    : await payload.create({
        collection: 'media',
        data: {
          alt: baseAlt,
          createdAt: media.createdAt || undefined,
          migrationKey,
          updatedAt: media.updatedAt || undefined,
        } as never,
        file,
        locale: 'zh-CN',
        context,
        overrideAccess: true,
      })

  mediaMap.set(media.id, Number(document.id))

  // Reconcile the original object explicitly as well as through Payload's
  // upload adapter. This makes reruns repair a partially populated local
  // object store without changing the customer's server.
  if (storageClient && document.filename) {
    await storageClient.send(
      new PutObjectCommand({
        Body: file.data,
        Bucket: env.s3.bucket,
        CacheControl: 'public,max-age=31536000,immutable',
        ContentType: file.mimetype,
        Key: `media/${document.filename}`,
      }),
    )
  }

  for (const locale of locales) {
    if (locale === 'zh-CN' || !hasLocaleValue(media.alt, locale)) continue
    await payload.update({
      collection: 'media',
      id: document.id,
      data: { alt: localizedValue(media.alt, locale, baseAlt) } as never,
      locale,
      context,
      overrideAccess: true,
    })
  }
}

const productMap = new Map<number, number>()
for (const product of productDocs) {
  const imageIDs = (Array.isArray(product.images) ? product.images : [])
    .map(mediaReferenceId)
    .filter((id): id is number => id !== null)
    .map((id) => mediaMap.get(id))
    .filter((id): id is number => typeof id === 'number')
    .filter((id, index, values) => values.indexOf(id) === index)

  if (!imageIDs.length) throw new Error(`Published product ${product.id} has no imported images.`)

  const productData = (locale: SiteLocale) => ({
    _status: 'published' as const,
    category: localizedValue(product.category, locale) || undefined,
    description: localizedValue(product.description, locale) || undefined,
    images: imageIDs,
    shortDescription: localizedValue(
      product.shortDescription,
      locale,
      'Please contact us for product details and sourcing support.',
    ),
    slug: product.slug,
    specifications: (product.specifications || []).map((spec) => ({
      name: localizedValue(spec.name, locale, 'Specification'),
      value: localizedValue(spec.value, locale, '—'),
    })),
    title: localizedValue(product.title, locale, 'Product'),
    workflowState: 'draft' as const,
  })

  const existing = await findByField('products', 'slug', product.slug)
  let document = existing
    ? await payload.update({
        collection: 'products',
        id: existing.id,
        data: productData('zh-CN') as never,
        draft: false,
        locale: 'zh-CN',
        context,
        overrideAccess: true,
      })
    : await payload.create({
        collection: 'products',
        data: productData('zh-CN') as never,
        draft: false,
        locale: 'zh-CN',
        context,
        overrideAccess: true,
      })

  productMap.set(product.id, Number(document.id))
  for (const locale of locales) {
    if (locale === 'zh-CN') continue
    document = await payload.update({
      collection: 'products',
      id: document.id,
      data: productData(locale) as never,
      draft: false,
      locale,
      context,
      overrideAccess: true,
    })
  }
}

const companyData = (locale: SiteLocale) => ({
  aboutDescription: localizedValue(company.aboutDescription, locale) || undefined,
  aboutTitle: localizedValue(company.aboutTitle, locale) || undefined,
  brandName: company.brandName || 'FoundBuddy',
  contact: {
    address: localizedValue(company.contact?.address, locale) || undefined,
    email: company.contact?.email || ' ',
    phone: company.contact?.phone || undefined,
    wechat: company.contact?.wechat || undefined,
  },
  heroDescription: localizedValue(company.heroDescription, locale, ' '),
  heroTitle: localizedValue(company.heroTitle, locale, company.brandName || 'FoundBuddy'),
  highlights: (company.highlights || []).map((item) => ({
    description: localizedValue(item.description, locale, '—'),
    title: localizedValue(item.title, locale, '—'),
  })),
})

for (const locale of locales) {
  await payload.updateGlobal({
    slug: 'company',
    data: companyData(locale) as never,
    locale,
    context,
    overrideAccess: true,
  })
}

await payload.updateGlobal({
  slug: 'homepage',
  data: {
    featuredProducts: productDocs
      .slice(0, 8)
      .map((product) => productMap.get(product.id))
      .filter((id): id is number => typeof id === 'number'),
  } as never,
  context,
  overrideAccess: true,
})

for (const mediaId of mediaMap.values()) {
  await payload.jobs.queue({
    input: { mediaId: String(mediaId) },
    overrideAccess: true,
    queue: 'media',
    req: localReq,
    task: 'generateMediaSizes',
  } as Parameters<typeof payload.jobs.queue>[0])
}

storageClient?.destroy()

let processedMediaJobs = 0
while (true) {
  const result = await payload.jobs.run({
    limit: 5,
    overrideAccess: true,
    queue: 'media',
    req: localReq,
    sequential: true,
    silent: true,
  })
  processedMediaJobs += Object.keys(result.jobStatus || {}).length
  if (result.noJobsRemaining) break
}

const [mediaCount, productCount, postCount] = await Promise.all([
  payload.count({ collection: 'media', overrideAccess: true }),
  payload.count({ collection: 'products', overrideAccess: true }),
  payload.count({ collection: 'posts', overrideAccess: true }),
])

console.log(
  JSON.stringify(
    {
      mode: 'apply',
      target: databaseURL,
      importedMedia: mediaMap.size,
      importedProducts: productMap.size,
      processedMediaJobs,
      targetCounts: {
        media: mediaCount.totalDocs,
        products: productCount.totalDocs,
        posts: postCount.totalDocs,
      },
    },
    null,
    2,
  ),
)

process.exit(0)
