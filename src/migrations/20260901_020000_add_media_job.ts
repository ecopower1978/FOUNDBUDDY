import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Register the asynchronous media derivative task in Payload's jobs enums.
 * Existing jobs and media records are untouched.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_payload_jobs_task_slug"
      ADD VALUE IF NOT EXISTS 'generateMediaSizes';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug"
      ADD VALUE IF NOT EXISTS 'generateMediaSizes';
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // PostgreSQL does not support removing enum values safely. Leaving the
  // value in place is harmless and allows historical job logs to remain valid.
}
