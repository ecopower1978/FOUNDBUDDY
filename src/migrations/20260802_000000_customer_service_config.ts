import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_customer_service_auth_scheme" AS ENUM('bearer', 'raw', 'x-api-key', 'none');
    CREATE TABLE "customer_service" (
      "id" serial PRIMARY KEY NOT NULL,
      "enabled" boolean DEFAULT true,
      "api_url" varchar,
      "api_key" varchar,
      "auth_scheme" "public"."enum_customer_service_auth_scheme" DEFAULT 'bearer' NOT NULL,
      "updated_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone
    );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "customer_service";
    DROP TYPE "public"."enum_customer_service_auth_scheme";
  `)
}
