import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260825000001-add-pos-operator-protected-operation-lease.cjs');

const Sequelize = {
    STRING: (length) => `VARCHAR(${length})`,
    DATE: 'DATETIME'
};

const buildQueryInterface = ({ columns = {}, indexes = [], hasTable = true } = {}) => ({
    showAllTables: jest.fn().mockResolvedValue(hasTable ? ['pos_terminal_operator_sessions'] : []),
    describeTable: jest.fn().mockResolvedValue(columns),
    showIndex: jest.fn().mockResolvedValue(indexes),
    addColumn: jest.fn().mockResolvedValue(undefined),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined),
    removeIndex: jest.fn().mockResolvedValue(undefined)
});

describe('POS operator protected-operation lease migration', () => {
    let queryInterface;

    beforeEach(() => {
        queryInterface = buildQueryInterface();
    });

    it('adds the protected-operation lease fields and lookup index', async () => {
        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn.mock.calls).toEqual([
            ['pos_terminal_operator_sessions', 'protected_operation_key', { type: 'VARCHAR(120)', allowNull: true, comment: 'Request identity for a currently executing protected POS mutation' }],
            ['pos_terminal_operator_sessions', 'protected_operation_type', { type: 'VARCHAR(120)', allowNull: true }],
            ['pos_terminal_operator_sessions', 'protected_operation_started_at', { type: 'DATETIME', allowNull: true }]
        ]);
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'pos_terminal_operator_sessions',
            ['pos_terminal_shift_id', 'protected_operation_started_at'],
            { name: 'idx_pos_terminal_operator_sessions_protected_operation' }
        );
    });

    it('is idempotent when the lease schema already exists', async () => {
        queryInterface = buildQueryInterface({
            columns: {
                protected_operation_key: {},
                protected_operation_type: {},
                protected_operation_started_at: {}
            },
            indexes: [{ name: 'idx_pos_terminal_operator_sessions_protected_operation' }]
        });

        await migration.up(queryInterface, Sequelize);
        expect(queryInterface.addColumn).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });

    it('fails closed when the operator-session table is unavailable', async () => {
        queryInterface = buildQueryInterface({ hasTable: false });
        await expect(migration.up(queryInterface, Sequelize)).rejects.toThrow('Required POS operator table is missing');
    });

    it('rolls back only its own index and fields', async () => {
        queryInterface = buildQueryInterface({
            columns: {
                protected_operation_key: {},
                protected_operation_type: {},
                protected_operation_started_at: {}
            },
            indexes: [{ name: 'idx_pos_terminal_operator_sessions_protected_operation' }]
        });

        await migration.down(queryInterface);
        expect(queryInterface.removeIndex).toHaveBeenCalledWith('pos_terminal_operator_sessions', 'idx_pos_terminal_operator_sessions_protected_operation');
        expect(queryInterface.removeColumn.mock.calls).toEqual([
            ['pos_terminal_operator_sessions', 'protected_operation_started_at'],
            ['pos_terminal_operator_sessions', 'protected_operation_type'],
            ['pos_terminal_operator_sessions', 'protected_operation_key']
        ]);
    });
});
