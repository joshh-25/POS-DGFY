import { jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260925000001-add-pos-tax-policy-snapshot.cjs');

const buildQueryInterface = ({ databases = ['landlord_db', 'tenant_one', 'tenant_two'], initialColumns = {} } = {}) => {
    const schema = new Map(databases.map((databaseName) => [
        databaseName,
        {
            pos_transaction_discounts: new Set(Object.keys(initialColumns)),
            ...(databaseName === 'landlord_db' ? { tenants: new Set() } : {})
        }
    ]));
    const executedDdl = [];

    const query = jest.fn(async (sql, options = {}) => {
        if (sql === 'SELECT DATABASE() AS dbName') return [[{ dbName: 'landlord_db' }]];

        if (sql.includes('information_schema.tables')) {
            const [databaseName, tableName] = options.replacements;
            return [[{ count: schema.get(databaseName)?.[tableName] ? 1 : 0 }]];
        }

        if (sql.includes('information_schema.columns')) {
            const [databaseName, tableName, columnName] = options.replacements;
            return [[{ count: schema.get(databaseName)?.[tableName]?.has(columnName) ? 1 : 0 }]];
        }

        if (sql.startsWith('SELECT DISTINCT db_name FROM tenants')) {
            return [[{ db_name: 'tenant_one' }, { db_name: 'tenant_two' }, { db_name: 'tenant_one' }]];
        }

        const ddlMatch = sql.match(/ALTER TABLE `([^`]+)`\.`([^`]+)` (ADD|DROP) COLUMN `([^`]+)`/);
        if (ddlMatch) {
            const [, databaseName, tableName, operation, columnName] = ddlMatch;
            const columns = schema.get(databaseName)?.[tableName];
            if (!columns) throw new Error(`Missing test table: ${databaseName}.${tableName}`);
            if (operation === 'ADD') columns.add(columnName);
            if (operation === 'DROP') columns.delete(columnName);
            executedDdl.push(sql);
            return [[], {}];
        }

        throw new Error(`Unexpected migration query: ${sql}`);
    });

    return {
        sequelize: { query },
        schema,
        executedDdl,
        query
    };
};

describe('POS tax policy snapshot migration', () => {
    test('adds both immutable snapshot columns to landlord and active tenant schemas', async () => {
        const queryInterface = buildQueryInterface();

        await migration.up(queryInterface);

        expect(queryInterface.executedDdl).toHaveLength(6);
        for (const databaseName of ['landlord_db', 'tenant_one', 'tenant_two']) {
            expect(queryInterface.schema.get(databaseName).pos_transaction_discounts)
                .toEqual(new Set(['tax_treatment', 'tax_policy_version']));
        }
        expect(queryInterface.executedDdl).toEqual(expect.arrayContaining([
            expect.stringContaining('`landlord_db`.`pos_transaction_discounts` ADD COLUMN `tax_treatment` VARCHAR(20) NULL'),
            expect.stringContaining('`tenant_one`.`pos_transaction_discounts` ADD COLUMN `tax_policy_version` INT NULL'),
            expect.stringContaining('`tenant_two`.`pos_transaction_discounts` ADD COLUMN `tax_treatment` VARCHAR(20) NULL')
        ]));
    });

    test('is idempotent and removes only its own columns on rollback', async () => {
        const queryInterface = buildQueryInterface({
            initialColumns: {
                tax_treatment: {},
                tax_policy_version: {}
            }
        });

        await migration.up(queryInterface);
        expect(queryInterface.executedDdl).toHaveLength(0);

        await migration.down(queryInterface);
        expect(queryInterface.executedDdl).toHaveLength(6);
        for (const databaseName of ['landlord_db', 'tenant_one', 'tenant_two']) {
            expect(queryInterface.schema.get(databaseName).pos_transaction_discounts).toEqual(new Set());
        }
        expect(queryInterface.executedDdl).toEqual(expect.arrayContaining([
            expect.stringContaining('`landlord_db`.`pos_transaction_discounts` DROP COLUMN `tax_policy_version`'),
            expect.stringContaining('`tenant_two`.`pos_transaction_discounts` DROP COLUMN `tax_treatment`')
        ]));
    });
});
