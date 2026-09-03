// Unit tests for Phase 269 (#788)'s migration:
//   - 20260908000001-add-voucher-account-restriction.cjs (tenant fan-out: one additive column on
//     `vouchers`, one new `voucher_account_grants` table, one new index and one COLUMN RETYPE on
//     `voucher_redemptions`).
//
// Mirrors addVoucherOrderValueAndAuditColumns.migration.test.js's test-double shape and lockstep
// drift-guard pattern. UNLIKE that migration, this one is not purely additive: the retype
// (`dgfy_account_id` INT -> CHAR(36)) is guarded on the column's CURRENT data type rather than on
// its presence, so idempotence has to be asserted separately for it -- a second run must emit no
// MODIFY at all, and a tenant already carrying CHAR(36) (one provisioned by sequelize.sync() after
// this ships) must be left alone.

import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import {
    REQUIRED_TENANT_SCHEMA_COLUMNS,
    REQUIRED_TENANT_SCHEMA_INDEXES,
    REQUIRED_TENANT_SCHEMA_TABLES
} from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260908000001-add-voucher-account-restriction.cjs');

const NEW_COLUMN_NAMES = ['is_account_restricted'];
const GRANTS_TABLE = 'voucher_account_grants';
const ACCOUNT_INDEX = 'idx_voucher_redemptions_account';

const buildQueryInterface = ({
    tenantDbNames = [],
    existingColumnsByDb = {},
    tablesByDb = null,
    existingTablesByDb = {},
    existingIndexesByDb = {},
    // Defaults to the pre-#788 world: every database still has the original INT column.
    accountColumnTypeByDb = {}
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
            // `voucher_account_grants` is the table this migration CREATES, so it is absent unless a
            // test says otherwise; everything else (vouchers, voucher_redemptions, tenants) exists.
            if (tableName === GRANTS_TABLE) {
                const present = (existingTablesByDb[databaseName] || []).includes(GRANTS_TABLE);
                return Promise.resolve([[{ count: present ? 1 : 0 }]]);
            }
            return Promise.resolve([[{ count: 1 }]]);
        }
        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) {
            return Promise.resolve([tenantDbNames.map((dbName) => ({ db_name: dbName }))]);
        }
        if (sql.includes('information_schema.statistics')) {
            const [databaseName, , indexName] = options.replacements;
            const already = existingIndexesByDb[databaseName] || [];
            return Promise.resolve([[{ count: already.includes(indexName) ? 1 : 0 }]]);
        }
        if (sql.includes('SELECT DATA_TYPE')) {
            const [databaseName] = options.replacements;
            return Promise.resolve([[{ dataType: accountColumnTypeByDb[databaseName] || 'int' }]]);
        }
        if (sql.includes('information_schema.columns')) {
            const [databaseName, , columnName] = options.replacements;
            const already = existingColumnsByDb[databaseName] || [];
            // dgfy_account_id predates this migration on every real database.
            if (columnName === 'dgfy_account_id') return Promise.resolve([[{ count: 1 }]]);
            return Promise.resolve([[{ count: already.includes(columnName) ? 1 : 0 }]]);
        }
        // ALTER TABLE / CREATE TABLE / DROP TABLE
        return Promise.resolve([[], undefined]);
    });
    return { sequelize: { query } };
};

const ddlOf = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE') || sql.includes('DROP TABLE'));

describe('20260908000001-add-voucher-account-restriction up()', () => {
    it('applies all four changes once per active tenant database plus the landlord DB', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await migration.up(queryInterface);

        const statements = ddlOf(queryInterface);
        expect(statements.filter((sql) => sql.includes('ADD COLUMN `is_account_restricted`'))).toHaveLength(3);
        expect(statements.filter((sql) => sql.includes(`CREATE TABLE \`${GRANTS_TABLE}\``) || sql.includes(`.\`${GRANTS_TABLE}\` (`))).toHaveLength(3);
        expect(statements.filter((sql) => sql.includes('MODIFY COLUMN `dgfy_account_id` CHAR(36)'))).toHaveLength(3);
        expect(statements.filter((sql) => sql.includes(`ADD INDEX \`${ACCOUNT_INDEX}\``))).toHaveLength(3);
    });

    it('retypes BEFORE adding the index, so the index is never built over the old INT column', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });

        await migration.up(queryInterface);

        const statements = ddlOf(queryInterface);
        const modifyAt = statements.findIndex((sql) => sql.includes('MODIFY COLUMN `dgfy_account_id`'));
        const indexAt = statements.findIndex((sql) => sql.includes(`ADD INDEX \`${ACCOUNT_INDEX}\``));
        expect(modifyAt).toBeGreaterThanOrEqual(0);
        expect(indexAt).toBeGreaterThan(modifyAt);
    });

    it('is idempotent -- a fully-migrated database emits no DDL at all on a second run', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { landlord_db: NEW_COLUMN_NAMES, tenant_a: NEW_COLUMN_NAMES },
            existingTablesByDb: { landlord_db: [GRANTS_TABLE], tenant_a: [GRANTS_TABLE] },
            existingIndexesByDb: { landlord_db: [ACCOUNT_INDEX], tenant_a: [ACCOUNT_INDEX] },
            accountColumnTypeByDb: { landlord_db: 'char', tenant_a: 'char' }
        });

        await migration.up(queryInterface);

        expect(ddlOf(queryInterface)).toHaveLength(0);
    });

    it('leaves a CHAR(36) column alone -- a tenant provisioned by sequelize.sync() after this ships', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_fresh'],
            accountColumnTypeByDb: { tenant_fresh: 'char' }
        });

        await migration.up(queryInterface);

        const statements = ddlOf(queryInterface).filter((sql) => sql.includes('tenant_fresh'));
        expect(statements.filter((sql) => sql.includes('MODIFY COLUMN'))).toHaveLength(0);
        // ...but the other three changes still apply to it.
        expect(statements.filter((sql) => sql.includes('ADD COLUMN `is_account_restricted`'))).toHaveLength(1);
    });

    it('skips a database missing the vouchers table entirely, without throwing', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: [],
            tablesByDb: { landlord_db: [] }
        });

        await expect(migration.up(queryInterface)).resolves.toBeUndefined();
        expect(ddlOf(queryInterface)).toHaveLength(0);
    });

    it('touches only the landlord DB when the tenants table itself does not exist (no fan-out possible)', async () => {
        const queryInterface = { sequelize: { query: jest.fn() } };
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) {
                const [, tableName] = options?.replacements || [];
                if (tableName === 'tenants') return Promise.resolve([[{ count: 0 }]]);
                if (tableName === GRANTS_TABLE) return Promise.resolve([[{ count: 0 }]]);
                return Promise.resolve([[{ count: 1 }]]);
            }
            if (sql.includes('SELECT DATA_TYPE')) return Promise.resolve([[{ dataType: 'int' }]]);
            if (sql.includes('information_schema.statistics')) return Promise.resolve([[{ count: 0 }]]);
            if (sql.includes('information_schema.columns')) {
                const [, , columnName] = options.replacements;
                return Promise.resolve([[{ count: columnName === 'dgfy_account_id' ? 1 : 0 }]]);
            }
            return Promise.resolve([[], undefined]);
        });

        await migration.up(queryInterface);

        expect(ddlOf(queryInterface).filter((sql) => sql.includes('ADD COLUMN `is_account_restricted`'))).toHaveLength(1);
    });

    it('the created table carries the CASCADE FK, the composite unique key, and a CHAR(36) account column', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });

        await migration.up(queryInterface);

        const createStatement = ddlOf(queryInterface).find((sql) => sql.includes(`.\`${GRANTS_TABLE}\` (`));
        expect(createStatement).toContain('`dgfy_account_id` char(36) NOT NULL');
        expect(createStatement).toContain('UNIQUE KEY `uq_voucher_account_grants_voucher_account` (`voucher_id`,`dgfy_account_id`)');
        expect(createStatement).toContain('REFERENCES `vouchers` (`voucher_id`) ON DELETE CASCADE');
    });
});

describe('20260908000001-add-voucher-account-restriction down()', () => {
    it('reverses every change, in the exact reverse order of up()', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: [],
            existingColumnsByDb: { landlord_db: NEW_COLUMN_NAMES },
            existingTablesByDb: { landlord_db: [GRANTS_TABLE] },
            existingIndexesByDb: { landlord_db: [ACCOUNT_INDEX] },
            accountColumnTypeByDb: { landlord_db: 'char' }
        });

        await migration.down(queryInterface);

        const statements = ddlOf(queryInterface);
        const dropIndexAt = statements.findIndex((sql) => sql.includes(`DROP INDEX \`${ACCOUNT_INDEX}\``));
        const modifyAt = statements.findIndex((sql) => sql.includes('MODIFY COLUMN `dgfy_account_id` INT'));
        const dropTableAt = statements.findIndex((sql) => sql.includes(`DROP TABLE`));
        const dropColumnAt = statements.findIndex((sql) => sql.includes('DROP COLUMN `is_account_restricted`'));

        expect(dropIndexAt).toBeGreaterThanOrEqual(0);
        // Dropping the index BEFORE the retype is load-bearing: MySQL will not narrow an indexed
        // CHAR(36) back to INT while a key still covers it.
        expect(modifyAt).toBeGreaterThan(dropIndexAt);
        expect(dropTableAt).toBeGreaterThan(modifyAt);
        expect(dropColumnAt).toBeGreaterThan(dropTableAt);
    });

    it('is idempotent -- a never-migrated database emits no DDL', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });

        await migration.down(queryInterface);

        expect(ddlOf(queryInterface)).toHaveLength(0);
    });
});

describe('sync-tenant-schemas.js lockstep with the migration', () => {
    it('declares the new column, the new table, and the new index', () => {
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers.is_account_restricted).toBeDefined();
        expect(REQUIRED_TENANT_SCHEMA_TABLES[GRANTS_TABLE]).toBeDefined();
        expect(REQUIRED_TENANT_SCHEMA_INDEXES.voucher_redemptions[ACCOUNT_INDEX]).toBeDefined();
    });

    it.each(NEW_COLUMN_NAMES)('the %s column DDL fragment is identical between the migration and the sync-tenant-schemas repair entry', async (columnName) => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.up(queryInterface);

        const statement = ddlOf(queryInterface).find((sql) => sql.includes(`ADD COLUMN \`${columnName}\``));
        expect(statement).toBeDefined();
        const migrationFragment = statement.replace(/\s+/g, ' ').split(`ADD COLUMN \`${columnName}\` `)[1].trim();

        const syncFragment = REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers[columnName].sql
            .replace(/\s+/g, ' ')
            .split(`ADD COLUMN \`${columnName}\` `)[1]
            .trim();

        expect(syncFragment).toBe(migrationFragment);
    });

    it('the CREATE TABLE body is identical between the migration and the sync-tenant-schemas table entry', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.up(queryInterface);

        const migrationCreate = ddlOf(queryInterface).find((sql) => sql.includes(`.\`${GRANTS_TABLE}\` (`));
        // Compare the parenthesised body only -- the migration qualifies the table name with its
        // per-database prefix, the registry does not. Everything inside the parentheses (columns,
        // keys, the FK) plus the trailing engine clause must match exactly.
        const bodyOf = (sql) => sql.slice(sql.indexOf('(')).replace(/\s+/g, ' ').trim();
        expect(bodyOf(migrationCreate)).toBe(bodyOf(REQUIRED_TENANT_SCHEMA_TABLES[GRANTS_TABLE].sql));
    });

    it('the index DDL fragment is identical between the migration and the sync-tenant-schemas repair entry', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.up(queryInterface);

        const statement = ddlOf(queryInterface).find((sql) => sql.includes(`ADD INDEX \`${ACCOUNT_INDEX}\``));
        const migrationFragment = statement.replace(/\s+/g, ' ').split(`ADD INDEX \`${ACCOUNT_INDEX}\` `)[1].trim();
        const syncFragment = REQUIRED_TENANT_SCHEMA_INDEXES.voucher_redemptions[ACCOUNT_INDEX].sql
            .replace(/\s+/g, ' ')
            .split(`ADD INDEX \`${ACCOUNT_INDEX}\` `)[1]
            .trim();

        expect(syncFragment).toBe(migrationFragment);
    });

    it('the voucher_redemptions CREATE TABLE snapshot carries the CORRECTED char(36) account column', () => {
        // The pre-#788 snapshot said `int`, which DgfyAccount.id (a UUID) could never fit. This
        // assertion is the drift guard against someone "restoring" the original type from an old
        // landlord dump.
        expect(REQUIRED_TENANT_SCHEMA_TABLES.voucher_redemptions.sql).toContain('`dgfy_account_id` char(36) DEFAULT NULL');
        expect(REQUIRED_TENANT_SCHEMA_TABLES.voucher_redemptions.sql).not.toContain('`dgfy_account_id` int');
    });
});
