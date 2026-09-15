import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_site_settings_template_key" AS ENUM('trust', 'catalog', 'solution');
    CREATE TABLE "site_settings" (
      "id" serial PRIMARY KEY NOT NULL,
      "template_key" "public"."enum_site_settings_template_key" DEFAULT 'trust' NOT NULL,
      "updated_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone
    );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "site_settings";
    DROP TYPE "public"."enum_site_settings_template_key";
  `)
}
