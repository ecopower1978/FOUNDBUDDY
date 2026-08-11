import configPromise from '@payload-config'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getPayload, type DataFromCollectionSlug } from 'payload'

import { isSMTPConfigured } from '@/config/env'
import { contentHash, TRANSLATION_CONTEXT_KEY } from '@/i18n/translationWorkflow'
import { isSiteLocale, locales, type SiteLocale } from '@/i18n/config'

type Row = Record<string, unknown>
type ID = number
type LocaleRows = Map<number, Map<SiteLocale, Row>>
type LocalizedChildren = Map<string, Map<SiteLocale, Row>>

const defaultSource = path.resolve('international-trade-web.db')
const defaultMediaDir = path.resolve('public/media')
const supportedMimeTypes = new Set([
  'image/avif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const args = new Set(process.argv.slice(2))
const valueAfter = (name: string) => {
  const argv = process.argv.slice(2)
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

const apply = args.has('--apply')
const dryRun = !apply
const sendInvites = args.has('--send-invites')
const skipInvites = args.has('--skip-invites')
const sourcePath = path.resolve(valueAfter('--source') || defaultSource)
const mediaDir = path.resolve(valueAfter('--media-dir') || defaultMediaDir)
const reportPath = path.resolve(
  valueAfter('--report') ||
    path.join(
      'reports',
      `sqlite-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    ),
)

if (args.has('--help')) {
  console.log(`Usage:
  pnpm data:import -- --source ./legacy.db --media-dir ./public/media
  pnpm data:import -- --apply --skip-invites
  pnpm data:import -- --apply --send-invites

The command is a dry-run unless --apply is supplied. A write requires exactly
one of --send-invites or --skip-invites so staging cannot email real users by
accident. Production also requires IMPORT_PRODUCTION_CONFIRM=IMPORT_SQLITE.`)
  process.exit(0)
}

if (!existsSync(sourcePath)) throw new Error(`SQLite source not found: ${sourcePath}`)
if (!existsSync(mediaDir)) throw new Error(`Legacy media directory not found: ${mediaDir}`)
if (apply && sendInvites === skipInvites) {
  throw new Error('Use exactly one of --send-invites or --skip-invites with --apply.')
}
if (
  apply &&
  process.env.NODE_ENV === 'production' &&
  process.env.IMPORT_PRODUCTION_CONFIRM !== 'IMPORT_SQLITE'
) {
  throw new Error(
    'Production import refused. Set IMPORT_PRODUCTION_CONFIRM=IMPORT_SQLITE after freezing writes and taking backups.',
  )
}
if (apply && !/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || '')) {
  throw new Error('A PostgreSQL DATABASE_URL is required for --apply.')
}
if (apply && sendInvites && !isSMTPConfigured) {
  throw new Error('SMTP must be configured before using --send-invites.')
}

const db = new DatabaseSync(sourcePath, { readOnly: true })

function hasTable(name: string) {
  return Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name),
  )
}

function rows(name: string): Row[] {
  return hasTable(name) ? (db.prepare(`SELECT * FROM "${name}"`).all() as Row[]) : []
}

function asNumber(value: unknown): number {
  return Number(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeLocale(value: unknown): SiteLocale | undefined {
  const normalized =
    value === 'zh' || value === 'zh-Hans' ? 'zh-CN' : value === 'zh-Hant' ? 'zh-TW' : value
  return isSiteLocale(normalized) ? normalized : undefined
}

function groupLocales(sourceRows: Row[]): LocaleRows {
  const result: LocaleRows = new Map()
  for (const row of sourceRows) {
    const parentID = asNumber(row._parent_id)
    const locale = normalizeLocale(row._locale)
    if (!Number.isFinite(parentID) || !locale) continue
    const entries = result.get(parentID) || new Map<SiteLocale, Row>()
    entries.set(locale, row)
    result.set(parentID, entries)
  }
  return result
}

function groupLocalizedChildren(sourceRows: Row[]): LocalizedChildren {
  const result: LocalizedChildren = new Map()
  for (const row of sourceRows) {
    const parentID = String(row._parent_id || '')
    const locale = normalizeLocale(row._locale)
    if (!parentID || !locale) continue
    const entries = result.get(parentID) || new Map<SiteLocale, Row>()
    entries.set(locale, row)
    result.set(parentID, entries)
  }
  return result
}

function bestLocale(rowsByLocale: Map<SiteLocale, Row> | undefined): Row {
  return (
    rowsByLocale?.get('zh-CN') ||
    rowsByLocale?.get('en') ||
    rowsByLocale?.values().next().value ||
    {}
  )
}

function parseJSON(value: unknown) {
  if (typeof value !== 'string' || !value) return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex')
}

function hashRows(value: unknown) {
  return sha256(JSON.stringify(value))
}

function emptyLexical() {
  return {
    root: {
      children: [],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

function translationMetadata(
  localized: Map<SiteLocale, Row> | undefined,
  hash: string,
) {
  const now = new Date().toISOString()
  return {
    translationSourceHash: hash,
    translationStatus: locales
      .filter((locale): locale is Exclude<SiteLocale, 'zh-CN'> => locale !== 'zh-CN')
      .map((locale) => ({
        error: null,
        locale,
        mode: localized?.has(locale) ? ('manual' as const) : ('auto' as const),
        sourceHash: hash,
        status: localized?.has(locale) ? ('complete' as const) : ('pending' as const),
        updatedAt: now,
      })),
  }
}

function mediaPath(row: Row) {
  const filename = asString(row.filename)
  if (!filename) return undefined
  const candidates = [
    path.join(mediaDir, filename),
    path.join(mediaDir, path.basename(asString(row.url) || filename)),
  ]
  return candidates.find(existsSync)
}

const source = {
  categories: rows('categories'),
  company: rows('company'),
  companyHighlights: rows('company_highlights'),
  companyHighlightLocales: rows('company_highlights_locales'),
  companyLocales: rows('company_locales'),
  media: rows('media'),
  mediaLocales: rows('media_locales'),
  posts: rows('posts'),
  postLocales: rows('posts_locales'),
  postRelations: rows('posts_rels'),
  products: rows('products'),
  productLocales: rows('products_locales'),
  productRelations: rows('products_rels'),
  specifications: rows('products_specifications'),
  specificationLocales: rows('products_specifications_locales'),
  users: rows('users').map(({ hash: _hash, salt: _salt, ...safe }) => safe),
}

const localizedProducts = groupLocales(source.productLocales)
const localizedPosts = groupLocales(source.postLocales)
const localizedMedia = groupLocales(source.mediaLocales)
const localizedCompany = groupLocales(source.companyLocales)
const localizedSpecifications = groupLocalizedChildren(source.specificationLocales)
const localizedCompanyHighlights = groupLocalizedChildren(
  source.companyHighlightLocales,
)
if (source.company[0]) {
  const companyID = asNumber(source.company[0].id)
  const companyLocales = localizedCompany.get(companyID) || new Map<SiteLocale, Row>()
  companyLocales.set('en', source.company[0])
  localizedCompany.set(companyID, companyLocales)
}

const warnings: string[] = []
const blocking: string[] = []
const mediaInventory: Array<{
  exists: boolean
  filename: string
  hash?: string
  id: number
  size?: number
}> = []

for (const row of source.media) {
  const id = asNumber(row.id)
  const filename = asString(row.filename) || `media-${id}`
  const filePath = mediaPath(row)
  if (!filePath) {
    mediaInventory.push({ exists: false, filename, id })
    blocking.push(`Media ${id} is missing: ${filename}`)
    continue
  }
  const file = await readFile(filePath)
  const fileStat = await stat(filePath)
  const mime = asString(row.mime_type) || ''
  if (!supportedMimeTypes.has(mime)) {
    blocking.push(`Media ${id} has unsupported MIME type: ${mime || 'unknown'}`)
  }
  if (fileStat.size > 15 * 1024 * 1024) {
    blocking.push(`Media ${id} exceeds 15 MB: ${filename}`)
  }
  mediaInventory.push({
    exists: true,
    filename,
    hash: sha256(file),
    id,
    size: fileStat.size,
  })
}

const productImageIDs = new Map<number, number[]>()
for (const relation of source.productRelations) {
  if (relation.path !== 'images' || relation.media_id == null) continue
  const parentID = asNumber(relation.parent_id)
  const current = productImageIDs.get(parentID) || []
  current.push(asNumber(relation.media_id))
  productImageIDs.set(parentID, current)
}
for (const product of source.products) {
  if (Boolean(product.featured) && !(productImageIDs.get(asNumber(product.id)) || []).length) {
    blocking.push(`Published legacy product ${product.id} has no image relation.`)
  }
}
if (source.company[0] && !asString(source.company[0].contact_email)) {
  blocking.push('The legacy company record has no contact email.')
}

for (const post of source.posts) {
  if (!localizedPosts.get(asNumber(post.id))?.size) {
    warnings.push(`Post ${post.id} has no localized content; an explicit draft placeholder will be used.`)
  }
}

const localeCoverage = {
  company: Object.fromEntries(
    locales.map((locale) => [locale, localizedCompany.get(1)?.has(locale) ? 1 : 0]),
  ),
  posts: Object.fromEntries(
    locales.map((locale) => [
      locale,
      [...localizedPosts.values()].filter((entry) => entry.has(locale)).length,
    ]),
  ),
  products: Object.fromEntries(
    locales.map((locale) => [
      locale,
      [...localizedProducts.values()].filter((entry) => entry.has(locale)).length,
    ]),
  ),
}

const report: Record<string, unknown> = {
  blocking,
  completedAt: null,
  dryRun,
  hashes: {
    categories: hashRows(source.categories),
    company: hashRows([
      source.company,
      source.companyLocales,
      source.companyHighlights,
      source.companyHighlightLocales,
    ]),
    media: hashRows(mediaInventory),
    posts: hashRows([source.posts, source.postLocales, source.postRelations]),
    products: hashRows([
      source.products,
      source.productLocales,
      source.productRelations,
      source.specifications,
      source.specificationLocales,
    ]),
    users: hashRows(source.users),
  },
  localeCoverage,
  mappings: {},
  media: mediaInventory,
  source: sourcePath,
  sourceCounts: {
    categories: source.categories.length,
    company: source.company.length,
    media: source.media.length,
    posts: source.posts.length,
    products: source.products.length,
    users: source.users.length,
  },
  targetCounts: {},
  warnings,
}

async function saveReport() {
  report.completedAt = new Date().toISOString()
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

if (dryRun || blocking.length) {
  await saveReport()
  db.close()
  console.log(
    JSON.stringify(
      {
        blocking: blocking.length,
        mode: 'dry-run',
        report: reportPath,
        sourceCounts: report.sourceCounts,
        warnings: warnings.length,
      },
      null,
      2,
    ),
  )
  if (blocking.length) process.exitCode = 1
} else {
  const payload = await getPayload({ config: configPromise })
  const context = {
    disableRevalidate: true,
    importMigration: true,
    [TRANSLATION_CONTEXT_KEY]: true,
  }

  const categoryMap = new Map<number, ID>()
  const mediaMap = new Map<number, ID>()
  const targetMedia: Array<{
    filename?: string | null
    id: ID
    legacyID: number
    url?: string | null
  }> = []
  const productMap = new Map<number, ID>()
  const userMap = new Map<number, ID>()
  const postMap = new Map<number, ID>()

  async function findOne<T extends 'categories' | 'media' | 'posts' | 'products' | 'users'>(
    collection: T,
    where: Record<string, unknown>,
  ): Promise<DataFromCollectionSlug<T> | undefined> {
    const found = await payload.find({
      collection: collection as never,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: where as never,
    })
    return found.docs[0] as DataFromCollectionSlug<T> | undefined
  }

  for (const category of source.categories) {
    const oldID = asNumber(category.id)
    const title = asString(category.title) || `Imported category ${oldID}`
    const slug = asString(category.slug) || `legacy-category-${oldID}`
    const existing = await findOne('categories', { slug: { equals: slug } })
    const data = {
      createdAt: asString(category.created_at),
      slug,
      title,
      updatedAt: asString(category.updated_at),
    }
    const doc = existing
      ? await payload.update({
          collection: 'categories',
          id: existing.id as ID,
          data,
          context,
          overrideAccess: true,
        })
      : await payload.create({
          collection: 'categories',
          data,
          context,
          overrideAccess: true,
        })
    categoryMap.set(oldID, doc.id)
  }
  for (const category of source.categories) {
    if (category.parent_id == null) continue
    const id = categoryMap.get(asNumber(category.id))
    const parent = categoryMap.get(asNumber(category.parent_id))
    if (id && parent) {
      await payload.update({
        collection: 'categories',
        id,
        data: { parent },
        context,
        overrideAccess: true,
      })
    }
  }

  const mediaTitleFallback = new Map<number, string>()
  for (const product of source.products) {
    const title = asString(bestLocale(localizedProducts.get(asNumber(product.id))).title)
    for (const mediaID of productImageIDs.get(asNumber(product.id)) || []) {
      if (title && !mediaTitleFallback.has(mediaID)) mediaTitleFallback.set(mediaID, title)
    }
  }

  for (const mediaRow of source.media) {
    const oldID = asNumber(mediaRow.id)
    const inventory = mediaInventory.find((item) => item.id === oldID)
    const filePath = mediaPath(mediaRow)
    if (!inventory?.hash || !filePath) throw new Error(`Validated media disappeared: ${oldID}`)
    const migrationKey = `sqlite:${oldID}:${inventory.hash}`
    const existing = await findOne('media', { migrationKey: { equals: migrationKey } })
    const localized = localizedMedia.get(oldID)
    const base = bestLocale(localized)
    const filename = asString(mediaRow.filename) || path.basename(filePath)
    const alt =
      asString(base.alt) ||
      asString(mediaRow.alt) ||
      mediaTitleFallback.get(oldID) ||
      filename.replace(/\.[^.]+$/, '')
    const file = await readFile(filePath)

    const doc = existing
      ? await payload.update({
        collection: 'media',
        id: existing.id as ID,
        data: { alt, migrationKey } as never,
        locale: 'zh-CN',
        context,
        overrideAccess: true,
      })
      : await payload.create({
        collection: 'media',
        data: {
          alt,
          createdAt: mediaRow.created_at,
          migrationKey,
          updatedAt: mediaRow.updated_at,
        } as never,
        file: {
          data: file,
          mimetype: asString(mediaRow.mime_type) || 'application/octet-stream',
          name: filename,
          size: file.length,
        },
        locale: 'zh-CN',
        context,
        overrideAccess: true,
      })
    mediaMap.set(oldID, doc.id as ID)
    targetMedia.push({
      filename: doc.filename,
      id: doc.id as ID,
      legacyID: oldID,
      url: doc.url,
    })

    for (const [locale, localeRow] of localized || []) {
      await payload.update({
        collection: 'media',
        id: doc.id as ID,
        data: { alt: asString(localeRow.alt) || alt },
        locale,
        context,
        overrideAccess: true,
      })
    }
  }

  const specsByProduct = new Map<number, Row[]>()
  for (const spec of source.specifications) {
    const parent = asNumber(spec._parent_id)
    const list = specsByProduct.get(parent) || []
    list.push(spec)
    specsByProduct.set(parent, list)
  }
  for (const list of specsByProduct.values()) {
    list.sort((a, b) => asNumber(a._order) - asNumber(b._order))
  }

  function productData(
    product: Row,
    locale: SiteLocale,
    specificationIDs?: Array<string | null | undefined>,
  ) {
    const oldID = asNumber(product.id)
    const localized = localizedProducts.get(oldID)
    const row = localized?.get(locale) || bestLocale(localized)
    const specifications = (specsByProduct.get(oldID) || []).map((spec, index) => {
      const localSpec =
        localizedSpecifications.get(String(spec.id))?.get(locale) ||
        bestLocale(localizedSpecifications.get(String(spec.id)))
      return {
        ...(specificationIDs?.[index] ? { id: specificationIDs[index] } : {}),
        name: asString(localSpec.name) || `Specification ${index + 1}`,
        value: asString(localSpec.value) || '—',
      }
    })
    const sourceHash = contentHash({
      category: row.category,
      description: row.description,
      shortDescription: row.short_description,
      specifications,
      title: row.title,
    })
    return {
      category: asString(row.category),
      createdAt: product.created_at,
      description: asString(row.description),
      images: (productImageIDs.get(oldID) || [])
        .map((id) => mediaMap.get(id))
        .filter(Boolean),
      shortDescription:
        asString(row.short_description) || `Imported product ${oldID}`,
      sku: asString(product.sku),
      slug: asString(product.slug) || `legacy-product-${oldID}`,
      specifications,
      title: asString(row.title) || `Imported product ${oldID}`,
      updatedAt: product.updated_at,
      workflowState: 'draft' as const,
      ...(locale === 'zh-CN' ? translationMetadata(localized, sourceHash) : {}),
    }
  }

  for (const product of source.products) {
    const oldID = asNumber(product.id)
    const slug = asString(product.slug) || `legacy-product-${oldID}`
    const existing = await findOne('products', { slug: { equals: slug } })
    const published = Boolean(product.featured)
    let doc = existing
      ? await payload.update({
          collection: 'products',
          id: existing.id as ID,
          data: productData(product, 'zh-CN') as never,
          draft: !published,
          locale: 'zh-CN',
          context,
          overrideAccess: true,
        })
      : await payload.create({
          collection: 'products',
          data: productData(product, 'zh-CN') as never,
          draft: !published,
          locale: 'zh-CN',
          context,
          overrideAccess: true,
        })
    productMap.set(oldID, doc.id)
    const specIDs = doc.specifications?.map(
      (item: { id?: string | null }) => item.id,
    )
    for (const locale of localizedProducts.get(oldID)?.keys() || []) {
      if (locale === 'zh-CN') continue
      doc = await payload.update({
        collection: 'products',
        id: doc.id,
        data: productData(product, locale, specIDs) as never,
        draft: !published,
        locale,
        context,
        overrideAccess: true,
      })
    }
  }

  const companyRow = source.company[0]
  if (companyRow) {
    const localized = localizedCompany.get(asNumber(companyRow.id))
    const base = bestLocale(localized)
    const highlights = source.companyHighlights
      .sort((a, b) => asNumber(a._order) - asNumber(b._order))
      .map((item) => {
        const local = bestLocale(localizedCompanyHighlights.get(String(item.id)))
        return {
          description: asString(local.description) || asString(item.description) || '—',
          title: asString(local.title) || asString(item.title) || '—',
        }
      })
    const sourceHash = contentHash({
      aboutDescription: base.about_description,
      aboutTitle: base.about_title,
      address: base.contact_address,
      heroDescription: base.hero_description,
      heroTitle: base.hero_title,
      highlights,
    })
    let doc = await payload.updateGlobal({
      slug: 'company',
      data: {
        aboutDescription: asString(base.about_description) || asString(companyRow.about_description),
        aboutTitle: asString(base.about_title) || asString(companyRow.about_title),
        brandName: asString(companyRow.brand_name) || 'Imported company',
        contact: {
          address: asString(base.contact_address) || asString(companyRow.contact_address),
          email: asString(companyRow.contact_email)!,
          phone: asString(companyRow.contact_phone),
          wechat: asString(companyRow.contact_wechat),
        },
        heroDescription:
          asString(base.hero_description) ||
          asString(companyRow.hero_description) ||
          'Imported company profile',
        heroTitle:
          asString(base.hero_title) || asString(companyRow.hero_title) || 'Imported company',
        highlights,
        ...translationMetadata(localized, sourceHash),
      } as never,
      locale: 'zh-CN',
      context,
      overrideAccess: true,
    })
    const highlightIDs = doc.highlights?.map((item) => item.id)
    for (const [locale, localeRow] of localized || []) {
      if (locale === 'zh-CN') continue
      const localeHighlights = source.companyHighlights.map((item, index) => {
        const translated =
          localizedCompanyHighlights.get(String(item.id))?.get(locale) ||
          bestLocale(localizedCompanyHighlights.get(String(item.id)))
        return {
          ...(highlightIDs?.[index] ? { id: highlightIDs[index] } : {}),
          description:
            asString(translated.description) || asString(item.description) || '—',
          title: asString(translated.title) || asString(item.title) || '—',
        }
      })
      doc = await payload.updateGlobal({
        slug: 'company',
        data: {
          aboutDescription: asString(localeRow.about_description),
          aboutTitle: asString(localeRow.about_title),
          contact: {
            address: asString(localeRow.contact_address),
            email: asString(companyRow.contact_email)!,
            phone: asString(companyRow.contact_phone),
            wechat: asString(companyRow.contact_wechat),
          },
          heroDescription:
            asString(localeRow.hero_description) ||
            asString(companyRow.hero_description) ||
            'Imported company profile',
          heroTitle:
            asString(localeRow.hero_title) || asString(companyRow.hero_title) || 'Imported company',
          highlights: localeHighlights,
        } as never,
        locale,
        context,
        overrideAccess: true,
      })
    }
  }

  // The first imported account establishes an authenticated owner context for
  // subsequent account creates. `overrideAccess` bypasses access functions but
  // intentionally does not bypass the last-owner/invitation hooks.
  let migrationOwner: Awaited<ReturnType<typeof findOne>> = undefined
  for (const user of source.users) {
    const oldID = asNumber(user.id)
    const email = asString(user.email)
    if (!email) {
      warnings.push(`User ${oldID} was skipped because the legacy email is empty.`)
      continue
    }
    const existing = await findOne('users', { email: { equals: email } })
    let doc = existing
    if (doc && doc.role !== 'owner') {
      doc = await payload.update({
        collection: 'users',
        id: doc.id,
        data: { role: 'owner' },
        context,
        overrideAccess: true,
        user: migrationOwner || undefined,
      })
    }
    if (!doc) {
      doc = await payload.create({
        collection: 'users',
        data: {
          createdAt: asString(user.created_at),
          email,
          name: asString(user.name) || email.split('@')[0],
          password: randomBytes(48).toString('base64url'),
          role: 'owner',
          updatedAt: asString(user.updated_at),
        },
        context,
        overrideAccess: true,
        user: migrationOwner || undefined,
      })
      if (sendInvites) {
        await payload.forgotPassword({
          collection: 'users',
          data: { email },
          disableEmail: false,
          overrideAccess: true,
        })
      }
    }
    migrationOwner ||= doc
    userMap.set(oldID, doc.id as ID)
  }

  function postData(post: Row, locale: SiteLocale) {
    const oldID = asNumber(post.id)
    const localized = localizedPosts.get(oldID)
    const row = localized?.get(locale) || bestLocale(localized)
    const slug = asString(post.slug) || `legacy-draft-${oldID}`
    const relations = source.postRelations.filter(
      (relation) => asNumber(relation.parent_id) === oldID,
    )
    const sourceHash = contentHash({
      content: parseJSON(row.content),
      excerpt: row.excerpt,
      meta: {
        description: row.meta_description,
        title: row.meta_title,
      },
      title: row.title,
    })
    return {
      authors: relations
        .filter((item) => item.path === 'authors' && item.users_id != null)
        .map((item) => userMap.get(asNumber(item.users_id)))
        .filter(Boolean),
      categories: relations
        .filter((item) => item.path === 'categories' && item.categories_id != null)
        .map((item) => categoryMap.get(asNumber(item.categories_id)))
        .filter(Boolean),
      content: parseJSON(row.content) || emptyLexical(),
      createdAt: post.created_at,
      excerpt: asString(row.excerpt),
      heroImage:
        post.hero_image_id == null ? undefined : mediaMap.get(asNumber(post.hero_image_id)),
      meta: {
        description: asString(row.meta_description),
        image:
          row.meta_image_id == null ? undefined : mediaMap.get(asNumber(row.meta_image_id)),
        title: asString(row.meta_title),
      },
      publishedAt: asString(post.published_at),
      slug,
      title: asString(row.title) || `Imported draft ${oldID}`,
      updatedAt: post.updated_at,
      ...(locale === 'zh-CN' ? translationMetadata(localized, sourceHash) : {}),
    }
  }

  for (const post of source.posts) {
    const oldID = asNumber(post.id)
    const slug = asString(post.slug) || `legacy-draft-${oldID}`
    const existing = await findOne('posts', { slug: { equals: slug } })
    const published = post._status === 'published'
    let doc = existing
      ? await payload.update({
          collection: 'posts',
          id: existing.id as ID,
          data: postData(post, 'zh-CN') as never,
          draft: !published,
          locale: 'zh-CN',
          context,
          overrideAccess: true,
        })
      : await payload.create({
          collection: 'posts',
          data: postData(post, 'zh-CN') as never,
          draft: !published,
          locale: 'zh-CN',
          context,
          overrideAccess: true,
        })
    postMap.set(oldID, doc.id)
    for (const locale of localizedPosts.get(oldID)?.keys() || []) {
      if (locale === 'zh-CN') continue
      doc = await payload.update({
        collection: 'posts',
        id: doc.id,
        data: postData(post, locale) as never,
        draft: !published,
        locale,
        context,
        overrideAccess: true,
      })
    }
  }

  for (const post of source.posts) {
    const oldID = asNumber(post.id)
    const id = postMap.get(oldID)
    if (!id) continue
    const relatedPosts = source.postRelations
      .filter(
        (relation) =>
          asNumber(relation.parent_id) === oldID &&
          relation.path === 'relatedPosts' &&
          relation.posts_id != null,
      )
      .map((relation) => postMap.get(asNumber(relation.posts_id)))
      .filter(Boolean)
    if (relatedPosts.length) {
      await payload.update({
        collection: 'posts',
        id,
        data: { relatedPosts } as never,
        draft: post._status !== 'published',
        context,
        overrideAccess: true,
      })
    }
  }

  const featuredProducts = source.products
    .filter((product) => Boolean(product.show_on_homepage) && Boolean(product.featured))
    .sort(
      (left, right) =>
        new Date(String(left.created_at)).getTime() -
        new Date(String(right.created_at)).getTime(),
    )
    .slice(0, 8)
    .map((product) => productMap.get(asNumber(product.id)))
    .filter((id): id is number => typeof id === 'number')
  await payload.updateGlobal({
    slug: 'homepage',
    data: { featuredProducts },
    context,
    overrideAccess: true,
  })

  const [categories, media, products, users, posts] = await Promise.all(
    ['categories', 'media', 'products', 'users', 'posts'].map((collection) =>
      payload.count({ collection: collection as never, overrideAccess: true }),
    ),
  )
  report.mappings = {
    categories: Object.fromEntries(categoryMap),
    media: Object.fromEntries(mediaMap),
    posts: Object.fromEntries(postMap),
    products: Object.fromEntries(productMap),
    users: Object.fromEntries(userMap),
  }
  report.targetCounts = {
    categories: categories.totalDocs,
    company: companyRow ? 1 : 0,
    media: media.totalDocs,
    posts: posts.totalDocs,
    products: products.totalDocs,
    users: users.totalDocs,
  }
  report.targetMedia = targetMedia
  report.relations = {
    homepageProducts: featuredProducts.length,
    postRelations: source.postRelations.length,
    productImages: [...productImageIDs.values()].reduce((sum, ids) => sum + ids.length, 0),
  }
  report.invites = sendInvites
    ? 'Sent only for newly created legacy accounts.'
    : 'Skipped explicitly; send password-reset links before production cutover.'

  await saveReport()
  db.close()
  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        report: reportPath,
        targetCounts: report.targetCounts,
        warnings: warnings.length,
      },
      null,
      2,
    ),
  )
}
