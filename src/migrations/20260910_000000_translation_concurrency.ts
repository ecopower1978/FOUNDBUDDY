import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Enable Payload's database-backed job concurrency control. Translation tasks
 * use one shared key so overlapping cron requests cannot run two translations
 * at the same time.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_jobs" ADD COLUMN IF NOT EXISTS "concurrency_key" varchar;
    CREATE INDEX IF NOT EXISTS "payload_jobs_concurrency_key_idx"
      ON "payload_jobs" USING btree ("concurrency_key");
    UPDATE "payload_jobs"
      SET "concurrency_key" = 'translation-global'
      WHERE "concurrency_key" IS NULL
        AND "completed_at" IS NULL
        AND "has_error" IS NOT TRUE
        AND "task_slug" IN ('translateProduct', 'translatePost', 'translateCompany');
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload_jobs_concurrency_key_idx";
    ALTER TABLE "payload_jobs" DROP COLUMN IF EXISTS "concurrency_key";
  `)
}
