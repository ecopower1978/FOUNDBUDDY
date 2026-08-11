import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_workflow_state" AS ENUM('draft', 'unlisted');
  CREATE TYPE "public"."enum__products_v_version_workflow_state" AS ENUM('draft', 'unlisted');
  ALTER TABLE "products" ADD COLUMN "workflow_state" "enum_products_workflow_state" DEFAULT 'draft';
  ALTER TABLE "_products_v" ADD COLUMN "version_workflow_state" "enum__products_v_version_workflow_state" DEFAULT 'draft';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" DROP COLUMN "workflow_state";
  ALTER TABLE "_products_v" DROP COLUMN "version_workflow_state";
  DROP TYPE "public"."enum_products_workflow_state";
  DROP TYPE "public"."enum__products_v_version_workflow_state";`)
}
