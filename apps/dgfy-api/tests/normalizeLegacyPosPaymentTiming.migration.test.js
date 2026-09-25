import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260925000001-normalize-legacy-pos-payment-timing.cjs');

const buildQueryInterface = ({ tenantDbNames = [], existingTables = {}, existingColumns = {} } = {}) => {
    const query = jest.fn(async (sql, options = {}) => {
        if (sql.includes('SELECT DATABASE()')) return [[{ dbName: 'landlord_db' }]];
        if (sql.includes('information_schema.tables')) {
            const [databaseName, tableName] = options.replacements || [];
            const exists = existingTables[`${databaseName}:${tableName}`] ?? true;
            return [[{ count: exists ? 1 : 0 }]];
        }
        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) {
            return [tenantDbNames.map((dbName) => ({ db_name: dbName }))];
        }
        if (sql.includes('information_schema.columns')) {
            const [databaseName, tableName, columnName] = options.replacements || [];
            const exists = existingColumns[`${databaseName}:${tableName}:${columnName}`] ?? true;
            return [[{ count: exists ? 1 : 0 }]];
        }
        return [[]];
    });

    return { sequelize: { query } };
};

describe('legacy POS payment timing repair migration', () => {
    it('normalizes blank timing values for the landlord and active tenant databases', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a'] });

        await migration.up(queryInterface);

        const updates = queryInterface.sequelize.query.mock.calls
            .map(([sql]) => sql)
            .filter((sql) => sql.includes('UPDATE') && sql.includes('payment_timing'));
        expect(updates).toHaveLength(2);
        expect(updates[0]).toContain("WHEN `order_method` = 'dine_in'");
        expect(updates[0]).toContain("THEN 'on_dine_in'");
        expect(updates[0]).toContain("THEN 'on_pickup'");
        expect(updates[0]).toContain("THEN 'on_delivery'");
        expect(updates[0]).toContain('IS NULL');
        expect(updates[0]).toContain("TRIM(`payment_timing`) = ''");
    });

    it('skips a database that does not yet have payment timing', async () => {
        const queryInterface = buildQueryInterface({
            existingColumns: { 'landlord_db:pos_transactions:payment_timing': false }
        });

        await migration.up(queryInterface);

        const updates = queryInterface.sequelize.query.mock.calls
            .map(([sql]) => sql)
            .filter((sql) => sql.includes('UPDATE') && sql.includes('payment_timing'));
        expect(updates).toHaveLength(0);
    });
});
