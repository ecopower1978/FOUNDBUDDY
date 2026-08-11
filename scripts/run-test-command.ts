import 'dotenv/config'

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Pool } from 'pg'

const kind = process.argv[2]
if (kind !== 'int' && kind !== 'e2e') {
  throw new Error('Expected test kind "int" or "e2e".')
}

const databaseURL = process.env.DATABASE_URL
if (!databaseURL || !/^postgres(?:ql)?:\/\//.test(databaseURL)) {
  throw new Error('Tests require an explicit PostgreSQL DATABASE_URL.')
}
const databaseName = decodeURIComponent(new URL(databaseURL).pathname.replace(/^\//, ''))
if (!databaseName.toLowerCase().includes('_test')) {
  throw new Error(
    `Refusing to use database "${databaseName}". Test database names must contain "_test".`,
  )
}

const requiredS3 = [
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET',
] as const
for (const name of requiredS3) {
  if (!process.env[name]) throw new Error(`Tests require ${name}.`)
}
if (!process.env.S3_BUCKET!.toLowerCase().includes('test')) {
  throw new Error('The test S3_BUCKET base name must contain "test".')
}

const suffix = `${kind}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
const schema = `test_${suffix.replace(/-/g, '_')}`
const bucket = `${process.env.S3_BUCKET!.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${suffix}`
  .replace(/-+/g, '-')
  .slice(0, 63)

const pool = new Pool({ connectionString: databaseURL })
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  region: process.env.S3_REGION || 'us-east-1',
})

async function emptyBucket() {
  let continuationToken: string | undefined
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
    )
    if (page.Contents?.length) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: page.Contents.flatMap((item) =>
              item.Key ? [{ Key: item.Key }] : [],
            ),
          },
        }),
      )
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
}

let exitCode = 1
try {
  await pool.query(`CREATE SCHEMA "${schema}"`)
  await s3.send(new CreateBucketCommand({ Bucket: bucket }))

  const child = spawn(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['run', kind === 'int' ? 'test:int:raw' : 'test:e2e:raw'],
    {
      env: {
        ...process.env,
        DATABASE_SCHEMA: schema,
        PAYLOAD_DB_PUSH: 'true',
        S3_BUCKET: bucket,
        S3_PUBLIC_URL: `${process.env.S3_ENDPOINT!.replace(/\/$/, '')}/${bucket}`,
      },
      shell: process.platform === 'win32',
      stdio: 'inherit',
    },
  )
  exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
} finally {
  try {
    await emptyBucket()
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }))
  } catch (error) {
    console.error('Failed to remove temporary test bucket:', error)
    exitCode = 1
  }
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  } catch (error) {
    console.error('Failed to remove temporary test schema:', error)
    exitCode = 1
  }
  await pool.end()
  s3.destroy()
}

process.exitCode = exitCode
