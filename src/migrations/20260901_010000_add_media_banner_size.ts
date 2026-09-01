import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Store the generated long-form image variant used by the homepage banner.
 * Existing media rows remain valid; the new fields are populated the next
 * time an image is uploaded or reprocessed.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "sizes_banner_url" varchar;
    ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "sizes_banner_width" numeric;
    ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "sizes_banner_height" numeric;
    ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "sizes_banner_mime_type" varchar;
    ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "sizes_banner_filesize" numeric;
    ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "sizes_banner_filename" varchar;
    CREATE INDEX IF NOT EXISTS "media_sizes_banner_sizes_banner_filename_idx"
      ON "media" USING btree ("sizes_banner_filename");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "media_sizes_banner_sizes_banner_filename_idx";
    ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_banner_url";
    ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_banner_width";
    ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_banner_height";
    ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_banner_mime_type";
    ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_banner_filesize";
    ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_banner_filename";
  `)
}
