import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260824000003-add-pos-cashier-pin-and-operator-authority.cjs');

const Sequelize = {
    STRING: (length) => `VARCHAR(${length})`,
    INTEGER: 'INTEGER',
    DATE: 'DATETIME'
};

const buildQueryInterface = ({ describedTables = {}, indexes = {} } = {}) => ({
    showAllTables: jest.fn().mockResolvedValue([
        'users',
        'pos_terminal_operator_sessions'
    ]),
    describeTable: jest.fn((tableName) => Promise.resolve(describedTables[tableName] || {})),
    showIndex: jest.fn((tableName) => Promise.resolve(indexes[tableName] || [])),
    addColumn: jest.fn().mockResolvedValue(undefined),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined),
    removeIndex: jest.fn().mockResolvedValue(undefined)
});

describe('POS operator authority migration', () => {
    let queryInterface;

    beforeEach(() => {
        queryInterface = buildQueryInterface();
    });

    it('adds dedicated cashier PIN state and operator authority persistence', async () => {
        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn.mock.calls).toEqual([
            ['users', 'pos_cashier_pin_hash', { type: 'VARCHAR(255)', allowNull: true, comment: 'Dedicated POS cashier takeover PIN bcrypt hash' }],
            ['users', 'pos_cashier_pin_failed_attempts', { type: 'INTEGER', allowNull: false, defaultValue: 0, comment: 'Failed dedicated cashier PIN attempts since last successful verification' }],
            ['users', 'pos_cashier_pin_locked_until', { type: 'DATETIME', allowNull: true, comment: 'Dedicated cashier PIN lockout expiry' }],
            ['users', 'pos_cashier_pin_changed_at', { type: 'DATETIME', allowNull: true, comment: 'Dedicated cashier PIN last enrollment/reset timestamp' }],
            ['pos_terminal_operator_sessions', 'authority_token_hash', { type: 'VARCHAR(64)', allowNull: true, comment: 'SHA-256 hash of the short-lived HttpOnly operator authority token' }],
            ['pos_terminal_operator_sessions', 'authority_expires_at', { type: 'DATETIME', allowNull: true }],
            ['pos_terminal_operator_sessions', 'revoked_at', { type: 'DATETIME', allowNull: true }],
            ['pos_terminal_operator_sessions', 'revoked_reason', { type: 'VARCHAR(80)', allowNull: true }],
            ['pos_terminal_operator_sessions', 'idempotency_key', { type: 'VARCHAR(120)', allowNull: true }]
        ]);
        expect(queryInterface.addIndex.mock.calls).toEqual([
            ['pos_terminal_operator_sessions', ['authority_token_hash'], { name: 'idx_pos_terminal_operator_sessions_authority_token_hash' }],
            ['pos_terminal_operator_sessions', ['pos_terminal_shift_id', 'idempotency_key'], { name: 'uq_pos_terminal_operator_sessions_shift_idempotency', unique: true }]
        ]);
    });

    it('is safe to rerun when all fields and indexes already exist', async () => {
        queryInterface = buildQueryInterface({
            describedTables: {
                users: {
                    pos_cashier_pin_hash: {},
                    pos_cashier_pin_failed_attempts: {},
                    pos_cashier_pin_locked_until: {},
                    pos_cashier_pin_changed_at: {}
                },
                pos_terminal_operator_sessions: {
                    authority_token_hash: {},
                    authority_expires_at: {},
                    revoked_at: {},
                    revoked_reason: {},
                    idempotency_key: {}
                }
            },
            indexes: {
                pos_terminal_operator_sessions: [
                    { name: 'idx_pos_terminal_operator_sessions_authority_token_hash' },
                    { name: 'uq_pos_terminal_operator_sessions_shift_idempotency' }
                ]
            }
        });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });

    it('rolls back only the authority fields and indexes', async () => {
        queryInterface = buildQueryInterface({
            describedTables: {
                users: {
                    pos_cashier_pin_hash: {},
                    pos_cashier_pin_failed_attempts: {},
                    pos_cashier_pin_locked_until: {},
                    pos_cashier_pin_changed_at: {}
                },
                pos_terminal_operator_sessions: {
                    authority_token_hash: {},
                    authority_expires_at: {},
                    revoked_at: {},
                    revoked_reason: {},
                    idempotency_key: {}
                }
            },
            indexes: {
                pos_terminal_operator_sessions: [
                    { name: 'idx_pos_terminal_operator_sessions_authority_token_hash' },
                    { name: 'uq_pos_terminal_operator_sessions_shift_idempotency' }
                ]
            }
        });

        await migration.down(queryInterface);

        expect(queryInterface.removeIndex.mock.calls).toEqual([
            ['pos_terminal_operator_sessions', 'uq_pos_terminal_operator_sessions_shift_idempotency'],
            ['pos_terminal_operator_sessions', 'idx_pos_terminal_operator_sessions_authority_token_hash']
        ]);
        expect(queryInterface.removeColumn.mock.calls).toEqual([
            ['pos_terminal_operator_sessions', 'idempotency_key'],
            ['pos_terminal_operator_sessions', 'revoked_reason'],
            ['pos_terminal_operator_sessions', 'revoked_at'],
            ['pos_terminal_operator_sessions', 'authority_expires_at'],
            ['pos_terminal_operator_sessions', 'authority_token_hash'],
            ['users', 'pos_cashier_pin_changed_at'],
            ['users', 'pos_cashier_pin_locked_until'],
            ['users', 'pos_cashier_pin_failed_attempts'],
            ['users', 'pos_cashier_pin_hash']
        ]);
    });
});
