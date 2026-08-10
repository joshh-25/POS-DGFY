import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260724000001-enforce-one-open-shift-per-operator.cjs');

// Routes queryInterface.sequelize.query calls by SQL shape instead of call order, since the
// migration now issues a variable number of queries (FK lookup, optional DROP/ADD FOREIGN KEY)
// before the ADD COLUMN, depending on the FK's current state.
const buildSequelizeQuery = ({ duplicates = [], foreignKey = null } = {}) => jest.fn((sql) => {
    if (sql.includes('GROUP BY cashier_id')) return Promise.resolve([duplicates]);
    if (sql.includes('REFERENTIAL_CONSTRAINTS')) {
        return Promise.resolve([foreignKey ? [foreignKey] : []]);
    }
    return Promise.resolve([[], undefined]);
});

const buildQueryInterface = (options) => ({
    showAllTables: jest.fn().mockResolvedValue(['pos_terminal_shifts']),
    showIndex: jest.fn().mockResolvedValue([]),
    describeTable: jest.fn().mockResolvedValue({}),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeIndex: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined),
    sequelize: {
        query: buildSequelizeQuery(options)
    }
});

describe('one open POS shift per operator migration', () => {
    let queryInterface;

    beforeEach(() => {
        queryInterface = buildQueryInterface({
            foreignKey: { constraintName: 'pos_terminal_shifts_ibfk_4', updateRule: 'CASCADE' }
        });
    });

    it('blocks the migration when an operator has duplicate open shifts', async () => {
        queryInterface = buildQueryInterface({
            duplicates: [{ operator_user_id: 41, open_shift_count: 2 }]
        });

        await expect(migration.up(queryInterface)).rejects.toThrow(
            'Explicitly close duplicate open shifts first for user IDs: 41'
        );
        expect(queryInterface.describeTable).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });

    it('relaxes the cashier_id FK from CASCADE to RESTRICT before adding the generated column', async () => {
        await migration.up(queryInterface);

        const calls = queryInterface.sequelize.query.mock.calls.map(([sql]) => sql);
        const fkLookupIndex = calls.findIndex((sql) => sql.includes('REFERENTIAL_CONSTRAINTS'));
        const dropIndex = calls.findIndex((sql) => sql.includes('DROP FOREIGN KEY `pos_terminal_shifts_ibfk_4`'));
        const addRestrictIndex = calls.findIndex((sql) => sql.includes('ON UPDATE RESTRICT ON DELETE RESTRICT'));
        const addColumnIndex = calls.findIndex((sql) => sql.includes('GENERATED ALWAYS AS'));

        expect(fkLookupIndex).toBeGreaterThanOrEqual(0);
        expect(dropIndex).toBeGreaterThan(fkLookupIndex);
        expect(addRestrictIndex).toBeGreaterThan(dropIndex);
        expect(addColumnIndex).toBeGreaterThan(addRestrictIndex);
        expect(calls[addColumnIndex]).toContain('CASE WHEN status = \'open\' THEN cashier_id ELSE NULL END');

        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'pos_terminal_shifts',
            ['active_operator_user_id'],
            {
                name: 'uq_pos_terminal_shifts_active_operator',
                unique: true
            }
        );
    });

    it('does not touch the FK when it is already ON UPDATE RESTRICT', async () => {
        queryInterface = buildQueryInterface({
            foreignKey: { constraintName: 'pos_terminal_shifts_ibfk_4', updateRule: 'RESTRICT' }
        });

        await migration.up(queryInterface);

        const calls = queryInterface.sequelize.query.mock.calls.map(([sql]) => sql);
        expect(calls.some((sql) => sql.includes('DROP FOREIGN KEY'))).toBe(false);
        expect(calls.some((sql) => sql.includes('GENERATED ALWAYS AS'))).toBe(true);
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

    it('removes the unique index and column, then restores ON UPDATE CASCADE on down', async () => {
        queryInterface = buildQueryInterface({
            foreignKey: { constraintName: 'pos_terminal_shifts_ibfk_4', updateRule: 'RESTRICT' }
        });
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

        const calls = queryInterface.sequelize.query.mock.calls.map(([sql]) => sql);
        expect(calls.some((sql) => sql.includes('ON UPDATE CASCADE') && !sql.includes('RESTRICT'))).toBe(true);
    });
});
