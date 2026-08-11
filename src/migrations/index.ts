import * as migration_20260729_023322_baseline from './20260729_023322_baseline';
import * as migration_20260729_025233_product_workflow_state from './20260729_025233_product_workflow_state';
import * as migration_20260729_030454_preserve_legacy_product_fields from './20260729_030454_preserve_legacy_product_fields';
import * as migration_20260802_000000_customer_service_config from './20260802_000000_customer_service_config';

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
    name: '20260729_030454_preserve_legacy_product_fields'
  },
  {
    up: migration_20260802_000000_customer_service_config.up,
    down: migration_20260802_000000_customer_service_config.down,
    name: '20260802_000000_customer_service_config'
  },
];
