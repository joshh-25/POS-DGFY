// Unit tests for Phase 244 (#1332, epic #1321)'s migration:
//   - 20260905000002-add-voucher-auto-apply.cjs (tenant fan-out: one additive column
//     `vouchers.auto_apply` plus one composite index `idx_vouchers_auto_apply`).
//
// Mirrors addDeliveryVoucherBenefit.migration.test.js's own test-double shape and lockstep
// drift-guard pattern for sync-tenant-schemas.js -- see that file's header for the precedent.
// UNLIKE that migration, this one has no ENUM widening, so there is no "throws rather than
// narrowing while a row exists" case to cover -- down() is a plain guarded index-drop/column-drop.

import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { REQUIRED_TENANT_SCHEMA_COLUMNS, REQUIRED_TENANT_SCHEMA_INDEXES, REQUIRED_TENANT_SCHEMA_TABLES } from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260905000002-add-voucher-auto-apply.cjs');

const buildQueryInterface = ({
    tenantDbNames = [],
    existingColumnsByDb = {},
    existingIndexesByDb = {},
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
        if (sql.includes('information_schema.statistics')) {
            const [databaseName, , indexName] = options.replacements;
            const already = existingIndexesByDb[databaseName] || [];
            return Promise.resolve([[{ count: already.includes(indexName) ? 1 : 0 }]]);
        }
        // ALTER TABLE ... ADD/DROP COLUMN, ADD/DROP INDEX
        return Promise.resolve([[], undefined]);
    });
    return { sequelize: { query } };
};

const statementsOf = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('ALTER TABLE'));

describe('20260905000002-add-voucher-auto-apply up()', () => {
    it('adds the column and the index once per active tenant database plus the landlord DB', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface);
        const addColumnStatements = statements.filter((sql) => sql.includes('ADD COLUMN `auto_apply`'));
        const addIndexStatements = statements.filter((sql) => sql.includes('ADD INDEX `idx_vouchers_auto_apply`'));

        expect(addColumnStatements).toHaveLength(3);
        expect(addIndexStatements).toHaveLength(3);
    });

    it('is idempotent -- both ADD COLUMN and ADD INDEX are skipped where they already exist', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { tenant_a: ['auto_apply'] },
            existingIndexesByDb: { tenant_a: ['idx_vouchers_auto_apply'] }
        });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface).filter((sql) => sql.includes('tenant_a'));
        expect(statements.filter((sql) => sql.includes('ADD COLUMN'))).toHaveLength(0);
        expect(statements.filter((sql) => sql.includes('ADD INDEX'))).toHaveLength(0);
    });

    it('adds the column but still adds the index when only the column already exists', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: [],
            existingColumnsByDb: { landlord_db: ['auto_apply'] }
        });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface);
        expect(statements.filter((sql) => sql.includes('ADD COLUMN `auto_apply`'))).toHaveLength(0);
        expect(statements.filter((sql) => sql.includes('ADD INDEX `idx_vouchers_auto_apply`'))).toHaveLength(1);
    });

    it('adds the column before the index, within one database\'s turn', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.up(queryInterface);

        const calls = queryInterface.sequelize.query.mock.calls.map(([sql]) => sql);
        const addColumnIndex = calls.findIndex((sql) => sql.includes('ADD COLUMN `auto_apply`'));
        const addIndexIndex = calls.findIndex((sql) => sql.includes('ADD INDEX `idx_vouchers_auto_apply`'));
        expect(addColumnIndex).toBeGreaterThanOrEqual(0);
        expect(addIndexIndex).toBeGreaterThan(addColumnIndex);
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

        const statements = statementsOf(queryInterface).filter((sql) => sql.includes('ADD COLUMN `auto_apply`'));
        expect(statements).toHaveLength(1);
    });
});

describe('20260905000002-add-voucher-auto-apply down()', () => {
    it('drops the index before the column, per database', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { landlord_db: ['auto_apply'], tenant_a: ['auto_apply'] },
            existingIndexesByDb: { landlord_db: ['idx_vouchers_auto_apply'], tenant_a: ['idx_vouchers_auto_apply'] }
        });

        await migration.down(queryInterface);

        const statements = statementsOf(queryInterface);
        expect(statements.filter((sql) => sql.includes('DROP INDEX `idx_vouchers_auto_apply`'))).toHaveLength(2);
        expect(statements.filter((sql) => sql.includes('DROP COLUMN `auto_apply`'))).toHaveLength(2);

        const calls = queryInterface.sequelize.query.mock.calls.map(([sql]) => sql);
        for (const databaseName of ['landlord_db', 'tenant_a']) {
            const dropIndexAt = calls.findIndex((sql) => sql.includes('DROP INDEX') && sql.includes(databaseName));
            const dropColumnAt = calls.findIndex((sql) => sql.includes('DROP COLUMN') && sql.includes(databaseName));
            expect(dropIndexAt).toBeGreaterThanOrEqual(0);
            expect(dropColumnAt).toBeGreaterThan(dropIndexAt);
        }
    });

    it('is idempotent -- skips the drop when neither the index nor the column exists', async () => {
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
            if (sql.includes('information_schema.statistics')) return Promise.resolve([[{ count: 1 }]]);
            return Promise.resolve([[], undefined]);
        });

        await migration.down(queryInterface);

        const statements = statementsOf(queryInterface);
        expect(statements.some((sql) => sql.includes('tenant_'))).toBe(false);
        expect(statements.some((sql) => sql.includes('landlord_db'))).toBe(true);
    });
});

describe('sync-tenant-schemas.js lockstep with the migration', () => {
    it('declares the additive column and the index', () => {
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers.auto_apply).toBeDefined();
        expect(REQUIRED_TENANT_SCHEMA_INDEXES.vouchers.idx_vouchers_auto_apply).toBeDefined();
    });

    it('the column DDL fragment is identical between the migration and the sync-tenant-schemas repair entry', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.up(queryInterface);

        const statement = statementsOf(queryInterface).find((sql) => sql.includes('ADD COLUMN `auto_apply`'));
        expect(statement).toBeDefined();
        const migrationFragment = statement.replace(/\s+/g, ' ').split('ADD COLUMN `auto_apply` ')[1].trim();

        const syncFragment = REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers.auto_apply.sql
            .replace(/\s+/g, ' ')
            .split('ADD COLUMN `auto_apply` ')[1]
            .trim();

        expect(syncFragment).toBe(migrationFragment);
    });

    it('the index DDL fragment is identical between the migration and the sync-tenant-schemas repair entry', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.up(queryInterface);

        const statement = statementsOf(queryInterface).find((sql) => sql.includes('ADD INDEX `idx_vouchers_auto_apply`'));
        expect(statement).toBeDefined();
        const migrationFragment = statement.replace(/\s+/g, ' ').split('ADD INDEX `idx_vouchers_auto_apply` ')[1].trim();

        const syncFragment = REQUIRED_TENANT_SCHEMA_INDEXES.vouchers.idx_vouchers_auto_apply.sql
            .replace(/\s+/g, ' ')
            .split('ADD INDEX `idx_vouchers_auto_apply` ')[1]
            .trim();

        expect(syncFragment).toBe(migrationFragment);
    });

    it('REQUIRED_TENANT_SCHEMA_TABLES.vouchers carries the auto_apply column and its KEY line', () => {
        const createTableSql = REQUIRED_TENANT_SCHEMA_TABLES.vouchers.sql;
        expect(createTableSql).toContain('`auto_apply`');
        expect(createTableSql).toContain('KEY `idx_vouchers_auto_apply` (`auto_apply`,`status`,`benefit_target`)');
    });
});
