import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { REQUIRED_TENANT_SCHEMA_TABLES } from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260913000001-create-delivery-completion-evidence.cjs');

const buildQueryInterface = ({ existingTables = new Set(), tenantDbNames = ['tenant_a'] } = {}) => {
    const query = jest.fn((sql, options = {}) => {
        if (sql.includes('SELECT DATABASE()')) return Promise.resolve([[{ dbName: 'landlord_db' }]]);
        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) {
            return Promise.resolve([tenantDbNames.map((dbName) => ({ db_name: dbName }))]);
        }
        if (sql.includes('information_schema.tables')) {
            const [databaseName, tableName] = options.replacements || [];
            const baseTable = ['tenants', 'delivery_jobs', 'users'].includes(tableName);
            const exists = baseTable || existingTables.has(`${databaseName}:${tableName}`);
            return Promise.resolve([[{ count: exists ? 1 : 0 }]]);
        }
        return Promise.resolve([[], undefined]);
    });
    return { sequelize: { query } };
};

const ddlStatements = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('CREATE TABLE') || sql.includes('DROP TABLE'));

describe('delivery-completion evidence tenant migration', () => {
    it('creates both tables for the landlord and active tenant databases', async () => {
        const queryInterface = buildQueryInterface();

        await migration.up(queryInterface);

        const statements = ddlStatements(queryInterface);
        expect(statements).toHaveLength(4);
        expect(statements.filter((sql) => sql.includes('delivery_completion_evidence`'))).toHaveLength(4);
        expect(statements.filter((sql) => sql.includes('delivery_completion_evidence_images'))).toHaveLength(2);
        expect(statements.every((sql) => sql.includes('ON DELETE CASCADE') || sql.includes('ON DELETE SET NULL'))).toBe(true);
    });

    it('drops child before parent across both databases', async () => {
        const queryInterface = buildQueryInterface({
            existingTables: new Set([
                'landlord_db:delivery_completion_evidence',
                'landlord_db:delivery_completion_evidence_images',
                'tenant_a:delivery_completion_evidence',
                'tenant_a:delivery_completion_evidence_images'
            ])
        });

        await migration.down(queryInterface);

        const statements = ddlStatements(queryInterface).filter((sql) => sql.includes('DROP TABLE'));
        expect(statements).toHaveLength(4);
        expect(statements[0]).toContain('delivery_completion_evidence_images');
        expect(statements[1]).toContain('delivery_completion_evidence`');
        expect(statements[2]).toContain('delivery_completion_evidence_images');
        expect(statements[3]).toContain('delivery_completion_evidence`');
    });

    it('keeps the repair registry in lockstep with both new table names', () => {
        expect(REQUIRED_TENANT_SCHEMA_TABLES.delivery_completion_evidence.sql).toContain('delivery_completion_evidence');
        expect(REQUIRED_TENANT_SCHEMA_TABLES.delivery_completion_evidence_images.sql).toContain('delivery_completion_evidence_images');
    });
});
