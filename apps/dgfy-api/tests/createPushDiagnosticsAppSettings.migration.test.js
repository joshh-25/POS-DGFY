import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261019000003-create-push-diagnostics-app-settings.cjs');
const Sequelize = {
    STRING: (length) => ({ type: 'STRING', length }),
    BOOLEAN: 'BOOLEAN', UUID: 'UUID', DATE: 'DATE',
    literal: (sql) => ({ literal: sql })
};

const buildQueryInterface = (tables = []) => ({
    showAllTables: jest.fn().mockResolvedValue(tables),
    createTable: jest.fn().mockResolvedValue(undefined),
    dropTable: jest.fn().mockResolvedValue(undefined)
});

describe('create push diagnostics app settings migration', () => {
    it('creates the landlord app setting table with default-off state and nullable admin attribution', async () => {
        const queryInterface = buildQueryInterface();
        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.createTable).toHaveBeenCalledTimes(1);
        const [table, columns] = queryInterface.createTable.mock.calls[0];
        expect(table).toBe('push_diagnostics_app_settings');
        expect(columns).toMatchObject({
            app: { type: { type: 'STRING', length: 40 }, allowNull: false, primaryKey: true },
            enabled: { type: 'BOOLEAN', allowNull: false, defaultValue: false },
            updated_by_admin_id: {
                type: 'UUID', allowNull: true,
                references: { model: 'platform_admin_users', key: 'id' },
                onDelete: 'SET NULL'
            },
            created_at: { type: 'DATE', allowNull: false },
            updated_at: { type: 'DATE', allowNull: false }
        });
    });

    it('is idempotent and drops only its own table', async () => {
        const existing = buildQueryInterface(['push_diagnostics_app_settings']);
        await migration.up(existing, Sequelize);
        expect(existing.createTable).not.toHaveBeenCalled();

        await migration.down(existing);
        expect(existing.dropTable).toHaveBeenCalledWith('push_diagnostics_app_settings');

        const absent = buildQueryInterface();
        await migration.down(absent);
        expect(absent.dropTable).not.toHaveBeenCalled();
    });
});
