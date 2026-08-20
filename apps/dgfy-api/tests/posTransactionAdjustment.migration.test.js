import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260819000001-create-pos-transaction-adjustments.cjs');

const Sequelize = {
    INTEGER: 'INTEGER',
    DATE: 'DATE',
    JSON: 'JSON',
    STRING: jest.fn((length) => `STRING(${length})`),
    DECIMAL: jest.fn((precision, scale) => `DECIMAL(${precision},${scale})`),
    ENUM: jest.fn((...values) => ({ type: 'ENUM', values })),
    literal: jest.fn((value) => `literal(${value})`)
};

describe('POS transaction adjustment migration', () => {
    it('creates the tenant-local adjustment table with accountability foreign keys and indexes', async () => {
        const queryInterface = {
            showAllTables: jest.fn().mockResolvedValue([]),
            createTable: jest.fn().mockResolvedValue(undefined),
            addIndex: jest.fn().mockResolvedValue(undefined)
        };

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.createTable).toHaveBeenCalledTimes(1);
        const [tableName, columns] = queryInterface.createTable.mock.calls[0];
        expect(tableName).toBe('pos_transaction_adjustments');
        expect(columns.pos_transaction_id).toEqual(expect.objectContaining({
            allowNull: false,
            references: { model: 'pos_transactions', key: 'pos_transaction_id' },
            onDelete: 'RESTRICT'
        }));
        expect(columns.original_shift_id).toEqual(expect.objectContaining({
            allowNull: true,
            references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
            onDelete: 'SET NULL'
        }));
        expect(columns.actor_user_id).toEqual(expect.objectContaining({
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onDelete: 'RESTRICT'
        }));
        expect(columns.cash_drawer_event_id).toEqual(expect.objectContaining({
            allowNull: true,
            references: { model: 'pos_cash_drawer_events', key: 'pos_cash_drawer_event_id' },
            onDelete: 'SET NULL'
        }));
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'pos_transaction_adjustments',
            ['pos_transaction_id', 'idempotency_key'],
            { name: 'uq_pos_transaction_adjustments_transaction_idempotency', unique: true }
        );
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'pos_transaction_adjustments',
            ['provider_event_id'],
            { name: 'uq_pos_transaction_adjustments_provider_event_id', unique: true }
        );
        expect(queryInterface.addIndex).toHaveBeenCalledTimes(7);
    });

    it('is idempotent when the table already exists', async () => {
        const queryInterface = {
            showAllTables: jest.fn().mockResolvedValue(['pos_transaction_adjustments']),
            createTable: jest.fn(),
            addIndex: jest.fn()
        };

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.createTable).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });
});
