// Unit tests for Phase 262 (#1490 + #1494)'s migration:
//   - 20260906000002-add-voucher-order-value-and-audit-columns.cjs (tenant fan-out: three
//     additive columns on `vouchers` -- max_order_value_centavos, created_by, updated_by).
//
// Mirrors addVoucherAutoApply.migration.test.js's own test-double shape and lockstep drift-guard
// pattern for sync-tenant-schemas.js. UNLIKE that migration, this one adds no index -- down() is a
// plain guarded column-drop only, no index-drop ordering to cover.

import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { REQUIRED_TENANT_SCHEMA_COLUMNS } from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260906000002-add-voucher-order-value-and-audit-columns.cjs');

const NEW_COLUMN_NAMES = ['max_order_value_centavos', 'created_by', 'updated_by'];

const buildQueryInterface = ({
    tenantDbNames = [],
    existingColumnsByDb = {},
    tablesByDb = null
} = {}) => {
    const query = jest.fn((sql, options) => {
        if (sql.includes('SELECT DATABASE()')) {
            return Promise.resolve([[{ dbName: 'landlord_db' }]]);
        }
        if (sql.includes('information_schema.tables')) {
            const [databaseName, tableName] = options?.replacements || [];
            if (tablesByDb) {
                const tables = tablesByDb[databaseName] || [];
                return Promise.resolve([[{ count: tables.includes(tableName) ? 1 : 0 }]]);
            }
            return Promise.resolve([[{ count: 1 }]]);
        }
        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) {
            return Promise.resolve([tenantDbNames.map((dbName) => ({ db_name: dbName }))]);
        }
        if (sql.includes('information_schema.columns')) {
            const [databaseName, , columnName] = options.replacements;
            const already = existingColumnsByDb[databaseName] || [];
            return Promise.resolve([[{ count: already.includes(columnName) ? 1 : 0 }]]);
        }
        // ALTER TABLE ... ADD/DROP COLUMN
        return Promise.resolve([[], undefined]);
    });
    return { sequelize: { query } };
};

const statementsOf = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('ALTER TABLE'));

describe('20260906000002-add-voucher-order-value-and-audit-columns up()', () => {
    it('adds all three columns once per active tenant database plus the landlord DB', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface);
        for (const columnName of NEW_COLUMN_NAMES) {
            const addColumnStatements = statements.filter((sql) => sql.includes(`ADD COLUMN \`${columnName}\``));
            expect(addColumnStatements).toHaveLength(3);
        }
    });

    it('is idempotent -- ADD COLUMN is skipped for a column that already exists', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { tenant_a: ['max_order_value_centavos', 'created_by', 'updated_by'] }
        });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface).filter((sql) => sql.includes('tenant_a'));
        expect(statements.filter((sql) => sql.includes('ADD COLUMN'))).toHaveLength(0);
    });

    it('adds only the missing columns when some already exist', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: [],
            existingColumnsByDb: { landlord_db: ['max_order_value_centavos'] }
        });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface);
        expect(statements.filter((sql) => sql.includes('ADD COLUMN `max_order_value_centavos`'))).toHaveLength(0);
        expect(statements.filter((sql) => sql.includes('ADD COLUMN `created_by`'))).toHaveLength(1);
        expect(statements.filter((sql) => sql.includes('ADD COLUMN `updated_by`'))).toHaveLength(1);
    });

    it('skips a database missing the vouchers table entirely, without throwing', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: [],
            tablesByDb: { landlord_db: [] }
        });

        await expect(migration.up(queryInterface)).resolves.toBeUndefined();

        const statements = statementsOf(queryInterface);
        expect(statements).toHaveLength(0);
    });

    it('touches only the landlord DB when the tenants table itself does not exist (no fan-out possible)', async () => {
        const queryInterface = { sequelize: { query: jest.fn() } };
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) {
                const [, tableName] = options?.replacements || [];
                return Promise.resolve([[{ count: tableName === 'tenants' ? 0 : 1 }]]);
            }
            return Promise.resolve([[{ count: 0 }], undefined]);
        });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface).filter((sql) => sql.includes('ADD COLUMN `max_order_value_centavos`'));
        expect(statements).toHaveLength(1);
    });
});

describe('20260906000002-add-voucher-order-value-and-audit-columns down()', () => {
    it('drops all three columns per database, in reverse order', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: {
                landlord_db: ['max_order_value_centavos', 'created_by', 'updated_by'],
                tenant_a: ['max_order_value_centavos', 'created_by', 'updated_by']
            }
        });

        await migration.down(queryInterface);

        const statements = statementsOf(queryInterface);
        for (const columnName of NEW_COLUMN_NAMES) {
            expect(statements.filter((sql) => sql.includes(`DROP COLUMN \`${columnName}\``))).toHaveLength(2);
        }

        const calls = queryInterface.sequelize.query.mock.calls.map(([sql]) => sql);
        for (const databaseName of ['landlord_db', 'tenant_a']) {
            const dropUpdatedByAt = calls.findIndex((sql) => sql.includes('DROP COLUMN `updated_by`') && sql.includes(databaseName));
            const dropCreatedByAt = calls.findIndex((sql) => sql.includes('DROP COLUMN `created_by`') && sql.includes(databaseName));
            const dropMaxOrderValueAt = calls.findIndex((sql) => sql.includes('DROP COLUMN `max_order_value_centavos`') && sql.includes(databaseName));
            // NEW_COLUMNS is reversed in down(), so updated_by drops first, then created_by, then max_order_value_centavos.
            expect(dropUpdatedByAt).toBeGreaterThanOrEqual(0);
            expect(dropCreatedByAt).toBeGreaterThan(dropUpdatedByAt);
            expect(dropMaxOrderValueAt).toBeGreaterThan(dropCreatedByAt);
        }
    });

    it('is idempotent -- skips the drop when none of the columns exist', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.down(queryInterface);

        const statements = statementsOf(queryInterface);
        expect(statements.filter((sql) => sql.includes('DROP'))).toHaveLength(0);
    });

    it('touches only the landlord DB when the tenants table itself does not exist', async () => {
        const queryInterface = { sequelize: { query: jest.fn() } };
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) {
                const [, tableName] = options?.replacements || [];
                return Promise.resolve([[{ count: tableName === 'tenants' ? 0 : 1 }]]);
            }
            if (sql.includes('information_schema.columns')) return Promise.resolve([[{ count: 1 }]]);
            return Promise.resolve([[], undefined]);
        });

        await migration.down(queryInterface);

        const statements = statementsOf(queryInterface);
        expect(statements.some((sql) => sql.includes('tenant_'))).toBe(false);
        expect(statements.some((sql) => sql.includes('landlord_db'))).toBe(true);
    });
});

describe('sync-tenant-schemas.js lockstep with the migration', () => {
    it('declares all three additive columns', () => {
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers.max_order_value_centavos).toBeDefined();
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers.created_by).toBeDefined();
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers.updated_by).toBeDefined();
    });

    it.each(NEW_COLUMN_NAMES)('the %s column DDL fragment is identical between the migration and the sync-tenant-schemas repair entry', async (columnName) => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.up(queryInterface);

        const statement = statementsOf(queryInterface).find((sql) => sql.includes(`ADD COLUMN \`${columnName}\``));
        expect(statement).toBeDefined();
        const migrationFragment = statement.replace(/\s+/g, ' ').split(`ADD COLUMN \`${columnName}\` `)[1].trim();

        const syncFragment = REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers[columnName].sql
            .replace(/\s+/g, ' ')
            .split(`ADD COLUMN \`${columnName}\` `)[1]
            .trim();

        expect(syncFragment).toBe(migrationFragment);
    });
});
