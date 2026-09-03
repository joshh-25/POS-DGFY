// Unit tests for Phase 240 (#1331, epic #1321)'s migration:
//   - 20260904000001-add-delivery-voucher-benefit.cjs (tenant fan-out: two ENUM MODIFY widenings on
//     `vouchers` plus four additive columns across `vouchers`/`pos_transactions`).
//
// Mirrors addDeliveryFeeBreakdown.migration.test.js's own test-double shape (itself mirroring
// addDeliveryAssignmentShift.migration.test.js) for the idempotence/down-migration assertions, and
// its lockstep drift-guard pattern for sync-tenant-schemas.js.
//
// Plus a drift test: apps/dgfy-api/scripts/sync-tenant-schemas.js's four ADD-COLUMN DDL fragments
// (the two vouchers columns, the two pos_transactions columns) must be column-definition-identical
// to this migration's own DDL -- this lockstep is the #860/#639 crash-loop guard, and nothing else
// in this repo checks it. The two ENUM widenings are deliberately NOT covered by that drift test --
// REQUIRED_TENANT_SCHEMA_COLUMNS is column-presence based only and has no repair path for an enum
// value widening (see sync-tenant-schemas.js's own comment on this); those two are instead asserted
// directly against REQUIRED_TENANT_SCHEMA_TABLES.vouchers' CREATE TABLE string below.

import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { REQUIRED_TENANT_SCHEMA_COLUMNS, REQUIRED_TENANT_SCHEMA_TABLES } from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260904000001-add-delivery-voucher-benefit.cjs');

const NEW_VOUCHER_COLUMN_NAMES = ['benefit_target', 'delivery_amount_off_centavos'];
const NEW_POS_TRANSACTION_COLUMN_NAMES = ['delivery_fee_waiver_voucher_id', 'delivery_fee_waiver_label_snapshot'];

const buildQueryInterface = ({ tenantDbNames = [], existingColumnsByDb = {}, tablesByDb = null } = {}) => {
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
            // Every candidate database "has" every table in this fixture -- table-existence is not
            // the invariant under test unless tablesByDb is supplied.
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
        if (sql.includes('WHERE `voucher_kind` = ?') || sql.includes('WHERE `benefit_class` = ?')) {
            // No rows using the new enum value in this fixture, unless overridden by a dedicated
            // queryInterface built for the rollback-blocked test below.
            return Promise.resolve([[{ count: 0 }]]);
        }
        // ALTER TABLE ... ADD/DROP/MODIFY COLUMN
        return Promise.resolve([[], undefined]);
    });
    return { sequelize: { query } };
};

const statementsOf = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('ALTER TABLE'));

describe('20260904000001-add-delivery-voucher-benefit up()', () => {
    it('widens both enums and adds all four new columns, once per active tenant database plus the landlord DB', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface);
        const modifyStatements = statements.filter((sql) => sql.includes('MODIFY COLUMN'));
        const addStatements = statements.filter((sql) => sql.includes('ADD COLUMN'));

        // 3 databases x 2 enum MODIFYs = 6.
        expect(modifyStatements.filter((sql) => sql.includes('`voucher_kind`'))).toHaveLength(3);
        expect(modifyStatements.filter((sql) => sql.includes('`benefit_class`'))).toHaveLength(3);

        // 3 databases x 4 additive columns = 12 ADD COLUMN statements.
        for (const name of [...NEW_VOUCHER_COLUMN_NAMES, ...NEW_POS_TRANSACTION_COLUMN_NAMES]) {
            expect(addStatements.filter((sql) => sql.includes(`ADD COLUMN \`${name}\``))).toHaveLength(3);
        }
    });

    it('appends both enum values LAST, never mid-list', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface);
        const voucherKindModify = statements.find((sql) => sql.includes('MODIFY COLUMN `voucher_kind`'));
        const benefitClassModify = statements.find((sql) => sql.includes('MODIFY COLUMN `benefit_class`'));

        expect(voucherKindModify).toContain("ENUM('promo_code','delivery_campaign')");
        expect(benefitClassModify).toContain("ENUM('percent_off','amount_off','fixed_price','free_delivery')");
    });

    it('is idempotent -- MODIFY re-runs (harmless), ADD COLUMN is skipped where the column already exists', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { tenant_a: [...NEW_VOUCHER_COLUMN_NAMES, ...NEW_POS_TRANSACTION_COLUMN_NAMES] }
        });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface);
        const addStatements = statements.filter((sql) => sql.includes('ADD COLUMN') && sql.includes('tenant_a'));
        expect(addStatements).toHaveLength(0);
        // MODIFY still runs for tenant_a (naturally idempotent, no columnExists guard needed).
        const modifyStatementsForTenantA = statements.filter((sql) => sql.includes('MODIFY COLUMN') && sql.includes('tenant_a'));
        expect(modifyStatementsForTenantA).toHaveLength(2);
    });

    it('adds the delivery_fee_waiver_voucher_id FK only when the vouchers table exists in that database', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: [],
            tablesByDb: { landlord_db: ['vouchers', 'pos_transactions'] }
        });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface);
        const fkStatement = statements.find((sql) => sql.includes('delivery_fee_waiver_voucher_id'));
        expect(fkStatement).toContain('ADD CONSTRAINT `fk_pos_transactions_delivery_fee_waiver_voucher`');
    });

    it('skips a database missing pos_transactions entirely, without throwing', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: [],
            tablesByDb: { landlord_db: ['vouchers'] }
        });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface);
        expect(statements.some((sql) => sql.includes('pos_transactions'))).toBe(false);
    });

    it('touches only the landlord DB when the tenants table itself does not exist (no fan-out possible)', async () => {
        const queryInterface = { sequelize: { query: jest.fn() } };
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) {
                const [, tableName] = options?.replacements || [];
                return Promise.resolve([[{ count: tableName === 'tenants' ? 0 : 1 }]]);
            }
            return Promise.resolve([[], undefined]);
        });

        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface).filter((sql) => sql.includes('ADD COLUMN'));
        expect(statements).toHaveLength(4);
    });
});

describe('20260904000001-add-delivery-voucher-benefit down()', () => {
    it('drops all four additive columns per database, before narrowing the enums back', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: {
                landlord_db: [...NEW_VOUCHER_COLUMN_NAMES, ...NEW_POS_TRANSACTION_COLUMN_NAMES],
                tenant_a: [...NEW_VOUCHER_COLUMN_NAMES, ...NEW_POS_TRANSACTION_COLUMN_NAMES]
            }
        });

        await migration.down(queryInterface);

        const statements = statementsOf(queryInterface);
        const dropStatements = statements.filter((sql) => sql.includes('DROP COLUMN'));
        for (const name of [...NEW_VOUCHER_COLUMN_NAMES, ...NEW_POS_TRANSACTION_COLUMN_NAMES]) {
            expect(dropStatements.filter((sql) => sql.includes(`DROP COLUMN \`${name}\``))).toHaveLength(2);
        }

        const modifyStatements = statements.filter((sql) => sql.includes('MODIFY COLUMN'));
        expect(modifyStatements.filter((sql) => sql.includes("ENUM('promo_code')"))).toHaveLength(2);
        expect(modifyStatements.filter((sql) => sql.includes("ENUM('percent_off','amount_off','fixed_price')"))).toHaveLength(2);

        // Ordering: WITHIN a given database's own turn, every DROP COLUMN call must appear before
        // that same database's MODIFY COLUMN calls -- the migration processes one database fully
        // (drop, then narrow) before moving to the next, not "drop everywhere, then narrow
        // everywhere", so the assertion is scoped per database rather than across the whole call log.
        const calls = queryInterface.sequelize.query.mock.calls.map(([sql]) => sql);
        for (const databaseName of ['landlord_db', 'tenant_a']) {
            const dropIndexesForDb = calls
                .map((sql, i) => (sql.includes('DROP COLUMN') && sql.includes(databaseName) ? i : -1))
                .filter((i) => i >= 0);
            const modifyIndexesForDb = calls
                .map((sql, i) => (sql.includes('MODIFY COLUMN') && sql.includes(databaseName) ? i : -1))
                .filter((i) => i >= 0);
            expect(Math.max(...dropIndexesForDb)).toBeLessThan(Math.min(...modifyIndexesForDb));
        }
    });

    it('throws rather than narrowing voucher_kind while a delivery_campaign row exists', async () => {
        const queryInterface = { sequelize: { query: jest.fn() } };
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) return Promise.resolve([[{ count: 1 }]]);
            if (sql.includes('SELECT DISTINCT db_name FROM tenants')) return Promise.resolve([[]]);
            if (sql.includes('information_schema.columns')) return Promise.resolve([[{ count: 0 }]]);
            if (sql.includes('WHERE `voucher_kind` = ?')) {
                const [value] = options.replacements;
                return Promise.resolve([[{ count: value === 'delivery_campaign' ? 1 : 0 }]]);
            }
            if (sql.includes('WHERE `benefit_class` = ?')) return Promise.resolve([[{ count: 0 }]]);
            return Promise.resolve([[], undefined]);
        });

        await expect(migration.down(queryInterface)).rejects.toThrow(/Cannot roll back voucher_kind widening/);
    });

    it('throws rather than narrowing benefit_class while a free_delivery row exists', async () => {
        const queryInterface = { sequelize: { query: jest.fn() } };
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) return Promise.resolve([[{ count: 1 }]]);
            if (sql.includes('SELECT DISTINCT db_name FROM tenants')) return Promise.resolve([[]]);
            if (sql.includes('information_schema.columns')) return Promise.resolve([[{ count: 0 }]]);
            if (sql.includes('WHERE `voucher_kind` = ?')) return Promise.resolve([[{ count: 0 }]]);
            if (sql.includes('WHERE `benefit_class` = ?')) {
                const [value] = options.replacements;
                return Promise.resolve([[{ count: value === 'free_delivery' ? 1 : 0 }]]);
            }
            return Promise.resolve([[], undefined]);
        });

        await expect(migration.down(queryInterface)).rejects.toThrow(/Cannot roll back benefit_class widening/);
    });

    it('touches only the landlord DB when the tenants table itself does not exist', async () => {
        const queryInterface = { sequelize: { query: jest.fn() } };
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) {
                const [, tableName] = options?.replacements || [];
                return Promise.resolve([[{ count: tableName === 'tenants' ? 0 : 1 }]]);
            }
            if (sql.includes('information_schema.columns')) return Promise.resolve([[{ count: 0 }]]);
            return Promise.resolve([[{ count: 0 }], undefined]);
        });

        await migration.down(queryInterface);

        const statements = statementsOf(queryInterface);
        expect(statements.some((sql) => sql.includes('tenant_'))).toBe(false);
    });
});

describe('sync-tenant-schemas.js lockstep with the migration', () => {
    it('declares all four additive columns', () => {
        for (const name of NEW_VOUCHER_COLUMN_NAMES) {
            expect(REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers[name]).toBeDefined();
        }
        for (const name of NEW_POS_TRANSACTION_COLUMN_NAMES) {
            expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions[name]).toBeDefined();
        }
    });

    // The migration's own DDL fragment (everything after "ADD COLUMN `<name>` ") must appear
    // verbatim inside sync-tenant-schemas.js's own SQL string for that column -- this is the actual
    // DDL the repair loop would run at API boot, and it must describe the exact same column the
    // migration creates. Reconstructed from the migration's own `up()` output rather than hardcoded
    // here a second time, so this test itself cannot silently drift from the migration.
    it('every additive-column DDL fragment is identical between the migration and the sync-tenant-schemas repair entry', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: [] });
        await migration.up(queryInterface);

        const statements = statementsOf(queryInterface).filter((sql) => sql.includes('ADD COLUMN'));
        const registryByTable = {
            vouchers: REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers,
            pos_transactions: REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions
        };

        for (const [table, names] of [
            ['vouchers', NEW_VOUCHER_COLUMN_NAMES],
            ['pos_transactions', NEW_POS_TRANSACTION_COLUMN_NAMES]
        ]) {
            for (const name of names) {
                const migrationStatement = statements.find((sql) => sql.includes(table) && sql.includes(`ADD COLUMN \`${name}\``));
                expect(migrationStatement).toBeDefined();
                const migrationFragment = migrationStatement
                    .replace(/\s+/g, ' ')
                    .split(`ADD COLUMN \`${name}\` `)[1]
                    .trim();

                const syncSql = registryByTable[table][name].sql;
                const syncFragment = syncSql
                    .replace(/\s+/g, ' ')
                    .split(`ADD COLUMN \`${name}\` `)[1]
                    .trim();

                expect(syncFragment).toBe(migrationFragment);
            }
        }
    });

    // The two ENUM widenings have no column-presence repair path (see this file's own header
    // comment) -- so REQUIRED_TENANT_SCHEMA_TABLES.vouchers' CREATE TABLE fallback is what a
    // wholly-missing tenant table actually gets, and it must carry both widened enums directly.
    it('REQUIRED_TENANT_SCHEMA_TABLES.vouchers carries both widened enums, not the narrow originals', () => {
        const createTableSql = REQUIRED_TENANT_SCHEMA_TABLES.vouchers.sql;
        expect(createTableSql).toContain("`voucher_kind` enum('promo_code','delivery_campaign')");
        expect(createTableSql).toContain("`benefit_class` enum('percent_off','amount_off','fixed_price','free_delivery')");
        expect(createTableSql).toContain('`benefit_target`');
        expect(createTableSql).toContain('`delivery_amount_off_centavos`');
    });
});
