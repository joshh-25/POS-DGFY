import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261017000001-create-push-device-tokens-and-delivery-logs.cjs');
const Sequelize = {
    ENUM: (...values) => ({ type: 'ENUM', values }),
    UUID: 'UUID', UUIDV4: 'UUIDV4',
    STRING: (length) => ({ type: 'STRING', length }),
    INTEGER: { UNSIGNED: 'INTEGER_UNSIGNED' }, BOOLEAN: 'BOOLEAN', DATE: 'DATE',
    literal: (sql) => ({ literal: sql }), QueryTypes: { SELECT: 'SELECT' }
};
const buildQueryInterface = ({ tables = [], indexes = [], columns = {} } = {}) => ({
    showAllTables: jest.fn().mockResolvedValue(tables),
    createTable: jest.fn().mockResolvedValue(undefined),
    dropTable: jest.fn().mockResolvedValue(undefined),
    showIndex: jest.fn().mockResolvedValue(indexes),
    describeTable: jest.fn().mockResolvedValue(columns),
    addIndex: jest.fn().mockResolvedValue(undefined),
    sequelize: {
        getDialect: () => 'mysql',
        query: jest.fn().mockResolvedValue([])
    }
});

describe('create push token and delivery log migration', () => {
    it('creates landlord tables, binary token matching, active-owner uniqueness, and exact-one-owner check', async () => {
        const queryInterface = buildQueryInterface();
        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.createTable).toHaveBeenCalledWith('push_device_tokens', expect.objectContaining({
            token: expect.objectContaining({ allowNull: false }),
            dgfy_account_id: expect.objectContaining({ allowNull: true }),
            guest_pos_transaction_id: expect.objectContaining({ allowNull: true })
        }));
        expect(queryInterface.createTable).toHaveBeenCalledWith('push_delivery_logs', expect.objectContaining({
            dedupe_key: expect.objectContaining({ unique: true }),
            token_hash: expect.objectContaining({ allowNull: false })
        }));
        expect(queryInterface.createTable.mock.calls[1][1]).not.toHaveProperty('message_body');
        expect(queryInterface.sequelize.query.mock.calls.map(([sql]) => sql).join('\n'))
            .toMatch(/COLLATE ascii_bin[\s\S]*active_token[\s\S]*chk_push_device_tokens_owner/);
        expect(queryInterface.addIndex.mock.calls.map((call) => call[2].name)).toEqual(expect.arrayContaining([
            'uq_push_device_tokens_active_token', 'idx_push_delivery_logs_status_sent_at', 'idx_push_delivery_logs_receipt_poll'
        ]));
    });

    it('does not recreate existing tables and drops both tables on down', async () => {
        const queryInterface = buildQueryInterface({
            tables: ['push_device_tokens', 'push_delivery_logs'],
            indexes: [{ name: 'uq_push_device_tokens_active_token' }],
            columns: { active_token: { type: 'VARCHAR(255)' } }
        });
        await migration.up(queryInterface, Sequelize);
        expect(queryInterface.createTable).not.toHaveBeenCalled();
        await migration.down(queryInterface);
        expect(queryInterface.dropTable).toHaveBeenNthCalledWith(1, 'push_delivery_logs');
        expect(queryInterface.dropTable).toHaveBeenNthCalledWith(2, 'push_device_tokens');
    });
});
