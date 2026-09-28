import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import {
    REQUIRED_TENANT_SCHEMA_INDEXES,
    REQUIRED_TENANT_SCHEMA_TABLES
} from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260914000004-create-pos-terminal-device-enrollment.cjs');

const buildQueryInterface = ({ tenantDbNames = [], tables = null } = {}) => {
    const query = jest.fn(async (sql, options = {}) => {
        if (sql.includes('SELECT DATABASE()')) return [[{ dbName: 'landlord_db' }]];
        if (sql.includes('information_schema.tables')) {
            const [, tableName] = options.replacements || [];
            const databaseName = options.replacements?.[0];
            const configured = tables?.[databaseName];
            return [[{ count: configured ? (configured.includes(tableName) ? 1 : 0) : 1 }]];
        }
        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) {
            return [tenantDbNames.map((dbName) => ({ db_name: dbName }))];
        }
        return [[], undefined];
    });
    return { sequelize: { query } };
};

const ddlStatements = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => /CREATE TABLE|DROP TABLE/.test(sql));

describe('20260914000004 POS terminal device enrollment migration', () => {
    it('creates all tenant-local tables for the landlord and every active tenant database', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a', 'tenant_b'] });
        await migration.up(queryInterface);

        const statements = ddlStatements(queryInterface).filter((sql) => sql.includes('CREATE TABLE'));
        expect(statements).toHaveLength(9);
        expect(statements.filter((sql) => sql.includes('landlord_db'))).toHaveLength(3);
        expect(statements.filter((sql) => sql.includes('tenant_a'))).toHaveLength(3);
        expect(statements.every((sql) => sql.includes('CREATE TABLE IF NOT EXISTS'))).toBe(true);
        expect(statements.find((sql) => sql.includes('pos_terminal_device_enrollments'))).toContain('UNIQUE KEY `uq_pos_terminal_device_enrollments_active_terminal`');
        expect(statements.find((sql) => sql.includes('pos_terminal_device_challenges'))).toContain('`request_method` VARCHAR(12) NOT NULL DEFAULT \'POST\'');
    });

    it('is safe to rerun and rejects unsafe tenant database identifiers', async () => {
        const queryInterface = buildQueryInterface({ tenantDbNames: ['tenant_a'] });
        await expect(migration.up(queryInterface)).resolves.toBeUndefined();
        await expect(migration.up(buildQueryInterface({ tenantDbNames: ['tenant`bad'] })))
            .rejects.toThrow('Unsafe database identifier');
    });

    it('drops existing tables in reverse dependency order and is idempotent when absent', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            tables: {
                landlord_db: [
                    'tenants',
                    'pos_terminal_device_enrollments',
                    'pos_terminal_device_activations',
                    'pos_terminal_device_challenges'
                ],
                tenant_a: [
                    'pos_terminal_device_enrollments',
                    'pos_terminal_device_activations',
                    'pos_terminal_device_challenges'
                ]
            }
        });
        await migration.down(queryInterface);
        const drops = ddlStatements(queryInterface).filter((sql) => sql.includes('DROP TABLE'));
        expect(drops).toHaveLength(6);
        expect(drops[0]).toContain('pos_terminal_device_challenges');
        expect(drops[1]).toContain('pos_terminal_device_activations');
        expect(drops[2]).toContain('pos_terminal_device_enrollments');

        const absent = buildQueryInterface({ tenantDbNames: [], tables: { landlord_db: [] } });
        await expect(migration.down(absent)).resolves.toBeUndefined();
        expect(ddlStatements(absent).filter((sql) => sql.includes('DROP TABLE'))).toHaveLength(0);
    });

    it('keeps tenant repair tables and indexes in lockstep with the migration contract', () => {
        expect(REQUIRED_TENANT_SCHEMA_TABLES.pos_terminal_device_enrollments.sql)
            .toContain('`active_terminal_key`');
        expect(REQUIRED_TENANT_SCHEMA_TABLES.pos_terminal_device_activations.sql)
            .toContain('`activation_hash`');
        expect(REQUIRED_TENANT_SCHEMA_TABLES.pos_terminal_device_challenges.sql)
            .toContain('`request_method` varchar(12) NOT NULL DEFAULT \'POST\'');
        expect(REQUIRED_TENANT_SCHEMA_INDEXES.pos_terminal_device_enrollments.uq_pos_terminal_device_enrollments_active_terminal.sql)
            .toContain('(`active_terminal_key`)');
        expect(REQUIRED_TENANT_SCHEMA_INDEXES.pos_terminal_device_enrollments.uq_pos_terminal_device_enrollments_active_device.sql)
            .toContain('(`active_device_key`)');
        expect(REQUIRED_TENANT_SCHEMA_INDEXES.pos_terminal_device_challenges.idx_pos_terminal_device_challenges_consumed_at.sql)
            .toContain('(`consumed_at`)');
    });
});
