import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import configPromise from '@payload-config'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { env, isS3Configured } from '@/config/env'
import { migrations } from '@/migrations'
import { redisPing } from '@/utilities/rateLimit'

export const dynamic = 'force-dynamic'

async function checkDatabase() {
  const payload = await getPayload({ config: configPromise })
  await payload.count({ collection: 'products', overrideAccess: true })
  return payload
}

async function checkMigrations(payload: Awaited<ReturnType<typeof getPayload>>) {
  const enforce =
    process.env.NODE_ENV === 'production' || process.env.PAYLOAD_DB_PUSH === 'false'
  if (!enforce) return { missing: [] as string[], status: 'development-push' }

  const result = await payload.find({
    collection: 'payload-migrations',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
  })
  const applied = new Set(result.docs.map((migration) => migration.name))
  const missing = migrations.map((migration) => migration.name).filter((name) => !applied.has(name))
  if (missing.length) throw new Error(`Pending migrations: ${missing.join(', ')}`)
  return { missing, status: 'current' }
}

async function checkStorage() {
  if (!isS3Configured) return 'development-local'
  const client = new S3Client({
    credentials: {
      accessKeyId: env.s3.accessKeyId,
      secretAccessKey: env.s3.secretAccessKey,
    },
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: env.s3.forcePathStyle,
    region: env.s3.region,
  })
  await client.send(new HeadBucketCommand({ Bucket: env.s3.bucket }))
  client.destroy()
  return 'connected'
}

export async function GET() {
  const checks: Record<string, string> = {}
  try {
    const payload = await checkDatabase()
    checks.database = 'connected'
    checks.migrations = (await checkMigrations(payload)).status
    checks.storage = await checkStorage()
    checks.redis = await redisPing()
    return NextResponse.json(
      { checks, status: 'ready', time: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { checks, status: 'not-ready', time: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' }, status: 503 },
    )
  }
}
