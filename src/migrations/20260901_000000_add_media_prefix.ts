import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The S3 storage plugin persists a collection prefix on every media document.
 * The original baseline migration was generated before that field was added,
 * so production databases can have the column missing even though Payload's
 * runtime schema expects it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" ADD COLUMN "prefix" varchar DEFAULT 'media';
    UPDATE "media" SET "prefix" = 'media' WHERE "prefix" IS NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" DROP COLUMN "prefix";
  `)
}
