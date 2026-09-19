// Unit tests for #1931's migration:
//   - 20260916000001-add-retail-acceptance-inventory-evidence.cjs (tenant fan-out, mirrors
//     20260903000001-add-delivery-fee-breakdown.cjs's own test-mocking shape for the
//     idempotence/down-migration assertions).
//
// NOTE (deliberate, not an oversight): unlike the delivery-fee columns, there is no
// string-identical drift test against apps/dgfy-api/scripts/sync-tenant-schemas.js here.
// The migration's ADD COLUMN carries a COMMENT (schema-level documentation of the
// once-only evidence semantics); the sync-registry entries are plain `DATETIME NULL`.
// Presence + nullability -- what the #860/#639 crash-loop guard actually depends on --
// match; the COMMENT is metadata-only and intentionally not part of the lockstep.

import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260916000001-add-retail-acceptance-inventory-evidence.cjs');

const NEW_COLUMN_NAMES = ['inventory_issued_at', 'inventory_reversed_at'];

const buildFanoutQueryInterface = ({ tenantDbNames = [], existingColumnsByDb = {} } = {}) => {
    const query = jest.fn((sql, options) => {
        if (sql.includes('SELECT DATABASE()')) {
            return Promise.resolve([[{ dbName: 'landlord_db' }]]);
        }
        if (sql.includes('information_schema.tables')) {
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

const alterStatements = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('ALTER TABLE'));

describe('retail acceptance inventory-evidence migration (20260916000001)', () => {
    it('adds both evidence columns, once per active tenant database plus the landlord DB', async () => {
        const queryInterface = buildFanoutQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await migration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        // 3 databases (landlord_db, tenant_a, tenant_b) x 2 columns = 6 ADD COLUMN statements.
        expect(statements).toHaveLength(6);
        for (const name of NEW_COLUMN_NAMES) {
            const adds = statements.filter((sql) => sql.includes(`ADD COLUMN \`${name}\``));
            expect(adds).toHaveLength(3);
            for (const sql of adds) {
                expect(sql).toContain('DATETIME NULL');
            }
        }
    });

    it('is idempotent -- skips a column already present in a given database', async () => {
        const queryInterface = buildFanoutQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { tenant_a: NEW_COLUMN_NAMES }
        });

        await migration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        expect(statements).toHaveLength(2);
        expect(statements.every((sql) => !sql.includes('tenant_a'))).toBe(true);
    });

    it('down() drops exactly the two columns, per database', async () => {
        const queryInterface = buildFanoutQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { landlord_db: NEW_COLUMN_NAMES, tenant_a: NEW_COLUMN_NAMES }
        });

        await migration.down(queryInterface);

        const statements = alterStatements(queryInterface).filter((sql) => sql.includes('DROP COLUMN'));
        expect(statements).toHaveLength(4);
        for (const name of NEW_COLUMN_NAMES) {
            expect(statements.filter((sql) => sql.includes(`DROP COLUMN \`${name}\``))).toHaveLength(2);
        }
    });

    it('skips databases where pos_transactions does not exist', async () => {
        const queryInterface = { sequelize: { query: jest.fn() } };
        queryInterface.sequelize.query.mockImplementation((sql, options) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) {
                const [, tableName] = options?.replacements || [];
                // 'tenants' absent -> no fan-out; pos_transactions present on landlord_db.
                return Promise.resolve([[{ count: tableName === 'tenants' ? 0 : 1 }]]);
            }
            return Promise.resolve([[], undefined]);
        });

        await migration.up(queryInterface);

        expect(alterStatements(queryInterface)).toHaveLength(2);
    });
});
