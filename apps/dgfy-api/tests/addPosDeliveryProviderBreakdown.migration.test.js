import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { REQUIRED_TENANT_SCHEMA_COLUMNS } from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261002000001-add-pos-delivery-provider-breakdown.cjs');

const COLUMN_NAME = 'delivery_provider_breakdown';

const buildFanoutQueryInterface = ({ tenantDbNames = [], existingColumnsByDb = {} } = {}) => {
    const query = jest.fn((sql, options = {}) => {
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
        return Promise.resolve([[], undefined]);
    });

    return { sequelize: { query } };
};

const alterStatements = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('ALTER TABLE'));

describe('POS delivery provider breakdown migration', () => {
    it('adds the column to the landlord and every active tenant database', async () => {
        const queryInterface = buildFanoutQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });

        await migration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        expect(statements).toHaveLength(3);
        expect(statements.every((sql) => sql.includes(`ADD COLUMN \`${COLUMN_NAME}\` JSON NULL`))).toBe(true);
    });

    it('is idempotent per database when a tenant already has the column', async () => {
        const queryInterface = buildFanoutQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { tenant_a: [COLUMN_NAME] }
        });

        await migration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        expect(statements).toHaveLength(1);
        expect(statements[0]).not.toContain('tenant_a');
    });

    it('drops the column from each database on down()', async () => {
        const queryInterface = buildFanoutQueryInterface({
            tenantDbNames: ['tenant_a'],
            existingColumnsByDb: { landlord_db: [COLUMN_NAME], tenant_a: [COLUMN_NAME] }
        });

        await migration.down(queryInterface);

        const statements = alterStatements(queryInterface).filter((sql) => sql.includes('DROP COLUMN'));
        expect(statements).toHaveLength(2);
        expect(statements.every((sql) => sql.includes(`DROP COLUMN \`${COLUMN_NAME}\``))).toBe(true);
    });

    it('still repairs the current database when the landlord has no tenants table', async () => {
        const query = jest.fn((sql, options = {}) => {
            if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
            if (sql.includes('information_schema.tables')) {
                const [, tableName] = options.replacements || [];
                return Promise.resolve([[{ count: tableName === 'tenants' ? 0 : 1 }]]);
            }
            if (sql.includes('information_schema.columns')) return Promise.resolve([[{ count: 0 }]]);
            return Promise.resolve([[], undefined]);
        });
        const queryInterface = { sequelize: { query } };

        await migration.up(queryInterface);

        expect(alterStatements(queryInterface)).toHaveLength(1);
    });
});

describe('sync-tenant-schemas.js lockstep', () => {
    it('declares the same provider-breakdown column definition for API boot repair', async () => {
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions[COLUMN_NAME]).toBeDefined();

        const queryInterface = buildFanoutQueryInterface();
        await migration.up(queryInterface);
        const migrationStatement = alterStatements(queryInterface)[0]
            .replace(/\s+/g, ' ')
            .split(`ADD COLUMN \`${COLUMN_NAME}\` `)[1]
            .trim();
        const syncStatement = REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions[COLUMN_NAME].sql
            .replace(/\s+/g, ' ')
            .split(`ADD COLUMN \`${COLUMN_NAME}\` `)[1]
            .trim();

        expect(syncStatement).toBe(migrationStatement);
    });
});
