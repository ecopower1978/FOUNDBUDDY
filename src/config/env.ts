import { z } from 'zod'

const productionSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
  PAYLOAD_SECRET: z.string().min(32),
  PREVIEW_SECRET: z.string().min(24),
  CRON_SECRET: z.string().min(24),
  SITE_URL: z
    .string()
    .url()
    .startsWith('https://')
    .refine((value) => {
      const hostname = new URL(value).hostname
      return hostname !== 'localhost' && !hostname.endsWith('.example')
    }, 'must be a real production hostname'),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  // Private-network S3-compatible services (for example MinIO in CI) may use
  // HTTP internally; the browser-facing S3_PUBLIC_URL must still be HTTPS.
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_PUBLIC_URL: z.string().url().startsWith('https://'),
  REDIS_URL: z.string().url(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_FROM_ADDRESS: z.string().email(),
  SMTP_FROM_NAME: z.string().min(1),
  TRUST_PROXY_HEADERS: z.literal('true'),
})

if (process.env.NODE_ENV === 'production') {
  const result = productionSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid production environment: ${issues}`)
  }
}

export const env = {
  databaseURL:
    process.env.DATABASE_URL ||
    'postgresql://payload:payload@127.0.0.1:5432/international_trade',
  siteURL: process.env.SITE_URL || 'http://localhost:3000',
  payloadSecret: process.env.PAYLOAD_SECRET || 'development-only-payload-secret-change-me',
  previewSecret: process.env.PREVIEW_SECRET || 'development-preview-secret',
  cronSecret: process.env.CRON_SECRET || 'development-cron-secret',
  redisURL: process.env.REDIS_URL || '',
  s3: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    bucket: process.env.S3_BUCKET || '',
    endpoint: process.env.S3_ENDPOINT || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    publicURL: (process.env.S3_PUBLIC_URL || '').replace(/\/$/, ''),
    region: process.env.S3_REGION || 'auto',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
  smtp: {
    fromAddress: process.env.SMTP_FROM_ADDRESS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Website',
    host: process.env.SMTP_HOST || '',
    password: process.env.SMTP_PASSWORD || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
  },
} as const

export const isS3Configured = Boolean(
  env.s3.bucket &&
    env.s3.accessKeyId &&
    env.s3.secretAccessKey &&
    env.s3.publicURL,
)

export const isSMTPConfigured = Boolean(env.smtp.host && env.smtp.fromAddress)
