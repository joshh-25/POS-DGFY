import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../migrations/20260724000001-enforce-one-open-shift-per-operator.cjs');

const buildQueryInterface = () => ({
    showAllTables: jest.fn().mockResolvedValue(['pos_terminal_shifts']),
    showIndex: jest.fn().mockResolvedValue([]),
    describeTable: jest.fn().mockResolvedValue({}),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeIndex: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined),
    sequelize: {
        query: jest.fn()
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[], undefined])
    }
});

describe('one open POS shift per operator migration', () => {
    let queryInterface;

    beforeEach(() => {
        queryInterface = buildQueryInterface();
    });

    it('blocks the migration when an operator has duplicate open shifts', async () => {
        queryInterface.sequelize.query = jest.fn().mockResolvedValueOnce([[
            { operator_user_id: 41, open_shift_count: 2 }
        ]]);

        await expect(migration.up(queryInterface)).rejects.toThrow(
            'Explicitly close duplicate open shifts first for user IDs: 41'
        );
        expect(queryInterface.describeTable).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });

    it('adds the generated active-operator column and unique index', async () => {
        await migration.up(queryInterface);

        expect(queryInterface.sequelize.query).toHaveBeenCalledTimes(2);
        expect(queryInterface.sequelize.query.mock.calls[1][0]).toContain(
            'CASE WHEN status = \'open\' THEN cashier_id ELSE NULL END'
        );
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'pos_terminal_shifts',
            ['active_operator_user_id'],
            {
                name: 'uq_pos_terminal_shifts_active_operator',
                unique: true
            }
        );
    });

    it('is safe to rerun after the column and index exist', async () => {
        queryInterface.describeTable.mockResolvedValue({
            active_operator_user_id: {}
        });
        queryInterface.showIndex.mockResolvedValue([{
            name: 'uq_pos_terminal_shifts_active_operator'
        }]);

        await migration.up(queryInterface);

        expect(queryInterface.sequelize.query).toHaveBeenCalledTimes(1);
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });

    it('removes the unique index before removing the generated column', async () => {
        queryInterface.describeTable.mockResolvedValue({
            active_operator_user_id: {}
        });
        queryInterface.showIndex.mockResolvedValue([{
            name: 'uq_pos_terminal_shifts_active_operator'
        }]);

        await migration.down(queryInterface);

        expect(queryInterface.removeIndex).toHaveBeenCalledWith(
            'pos_terminal_shifts',
            'uq_pos_terminal_shifts_active_operator'
        );
        expect(queryInterface.removeColumn).toHaveBeenCalledWith(
            'pos_terminal_shifts',
            'active_operator_user_id'
        );
    });
});
