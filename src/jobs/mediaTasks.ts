import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { PayloadRequest, TaskConfig } from 'payload'
import sharp from 'sharp'

import { env, isS3Configured } from '@/config/env'
import type { Media } from '@/payload-types'

export const MEDIA_PROCESSING_CONTEXT_KEY = 'mediaImageProcessing'

const variants = [
  { height: 300, name: 'thumbnail', width: 300 },
  { height: 1200, name: 'square', width: 1200 },
  { height: 630, name: 'og', width: 1200 },
  { height: 720, name: 'banner', width: 1920 },
] as const

type VariantName = (typeof variants)[number]['name']

type MediaRecord = Pick<Media, 'filename' | 'id' | 'mimeType' | 'prefix'> & {
  sizes?: Record<string, Record<string, unknown> | null> | null
}

function normalizeSegment(value: string) {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function getStorageKey(prefix: string | null | undefined, filename: string) {
  const normalizedPrefix = normalizeSegment(prefix || 'media')
  const normalizedFilename = normalizeSegment(filename)
  return [normalizedPrefix, normalizedFilename].filter(Boolean).join('/')
}

function getPublicURL(prefix: string | null | undefined, filename: string) {
  const baseURL = isS3Configured ? env.s3.publicURL : env.siteURL.replace(/\/$/, '')
  const key = isS3Configured
    ? getStorageKey(prefix, filename)
    : `media/${normalizeSegment(filename)}`
  return `${baseURL}/${key}`
}

function variantFilename(filename: string, name: VariantName) {
  const extensionIndex = filename.lastIndexOf('.')
  const base = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename
  return `${base}-${name}.webp`
}

function createStorageClient() {
  if (!isS3Configured) return null

  return new S3Client({
    credentials: {
      accessKeyId: env.s3.accessKeyId,
      secretAccessKey: env.s3.secretAccessKey,
    },
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: env.s3.forcePathStyle,
    region: env.s3.region,
  })
}

async function readOriginal(media: MediaRecord, client: S3Client | null) {
  if (client) {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: env.s3.bucket,
        Key: getStorageKey(media.prefix, media.filename || ''),
      }),
    )

    if (!response.Body) throw new Error(`Original media ${media.id} has an empty object body`)
    return Buffer.from(await response.Body.transformToByteArray())
  }

  if (!media.filename) throw new Error(`Media ${media.id} has no filename`)
  return fs.readFile(path.resolve(process.cwd(), 'public/media', media.filename))
}

async function writeVariant(
  client: S3Client | null,
  prefix: string | null | undefined,
  filename: string,
  buffer: Buffer,
) {
  if (client) {
    await client.send(
      new PutObjectCommand({
        Body: buffer,
        Bucket: env.s3.bucket,
        CacheControl: 'public,max-age=31536000,immutable',
        ContentType: 'image/webp',
        Key: getStorageKey(prefix, filename),
      }),
    )
    return
  }

  await fs.mkdir(path.resolve(process.cwd(), 'public/media'), { recursive: true })
  await fs.writeFile(path.resolve(process.cwd(), 'public/media', filename), buffer)
}

async function generateMediaVariants(media: MediaRecord, req: PayloadRequest) {
  const client = createStorageClient()

  try {
    const original = await readOriginal(media, client)
    const source = sharp(original, { limitInputPixels: 40_000_000 }).rotate()
    const generated = await Promise.all(
      variants.map(async (variant) => {
        const result = await source
          .clone()
          .resize({
            fit: 'cover',
            height: variant.height,
            position: 'centre',
            width: variant.width,
            // The square product variants must not be upscaled. OG and banner
            // assets intentionally keep their requested canvas ratio so the
            // responsive layouts do not fall back to a square crop.
            withoutEnlargement: variant.name === 'thumbnail' || variant.name === 'square',
          })
          .webp({ quality: 85 })
          .toBuffer({ resolveWithObject: true })
        const filename = variantFilename(media.filename || `media-${media.id}`, variant.name)

        await writeVariant(client, media.prefix, filename, result.data)
        return {
          filename,
          filesize: result.info.size,
          height: result.info.height,
          mimeType: 'image/webp',
          name: variant.name,
          url: getPublicURL(media.prefix, filename),
          width: result.info.width,
        }
      }),
    )

    const sizes = generated.reduce<Record<string, Record<string, unknown> | null>>(
      (result, item) => {
        result[item.name] = {
          filename: item.filename,
          filesize: item.filesize,
          height: item.height,
          mimeType: item.mimeType,
          url: item.url,
          width: item.width,
        }
        return result
      },
      // Keep legacy size metadata on older records. New uploads simply have
      // an empty object here because those variants are no longer generated.
      { ...(media.sizes || {}) },
    )

    await req.payload.update({
      collection: 'media',
      context: { [MEDIA_PROCESSING_CONTEXT_KEY]: true },
      data: { sizes } as never,
      depth: 0,
      id: media.id,
      overrideAccess: true,
      req,
    })

    return { generated: generated.length }
  } finally {
    client?.destroy()
  }
}

export async function queueMediaImageProcessing(
  req: PayloadRequest,
  mediaId: number | string,
) {
  await req.payload.jobs.queue({
    input: { mediaId: String(mediaId) },
    overrideAccess: true,
    queue: 'media',
    req,
    task: 'generateMediaSizes',
    // Let the cloud-storage afterChange hook finish its original upload before
    // a worker attempts to read the object back for derivative generation.
    waitUntil: new Date(Date.now() + 5_000),
  } as Parameters<typeof req.payload.jobs.queue>[0])
}

const inputSchema: TaskConfig['inputSchema'] = [
  { name: 'mediaId', type: 'text', required: true },
]

const outputSchema: TaskConfig['outputSchema'] = [
  { name: 'generated', type: 'number', required: true },
]

export const mediaTasks: TaskConfig[] = [
  {
    handler: async ({ input, req }) => {
      const media = (await req.payload.findByID({
        collection: 'media',
        depth: 0,
        id: String((input as { mediaId: string }).mediaId),
        overrideAccess: true,
        req,
      })) as MediaRecord

      if (!media.filename) throw new Error(`Media ${media.id} has no filename`)
      return { output: await generateMediaVariants(media, req) }
    },
    inputSchema,
    label: '生成图片派生尺寸',
    outputSchema,
    retries: {
      attempts: 3,
      backoff: { delay: 2_000, type: 'exponential' },
    },
    slug: 'generateMediaSizes',
  },
]
