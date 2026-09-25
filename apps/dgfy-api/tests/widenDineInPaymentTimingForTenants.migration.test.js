import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260924000002-widen-dine-in-payment-timing-for-tenants.cjs');

const buildQueryInterface = ({ tenantDbNames = [], columnsByDb = {}, dineInRowsByDb = {} } = {}) => {
    const query = jest.fn(async (sql, options = {}) => {
        if (sql.includes('SELECT DATABASE()')) return [[{ dbName: 'landlord_db' }]];
        if (sql.includes('information_schema.tables')) {
            return [[{ count: 1 }]];
        }
        if (sql.includes("SELECT DISTINCT db_name FROM tenants")) {
            return [tenantDbNames.map((dbName) => ({ db_name: dbName }))];
        }
        if (sql.includes('information_schema.columns')) {
            const databaseName = options.replacements?.[0];
            const column = columnsByDb[databaseName];
            return [column ? [column] : []];
        }
        if (sql.includes('SELECT COUNT(*) AS count') && sql.includes("payment_timing` = 'on_dine_in'")) {
            const match = sql.match(/`([^`]+)`\.`pos_transactions`/);
            const databaseName = match?.[1];
            return [[{ count: dineInRowsByDb[databaseName] || 0 }]];
        }
        return [[]];
    });

    return { sequelize: { query } };
};

const alterStatements = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('ALTER TABLE'));

describe('tenant Dine-in payment timing migration', () => {
    it('widens every landlord and active tenant enum', async () => {
        const oldColumn = {
            COLUMN_TYPE: "enum('upfront','on_pickup','on_delivery')",
            IS_NULLABLE: 'NO',
            COLUMN_DEFAULT: 'upfront'
        };
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a', 'tenant_b'],
            columnsByDb: {
                landlord_db: oldColumn,
                tenant_a: oldColumn,
                tenant_b: oldColumn
            }
        });

        await migration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        expect(statements).toHaveLength(3);
        expect(statements.every((sql) => sql.includes("'on_dine_in'"))).toBe(true);
    });

    it('is idempotent when every database already has the canonical enum', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: ['tenant_a'],
            columnsByDb: {
                landlord_db: {
                    COLUMN_TYPE: "enum('upfront','on_pickup','on_delivery','on_dine_in')",
                    IS_NULLABLE: 'NO',
                    COLUMN_DEFAULT: 'upfront'
                },
                tenant_a: {
                    COLUMN_TYPE: "enum('upfront','on_pickup','on_delivery','on_dine_in')",
                    IS_NULLABLE: 'NO',
                    COLUMN_DEFAULT: 'upfront'
                }
            }
        });

        await migration.up(queryInterface);

        expect(alterStatements(queryInterface)).toHaveLength(0);
    });

    it('adds the column when a tenant schema predates payment timing entirely', async () => {
        const queryInterface = buildQueryInterface({
            tenantDbNames: [],
            columnsByDb: { landlord_db: null }
        });

        await migration.up(queryInterface);

        const [statement] = alterStatements(queryInterface);
        expect(statement).toContain('ADD COLUMN `payment_timing`');
        expect(statement).toContain("'on_dine_in'");
    });

    it('refuses to narrow the enum while Dine-in rows still exist', async () => {
        const queryInterface = buildQueryInterface({
            columnsByDb: {
                landlord_db: {
                    COLUMN_TYPE: "enum('upfront','on_pickup','on_delivery','on_dine_in')",
                    IS_NULLABLE: 'NO',
                    COLUMN_DEFAULT: 'upfront'
                }
            },
            dineInRowsByDb: { landlord_db: 1 }
        });

        await expect(migration.down(queryInterface)).rejects.toThrow(/contains on_dine_in rows/);
    });
});
