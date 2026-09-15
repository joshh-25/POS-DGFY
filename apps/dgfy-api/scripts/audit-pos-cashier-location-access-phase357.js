import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePermissionArray } from '../src/utils/userPermissions.js';

export const PHASE357_REQUIRED_OPERATING_INDEXES = Object.freeze([
    Object.freeze({
        table: 'pos_terminal_shifts',
        name: 'uq_pos_terminal_shifts_active_operator',
        columns: Object.freeze(['active_operator_user_id'])
    }),
    Object.freeze({
        table: 'pos_terminal_operator_sessions',
        name: 'uq_pos_terminal_operator_sessions_active_user',
        columns: Object.freeze(['active_operator_user_id'])
    }),
    Object.freeze({
        table: 'pos_terminal_operator_sessions',
        name: 'uq_pos_terminal_operator_sessions_active_terminal',
        columns: Object.freeze(['active_terminal_id'])
    }),
    Object.freeze({
        table: 'employee_attendance_sessions',
        name: 'uq_employee_attendance_sessions_active_user',
        columns: Object.freeze(['active_user_id'])
    })
]);

const toCount = (value) => {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : null;
};

const toBoolean = (value) => value === true || value === 1 || value === '1';

export const parsePhase357FeatureSetting = (rawSetting) => {
    const raw = rawSetting?.setting_value ?? rawSetting?.value ?? rawSetting;
    let value = raw;
    if (typeof raw === 'string') {
        try {
            value = JSON.parse(raw);
        } catch {
            value = { enabled: ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase()) };
        }
    }
    const rawLocationIds = Array.isArray(value?.location_ids) ? value.location_ids : [];
    const locationIds = rawLocationIds
        .map((entry) => Number.parseInt(entry, 10))
        .filter((entry) => Number.isInteger(entry) && entry > 0);
    const uniqueLocationIds = [...new Set(locationIds)];
    return {
        present: raw != null && String(raw).trim() !== '',
        enabled: toBoolean(value?.enabled),
        location_count: uniqueLocationIds.length,
        configured_location_ids: uniqueLocationIds,
        invalid_location_entry_count: rawLocationIds.length - locationIds.length,
        duplicate_location_entry_count: locationIds.length - uniqueLocationIds.length
    };
};

const normalizedIndexRows = (indexes = []) => indexes.map((index) => ({
    table: String(index.table || index.table_name || '').trim(),
    name: String(index.name || index.index_name || '').trim(),
    unique: Number(index.non_unique ?? (index.unique ? 0 : 1)) === 0,
    columns: String(index.columns || index.column_names || '')
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean)
}));

const findMatchingIndex = (indexes, required) => indexes.find((index) => (
    index.table === required.table
    && index.name === required.name
    && index.unique
    && required.columns.every((column, position) => index.columns[position] === column)
));

export const buildPhase357TenantReport = ({
    tenant = {},
    cashierUsers = [],
    indexes = [],
    featureSetting = null,
    state = {},
    schemaErrors = []
} = {}) => {
    const users = cashierUsers.map((user) => {
        const permissions = normalizePermissionArray(user.permissions);
        return {
            user_id: user.user_id,
            is_active: toBoolean(user.is_active),
            item_edit_grant: permissions.includes('items:edit')
                ? 'review_required_ambiguous_edit'
                : 'no_stored_edit'
        };
    });
    const ambiguousEditCount = users.filter((user) => user.item_edit_grant === 'review_required_ambiguous_edit').length;
    const normalizedIndexes = normalizedIndexRows(indexes);
    const missingIndexes = PHASE357_REQUIRED_OPERATING_INDEXES
        .filter((required) => !findMatchingIndex(normalizedIndexes, required))
        .map((required) => required.name);
    const counts = {
        open_shifts: toCount(state.open_shifts),
        active_operator_sessions: toCount(state.active_operator_sessions),
        open_attendance_sessions: toCount(state.open_attendance_sessions),
        lifecycle_audit_events: toCount(state.lifecycle_audit_events)
    };
    const attribution = {
        open_shifts_without_user: toCount(state.open_shifts_without_user),
        active_operators_without_user: toCount(state.active_operators_without_user),
        open_attendance_without_user: toCount(state.open_attendance_without_user),
        lifecycle_audit_events_without_actor: toCount(state.lifecycle_audit_events_without_actor)
    };

    return {
        tenant_id: tenant.id ?? null,
        feature: parsePhase357FeatureSetting(featureSetting),
        state: counts,
        actor_attribution: attribution,
        grant_reconciliation: {
            cashier_count: users.length,
            active_cashier_count: users.filter((user) => user.is_active).length,
            ambiguous_item_edit_count: ambiguousEditCount,
            automatic_rewrite: false,
            users
        },
        operating_indexes: {
            required: PHASE357_REQUIRED_OPERATING_INDEXES.map(({ table, name, columns }) => ({ table, name, columns })),
            missing: missingIndexes,
            healthy: missingIndexes.length === 0
        },
        schema_errors: [...new Set(schemaErrors.map((error) => String(error).trim()).filter(Boolean))],
        read_only: true
    };
};

const queryRows = async (connection, statement, options = {}) => {
    try {
        const [rows] = await connection.query(statement, { logging: false, ...options });
        return { rows: Array.isArray(rows) ? rows : [], error: null };
    } catch (error) {
        return { rows: [], error: String(error?.code || 'query_failed') };
    }
};

const queryCount = async (connection, statement) => {
    const result = await queryRows(connection, statement);
    return { value: toCount(result.rows[0]?.total), error: result.error };
};

const readTenantReport = async ({ tenant, Sequelize, landlord }) => {
    const connection = new Sequelize(tenant.db_name, landlord.config.username, landlord.config.password, {
        host: landlord.config.host,
        port: landlord.config.port,
        dialect: 'mysql',
        logging: false,
        pool: { max: 1, min: 0 }
    });
    const schemaErrors = [];
    try {
        const usersResult = await queryRows(
            connection,
            "SELECT user_id, is_active, permissions FROM users WHERE role = 'cashier' AND deleted_at IS NULL"
        );
        if (usersResult.error) schemaErrors.push(`users:${usersResult.error}`);

        const settingResult = await queryRows(
            connection,
            "SELECT setting_value FROM system_settings WHERE setting_key = 'pos_cashier_attendance_lifecycle_v1' LIMIT 1"
        );
        if (settingResult.error) schemaErrors.push(`system_settings:${settingResult.error}`);

        const statements = {
            open_shifts: "SELECT COUNT(*) AS total FROM pos_terminal_shifts WHERE status = 'open'",
            active_operator_sessions: "SELECT COUNT(*) AS total FROM pos_terminal_operator_sessions WHERE status = 'active'",
            open_attendance_sessions: "SELECT COUNT(*) AS total FROM employee_attendance_sessions WHERE status = 'open'",
            lifecycle_audit_events: "SELECT COUNT(*) AS total FROM audit_logs WHERE entity_type = 'pos_cashier_lifecycle'",
            open_shifts_without_user: "SELECT COUNT(*) AS total FROM pos_terminal_shifts s LEFT JOIN users u ON u.user_id = s.cashier_id WHERE s.status = 'open' AND u.user_id IS NULL",
            active_operators_without_user: "SELECT COUNT(*) AS total FROM pos_terminal_operator_sessions s LEFT JOIN users u ON u.user_id = s.user_id WHERE s.status = 'active' AND u.user_id IS NULL",
            open_attendance_without_user: "SELECT COUNT(*) AS total FROM employee_attendance_sessions s LEFT JOIN users u ON u.user_id = s.user_id WHERE s.status = 'open' AND u.user_id IS NULL",
            lifecycle_audit_events_without_actor: "SELECT COUNT(*) AS total FROM audit_logs WHERE entity_type = 'pos_cashier_lifecycle' AND user_id IS NULL"
        };
        const state = {};
        for (const [key, statement] of Object.entries(statements)) {
            const result = await queryCount(connection, statement);
            state[key] = result.value;
            if (result.error) schemaErrors.push(`${key}:${result.error}`);
        }

        const requiredNames = PHASE357_REQUIRED_OPERATING_INDEXES.map((index) => index.name);
        const indexesResult = await queryRows(
            connection,
            `SELECT TABLE_NAME AS table_name, INDEX_NAME AS name, NON_UNIQUE AS non_unique, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME IN (:names)
             GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`,
            { replacements: { names: requiredNames } }
        );
        if (indexesResult.error) schemaErrors.push(`indexes:${indexesResult.error}`);

        return buildPhase357TenantReport({
            tenant,
            cashierUsers: usersResult.rows,
            indexes: indexesResult.rows,
            featureSetting: settingResult.rows[0] || null,
            state,
            schemaErrors
        });
    } finally {
        await connection.close();
    }
};

export const runPhase357CashierLocationAudit = async () => {
    const { default: landlord } = await import('../src/config/database.js');
    const { Sequelize } = await import('sequelize');
    const host = landlord.config.host;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
        throw new Error('This audit is local-only.');
    }
    try {
        const [tenants] = await landlord.query("SELECT id, db_name FROM tenants WHERE status = 'active'", { logging: false });
        const report = [];
        const skipped = [];
        for (const tenant of tenants) {
            const dbName = String(tenant.db_name || '').trim();
            if (!/^[A-Za-z0-9_]+$/.test(dbName) || /^test_/i.test(dbName)) {
                skipped.push({ tenant_id: tenant.id ?? null, reason: 'invalid_or_test_database' });
                continue;
            }
            try {
                report.push(await readTenantReport({ tenant, Sequelize, landlord }));
            } catch (error) {
                report.push({
                    tenant_id: tenant.id ?? null,
                    read_only: true,
                    schema_errors: [String(error?.code || 'tenant_query_failed')],
                    operating_indexes: { healthy: false, missing: PHASE357_REQUIRED_OPERATING_INDEXES.map((index) => index.name) }
                });
            }
        }
        return { read_only: true, report, skipped_database_count: skipped.length };
    } finally {
        await landlord.close();
    }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runPhase357CashierLocationAudit()
        .then((result) => console.log(JSON.stringify(result, null, 2)))
        .catch(() => {
            console.error('Phase 357 cashier location audit failed; check local database availability/schema. No grants or tenant rows were modified.');
            process.exitCode = 1;
        });
}
