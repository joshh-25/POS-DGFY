import { jest } from '@jest/globals';
import { MetaSequelizeStorage } from '../src/metadata/storage.js';
import { SCHEMA_MIGRATIONS_TABLE } from '../src/metadata/bootstrap.js';

function buildSequelize({ bulkInsert, bulkDelete, query }) {
    return {
        getQueryInterface: () => ({ bulkInsert, bulkDelete }),
        query
    };
}

describe('MetaSequelizeStorage', () => {
    test('logMigration calls bulkInsert with the exact name and an executed_at Date instance', async () => {
        const bulkInsert = jest.fn().mockResolvedValue();
        const sequelize = buildSequelize({ bulkInsert, bulkDelete: jest.fn(), query: jest.fn() });
        const storage = new MetaSequelizeStorage({ sequelize });

        await storage.logMigration({ name: '00000000000000-runner-contract-placeholder' });

        expect(bulkInsert).toHaveBeenCalledTimes(1);
        const [tableName, rows] = bulkInsert.mock.calls[0];
        expect(tableName).toBe(SCHEMA_MIGRATIONS_TABLE);
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('00000000000000-runner-contract-placeholder');
        expect(rows[0].executed_at).toBeInstanceOf(Date);
    });

    test('unlogMigration calls bulkDelete with { name }', async () => {
        const bulkDelete = jest.fn().mockResolvedValue();
        const sequelize = buildSequelize({ bulkInsert: jest.fn(), bulkDelete, query: jest.fn() });
        const storage = new MetaSequelizeStorage({ sequelize });

        await storage.unlogMigration({ name: '00000000000000-runner-contract-placeholder' });

        expect(bulkDelete).toHaveBeenCalledTimes(1);
        expect(bulkDelete).toHaveBeenCalledWith(
            SCHEMA_MIGRATIONS_TABLE,
            { name: '00000000000000-runner-contract-placeholder' }
        );
    });

    test('executed() resolves to a plain array of migration-name strings', async () => {
        const query = jest.fn().mockResolvedValue([[{ name: 'a' }, { name: 'b' }], []]);
        const sequelize = buildSequelize({ bulkInsert: jest.fn(), bulkDelete: jest.fn(), query });
        const storage = new MetaSequelizeStorage({ sequelize });

        const result = await storage.executed();

        expect(result).toEqual(['a', 'b']);
    });

    test('a custom tableName option overrides the SCHEMA_MIGRATIONS_TABLE default', async () => {
        const bulkInsert = jest.fn().mockResolvedValue();
        const sequelize = buildSequelize({ bulkInsert, bulkDelete: jest.fn(), query: jest.fn() });
        const storage = new MetaSequelizeStorage({ sequelize, tableName: 'custom_migrations' });

        await storage.logMigration({ name: 'x' });

        expect(bulkInsert.mock.calls[0][0]).toBe('custom_migrations');
    });
});
