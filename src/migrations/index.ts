import * as migration_20260729_023322_baseline from './20260729_023322_baseline'
import * as migration_20260729_025233_product_workflow_state from './20260729_025233_product_workflow_state'
import * as migration_20260729_030454_preserve_legacy_product_fields from './20260729_030454_preserve_legacy_product_fields'
import * as migration_20260802_000000_customer_service_config from './20260802_000000_customer_service_config'
import * as migration_20260901_000000_add_media_prefix from './20260901_000000_add_media_prefix'
import * as migration_20260901_010000_add_media_banner_size from './20260901_010000_add_media_banner_size'
import * as migration_20260901_020000_add_media_job from './20260901_020000_add_media_job'
import * as migration_20260910_000000_translation_concurrency from './20260910_000000_translation_concurrency'
import * as migration_20260914_000000_site_settings from './20260914_000000_site_settings'

export const migrations = [
  {
    up: migration_20260729_023322_baseline.up,
    down: migration_20260729_023322_baseline.down,
    name: '20260729_023322_baseline',
  },
  {
    up: migration_20260729_025233_product_workflow_state.up,
    down: migration_20260729_025233_product_workflow_state.down,
    name: '20260729_025233_product_workflow_state',
  },
  {
    up: migration_20260729_030454_preserve_legacy_product_fields.up,
    down: migration_20260729_030454_preserve_legacy_product_fields.down,
    name: '20260729_030454_preserve_legacy_product_fields',
  },
  {
    up: migration_20260802_000000_customer_service_config.up,
    down: migration_20260802_000000_customer_service_config.down,
    name: '20260802_000000_customer_service_config',
  },
  {
    up: migration_20260901_000000_add_media_prefix.up,
    down: migration_20260901_000000_add_media_prefix.down,
    name: '20260901_000000_add_media_prefix',
  },
  {
    up: migration_20260901_010000_add_media_banner_size.up,
    down: migration_20260901_010000_add_media_banner_size.down,
    name: '20260901_010000_add_media_banner_size',
  },
  {
    up: migration_20260901_020000_add_media_job.up,
    down: migration_20260901_020000_add_media_job.down,
    name: '20260901_020000_add_media_job',
  },
  {
    up: migration_20260910_000000_translation_concurrency.up,
    down: migration_20260910_000000_translation_concurrency.down,
    name: '20260910_000000_translation_concurrency',
  },
  {
    up: migration_20260914_000000_site_settings.up,
    down: migration_20260914_000000_site_settings.down,
    name: '20260914_000000_site_settings',
  },
]
