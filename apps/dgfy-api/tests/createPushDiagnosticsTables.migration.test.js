import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261019000001-create-push-diagnostics-tables.cjs');
const Sequelize = {
    ENUM: (...values) => ({ type: 'ENUM', values }),
    UUID: 'UUID', UUIDV4: 'UUIDV4',
    STRING: (length) => ({ type: 'STRING', length }),
    INTEGER: { UNSIGNED: 'INTEGER_UNSIGNED' }, DATE: 'DATE',
    literal: (sql) => ({ literal: sql })
};
const buildQueryInterface = ({ tables = [], indexes = [], columns = {} } = {}) => ({
    showAllTables: jest.fn().mockResolvedValue(tables),
    createTable: jest.fn().mockResolvedValue(undefined),
    dropTable: jest.fn().mockResolvedValue(undefined),
    showIndex: jest.fn().mockResolvedValue(indexes),
    describeTable: jest.fn().mockResolvedValue(columns),
    addIndex: jest.fn().mockResolvedValue(undefined),
    sequelize: { getDialect: () => 'mysql', query: jest.fn().mockResolvedValue([]) }
});

describe('create push diagnostics tables migration', () => {
    it('creates the three landlord tables with no token or message-content columns on events', async () => {
        const queryInterface = buildQueryInterface();
        await migration.up(queryInterface, Sequelize);

        const created = Object.fromEntries(queryInterface.createTable.mock.calls);
        expect(Object.keys(created).sort()).toEqual(['push_diagnostic_devices', 'push_diagnostic_enrollment_codes', 'push_dispatch_events']);
        expect(Object.keys(created.push_dispatch_events)).not.toEqual(expect.arrayContaining(['token', 'token_hash', 'message_body']));
        expect(created.push_diagnostic_enrollment_codes).toHaveProperty('code_hash');
        expect(created.push_diagnostic_enrollment_codes).not.toHaveProperty('code');
        expect(created.push_diagnostic_devices.enrolled_by_admin_id).toMatchObject({ allowNull: false });
    });

    it('keeps the diagnostic token case-sensitive and unique among active devices', async () => {
        const queryInterface = buildQueryInterface();
        await migration.up(queryInterface, Sequelize);
        expect(queryInterface.sequelize.query.mock.calls.map(([sql]) => sql).join('\n'))
            .toMatch(/push_diagnostic_devices[\s\S]*COLLATE ascii_bin[\s\S]*active_token/);
        expect(queryInterface.addIndex.mock.calls.map((call) => call[2].name)).toEqual(expect.arrayContaining([
            'uq_push_diagnostic_devices_active_token', 'idx_push_dispatch_events_created_at', 'idx_push_diagnostic_enrollment_codes_expiry'
        ]));
    });

    it('is idempotent and never touches the existing push tables', async () => {
        const queryInterface = buildQueryInterface({
            tables: ['push_dispatch_events', 'push_diagnostic_devices', 'push_diagnostic_enrollment_codes'],
            indexes: [{ name: 'uq_push_diagnostic_devices_active_token' }],
            columns: { active_token: { type: 'VARCHAR(255)' } }
        });
        await migration.up(queryInterface, Sequelize);
        expect(queryInterface.createTable).not.toHaveBeenCalled();

        await migration.down(queryInterface);
        const dropped = queryInterface.dropTable.mock.calls.map(([name]) => name);
        expect(dropped).toEqual(['push_diagnostic_enrollment_codes', 'push_diagnostic_devices', 'push_dispatch_events']);
        expect(dropped).not.toEqual(expect.arrayContaining(['push_device_tokens', 'push_delivery_logs']));
    });
});
