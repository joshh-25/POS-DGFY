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
  REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS,
  REQUIRED_TENANT_SCHEMA_INDEXES,
  REQUIRED_TENANT_SCHEMA_TABLES,
  buildTenantSchemaEnumRepairSql,
  repairItemFolderCategoryLifecycleSchema,
  repairPosParkedSaleOriginOwnership
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
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.delivery_jobs).toHaveProperty('idx_delivery_jobs_personnel_status');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.delivery_jobs).toHaveProperty('idx_delivery_jobs_assignment_shift');
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
      { table: 'pos_z_reading_snapshots', column: 'day_close_pin_confirmed_at' }
    ]);

    expect(repairs).toHaveLength(4);
    expect(repairs[0].sql).toContain('ADD COLUMN `location_id`');
    expect(repairs[1].sql).toContain('ADD COLUMN `closed_by_user_id`');
    expect(repairs[2].sql).toContain('ADD COLUMN `closed_from_terminal_id`');
    expect(repairs[3].sql).toContain('ADD COLUMN `day_close_pin_confirmed_at`');
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
