import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260808000003-add-delivery-assignment-shift.cjs');

const Sequelize = {
    INTEGER: 'INTEGER'
};

const buildQueryInterface = ({ columns = {}, indexes = [] } = {}) => ({
    describeTable: jest.fn().mockResolvedValue(columns),
    showIndex: jest.fn().mockResolvedValue(indexes),
    addColumn: jest.fn().mockResolvedValue(undefined),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeIndex: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined)
});

describe('delivery assignment shift migration', () => {
    it('adds the assignment shift column and index when missing', async () => {
        const queryInterface = buildQueryInterface({
            columns: { delivery_job_id: {} }
        });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).toHaveBeenCalledWith(
            'delivery_jobs',
            'assigned_shift_id',
            expect.objectContaining({
                type: 'INTEGER',
                allowNull: true,
                references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' }
            })
        );
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'delivery_jobs',
            ['assigned_shift_id'],
            { name: 'idx_delivery_jobs_assignment_shift' }
        );
    });

    it('is idempotent when the column and index already exist', async () => {
        const queryInterface = buildQueryInterface({
            columns: { assigned_shift_id: {} },
            indexes: [{ name: 'idx_delivery_jobs_assignment_shift' }]
        });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });

    it('removes the index and column on down', async () => {
        const queryInterface = buildQueryInterface({
            columns: { assigned_shift_id: {} },
            indexes: [{ name: 'idx_delivery_jobs_assignment_shift' }]
        });

        await migration.down(queryInterface);

        expect(queryInterface.removeIndex).toHaveBeenCalledWith(
            'delivery_jobs',
            'idx_delivery_jobs_assignment_shift'
        );
        expect(queryInterface.removeColumn).toHaveBeenCalledWith('delivery_jobs', 'assigned_shift_id');
    });
});
