import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';
import { REQUIRED_TENANT_SCHEMA_COLUMNS, REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS } from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261022000001-add-direct-delivery-courier-fields.cjs');

const OLD_ENUM = "enum('placed','confirmed','preparing','packed','ready_for_pickup','out_for_delivery','completed','cancelled','rejected')";
const NEW_ENUM = OLD_ENUM.replace("'ready_for_pickup'", "'ready_for_rider','ready_for_pickup'");

const buildQueryInterface = ({ tenants = ['tenant_a'], existingColumns = {}, enumValues = OLD_ENUM } = {}) => {
    const query = jest.fn(async (sql, options = {}) => {
        if (sql.includes('SELECT DATABASE()')) return [[{ dbName: 'landlord_db' }]];
        if (sql.includes('information_schema.tables')) return [[{ count: 1 }]];
        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) return [tenants.map((db_name) => ({ db_name }))];
        if (sql.includes('information_schema.columns')) {
            const [database, table, name] = options.replacements || [];
            if (table === 'pos_transactions' && name === 'fulfillment_status') {
                return [[{ columnType: enumValues, isNullable: 'YES', columnDefault: null }]];
            }
            return [existingColumns[`${database}.${table}.${name}`]
                ? [{ columnType: 'varchar(120)', isNullable: 'YES', columnDefault: null }]
                : []];
        }
        return [[]];
    });
    return { sequelize: { query } };
};

const alterStatements = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('ALTER TABLE'));

describe('direct delivery tenant schema migration (Phase 527, #2667)', () => {
    it('adds courier fields and widens fulfillment_status for landlord and active tenants', async () => {
        const queryInterface = buildQueryInterface();

        await migration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        expect(statements).toHaveLength(8);
        expect(statements.filter((sql) => sql.includes('ADD COLUMN `courier_'))).toHaveLength(6);
        expect(statements.filter((sql) => sql.includes('MODIFY COLUMN `fulfillment_status`'))).toHaveLength(2);
        expect(statements.every((sql) => sql.includes('`landlord_db`') || sql.includes('`tenant_a`'))).toBe(true);
        expect(statements.filter((sql) => sql.includes('MODIFY COLUMN')).every((sql) => sql.includes("'ready_for_rider'"))).toBe(true);
    });

    it('skips courier columns and ENUM values that are already present', async () => {
        const existingColumns = {};
        for (const database of ['landlord_db', 'tenant_a']) {
            for (const name of ['courier_service', 'courier_service_name', 'courier_reference']) {
                existingColumns[`${database}.delivery_jobs.${name}`] = true;
            }
        }
        const queryInterface = buildQueryInterface({ existingColumns, enumValues: NEW_ENUM });

        await migration.up(queryInterface);

        expect(alterStatements(queryInterface)).toHaveLength(0);
    });

    it('keeps additive fields and the widened ENUM on rollback', async () => {
        const query = jest.fn();

        await migration.down({ sequelize: { query } });

        expect(query).not.toHaveBeenCalled();
    });

    it('matches the tenant boot-repair registry', () => {
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_jobs.courier_service.sql)
            .toContain('ADD COLUMN `courier_service` VARCHAR(40) NULL');
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_jobs.courier_service_name.sql)
            .toContain('ADD COLUMN `courier_service_name` VARCHAR(120) NULL');
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_jobs.courier_reference.sql)
            .toContain('ADD COLUMN `courier_reference` VARCHAR(120) NULL');
        expect(REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS.pos_transactions.fulfillment_status.enumValues)
            .toContain('ready_for_rider');
    });
});
