import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261026000002-add-pos-taxpayer-type-setting.cjs');

const buildQueryInterface = ({ existingSettings = {} } = {}) => {
    const tables = new Map([
        ['landlord_db', new Set(['tenants', 'system_settings'])],
        ['tenant_one', new Set(['system_settings'])],
        ['tenant_two', new Set(['system_settings'])]
    ]);
    const settings = new Map(Object.entries(existingSettings).map(([databaseName, values]) => [
        databaseName,
        new Set(values)
    ]));
    const inserted = [];
    const query = jest.fn(async (sql, options = {}) => {
        if (sql === 'SELECT DATABASE() AS dbName') return [[{ dbName: 'landlord_db' }]];

        if (sql.includes('information_schema.tables')) {
            const [databaseName, tableName] = options.replacements;
            return [[{ count: tables.get(databaseName)?.has(tableName) ? 1 : 0 }]];
        }

        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) {
            return [[{ db_name: 'tenant_one' }, { db_name: 'tenant_two' }, { db_name: 'tenant_one' }]];
        }

        const selectMatch = sql.match(/SELECT setting_key FROM `([^`]+)`\.`system_settings`/);
        if (selectMatch) {
            const databaseName = selectMatch[1];
            return [[...(settings.get(databaseName)?.has('pos_taxpayer_type') ? [{ setting_key: 'pos_taxpayer_type' }] : [])]];
        }

        const insertMatch = sql.match(/INSERT INTO `([^`]+)`\.`system_settings`/);
        if (insertMatch) {
            const databaseName = insertMatch[1];
            settings.set(databaseName, settings.get(databaseName) || new Set());
            settings.get(databaseName).add('pos_taxpayer_type');
            inserted.push(databaseName);
            return [[], {}];
        }

        throw new Error(`Unexpected migration query: ${sql}`);
    });

    return { sequelize: { query }, inserted, settings, query };
};

describe('POS taxpayer type migration', () => {
    it('seeds the setting in landlord and active tenant schemas without overwriting existing data', async () => {
        const queryInterface = buildQueryInterface({
            existingSettings: { tenant_two: ['pos_taxpayer_type'] }
        });

        await migration.up(queryInterface);

        expect(queryInterface.inserted).toEqual(['landlord_db', 'tenant_one']);
        expect(queryInterface.settings.get('tenant_two')).toEqual(new Set(['pos_taxpayer_type']));
    });

    it('is idempotent and its rollback preserves the setting data', async () => {
        const queryInterface = buildQueryInterface();

        await migration.up(queryInterface);
        await migration.up(queryInterface);
        await migration.down(queryInterface);

        expect(queryInterface.inserted).toEqual(['landlord_db', 'tenant_one', 'tenant_two']);
        expect(queryInterface.settings.get('landlord_db')).toEqual(new Set(['pos_taxpayer_type']));
        expect(queryInterface.settings.get('tenant_one')).toEqual(new Set(['pos_taxpayer_type']));
        expect(queryInterface.settings.get('tenant_two')).toEqual(new Set(['pos_taxpayer_type']));
    });
});
