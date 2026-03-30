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
    '20260330000002-add-show-in-pos-filter-to-item-folders.cjs'
]);

const REQUIRED_TABLE_COLUMNS = Object.freeze({
    tenants: ['id', 'name', 'company_token', 'db_name', 'status', 'plan'],
    users: ['user_id', 'role', 'is_master_admin', 'deleted_at'],
    items: ['item_id', 'vat_type'],
    item_folders: ['folder_id', 'name', 'show_in_pos_filter'],
    pos_catalog_overrides: ['pos_catalog_override_id', 'item_id', 'pos_visible', 'pos_image_url'],
    pos_transactions: [
        'pos_transaction_id',
        'discount_rate_snapshot',
        'service_fee_amount',
        'service_fee_label_snapshot',
        'service_fee_method_snapshot',
        'service_fee_overridden',
        'shift_id'
    ],
    pos_transaction_lines: ['line_id', 'vat_type_snapshot', 'vat_rate_snapshot', 'sale_price_overridden', 'price_override_reason'],
    pos_terminal_shifts: ['pos_terminal_shift_id', 'business_date', 'terminal_id', 'cashier_id', 'status'],
    pos_cash_drawer_events: ['pos_cash_drawer_event_id', 'pos_terminal_shift_id', 'event_type', 'amount', 'recorded_by'],
    system_settings: ['setting_id', 'setting_key', 'setting_value', 'data_type']
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

export const auditRuntimeSchemaReadiness = async ({
    sequelizeInstance,
    requiredMigrations = REQUIRED_RUNTIME_MIGRATIONS,
    requiredTableColumns = REQUIRED_TABLE_COLUMNS,
    optionalTableColumns = OPTIONAL_TABLE_COLUMNS
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
