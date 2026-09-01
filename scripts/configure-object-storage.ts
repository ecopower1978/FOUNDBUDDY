import {
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import { env, isS3Configured, siteOrigins } from '@/config/env'

if (!isS3Configured) throw new Error('Complete S3 configuration is required.')
if (process.env.NODE_ENV === 'production' && process.env.STORAGE_CONFIG_CONFIRM !== 'CONFIGURE') {
  throw new Error(
    'Production storage configuration refused. Set STORAGE_CONFIG_CONFIRM=CONFIGURE after reviewing retention values.',
  )
}

const noncurrentDays = Number(process.env.STORAGE_NONCURRENT_DAYS || 365)
if (!Number.isInteger(noncurrentDays) || noncurrentDays < 30) {
  throw new Error('STORAGE_NONCURRENT_DAYS must be an integer of at least 30.')
}

const client = new S3Client({
  credentials: {
    accessKeyId: env.s3.accessKeyId,
    secretAccessKey: env.s3.secretAccessKey,
  },
  endpoint: env.s3.endpoint || undefined,
  forcePathStyle: env.s3.forcePathStyle,
  region: env.s3.region,
})

const allowedOrigins = siteOrigins.filter((origin) => origin.startsWith('https://'))
if (allowedOrigins.length === 0) allowedOrigins.push(env.siteURL)

try {
  await client.send(
    new PutBucketVersioningCommand({
      Bucket: env.s3.bucket,
      VersioningConfiguration: { Status: 'Enabled' },
    }),
  )
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: env.s3.bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
            Filter: { Prefix: '' },
            ID: 'media-retention',
            NoncurrentVersionExpiration: { NoncurrentDays: noncurrentDays },
            Status: 'Enabled',
          },
        ],
      },
    }),
  )
  await client.send(
    new PutBucketCorsCommand({
      Bucket: env.s3.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'HEAD', 'PUT'],
            AllowedOrigins: allowedOrigins,
            ExposeHeaders: ['Content-Length', 'Content-Range', 'ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  )
  console.log(
    `Configured ${env.s3.bucket}: versioning enabled, incomplete uploads expire after 7 days, noncurrent versions after ${noncurrentDays} days.`,
  )
} finally {
  client.destroy()
}
