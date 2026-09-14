import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';
import { REQUIRED_TENANT_SCHEMA_TABLES } from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260914000002-create-delivery-run-remittances.cjs');

const tableNames = new Set([
    'tenants',
    'delivery_runs',
    'tenant_locations',
    'users',
    'pos_transactions',
    'delivery_personnel'
]);

const buildQueryInterface = ({ existingTables = new Set() } = {}) => {
    const query = jest.fn(async (sql, options = {}) => {
        if (sql.includes('SELECT DATABASE()')) return [[{ dbName: 'landlord_db' }]];
        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) return [[{ db_name: 'tenant_a' }]];
        if (sql.includes('information_schema.tables')) {
            const [databaseName, tableName] = options.replacements || [];
            const exists = tableNames.has(tableName) || existingTables.has(`${databaseName}:${tableName}`);
            return [[{ count: exists ? 1 : 0 }]];
        }
        return [[], undefined];
    });
    return { sequelize: { query } };
};

const ddlStatements = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('CREATE TABLE') || sql.includes('DROP TABLE'));

const createTableStatementsFor = (statements, tableName) => statements.filter((sql) => {
    const match = sql.match(/CREATE TABLE `[^`]+`\.`([^`]+)` \(/);
    return match?.[1] === tableName;
});

describe('delivery-run remittance tenant migration', () => {
    it('creates the three tables in the landlord and active tenant schemas in dependency order', async () => {
        const queryInterface = buildQueryInterface();

        await migration.up(queryInterface);

        const statements = ddlStatements(queryInterface);
        expect(statements).toHaveLength(6);
        expect(createTableStatementsFor(statements, 'delivery_run_remittances')).toHaveLength(2);
        expect(createTableStatementsFor(statements, 'delivery_run_remittance_allocations')).toHaveLength(2);
        expect(createTableStatementsFor(statements, 'delivery_run_remittance_variances')).toHaveLength(2);
        expect(statements[0]).toContain('CREATE TABLE `landlord_db`.`delivery_run_remittances`');
        expect(statements[1]).toContain('CREATE TABLE `landlord_db`.`delivery_run_remittance_allocations`');
        expect(statements[2]).toContain('CREATE TABLE `landlord_db`.`delivery_run_remittance_variances`');
        expect(statements.every((sql) => sql.includes('ON DELETE RESTRICT'))).toBe(true);
    });

    it('is idempotent when all remittance tables already exist', async () => {
        const queryInterface = buildQueryInterface({
            existingTables: new Set([
                'landlord_db:delivery_run_remittances',
                'landlord_db:delivery_run_remittance_allocations',
                'landlord_db:delivery_run_remittance_variances',
                'tenant_a:delivery_run_remittances',
                'tenant_a:delivery_run_remittance_allocations',
                'tenant_a:delivery_run_remittance_variances'
            ])
        });

        await migration.up(queryInterface);

        expect(ddlStatements(queryInterface)).toHaveLength(0);
    });

    it('drops variance, allocation, then remittance tables for every database', async () => {
        const queryInterface = buildQueryInterface({
            existingTables: new Set([
                'landlord_db:delivery_run_remittances',
                'landlord_db:delivery_run_remittance_allocations',
                'landlord_db:delivery_run_remittance_variances',
                'tenant_a:delivery_run_remittances',
                'tenant_a:delivery_run_remittance_allocations',
                'tenant_a:delivery_run_remittance_variances'
            ])
        });

        await migration.down(queryInterface);

        const statements = ddlStatements(queryInterface).filter((sql) => sql.includes('DROP TABLE'));
        expect(statements).toHaveLength(6);
        expect(statements[0]).toContain('delivery_run_remittance_variances');
        expect(statements[1]).toContain('delivery_run_remittance_allocations');
        expect(statements[2]).toContain('delivery_run_remittances');
        expect(statements[3]).toContain('delivery_run_remittance_variances');
    });

    it('keeps all three tables in fresh-tenant provisioning order', () => {
        expect(REQUIRED_TENANT_SCHEMA_TABLES.delivery_run_remittances.sql).toContain('delivery_run_remittances');
        expect(REQUIRED_TENANT_SCHEMA_TABLES.delivery_run_remittance_allocations.sql).toContain('delivery_run_remittances');
        expect(REQUIRED_TENANT_SCHEMA_TABLES.delivery_run_remittance_variances.sql).toContain('delivery_run_remittance_allocations');
    });
});
