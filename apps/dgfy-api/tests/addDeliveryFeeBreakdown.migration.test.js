// Unit tests for Phase 237 (#1329, epic #1321)'s two migrations:
//   - 20260903000001-add-delivery-fee-breakdown.cjs (tenant fan-out, mirrors
//     20260902000001-add-delivery-distance-capture.cjs's own test-mocking shape, which itself
//     mirrors addDeliveryAssignmentShift.migration.test.js / addThirdPartyDeliveryPersonnelName
//     .migration.test.js for the idempotence/down-migration assertions).
//   - 20260903000002-add-payment-session-delivery-breakdown.cjs (landlord-only, plain addColumn,
//     mirrors 20260608000001-add-fee-policy-to-commerce-payment-sessions.cjs's own migration).
//
// Plus a drift test: apps/dgfy-api/scripts/sync-tenant-schemas.js's five DDL strings for
// pos_transactions must be column-definition-identical to the tenant-fanout migration's own DDL --
// this lockstep is the #860/#639 crash-loop guard, and nothing else in this repo checks it.

import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { REQUIRED_TENANT_SCHEMA_COLUMNS } from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const tenantFanoutMigration = require('../../dgfy-migration-runner/migrations/20260903000001-add-delivery-fee-breakdown.cjs');
const landlordMigration = require('../../dgfy-migration-runner/migrations/20260903000002-add-payment-session-delivery-breakdown.cjs');

const NEW_COLUMN_NAMES = [
    'delivery_fee_mode',
    'delivery_fee_base',
    'delivery_fee_waiver',
    'delivery_fee_override',
    'delivery_fee_calc_version'
];

// ---- tenant fan-out migration (mirrors 20260902000001's own test-double shape) ----

const buildFanoutQueryInterface = ({ tenantDbNames = [], existingColumnsByDb = {} } = {}) => {
    const query = jest.fn((sql, options) => {
        if (sql.includes('SELECT DATABASE()')) {
            return Promise.resolve([[{ dbName: 'landlord_db' }]]);
        }
        if (sql.includes('information_schema.tables')) {
            // Every candidate database "has" the table in this fixture -- table-existence is not
            // the invariant under test here.
            return Promise.resolve([[{ count: 1 }]]);
        }
        if (sql.includes("SELECT DISTINCT db_name FROM tenants")) {
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

const alterStatements = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('ALTER TABLE'));

describe('tenant fan-out migration (20260903000001)', () => {
    it('adds all five columns, once per active tenant database plus the landlord DB', async () => {
        const queryInterface = buildFanoutQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await tenantFanoutMigration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        // 3 databases (landlord_db, tenant_a, tenant_b) x 5 columns = 15 ADD COLUMN statements.
        expect(statements).toHaveLength(15);
        for (const name of NEW_COLUMN_NAMES) {
            expect(statements.filter((sql) => sql.includes(`ADD COLUMN \`${name}\``))).toHaveLength(3);
        }
    });

    it('is idempotent -- skips a column already present in a given database', async () => {
        const queryInterface = buildFanoutQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { tenant_a: NEW_COLUMN_NAMES }
        });

        await tenantFanoutMigration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        // Only landlord_db (not pre-populated) gets the 5 ADD COLUMN statements; tenant_a is skipped
        // entirely since every column already exists there.
        expect(statements).toHaveLength(5);
        expect(statements.every((sql) => !sql.includes('tenant_a'))).toBe(true);
    });

    it('down() drops exactly the five columns, per database', async () => {
        const queryInterface = buildFanoutQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { landlord_db: NEW_COLUMN_NAMES, tenant_a: NEW_COLUMN_NAMES }
        });

        await tenantFanoutMigration.down(queryInterface);

        const statements = alterStatements(queryInterface).filter((sql) => sql.includes('DROP COLUMN'));
        expect(statements).toHaveLength(10);
        for (const name of NEW_COLUMN_NAMES) {
            expect(statements.filter((sql) => sql.includes(`DROP COLUMN \`${name}\``))).toHaveLength(2);
        }
    });

    it('touches only the landlord DB when the tenants table itself does not exist (no fan-out possible)', async () => {
        const queryInterface = { sequelize: { query: jest.fn() } };
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) {
                const [, tableName] = options?.replacements || [];
                // 'tenants' absent -> getActiveTenantDatabaseNames short-circuits to []. pos_transactions
                // itself IS present on landlord_db, so landlord_db is still touched.
                return Promise.resolve([[{ count: tableName === 'tenants' ? 0 : 1 }]]);
            }
            return Promise.resolve([[], undefined]);
        });

        await tenantFanoutMigration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        expect(statements).toHaveLength(5);
    });
});

// ---- landlord migration (mirrors 20260608000001's own test-double shape) ----

const buildLandlordQueryInterface = ({ columns = {} } = {}) => ({
    showAllTables: jest.fn().mockResolvedValue(['commerce_payment_sessions']),
    describeTable: jest.fn().mockResolvedValue(columns),
    addColumn: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined)
});

const Sequelize = { JSON: 'JSON' };

describe('landlord migration (20260903000002)', () => {
    it('adds the nullable delivery_fee_breakdown JSON column when missing', async () => {
        const queryInterface = buildLandlordQueryInterface({ columns: { session_id: {} } });

        await landlordMigration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).toHaveBeenCalledWith(
            'commerce_payment_sessions',
            'delivery_fee_breakdown',
            { type: 'JSON', allowNull: true }
        );
    });

    it('is idempotent when the column already exists', async () => {
        const queryInterface = buildLandlordQueryInterface({ columns: { delivery_fee_breakdown: {} } });

        await landlordMigration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
    });

    it('removes the column on down', async () => {
        const queryInterface = buildLandlordQueryInterface({ columns: { delivery_fee_breakdown: {} } });

        await landlordMigration.down(queryInterface);

        expect(queryInterface.removeColumn).toHaveBeenCalledWith('commerce_payment_sessions', 'delivery_fee_breakdown');
    });

    it('no-ops when the table itself does not exist', async () => {
        const queryInterface = {
            showAllTables: jest.fn().mockResolvedValue([]),
            describeTable: jest.fn(),
            addColumn: jest.fn(),
            removeColumn: jest.fn()
        };

        await landlordMigration.up(queryInterface, Sequelize);
        await landlordMigration.down(queryInterface);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
        expect(queryInterface.removeColumn).not.toHaveBeenCalled();
        expect(queryInterface.describeTable).not.toHaveBeenCalled();
    });
});

// ---- lockstep drift guard -- the #860/#639 crash-loop guard ----

describe('sync-tenant-schemas.js lockstep with the tenant fan-out migration', () => {
    it('declares all five pos_transactions columns', () => {
        for (const name of NEW_COLUMN_NAMES) {
            expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions[name]).toBeDefined();
        }
    });

    // The migration's DDL fragment (everything after "ADD COLUMN `<name>` ") must appear verbatim
    // inside sync-tenant-schemas.js's own SQL string for that column -- this is the actual DDL the
    // repair loop would run at API boot, and it must describe the exact same column the migration
    // creates. Extracted from tenantFanoutMigration's own exported column table rather than
    // hardcoded here a second time, so this test itself cannot silently drift from the migration.
    it('every column DDL fragment is identical between the migration and the sync-tenant-schemas repair entry', () => {
        // NEW_POS_TRANSACTION_COLUMNS isn't exported directly -- reconstruct the same fixture the
        // migration's own `up()` issues, and diff the ADD COLUMN fragment against the sync entry.
        const queryInterface = buildFanoutQueryInterface({ tenantDbNames: [] });
        return tenantFanoutMigration.up(queryInterface).then(() => {
            const statements = alterStatements(queryInterface);
            for (const name of NEW_COLUMN_NAMES) {
                const migrationStatement = statements.find((sql) => sql.includes(`ADD COLUMN \`${name}\``));
                expect(migrationStatement).toBeDefined();
                const migrationFragment = migrationStatement
                    .replace(/\s+/g, ' ')
                    .split(`ADD COLUMN \`${name}\` `)[1]
                    .trim();

                const syncSql = REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions[name].sql;
                const syncFragment = syncSql
                    .replace(/\s+/g, ' ')
                    .split(`ADD COLUMN \`${name}\` `)[1]
                    .trim();

                expect(syncFragment).toBe(migrationFragment);
            }
        });
    });
});
