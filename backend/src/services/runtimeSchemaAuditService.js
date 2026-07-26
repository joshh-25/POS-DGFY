import { QueryTypes } from 'sequelize';

const nowIso = () => new Date().toISOString();

export const REQUIRED_RUNTIME_MIGRATIONS = Object.freeze([
    '20260325000002-create-pos-transactions.cjs',
    '20260325000003-add-pos-reference-type-and-settings.cjs',
    '20260327000001-add-pos-strict-compliance-setting.cjs',
    '20260327000002-add-pos-discount-snapshot-columns.cjs',
    '20260328000001-add-pos-order-method-fees.cjs',
    '20260328000002-widen-pos-discount-rate-snapshot.cjs',
    '20260328000003-add-pos-catalog-overrides-and-user-roles.cjs',
    '20260330000001-add-pos-terminal-shifts-and-cash-events.cjs',
    '20260330000002-add-show-in-pos-filter-to-item-folders.cjs',
    '20260330000003-create-tenant-locations.cjs',
    '20260330000004-add-storefront-operational-settings.cjs',
    '20260330000005-add-pickup-to-pos-order-method-enums.cjs',
    '20260330000006-expand-pos-transactions-for-online-orders.cjs',
    '20260330000007-create-store-customers-and-addresses.cjs',
    '20260331000008-make-pos-cashier-nullable-for-online-store.cjs',
    '20260331000009-create-storefront-discovery-index.cjs',
    '20260331000010-add-primary-storefront-location.cjs',
    '20260406000001-add-tenant-compliance-program.cjs',
    '20260407000002-compliance-hardening-phase1-2.cjs',
    '20260408000004-add-pos-operation-replays.cjs',
    '20260408000005-add-security-signal-audit-enum.cjs',
    '20260422000001-add-compliance-downgrade-override-controls.cjs',
    '20260422000002-harden-compliance-downgrade-controls.cjs',
    '20260416000007-add-multi-location-inventory-ledger.cjs',
    '20260416000008-backfill-user-location-grants.cjs',
    '20260424000001-add-storefront-branding-assets-to-discovery-index.cjs',
    '20260424000002-harden-storefront-asset-settings-constraints.cjs',
    '20260424000003-enforce-storefront-asset-settings-via-triggers.cjs',
    '20260427000001-add-storefront-pos-read-path-indexes.cjs',
    '20260428000001-add-storefront-profile-content-to-discovery-index.cjs',
    '20260429000001-add-storefront-v2-profile-fields-to-discovery-index.cjs',
    '20260429000002-create-storefront-follows.cjs',
    '20260504000001-add-customer-access-fields-to-discovery-index.cjs',
    '20260601000001-add-rmo-fiscal-document-snapshot-fields.cjs',
    '20260629000001-add-pos-always-available-contract.cjs',
    '20260703000002-enforce-one-open-shift-per-terminal.cjs',
    '20260705000001-add-admin-provisioned-membership-source.cjs',
    '20260710000001-create-delivery-jobs.cjs',
    '20260711000001-add-pickup-cash-collection-fields.cjs',
    '20260711000002-add-item-folder-active-contract.cjs',
    '20260711000003-repair-pickup-cash-collection-columns.cjs',
    '20260714000002-add-pos-best-seller-contract.cjs',
    '20260724000001-enforce-one-open-shift-per-operator.cjs',
    '20260502000001-add-services-mode-booking-tables.cjs',
    '20260726000001-add-tracking-mode-to-items.cjs'
]);

const REQUIRED_TABLE_COLUMNS = Object.freeze({
    tenants: [
        'id',
        'name',
        'company_token',
        'db_name',
        'status',
        'plan',
        'compliance_mode_state',
        'compliance_mode_choice_required',
        'compliance_profile',
        'compliance_mode_override_by',
        'compliance_mode_override_at',
        'compliance_mode_revert_by',
        'compliance_mode_revert_at',
        'compliance_cycle_version',
        'compliance_revert_last_cycle_version'
    ],
    users: ['user_id', 'role', 'is_master_admin', 'deleted_at'],
    items: ['item_id', 'vat_type', 'tracking_mode', 'tracking_toggle_available'],
    item_folders: ['folder_id', 'name', 'show_in_pos_filter', 'is_active'],
    pos_catalog_overrides: ['pos_catalog_override_id', 'item_id', 'pos_visible', 'pos_image_url', 'pos_always_available', 'pos_best_seller_mode'],
    pos_transactions: [
        'pos_transaction_id',
        'document_type',
        'cashier_id',
        'discount_rate_snapshot',
        'service_fee_amount',
        'service_fee_label_snapshot',
        'service_fee_method_snapshot',
        'service_fee_overridden',
        'shift_id',
        'order_source',
        'fulfillment_status',
        'location_id',
        'tracking_pin',
        'delivery_fee',
        'store_customer_id',
        'accepted_by',
        'accepted_at',
        'buyer_tin',
        'buyer_business_style',
        'buyer_address',
        'fiscal_document_template_version',
        'fiscal_document_hash',
        'fiscal_document_snapshot',
        'fiscal_lifecycle_state',
        'fiscal_reprint_count',
        'fiscal_void_event_hash',
        'void_reason',
        'payment_collected_at',
        'payment_collected_by',
        'payment_collected_shift_id',
        'payment_collected_terminal_id'
    ],
    delivery_jobs: [
        'delivery_job_id',
        'pos_transaction_id',
        'location_id',
        'provider',
        'status'
    ],
    stock_movements: ['movement_id', 'item_id', 'movement_type', 'quantity', 'location_id', 'source_location_id', 'destination_location_id'],
    fifo_batches: ['batch_id', 'item_id', 'location_id', 'quantity', 'quantity_consumed'],
    item_location_stocks: ['item_location_stock_id', 'item_id', 'location_id', 'quantity_on_hand'],
    user_location_grants: ['user_location_grant_id', 'user_id', 'location_id', 'created_by'],
    tenant_compliance_artifacts: [
        'tenant_compliance_artifact_id',
        'tenant_id',
        'artifact_type',
        'status',
        'verification_status'
    ],
    tenant_compliance_peripherals: [
        'tenant_compliance_peripheral_id',
        'tenant_id',
        'device_class',
        'status',
        'is_shared',
        'verification_status'
    ],
    pos_transaction_lines: [
        'line_id',
        'vat_type_snapshot',
        'vat_rate_snapshot',
        'sale_price_overridden',
        'price_override_reason',
        'stock_effect_type',
        'stock_exempt_reason'
    ],
    pos_terminal_shifts: [
        'pos_terminal_shift_id',
        'business_date',
        'terminal_id',
        'cashier_id',
        'status',
        'active_terminal_id',
        'active_operator_user_id'
    ],
    pos_cash_drawer_events: ['pos_cash_drawer_event_id', 'pos_terminal_shift_id', 'event_type', 'amount', 'recorded_by'],
    pos_operation_replays: ['pos_operation_replay_id', 'operation_key', 'idempotency_key', 'request_hash', 'replay_status'],
    system_settings: ['setting_id', 'setting_key', 'setting_value', 'data_type'],
    tenant_locations: ['location_id', 'name', 'address_line', 'latitude', 'longitude', 'is_active', 'is_primary_storefront'],
    store_customers: ['customer_id', 'email', 'password_hash', 'name', 'is_active'],
    customer_addresses: ['address_id', 'customer_id', 'address_line', 'is_default'],
    storefront_follows: ['storefront_follow_id', 'tenant_id', 'storefront_slug', 'visitor_fingerprint'],
    dgfy_account_tenant_memberships: ['id', 'dgfy_account_id', 'tenant_id', 'tenant_user_id', 'role', 'status', 'source'],
    storefront_discovery_index: [
        'storefront_discovery_index_id',
        'tenant_id',
        'slug',
        'is_visible',
        'storefront_cover_image_url',
        'storefront_profile_image_url',
        'storefront_ui_v2_enabled',
        'storefront_categories',
        'storefront_gallery_images',
        'storefront_delivery_partners',
        'storefront_follow_enabled',
        'storefront_share_enabled',
        'storefront_review_summary',
        'customer_access_mode',
        'effective_customer_access_mode',
        'max_customer_access_mode',
        'inventory_display_mode',
        'inventory_low_stock_display_threshold',
        'access_capabilities',
        'access_limitation_reason',
        'customer_access_modes_enabled',
        'last_synced_at'
    ]
});

const REQUIRED_COLUMN_CONTRACTS = Object.freeze({
    items: {
        category: {
            enumValues: ['raw_material', 'packaging', 'product', 'supplies', 'service']
        }
    },
    pos_catalog_overrides: {
        pos_always_available: { allowNull: false },
        pos_best_seller_mode: { allowNull: false }
    },
    pos_transaction_lines: {
        stock_effect_type: { allowNull: false },
        stock_exempt_reason: { allowNull: true }
    },
    pos_transactions: {
        cashier_id: { allowNull: true },
        buyer_tin: { allowNull: true },
        buyer_business_style: { allowNull: true },
        buyer_address: { allowNull: true },
        fiscal_document_template_version: { allowNull: true },
        fiscal_document_hash: { allowNull: true },
        fiscal_document_snapshot: { allowNull: true },
        fiscal_lifecycle_state: { allowNull: false },
        fiscal_reprint_count: { allowNull: false },
        fiscal_void_event_hash: { allowNull: true },
        void_reason: { allowNull: true }
    },
    dgfy_account_tenant_memberships: {
        source: {
            allowNull: false,
            enumValues: ['founder', 'invite', 'admin_handover', 'admin_provisioned']
        }
    }
});

const OPTIONAL_TABLE_COLUMNS = Object.freeze({
    tenants: ['subscription_status', 'current_period_end', 'payment_method', 'rejection_reason']
});

const hasColumn = (tableDef, column) => (
    Boolean(tableDef) && Object.prototype.hasOwnProperty.call(tableDef, column)
);

const describeTableSafe = async (queryInterface, tableName) => {
    try {
        return await queryInterface.describeTable(tableName);
    } catch {
        return null;
    }
};

const normalizeEnumValues = (columnDef) => {
    const rawValues = Array.isArray(columnDef?.values) ? columnDef.values : [];
    const type = String(columnDef?.type || '');
    const parsedValues = [...type.matchAll(/'((?:[^']|'')*)'/g)]
        .map((match) => match[1].replace(/''/g, "'"));

    return new Set([...rawValues, ...parsedValues].map((value) => String(value)));
};

export const auditRuntimeSchemaReadiness = async ({
    sequelizeInstance,
    requiredMigrations = REQUIRED_RUNTIME_MIGRATIONS,
    requiredTableColumns = REQUIRED_TABLE_COLUMNS,
    optionalTableColumns = OPTIONAL_TABLE_COLUMNS,
    requiredColumnContracts = REQUIRED_COLUMN_CONTRACTS
} = {}) => {
    if (!sequelizeInstance) {
        throw new Error('sequelizeInstance is required');
    }

    const startedAt = Date.now();
    const issues = [];
    const warnings = [];
    const missingMigrations = [];
    const missingColumns = [];
    const optionalMissingColumns = [];

    // 1) Required migration presence
    try {
        const rows = await sequelizeInstance.query(
            'SELECT name FROM SequelizeMeta',
            { type: QueryTypes.SELECT }
        );
        const applied = new Set(rows.map((row) => row.name));

        for (const migrationName of requiredMigrations) {
            if (!applied.has(migrationName)) {
                missingMigrations.push(migrationName);
                issues.push({
                    scope: 'migration',
                    type: 'missing_required_migration',
                    migration: migrationName,
                    message: `Required migration is not applied: ${migrationName}`
                });
            }
        }
    } catch (error) {
        issues.push({
            scope: 'migration',
            type: 'migration_meta_unavailable',
            message: `Failed to read SequelizeMeta: ${error.message}`
        });
    }

    // 2) Required runtime columns
    const queryInterface = sequelizeInstance.getQueryInterface();
    for (const [tableName, requiredColumns] of Object.entries(requiredTableColumns)) {
        const tableDef = await describeTableSafe(queryInterface, tableName);
        if (!tableDef) {
            issues.push({
                scope: 'schema',
                type: 'missing_table',
                table: tableName,
                message: `Required table is missing or inaccessible: ${tableName}`
            });
            continue;
        }

        for (const column of requiredColumns) {
            if (!hasColumn(tableDef, column)) {
                const entry = { table: tableName, column };
                missingColumns.push(entry);
                issues.push({
                    scope: 'schema',
                    type: 'missing_required_column',
                    table: tableName,
                    column,
                    message: `Missing required column ${tableName}.${column}`
                });
            }
        }

        for (const optionalColumn of optionalTableColumns[tableName] || []) {
            if (!hasColumn(tableDef, optionalColumn)) {
                const warningEntry = { table: tableName, column: optionalColumn };
                optionalMissingColumns.push(warningEntry);
                warnings.push({
                    scope: 'schema',
                    type: 'missing_optional_column',
                    table: tableName,
                    column: optionalColumn,
                    message: `Optional column missing ${tableName}.${optionalColumn} (compatibility fallback may apply)`
                });
            }
        }

        const tableContracts = requiredColumnContracts?.[tableName] || {};
        for (const [columnName, contract] of Object.entries(tableContracts)) {
            if (!hasColumn(tableDef, columnName)) continue;

            if (Object.prototype.hasOwnProperty.call(contract, 'allowNull')) {
                const actualAllowNull = Boolean(tableDef[columnName]?.allowNull);
                if (actualAllowNull !== Boolean(contract.allowNull)) {
                    issues.push({
                        scope: 'schema',
                        type: 'invalid_column_contract',
                        table: tableName,
                        column: columnName,
                        expected: { allowNull: Boolean(contract.allowNull) },
                        actual: { allowNull: actualAllowNull },
                        message: `Column contract mismatch for ${tableName}.${columnName}: expected allowNull=${Boolean(contract.allowNull)}, got allowNull=${actualAllowNull}`
                    });
                }
            }

            if (Array.isArray(contract.enumValues) && contract.enumValues.length > 0) {
                const actualValues = normalizeEnumValues(tableDef[columnName]);
                const missingEnumValues = contract.enumValues.filter((value) => !actualValues.has(value));
                if (missingEnumValues.length > 0) {
                    issues.push({
                        scope: 'schema',
                        type: 'invalid_column_contract',
                        table: tableName,
                        column: columnName,
                        expected: { enumValues: contract.enumValues },
                        actual: { enumValues: [...actualValues] },
                        message: `Column contract mismatch for ${tableName}.${columnName}: missing enum values ${missingEnumValues.join(', ')}`
                    });
                }
            }
        }
    }

    const status = issues.length > 0 ? 'degraded' : 'healthy';
    const durationMs = Date.now() - startedAt;

    return {
        status,
        checkedAt: nowIso(),
        durationMs,
        missingMigrations,
        missingColumns,
        optionalMissingColumns,
        issueCount: issues.length,
        warningCount: warnings.length,
        issues,
        warnings
    };
};

export default {
    auditRuntimeSchemaReadiness,
    REQUIRED_RUNTIME_MIGRATIONS
};
