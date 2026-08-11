import 'dotenv/config'

const databaseURL = process.env.DATABASE_URL
if (!databaseURL || !new URL(databaseURL).pathname.toLowerCase().includes('_test')) {
  throw new Error('Tests require a PostgreSQL database name containing "_test".')
}
if (!process.env.DATABASE_SCHEMA?.startsWith('test_')) {
  throw new Error('Tests require an isolated DATABASE_SCHEMA beginning with "test_".')
}
if (!process.env.S3_BUCKET?.toLowerCase().includes('test')) {
  throw new Error('Tests require an isolated S3_BUCKET containing "test".')
}
