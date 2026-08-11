import configPromise from '@payload-config'
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getPayload } from 'payload'

import { env, isS3Configured } from '@/config/env'

if (!isS3Configured) throw new Error('Complete S3 configuration is required.')

const payload = await getPayload({ config: configPromise })
const client = new S3Client({
  credentials: {
    accessKeyId: env.s3.accessKeyId,
    secretAccessKey: env.s3.secretAccessKey,
  },
  endpoint: env.s3.endpoint || undefined,
  forcePathStyle: env.s3.forcePathStyle,
  region: env.s3.region,
})

let page = 1
let checked = 0
const failed: Array<{ id: number; key: string; reason: string }> = []

try {
  while (true) {
    const result = await payload.find({
      collection: 'media',
      depth: 0,
      limit: 100,
      overrideAccess: true,
      page,
      pagination: true,
    })
    for (const media of result.docs) {
      if (!media.filename) {
        failed.push({ id: media.id, key: '', reason: 'missing filename in database' })
        continue
      }
      const key = `media/${media.filename}`
      try {
        const object = await client.send(
          new HeadObjectCommand({ Bucket: env.s3.bucket, Key: key }),
        )
        if (
          typeof media.filesize === 'number' &&
          typeof object.ContentLength === 'number' &&
          media.filesize !== object.ContentLength
        ) {
          failed.push({
            id: media.id,
            key,
            reason: `size mismatch: db=${media.filesize}, object=${object.ContentLength}`,
          })
        }
      } catch (error) {
        failed.push({
          id: media.id,
          key,
          reason: error instanceof Error ? error.message : 'object unavailable',
        })
      }
      checked += 1
    }
    if (!result.hasNextPage) break
    page += 1
  }
} finally {
  client.destroy()
}

console.log(JSON.stringify({ checked, failed, ok: failed.length === 0 }, null, 2))
if (failed.length) process.exitCode = 1
