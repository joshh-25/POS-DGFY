import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';
import { compareTenantSyncFailures } from '../scripts/check-tenant-schema-sync-regressions.js';
import {
  assertTenantSchemaMutationModeAllowed,
  buildTenantSchemaRepairSql,
  buildTenantSchemaTableRepairSql,
  buildTenantSchemaIndexRepairSql,
  createSyncFailureRecord,
  getTenantSchemaCapabilityChecksum,
  normalizeErrorSignature,
  REQUIRED_TENANT_SCHEMA_COLUMNS,
  REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS,
  REQUIRED_TENANT_SCHEMA_INDEXES,
  REQUIRED_TENANT_SCHEMA_TABLES,
  TENANT_SCHEMA_CAPABILITY_VERSION,
  buildTenantSchemaEnumRepairSql,
  backfillItemFolderSortOrder,
  repairItemFolderCategoryLifecycleSchema,
  repairPosParkedSaleOriginOwnership,
  normalizeTenantSchemaTableRepairSql,
  resolveTenantSchemaRepairCollation,
  reconcileTenantSchema,
  summarizeTenantSchemaReconciliation
} from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const itemFolderSortOrderMigration = require('../../dgfy-migration-runner/migrations/20260910000001-add-item-folder-sort-order.cjs');

describe('tenant schema sync script contracts', () => {
  it('registers the persisted category display order for every tenant database', () => {
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.item_folders).toHaveProperty('sort_order');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.item_folders.sort_order.sql)
      .toContain('`sort_order` INTEGER NOT NULL DEFAULT 0');
  });

  it('registers the Dine-in payment policy and handover timing schema', () => {
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.tenant_locations).toHaveProperty('allow_dine_in_pay_at_store');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.tenant_locations.allow_dine_in_pay_at_store.sql)
      .toContain('`allow_dine_in_pay_at_store` TINYINT(1) NOT NULL DEFAULT 0');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions).toHaveProperty('payment_timing');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions.payment_timing.sql)
      .toContain("ENUM('upfront','on_pickup','on_delivery','on_dine_in')");
  });

  it('backfills existing category order deterministically', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ folder_id: 8 }, { folder_id: 3 }], {}])
        .mockResolvedValue([[], {}])
    };

    await backfillItemFolderSortOrder(connection, 'sku_tenant_test');

    expect(connection.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE `sku_tenant_test`.`item_folders` SET `sort_order` = ? WHERE `folder_id` = ?',
      [0, 8]
    );
    expect(connection.query).toHaveBeenNthCalledWith(
      3,
      'UPDATE `sku_tenant_test`.`item_folders` SET `sort_order` = ? WHERE `folder_id` = ?',
      [1, 3]
    );
  });

  it('does not reset an existing custom category order when the migration reruns', async () => {
    const queries = [];
    const query = jest.fn(async (sql, options = {}) => {
      queries.push(sql);
      if (sql === 'SELECT DATABASE() AS dbName') return [[{ dbName: 'sku_landlord' }], {}];
      if (sql.includes('information_schema.tables')) {
        const tableName = options.replacements?.[1];
        return [[{ count: tableName === 'item_folders' ? 1 : 0 }], {}];
      }
      if (sql.includes('information_schema.columns')) return [[{ count: 1 }], {}];
      throw new Error(`Unexpected migration query: ${sql}`);
    });

    await itemFolderSortOrderMigration.up({ sequelize: { query } }, { QueryTypes: { UPDATE: 'UPDATE' } });

    expect(queries.some((sql) => /^UPDATE /i.test(sql))).toBe(false);
    expect(queries.some((sql) => sql.includes('ORDER BY name ASC'))).toBe(false);
  });

  it('publishes a stable checksum for the complete tenant capability registry', () => {
    expect(getTenantSchemaCapabilityChecksum()).toMatch(/^[a-f0-9]{64}$/);
    expect(getTenantSchemaCapabilityChecksum()).toBe(getTenantSchemaCapabilityChecksum());
  });

  it('tracks parked-sale cancellation ENUMs in the tenant drift registry', () => {
    expect(REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS.pos_parked_sales.status.enumValues)
      .toEqual(['parked', 'claimed', 'completed', 'cancel_pending', 'cancelled']);
    expect(REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS.business_admin_approval_requests.action_type.enumValues)
      .toEqual(['pos_refund', 'force_close_shift', 'pos_void', 'pos_parked_sale_cancel']);

    const repairs = buildTenantSchemaEnumRepairSql([
      { table: 'pos_parked_sales', column: 'status' },
      { table: 'business_admin_approval_requests', column: 'action_type' }
    ]);
    expect(repairs).toHaveLength(2);
    expect(repairs[0].sql).toContain("ENUM('parked','claimed','completed','cancel_pending','cancelled')");
    expect(repairs[1].sql).toContain("ENUM('pos_refund','force_close_shift','pos_void','pos_parked_sale_cancel')");
  });

  // #2335: PR #2322 widened stock_movements.reference_type's ENUM on the landlord DB and the
  // Sequelize model, but never registered it here -- so no existing tenant's physical table was
  // ever repaired (confirmed empirically: all 52 production tenants still missing
  // 'POS_PARKED_SALE' at the time of this fix). This is the regression guard for that gap.
  it('tracks the POS_PARKED_SALE stock-movement ENUM widening (#2321/#2322/#2335) in the tenant drift registry', () => {
    const everyLiteralTheAppWrites = ['PO', 'JO', 'MANUAL', 'RETURN', 'DO', 'POS', 'POS_PARKED_SALE'];
    expect(REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS.stock_movements.reference_type.enumValues)
      .toEqual(everyLiteralTheAppWrites);

    const repairs = buildTenantSchemaEnumRepairSql([
      { table: 'stock_movements', column: 'reference_type' }
    ]);
    expect(repairs).toHaveLength(1);
    expect(repairs[0].sql).toContain("ENUM('PO','JO','MANUAL','RETURN','DO','POS','POS_PARKED_SALE')");
  });

  it('repairs the tenant-local Business Admin approval table and indexes', () => {
    const table = REQUIRED_TENANT_SCHEMA_TABLES.business_admin_approval_requests;
    expect(table.sql).toContain('business_admin_approval_requests');
    expect(table.sql.toLowerCase()).toContain("enum('pos_refund','force_close_shift','pos_void','pos_parked_sale_cancel')");
    expect(table.sql).toContain('FOREIGN KEY (`requested_by`) REFERENCES `users` (`user_id`)');

    const tableRepairs = buildTenantSchemaTableRepairSql(['business_admin_approval_requests']);
    expect(tableRepairs).toEqual([{ table: 'business_admin_approval_requests', sql: table.sql }]);

    const indexRepairs = buildTenantSchemaIndexRepairSql([
      { table: 'business_admin_approval_requests', indexName: 'uq_business_admin_approval_action_idempotency' },
      { table: 'business_admin_approval_requests', indexName: 'idx_business_admin_approval_status_created' },
      { table: 'business_admin_approval_requests', indexName: 'idx_business_admin_approval_entity_created' },
      { table: 'business_admin_approval_requests', indexName: 'idx_business_admin_approval_requested_created' }
    ]);
    expect(indexRepairs).toHaveLength(4);
    expect(indexRepairs[0].sql).toContain('UNIQUE INDEX `uq_business_admin_approval_action_idempotency`');
  });

  it('repairs Business Admin report and notification tables, lifecycle columns, and indexes', () => {
    const tableNames = [
      'business_admin_saved_report_views',
      'business_admin_alert_snapshots',
      'business_admin_notification_states'
    ];
    for (const tableName of tableNames) {
      expect(REQUIRED_TENANT_SCHEMA_TABLES[tableName].sql).toContain(`CREATE TABLE \`${tableName}\``);
    }
    expect(REQUIRED_TENANT_SCHEMA_TABLES.business_admin_notification_states.sql)
      .toContain('FOREIGN KEY (`business_admin_alert_snapshot_id`) REFERENCES `business_admin_alert_snapshots`');
    expect(Object.keys(REQUIRED_TENANT_SCHEMA_TABLES).indexOf('business_admin_alert_snapshots'))
      .toBeLessThan(Object.keys(REQUIRED_TENANT_SCHEMA_TABLES).indexOf('business_admin_notification_states'));

    const lifecycleColumns = [
      'source_domain', 'source_entity_type', 'source_entity_id', 'branch_id',
      'target_route', 'acknowledged_at', 'acknowledged_by', 'acknowledgement_note'
    ];
    for (const columnName of lifecycleColumns) {
      expect(REQUIRED_TENANT_SCHEMA_COLUMNS.business_admin_alert_snapshots[columnName].sql)
        .toContain(`ADD COLUMN \`${columnName}\``);
    }

    const reportIndexes = REQUIRED_TENANT_SCHEMA_INDEXES.pos_transactions;
    expect(reportIndexes.idx_pos_transactions_report_status_created_at.sql)
      .toContain('(`status`,`created_at`)');
    expect(reportIndexes.idx_pos_transactions_report_location_status_created_at.sql)
      .toContain('(`location_id`,`status`,`created_at`)');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.pos_transaction_adjustments.idx_pos_transaction_adjustments_business_admin_report.sql)
      .toContain('(`pos_transaction_id`,`status`,`adjustment_type`,`created_at`)');

    const businessAdminIndexes = [
      { table: 'business_admin_saved_report_views', indexName: 'uq_business_admin_saved_report_view_name' },
      { table: 'business_admin_saved_report_views', indexName: 'idx_business_admin_saved_report_view_user_updated' },
      { table: 'business_admin_alert_snapshots', indexName: 'idx_business_admin_alert_status_seen' },
      { table: 'business_admin_alert_snapshots', indexName: 'idx_business_admin_alert_type_status' },
      { table: 'business_admin_alert_snapshots', indexName: 'idx_business_admin_alert_branch_status_seen' },
      { table: 'business_admin_notification_states', indexName: 'uq_business_admin_notification_state_alert_user' },
      { table: 'business_admin_notification_states', indexName: 'idx_business_admin_notification_state_user_unread' },
      { table: 'pos_transactions', indexName: 'idx_pos_transactions_report_status_created_at' },
      { table: 'pos_transactions', indexName: 'idx_pos_transactions_report_location_status_created_at' },
      { table: 'pos_transaction_adjustments', indexName: 'idx_pos_transaction_adjustments_business_admin_report' }
    ];
    const indexRepairs = buildTenantSchemaIndexRepairSql(businessAdminIndexes);
    expect(indexRepairs).toHaveLength(businessAdminIndexes.length);
    expect(indexRepairs.find((repair) => repair.index === 'uq_business_admin_saved_report_view_name')?.sql)
      .toContain('UNIQUE INDEX `uq_business_admin_saved_report_view_name`');
    expect(indexRepairs.find((repair) => repair.index === 'uq_business_admin_notification_state_alert_user')?.sql)
      .toContain('UNIQUE INDEX `uq_business_admin_notification_state_alert_user`');
  });

  it('repairs the tenant-local storefront QR table and records the schema capability version', () => {
    const table = REQUIRED_TENANT_SCHEMA_TABLES.storefront_qr_codes;

    expect(TENANT_SCHEMA_CAPABILITY_VERSION).toBe('2026-10-21.1');
    expect(table.sql).toContain('CREATE TABLE `storefront_qr_codes`');
    expect(table.sql).toContain('`public_token` VARCHAR(64) NOT NULL');
    expect(table.sql).toContain('UNIQUE KEY `uq_storefront_qr_codes_public_token`');
    expect(table.sql).toContain('FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`)');
    expect(table.sql).toContain('FOREIGN KEY (`folder_id`) REFERENCES `item_folders` (`folder_id`)');

    expect(buildTenantSchemaTableRepairSql(['storefront_qr_codes']))
      .toEqual([{ table: 'storefront_qr_codes', sql: table.sql }]);
  });

  it('repairs tenant staff roles before adding the users assignment foreign key', () => {
    const staffRoles = REQUIRED_TENANT_SCHEMA_TABLES.staff_roles;
    const assignment = REQUIRED_TENANT_SCHEMA_COLUMNS.users.staff_role_id;

    expect(staffRoles.sql).toContain('CREATE TABLE `staff_roles`');
    expect(staffRoles.sql).toContain('`capabilities` JSON NOT NULL');
    expect(assignment.sql).toContain('REFERENCES `staff_roles` (`staff_role_id`)');
    expect(buildTenantSchemaTableRepairSql(['staff_roles']))
      .toEqual([{ table: 'staff_roles', sql: staffRoles.sql }]);
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
      { table: 'pos_transaction_adjustments', column: 'pos_payment_allocation_id' },
      { table: 'service_item_details', column: 'addons_enabled' }
    ]);

    expect(repairs).toHaveLength(6);
    expect(repairs[0].sql).toContain('ADD COLUMN `pos_always_available`');
    expect(repairs[1].sql).toContain('ADD COLUMN `pos_best_seller_mode`');
    expect(repairs[2].sql).toContain("ENUM('inventory_issue','stock_exempt')");
    expect(repairs[3].sql).toContain('ADD COLUMN `stock_exempt_reason`');
    expect(repairs[4].sql).toContain('ADD COLUMN `pos_payment_allocation_id`');
    expect(repairs[5].sql).toContain('ADD COLUMN `addons_enabled`');
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

  it('registers the tenant-local audit log table and POS event context contract', () => {
    expect(REQUIRED_TENANT_SCHEMA_TABLES).toHaveProperty('audit_logs');

    const [tableRepair] = buildTenantSchemaTableRepairSql(['audit_logs']);
    expect(tableRepair.sql).toContain('CREATE TABLE `audit_logs`');
    expect(tableRepair.sql).toContain('`event_type` varchar(100)');

    const columnRepairs = buildTenantSchemaRepairSql([
      { table: 'audit_logs', column: 'event_type' },
      { table: 'audit_logs', column: 'actor_username' },
      { table: 'audit_logs', column: 'terminal_id' },
      { table: 'audit_logs', column: 'shift_id' },
      { table: 'audit_logs', column: 'location_id' },
      { table: 'audit_logs', column: 'reason' },
      { table: 'audit_logs', column: 'request_id' }
    ]);
    expect(columnRepairs).toHaveLength(7);
    expect(columnRepairs[0].sql).toContain('ADD COLUMN `event_type`');
    expect(columnRepairs[6].sql).toContain('ADD COLUMN `request_id`');

    expect(REQUIRED_TENANT_SCHEMA_INDEXES.audit_logs).toHaveProperty('idx_audit_event_timestamp');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.audit_logs).toHaveProperty('idx_audit_terminal_timestamp');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.audit_logs).toHaveProperty('idx_audit_shift_timestamp');
  });

  it('registers shared parked-sale ownership columns and origin backfill', async () => {
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_parked_sales).toHaveProperty('origin_cashier_id');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_parked_sales).toHaveProperty('origin_shift_id');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_parked_sales).toHaveProperty('inventory_effects');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_parked_sales).toHaveProperty('inventory_deducted_at');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.pos_parked_sales)
      .toHaveProperty('idx_pos_parked_sales_origin_cashier_status');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.pos_parked_sales)
      .toHaveProperty('idx_pos_parked_sales_origin_shift_status');

    const connection = { query: jest.fn().mockResolvedValue([[], {}]) };
    await repairPosParkedSaleOriginOwnership(connection, 'sku_tenant_test');

    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining(
      '`origin_cashier_id` = COALESCE(`origin_cashier_id`, `cashier_id`)'
    ));
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining(
      '`origin_shift_id` = COALESCE(`origin_shift_id`, `shift_id`)'
    ));
  });

  it('registers manual delivery assignment tables and repairs for older tenants', () => {
    expect(REQUIRED_TENANT_SCHEMA_TABLES).toHaveProperty('delivery_personnel');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_personnel).toHaveProperty('user_id');

    const [tableRepair] = buildTenantSchemaTableRepairSql(['delivery_personnel']);
    expect(tableRepair.sql).toContain('CREATE TABLE `delivery_personnel`');
    expect(tableRepair.sql).toContain('idx_delivery_personnel_location_active');

    const columnRepairs = buildTenantSchemaRepairSql([
      { table: 'delivery_jobs', column: 'delivery_personnel_id' },
      { table: 'delivery_jobs', column: 'delivery_personnel_name' },
      { table: 'delivery_jobs', column: 'assigned_shift_id' }
    ]);
    expect(columnRepairs[0].sql).toContain('ADD COLUMN `delivery_personnel_id`');
    expect(columnRepairs[1].sql).toContain('ADD COLUMN `delivery_personnel_name`');
    expect(columnRepairs[2].sql).toContain('ADD COLUMN `assigned_shift_id`');
    const [userLinkRepair] = buildTenantSchemaRepairSql([
      { table: 'delivery_personnel', column: 'user_id' }
    ]);
    expect(userLinkRepair.sql).toContain('ADD COLUMN `user_id` INT NULL');
    expect(userLinkRepair.sql).toContain('delivery_personnel_user_id_fk');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.delivery_personnel)
      .toHaveProperty('delivery_personnel_user_id_idx');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.delivery_jobs).toHaveProperty('idx_delivery_jobs_personnel_status');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.delivery_jobs).toHaveProperty('idx_delivery_jobs_assignment_shift');
  });

  it('registers the Phase 260 delivery-run date-range contract for tenant repair', () => {
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_runs).toHaveProperty('scheduled_date_end');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_runs).toHaveProperty('transportation_label');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_runs).toHaveProperty('loading_confirmed_by');
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_runs).toHaveProperty('loading_confirmed_at');

    const [columnRepair] = buildTenantSchemaRepairSql([
      { table: 'delivery_runs', column: 'scheduled_date_end' }
    ]);
    expect(columnRepair.sql).toContain('ADD COLUMN `scheduled_date_end` DATE NULL');

    const [tableRepair] = buildTenantSchemaTableRepairSql(['delivery_runs']);
    expect(tableRepair.sql).toContain('`scheduled_date_end` date DEFAULT NULL');
    expect(tableRepair.sql).toContain('idx_delivery_runs_status_scheduled_range');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.delivery_runs)
      .toHaveProperty('idx_delivery_runs_status_scheduled_range');

    const deliveryRunRepairs = buildTenantSchemaRepairSql([
      { table: 'delivery_runs', column: 'transportation_label' },
      { table: 'delivery_runs', column: 'loading_confirmed_by' },
      { table: 'delivery_runs', column: 'loading_confirmed_at' }
    ]);
    expect(deliveryRunRepairs[0].sql).toContain('ADD COLUMN `transportation_label` VARCHAR(120) NULL');
    expect(deliveryRunRepairs[1].sql).toContain('fk_delivery_runs_loading_confirmed_by');
    expect(deliveryRunRepairs[2].sql).toContain('ADD COLUMN `loading_confirmed_at` DATETIME NULL');
  });

  it('registers the complete workflow delivery-fee audit contract', () => {
    const columns = [
      'from_store_delivery_fee_mode',
      'to_store_delivery_fee_mode',
      'from_store_delivery_fee_calc',
      'to_store_delivery_fee_calc'
    ];

    for (const column of columns) {
      expect(REQUIRED_TENANT_SCHEMA_COLUMNS.workflow_mode_change_log).toHaveProperty(column);
    }

    const repairs = buildTenantSchemaRepairSql(
      columns.map((column) => ({ table: 'workflow_mode_change_log', column }))
    );
    expect(repairs).toHaveLength(columns.length);
    expect(repairs[0].sql).toContain('VARCHAR(64) NULL');
    expect(repairs[2].sql).toContain('JSON NULL');
  });

  it('registers online inventory reservation tables in dependency order', () => {
    const reservationTables = ['inventory_reservations', 'inventory_reservation_lines'];
    const declared = Object.keys(REQUIRED_TENANT_SCHEMA_TABLES);
    const positions = reservationTables.map((table) => declared.indexOf(table));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const table of reservationTables) {
      expect(REQUIRED_TENANT_SCHEMA_TABLES).toHaveProperty(table);
    }

    const repairs = buildTenantSchemaTableRepairSql(reservationTables);
    expect(repairs[0].sql).toContain('CREATE TABLE `inventory_reservations`');
    expect(repairs[0].sql).toContain('UNIQUE KEY `uq_inventory_reservations_source`');
    expect(repairs[1].sql).toContain('CREATE TABLE `inventory_reservation_lines`');
    expect(repairs[1].sql).toContain('FOREIGN KEY (`inventory_reservation_id`)');
  });

  it('registers the four voucher tables in foreign-key dependency order', () => {
    const voucherTables = [
      'vouchers',
      'voucher_scopes',
      'voucher_redemptions',
      'voucher_redemption_lines'
    ];
    for (const table of voucherTables) {
      expect(REQUIRED_TENANT_SCHEMA_TABLES).toHaveProperty(table);
    }

    // Declaration order is load-bearing: buildTenantSchemaTableRepairSql preserves it, and each
    // table's FKs point at one declared before it. A reordering would fail on a real tenant repair.
    const declared = Object.keys(REQUIRED_TENANT_SCHEMA_TABLES);
    const positions = voucherTables.map((table) => declared.indexOf(table));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    const repairs = buildTenantSchemaTableRepairSql(voucherTables);
    expect(repairs.map((repair) => repair.table)).toEqual(voucherTables);
    expect(repairs[0].sql).toContain('CREATE TABLE `vouchers`');
    expect(repairs[0].sql).toContain('UNIQUE KEY `uq_vouchers_code`');
    expect(repairs[3].sql).toContain('CREATE TABLE `voucher_redemption_lines`');

    // ADR 0066 decision 4: the redemption ledger is authoritative, so its replay guard is a real
    // unique constraint rather than an application-level check.
    expect(repairs[2].sql).toContain('UNIQUE KEY `uq_voucher_redemptions_idempotency`');
    expect(repairs[2].sql).toContain('`idempotency_key` varchar(160) NOT NULL');

    // ADR 0066 decision 10: eligibility must be NOT NULL with an explicit default so "eligible
    // everywhere" cannot be produced by omission -- the #459 failure mode.
    for (const column of ['channels_mask', 'fulfillment_methods_mask', 'order_timings_mask']) {
      expect(repairs[0].sql).toContain(`\`${column}\` tinyint unsigned NOT NULL DEFAULT`);
    }

    // ADR 0066 decision 2: integer centavos, and bigint because centavos overflow int at ~21.5M pesos.
    expect(repairs[0].sql).toContain('`redeemed_value_centavos` bigint NOT NULL');
    expect(repairs[0].sql).not.toContain('`redeemed_value_centavos` int ');

    // voucher_scopes.scope_ref_id is polymorphic across items/item_folders, so it must NOT gain a FK.
    expect(repairs[1].sql).toContain('`scope_ref_id` int NOT NULL');
    expect(repairs[1].sql).not.toContain('FOREIGN KEY (`scope_ref_id`)');

    // #455 says "locations"; no such table exists. Every location FK targets tenant_locations.
    expect(repairs[2].sql).toContain('REFERENCES `tenant_locations` (`location_id`)');
  });

  it('normalizes MySQL 8-only table collations for compatible local repair targets', () => {
    const [repair] = buildTenantSchemaTableRepairSql(['pos_transaction_adjustments']);
    const normalized = normalizeTenantSchemaTableRepairSql(repair.sql, 'utf8mb4_general_ci');

    expect(repair.sql).toContain('COLLATE=utf8mb4_0900_ai_ci');
    expect(normalized).toContain('COLLATE=utf8mb4_general_ci');
    expect(normalized).not.toContain('utf8mb4_0900_ai_ci');
  });

  it('falls back to the target schema collation when MySQL 8 collation is unavailable', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ DEFAULT_COLLATION_NAME: 'utf8mb4_general_ci' }]])
        .mockResolvedValueOnce([[{ Collation: 'utf8mb4_general_ci' }]])
    };

    await expect(resolveTenantSchemaRepairCollation(connection, 'sku_tenant_test'))
      .resolves.toBe('utf8mb4_general_ci');
  });

  // Three separate code paths can create the voucher tables, and they must agree:
  //   1. the landlord migration (20260817000001-create-vouchers.cjs)
  //   2. sequelize.sync() over the models -- how tenantProvisioningService.js provisions a NEW tenant
  //   3. REQUIRED_TENANT_SCHEMA_TABLES/_INDEXES -- how an EXISTING tenant is repaired
  // Verified against a real MySQL 8.0.46 snapshot; these assertions are what keep them in step
  // without needing a database, since a divergence is otherwise invisible until a tenant is born.
  it('keeps the voucher model definitions, table registry, and index registry in parity', async () => {
    const voucherModels = {
      vouchers: (await import('../src/models/Voucher.js')).default,
      voucher_scopes: (await import('../src/models/VoucherScope.js')).default,
      voucher_redemptions: (await import('../src/models/VoucherRedemption.js')).default,
      voucher_redemption_lines: (await import('../src/models/VoucherRedemptionLine.js')).default
    };

    for (const [table, model] of Object.entries(voucherModels)) {
      const modelIndexNames = (model.options.indexes || []).map((index) => index.name).sort();
      const registryIndexNames = Object.keys(REQUIRED_TENANT_SCHEMA_INDEXES[table] || {}).sort();

      // Without an indexes block, sync() creates only MySQL's implicit FK/unique indexes, so a new
      // tenant silently loses every named index -- including uq_voucher_scopes_voucher_type_ref,
      // which is an integrity constraint rather than a lookup index.
      expect(modelIndexNames.length).toBeGreaterThan(0);
      expect(modelIndexNames).toEqual(registryIndexNames);

      // Same names again in the CREATE TABLE, so a tenant repaired by whole-table creation and one
      // repaired index-by-index end up identical.
      //
      // #696 exception: idx_vouchers_pricelist is deliberately NOT in this whole-table DDL string.
      // vouchers.pricelist_id was added to an ALREADY-SHIPPED table via a column-repair entry (not
      // baked into REQUIRED_TENANT_SCHEMA_TABLES.vouchers.sql, since that would require declaring
      // `pricelists` before `vouchers` -- reordering an existing table risks the exact
      // "REFERENCES an undeclared table" failure `service_booking_lines`'s own comment above warns
      // about). This mirrors the pre-existing fnb_modifier_groups.parent_modifier_option_id case
      // (also a column-repair-only FK, absent from that table's own whole-table DDL). The two-pass
      // repair driver still converges a from-scratch tenant to the same end state: table-repair
      // creates `vouchers` without the column, then column-repair (which queries real DB state, not
      // this static string) adds it immediately after -- confirmed by
      // `apps/dgfy-api/scripts/sync-tenant-schemas.js`'s own ordering, tables always applied before
      // columns.
      const [{ sql }] = buildTenantSchemaTableRepairSql([table]);
      const namesExpectedInWholeTableDdl = table === 'vouchers'
        ? registryIndexNames.filter((name) => name !== 'idx_vouchers_pricelist')
        : registryIndexNames;
      for (const indexName of namesExpectedInWholeTableDdl) {
        expect(sql).toContain(`\`${indexName}\``);
      }

      // A new tenant's DB inherits the server default collation (utf8mb4_0900_ai_ci on MySQL 8), and
      // pos_transaction_discounts.promo_code is utf8mb4_0900_ai_ci on every tenant. Pinning
      // general_ci here made `v.code = d.promo_code` -- the Phase 107 promo backfill's own join --
      // fail with ERROR 1267 Illegal mix of collations on repair-provisioned tenants only.
      expect(sql).toContain('COLLATE=utf8mb4_0900_ai_ci');
      expect(sql).not.toContain('utf8mb4_general_ci');
    }

    // Declaring uniqueness on the attribute instead makes Sequelize name the key after the column
    // (`code`, `idempotency_key`), while both other paths name it `uq_*` -- and
    // inspectRequiredTenantSchemaIndexes matches by name, so a new tenant would report as drifted
    // forever. Declaring it in both places is worse still: two unique keys on one column.
    expect(voucherModels.vouchers.rawAttributes.code.unique).toBeUndefined();
    expect(voucherModels.voucher_redemptions.rawAttributes.idempotency_key.unique).toBeUndefined();

    // Sequelize emits no referential action unless the attribute declares one, so these are what
    // keep a new tenant's cascade behaviour equal to the migration's.
    expect(voucherModels.voucher_scopes.rawAttributes.voucher_id.onDelete).toBe('CASCADE');
    expect(voucherModels.voucher_redemption_lines.rawAttributes.voucher_redemption_id.onDelete)
      .toBe('CASCADE');
    for (const column of [
      'pos_transaction_id',
      'location_id',
      'cashier_user_id',
      'store_customer_id',
      'reversal_of_redemption_id'
    ]) {
      expect(voucherModels.voucher_redemptions.rawAttributes[column].onDelete).toBe('SET NULL');
    }
  });

  // #696: registers pricelists/pricelist_items the same way the voucher tables above are guarded --
  // without this, the two new tables would ship with no cross-path check at all, which is exactly
  // the drift class the voucher parity test above exists to catch.
  it('registers the two pricelist tables after the voucher tables, in FK-dependency order', () => {
    const declared = Object.keys(REQUIRED_TENANT_SCHEMA_TABLES);
    expect(declared).toContain('pricelists');
    expect(declared).toContain('pricelist_items');
    expect(declared.indexOf('pricelists')).toBeGreaterThan(declared.indexOf('vouchers'));
    expect(declared.indexOf('pricelist_items')).toBeGreaterThan(declared.indexOf('pricelists'));

    const repairs = buildTenantSchemaTableRepairSql(['pricelists', 'pricelist_items']);
    expect(repairs[0].sql).toContain('CREATE TABLE `pricelists`');
    expect(repairs[0].sql).toContain('UNIQUE KEY `uq_pricelists_draft_of`');
    expect(repairs[1].sql).toContain('CREATE TABLE `pricelist_items`');
    expect(repairs[1].sql).toContain('UNIQUE KEY `uq_pricelist_items_pricelist_item` (`pricelist_id`,`item_id`)');

    // Same money convention as every other centavos column in this initiative (ADR 0066 decision 2).
    expect(repairs[1].sql).toContain('`unit_price_centavos` bigint NOT NULL');
    expect(repairs[1].sql).not.toContain('`unit_price_centavos` int ');

    // pricelist_items.item_id DOES get a real FK, unlike voucher_scopes.scope_ref_id -- it isn't
    // polymorphic, so there is no reason to withhold it.
    expect(repairs[1].sql).toContain('FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`)');
  });

  it('registers the vouchers.pricelist_id column-repair entry with its FK, applied after pricelists exists', () => {
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers).toHaveProperty('pricelist_id');
    const [repair] = buildTenantSchemaRepairSql([{ table: 'vouchers', column: 'pricelist_id' }]);
    expect(repair.sql).toContain('ADD COLUMN `pricelist_id` INT NULL');
    expect(repair.sql).toContain('REFERENCES `pricelists` (`pricelist_id`)');
  });

  // #713: same repair-only mechanism as pricelist_id above -- REQUIRED_TENANT_SCHEMA_TABLES'
  // vouchers CREATE TABLE string is a pre-existing landlord-DB snapshot and is deliberately not
  // edited; every tenant gets this column from the repair pass instead.
  it('registers the vouchers.is_publicly_listed column-repair entry, defaulting to false', () => {
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers).toHaveProperty('is_publicly_listed');
    const [repair] = buildTenantSchemaRepairSql([{ table: 'vouchers', column: 'is_publicly_listed' }]);
    expect(repair.sql).toContain('ADD COLUMN `is_publicly_listed` TINYINT(1) NOT NULL DEFAULT 0');
  });

  // Mirrors the voucher parity test above, same three-code-path rationale: the landlord migration,
  // sequelize.sync() (new-tenant provisioning), and this registry (existing-tenant repair) must all
  // agree, and nothing else in this suite would catch a divergence between them.
  it('keeps the pricelist model definitions, table registry, and index registry in parity', async () => {
    const pricelistModels = {
      pricelists: (await import('../src/models/Pricelist.js')).default,
      pricelist_items: (await import('../src/models/PricelistItem.js')).default
    };

    for (const [table, model] of Object.entries(pricelistModels)) {
      const modelIndexNames = (model.options.indexes || []).map((index) => index.name).sort();
      const registryIndexNames = Object.keys(REQUIRED_TENANT_SCHEMA_INDEXES[table] || {}).sort();

      expect(modelIndexNames.length).toBeGreaterThan(0);
      expect(modelIndexNames).toEqual(registryIndexNames);

      const [{ sql }] = buildTenantSchemaTableRepairSql([table]);
      for (const indexName of registryIndexNames) {
        expect(sql).toContain(`\`${indexName}\``);
      }

      expect(sql).toContain('COLLATE=utf8mb4_0900_ai_ci');
      expect(sql).not.toContain('utf8mb4_general_ci');
    }

    // Sequelize emits no referential action unless the attribute declares one.
    expect(pricelistModels.pricelists.rawAttributes.draft_of_pricelist_id.onDelete).toBe('CASCADE');
    expect(pricelistModels.pricelist_items.rawAttributes.pricelist_id.onDelete).toBe('CASCADE');

    // Uniqueness declared in the model's indexes block, not the attribute -- same reasoning the
    // voucher parity test asserts: the attribute form names the key after the column instead of
    // `uq_*`, and inspectRequiredTenantSchemaIndexes matches by name.
    expect(pricelistModels.pricelists.rawAttributes.draft_of_pricelist_id.unique).toBeUndefined();
  });

  it('registers the complete location-scoped Z-reading snapshot contract', () => {
    const repairs = buildTenantSchemaRepairSql([
      { table: 'pos_z_reading_snapshots', column: 'location_id' },
      { table: 'pos_z_reading_snapshots', column: 'closed_by_user_id' },
      { table: 'pos_z_reading_snapshots', column: 'closed_from_terminal_id' },
      { table: 'pos_z_reading_snapshots', column: 'day_close_pin_confirmed_at' },
      { table: 'pos_z_reading_snapshots', column: 'reading_payload_hash' }
    ]);

    expect(repairs).toHaveLength(5);
    expect(repairs[0].sql).toContain('ADD COLUMN `location_id`');
    expect(repairs[1].sql).toContain('ADD COLUMN `closed_by_user_id`');
    expect(repairs[2].sql).toContain('ADD COLUMN `closed_from_terminal_id`');
    expect(repairs[3].sql).toContain('ADD COLUMN `day_close_pin_confirmed_at`');
    expect(repairs[4].sql).toContain('ADD COLUMN `reading_payload_hash`');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.pos_z_reading_snapshots)
      .toHaveProperty('uq_pos_z_reading_snapshots_business_date_location');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.pos_z_reading_snapshots)
      .toHaveProperty('idx_pos_z_reading_snapshots_closed_by_user');
  });

  it('registers hosted wallet payment enum values for tenant repair', () => {
    const contract = REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS.pos_transactions.payment_type;
    expect(contract.enumValues).toEqual(expect.arrayContaining(['grab_pay', 'shopeepay']));

    const [repair] = buildTenantSchemaEnumRepairSql([
      { table: 'pos_transactions', column: 'payment_type', missing_values: ['grab_pay', 'shopeepay'] }
    ]);

    expect(repair.sql).toContain("'grab_pay'");
    expect(repair.sql).toContain("'shopeepay'");
  });

  it('registers the return adjustment enum value for tenant repair', () => {
    const contract = REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS.pos_transaction_adjustments.adjustment_type;
    expect(contract.enumValues).toEqual(expect.arrayContaining(['return']));

    const [repair] = buildTenantSchemaEnumRepairSql([
      { table: 'pos_transaction_adjustments', column: 'adjustment_type', missing_values: ['return'] }
    ]);

    expect(repair.sql).toContain("ENUM('void','cash_refund','external_refund','provider_refund','employee_credit_reversal','return')");
  });

  // Phase 137 (#819) -- ADR 0069 clause 4 (carried over verbatim from ADR 0068 clause 4).
  it('registers the partially_paid payment_status enum value for tenant repair', () => {
    const contract = REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS.pos_transactions.payment_status;
    expect(contract.enumValues).toEqual(expect.arrayContaining(['partially_paid']));

    const [repair] = buildTenantSchemaEnumRepairSql([
      { table: 'pos_transactions', column: 'payment_status', missing_values: ['partially_paid'] }
    ]);

    expect(repair.sql).toContain("'partially_paid'");
  });

  it('registers the on_dine_in payment_timing enum value for tenant repair', () => {
    const contract = REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS.pos_transactions.payment_timing;
    expect(contract.enumValues).toEqual(expect.arrayContaining(['on_dine_in']));

    const [repair] = buildTenantSchemaEnumRepairSql([
      { table: 'pos_transactions', column: 'payment_timing', missing_values: ['on_dine_in'] }
    ]);

    expect(repair.sql).toContain("ENUM('upfront','on_pickup','on_delivery','on_dine_in')");
  });

  it('registers pos_transactions.amount_paid and balance_due column repairs', () => {
    const repairs = buildTenantSchemaRepairSql([
      { table: 'pos_transactions', column: 'amount_paid' },
      { table: 'pos_transactions', column: 'balance_due' }
    ]);

    expect(repairs).toHaveLength(2);
    expect(repairs[0].sql).toContain('ADD COLUMN `amount_paid` DECIMAL(14,4) NOT NULL DEFAULT 0');
    expect(repairs[1].sql).toContain('ADD COLUMN `balance_due` DECIMAL(14,4) NOT NULL DEFAULT 0');
  });

  it('registers pos_order_payments as a whole-table backfill target', () => {
    expect(REQUIRED_TENANT_SCHEMA_TABLES).toHaveProperty('pos_order_payments');

    const [repair] = buildTenantSchemaTableRepairSql(['pos_order_payments']);
    expect(repair.sql).toContain('CREATE TABLE `pos_order_payments`');
    expect(repair.sql).toContain("`kind` enum('downpayment','balance','refund','forfeiture')");
    expect(repair.sql).toContain(
      'CONSTRAINT `pos_order_payments_ibfk_1` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`)'
    );
  });

  it('registers the service-option tables in foreign-key dependency order', () => {
    const serviceOptionTables = [
      'service_option_groups',
      'service_options',
      'service_item_option_groups',
      'service_booking_lines',
      'service_booking_line_options'
    ];
    const declared = Object.keys(REQUIRED_TENANT_SCHEMA_TABLES);
    const positions = serviceOptionTables.map((table) => declared.indexOf(table));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    const repairs = buildTenantSchemaTableRepairSql(serviceOptionTables);
    expect(repairs).toHaveLength(serviceOptionTables.length);
    expect(repairs[0].sql).toContain('CREATE TABLE `service_option_groups`');
    expect(repairs[1].sql).toContain(
      'REFERENCES `service_option_groups` (`group_id`) ON DELETE CASCADE ON UPDATE CASCADE'
    );
    expect(repairs[2].sql).toContain(
      'REFERENCES `service_option_groups` (`group_id`) ON DELETE CASCADE ON UPDATE CASCADE'
    );
    expect(repairs[4].sql).toContain(
      'REFERENCES `service_booking_lines` (`booking_line_id`) ON DELETE CASCADE ON UPDATE CASCADE'
    );
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

  describe('reconcileTenantSchema (#2027)', () => {
    it('report mode: reflects the first inspection pass directly and never issues a mutating statement', async () => {
      // An empty result set for every SELECT makes every registered table/column/index entry
      // read as "missing" -- report mode must surface that as-is without attempting any repair.
      const connection = { query: jest.fn().mockResolvedValue([[], {}]) };

      const result = await reconcileTenantSchema(connection, 'sku_tenant_test', 'report');

      expect(result.hasRemainingIssues).toBe(true);
      expect(result.remaining.tables.length).toBeGreaterThan(0);
      expect(result.remaining.columns.length).toBeGreaterThan(0);
      // remaining === missing in report mode -- nothing was re-inspected after a repair, because
      // no repair was ever attempted.
      expect(result.remaining).toEqual(result.missing);
      for (const [sql] of connection.query.mock.calls) {
        expect(sql.toUpperCase()).not.toMatch(/^ALTER TABLE|^CREATE TABLE|^INSERT INTO/);
      }
    });

    // #2027 bug fix regression: repair-apply mode used to have no branch for "post-repair
    // re-inspection still finds something missing" -- it fell through to a generic success path.
    // A connection double that never actually converges (every SELECT keeps returning empty, as
    // if none of the ALTER/CREATE/INSERT repair statements took effect) simulates exactly that
    // non-convergent case: repair-apply issues every repair statement, but the post-repair
    // re-inspection sees the same "everything missing" result as before.
    it('repair-apply mode: hasRemainingIssues stays true when post-repair re-inspection still finds missing objects', async () => {
      const connection = { query: jest.fn().mockResolvedValue([[], {}]) };

      const result = await reconcileTenantSchema(connection, 'sku_tenant_test', 'repair-apply');

      expect(result.hasRemainingIssues).toBe(true);
      expect(result.remaining.tables.length).toBeGreaterThan(0);
      expect(result.remaining.columns.length).toBeGreaterThan(0);
      // repair-apply DID attempt repairs (unlike report mode above) -- at least one mutating
      // statement must have been issued despite the end result still being incomplete.
      const issuedMutatingSql = connection.query.mock.calls.some(
        ([sql]) => typeof sql === 'string' && /^ALTER TABLE|^CREATE TABLE|^INSERT INTO/i.test(sql)
      );
      expect(issuedMutatingSql).toBe(true);
    });

    it('rejects an unsupported mode rather than silently defaulting', async () => {
      const connection = { query: jest.fn().mockResolvedValue([[], {}]) };
      await expect(reconcileTenantSchema(connection, 'sku_tenant_test', 'alter'))
        .rejects.toThrow(/unsupported mode/);
    });
  });

  describe('summarizeTenantSchemaReconciliation (#2027)', () => {
    it('builds the same human-readable parts shape used by both the CLI and provisioning error messages', () => {
      const parts = summarizeTenantSchemaReconciliation({
        tables: ['fnb_modifier_groups'],
        columns: [{ table: 'items', column: 'tracking_mode' }],
        indexes: [{ table: 'pos_terminal_shifts', indexName: 'uq_pos_terminal_shifts_active_operator' }],
        seeds: [{ table: 'pos_discount_rules' }],
        enumEntries: [{ table: 'items', column: 'category', missing_values: ['service'] }]
      });

      expect(parts).toEqual([
        'table:fnb_modifier_groups',
        'items.tracking_mode',
        'pos_terminal_shifts.uq_pos_terminal_shifts_active_operator (index)',
        'pos_discount_rules (seed data)',
        'items.category (missing enum values: service)'
      ]);
    });
  });
});
