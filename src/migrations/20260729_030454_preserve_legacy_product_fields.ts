import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "products_specifications" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "products_specifications_locales" (
  	"name" varchar,
  	"value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "_products_v_version_specifications" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_specifications_locales" (
  	"name" varchar,
  	"value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "products" ADD COLUMN "sku" varchar;
  ALTER TABLE "products_locales" ADD COLUMN "description" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_sku" varchar;
  ALTER TABLE "_products_v_locales" ADD COLUMN "version_description" varchar;
  ALTER TABLE "media" ADD COLUMN "migration_key" varchar;
  ALTER TABLE "products_specifications" ADD CONSTRAINT "products_specifications_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_specifications_locales" ADD CONSTRAINT "products_specifications_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products_specifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_specifications" ADD CONSTRAINT "_products_v_version_specifications_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_specifications_locales" ADD CONSTRAINT "_products_v_version_specifications_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v_version_specifications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_specifications_order_idx" ON "products_specifications" USING btree ("_order");
  CREATE INDEX "products_specifications_parent_id_idx" ON "products_specifications" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "products_specifications_locales_locale_parent_id_unique" ON "products_specifications_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_products_v_version_specifications_order_idx" ON "_products_v_version_specifications" USING btree ("_order");
  CREATE INDEX "_products_v_version_specifications_parent_id_idx" ON "_products_v_version_specifications" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_products_v_version_specifications_locales_locale_parent_id_" ON "_products_v_version_specifications_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_sku_idx" ON "products" USING btree ("sku");
  CREATE INDEX "_products_v_version_version_sku_idx" ON "_products_v" USING btree ("version_sku");
  CREATE UNIQUE INDEX "media_migration_key_idx" ON "media" USING btree ("migration_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_specifications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_specifications_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_specifications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_specifications_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "products_specifications" CASCADE;
  DROP TABLE "products_specifications_locales" CASCADE;
  DROP TABLE "_products_v_version_specifications" CASCADE;
  DROP TABLE "_products_v_version_specifications_locales" CASCADE;
  DROP INDEX "products_sku_idx";
  DROP INDEX "_products_v_version_version_sku_idx";
  DROP INDEX "media_migration_key_idx";
  ALTER TABLE "products" DROP COLUMN "sku";
  ALTER TABLE "products_locales" DROP COLUMN "description";
  ALTER TABLE "_products_v" DROP COLUMN "version_sku";
  ALTER TABLE "_products_v_locales" DROP COLUMN "version_description";
  ALTER TABLE "media" DROP COLUMN "migration_key";`)
}
