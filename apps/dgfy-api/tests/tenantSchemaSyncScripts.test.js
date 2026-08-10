import { jest } from '@jest/globals';
import { compareTenantSyncFailures } from '../scripts/check-tenant-schema-sync-regressions.js';
import {
  assertTenantSchemaMutationModeAllowed,
  buildTenantSchemaRepairSql,
  buildTenantSchemaTableRepairSql,
  createSyncFailureRecord,
  getTenantSchemaCapabilityChecksum,
  normalizeErrorSignature,
  REQUIRED_TENANT_SCHEMA_COLUMNS,
  REQUIRED_TENANT_SCHEMA_INDEXES,
  REQUIRED_TENANT_SCHEMA_TABLES,
  repairItemFolderCategoryLifecycleSchema
} from '../scripts/sync-tenant-schemas.js';

describe('tenant schema sync script contracts', () => {
  it('publishes a stable checksum for the complete tenant capability registry', () => {
    expect(getTenantSchemaCapabilityChecksum()).toMatch(/^[a-f0-9]{64}$/);
    expect(getTenantSchemaCapabilityChecksum()).toBe(getTenantSchemaCapabilityChecksum());
  });

  it('normalizes known too-many-keys failures with stable fingerprint', () => {
    const signature = normalizeErrorSignature('Too many keys specified; max 64 keys allowed');

    expect(signature).toEqual({
      error_code: 'mysql_too_many_keys',
      normalized_message: 'too many keys specified; max # keys allowed',
      fingerprint: '8516ffd691d70b58'
    });
  });

  it('requires explicit approval before a tenant schema mutation mode runs', () => {
    expect(() => assertTenantSchemaMutationModeAllowed('repair-apply', {}))
      .toThrow('TENANT_SCHEMA_MUTATION_APPROVED=true');
    expect(() => assertTenantSchemaMutationModeAllowed('alter', {
      TENANT_SCHEMA_MUTATION_APPROVED: 'true',
      NODE_ENV: 'production'
    })).toThrow('blocked in production');
    expect(() => assertTenantSchemaMutationModeAllowed('repair-apply', {
      TENANT_SCHEMA_MUTATION_APPROVED: 'true',
      NODE_ENV: 'production'
    })).not.toThrow();
    expect(() => assertTenantSchemaMutationModeAllowed('alter', {
      TENANT_SCHEMA_MUTATION_APPROVED: 'true',
      NODE_ENV: 'development'
    })).not.toThrow();
  });

  it('passes when current failures match baseline exactly', () => {
    const report = {
      results: [
        {
          tenant_db: 'tenant_a',
          status: 'failed',
          error_code: 'mysql_too_many_keys',
          fingerprint: '8516ffd691d70b58'
        }
      ]
    };

    const baseline = {
      failures: [
        {
          tenant_db: 'tenant_a',
          error_code: 'mysql_too_many_keys',
          fingerprint: '8516ffd691d70b58'
        }
      ]
    };

    const comparison = compareTenantSyncFailures(report, baseline);

    expect(comparison.summary.new_failure_count).toBe(0);
    expect(comparison.summary.mutated_failure_count).toBe(0);
    expect(comparison.summary.resolved_failure_count).toBe(0);
  });

  it('flags new and mutated failures for regression gating', () => {
    const report = {
      results: [
        {
          tenant_db: 'tenant_a',
          status: 'failed',
          error_code: 'mysql_foreign_key_incorrectly_formed',
          fingerprint: 'changedfingerprint1'
        },
        {
          tenant_db: 'tenant_new',
          status: 'failed',
          error_code: 'mysql_too_many_keys',
          fingerprint: '8516ffd691d70b58'
        }
      ]
    };

    const baseline = {
      failures: [
        {
          tenant_db: 'tenant_a',
          error_code: 'mysql_too_many_keys',
          fingerprint: '8516ffd691d70b58'
        }
      ]
    };

    const comparison = compareTenantSyncFailures(report, baseline);

    expect(comparison.summary.new_failure_count).toBe(2);
    expect(comparison.summary.mutated_failure_count).toBe(1);
    expect(comparison.new_failures).toHaveLength(2);
    expect(comparison.mutated_failures[0].tenant_db).toBe('tenant_a');
  });

  it('builds declared additive repair SQL for required POS schema columns', () => {
    const repairs = buildTenantSchemaRepairSql([
      { table: 'pos_catalog_overrides', column: 'pos_always_available' },
      { table: 'pos_catalog_overrides', column: 'pos_best_seller_mode' },
      { table: 'pos_transaction_lines', column: 'stock_effect_type' },
      { table: 'pos_transaction_lines', column: 'stock_exempt_reason' },
      { table: 'service_item_details', column: 'addons_enabled' }
    ]);

    expect(repairs).toHaveLength(5);
    expect(repairs[0].sql).toContain('ADD COLUMN `pos_always_available`');
    expect(repairs[1].sql).toContain('ADD COLUMN `pos_best_seller_mode`');
    expect(repairs[2].sql).toContain("ENUM('inventory_issue','stock_exempt')");
    expect(repairs[3].sql).toContain('ADD COLUMN `stock_exempt_reason`');
    expect(repairs[4].sql).toContain('ADD COLUMN `addons_enabled`');
  });

  it('registers storefront_catalog_overrides as a whole-table backfill target', () => {
    // Regression test: this table (created 2026-05-03) was missing from
    // REQUIRED_TENANT_SCHEMA_TABLES, so tenants that predate it had no way to get the whole
    // table created -- only ALTER TABLE column repairs, which fail outright when the table
    // itself doesn't exist. That failure trips the tenant schema preflight and crash-loops
    // the whole backend for every tenant (2026-08-02 staging incident).
    expect(REQUIRED_TENANT_SCHEMA_TABLES).toHaveProperty('storefront_catalog_overrides');

    const [repair] = buildTenantSchemaTableRepairSql(['storefront_catalog_overrides']);
    expect(repair.sql).toContain('CREATE TABLE `storefront_catalog_overrides`');
    expect(repair.sql).toContain('`image_fingerprint` varchar(64)');
    expect(repair.sql).toContain(
      'CONSTRAINT `storefront_catalog_overrides_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`)'
    );
  });

  it('registers manual delivery assignment tables and repairs for older tenants', () => {
    expect(REQUIRED_TENANT_SCHEMA_TABLES).toHaveProperty('delivery_personnel');

    const [tableRepair] = buildTenantSchemaTableRepairSql(['delivery_personnel']);
    expect(tableRepair.sql).toContain('CREATE TABLE `delivery_personnel`');
    expect(tableRepair.sql).toContain('idx_delivery_personnel_location_active');

    const columnRepairs = buildTenantSchemaRepairSql([
      { table: 'delivery_jobs', column: 'delivery_personnel_id' },
      { table: 'delivery_jobs', column: 'assigned_shift_id' }
    ]);
    expect(columnRepairs[0].sql).toContain('ADD COLUMN `delivery_personnel_id`');
    expect(columnRepairs[1].sql).toContain('ADD COLUMN `assigned_shift_id`');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.delivery_jobs).toHaveProperty('idx_delivery_jobs_personnel_status');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.delivery_jobs).toHaveProperty('idx_delivery_jobs_assignment_shift');
  });

  it('registers Phase 20 F&B modifier columns and conditional-group index', () => {
    const repairs = buildTenantSchemaRepairSql([
      { table: 'fnb_modifier_groups', column: 'group_kind' },
      { table: 'fnb_modifier_groups', column: 'parent_modifier_option_id' }
    ]);

    expect(repairs).toHaveLength(2);
    expect(repairs[0].sql).toContain("DEFAULT 'modifier'");
    expect(repairs[1].sql).toContain('ON DELETE SET NULL');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.fnb_modifier_groups)
      .toHaveProperty('idx_fnb_modifier_groups_parent_option');
  });

  it('preserves missing-column evidence in tenant sync failure records', () => {
    const error = new Error('Missing required tenant schema columns: pos_catalog_overrides.pos_always_available');
    error.missing_columns = [{ table: 'pos_catalog_overrides', column: 'pos_always_available' }];
    error.repair_sql = buildTenantSchemaRepairSql(error.missing_columns);

    const record = createSyncFailureRecord({
      id: 'tenant-1',
      name: 'Tenant 1',
      db_name: 'sku_tenant_test'
    }, error);

    expect(record.status).toBe('failed');
    expect(record.missing_columns).toEqual(error.missing_columns);
    expect(record.repair_sql[0].sql).toContain('pos_always_available');
  });

  it('uses Sequelize replacement options during tenant provisioning schema repair', async () => {
    const connection = {
      getDialect: jest.fn(() => 'mysql'),
      getQueryInterface: jest.fn(() => ({})),
      query: jest.fn()
        .mockResolvedValueOnce([[
          { COLUMN_NAME: 'deleted_at' },
          { COLUMN_NAME: 'deleted_by' },
          { COLUMN_NAME: 'active_name_key' }
        ], {}])
        .mockResolvedValueOnce([[], {}])
        .mockResolvedValueOnce([[{ INDEX_NAME: 'uq_item_folders_active_name' }], {}])
    };

    await repairItemFolderCategoryLifecycleSchema(connection, 'sku_tenant_grandmatador_test');

    expect(connection.query).toHaveBeenCalledTimes(3);
    for (const [, options] of connection.query.mock.calls) {
      expect(options).toEqual({ replacements: ['sku_tenant_grandmatador_test'] });
    }
  });
});
