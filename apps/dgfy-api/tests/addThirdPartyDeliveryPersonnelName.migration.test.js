import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260812000005-add-third-party-delivery-personnel-name.cjs');

const Sequelize = {
    STRING: (length) => `STRING(${length})`
};

const buildQueryInterface = ({ columns = {} } = {}) => ({
    describeTable: jest.fn().mockResolvedValue(columns),
    addColumn: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined)
});

describe('third-party delivery personnel name migration', () => {
    it('adds the nullable courier name column when missing', async () => {
        const queryInterface = buildQueryInterface({ columns: { delivery_job_id: {} } });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).toHaveBeenCalledWith(
            'delivery_jobs',
            'delivery_personnel_name',
            { type: 'STRING(255)', allowNull: true }
        );
    });

    it('is idempotent when the courier name column already exists', async () => {
        const queryInterface = buildQueryInterface({ columns: { delivery_personnel_name: {} } });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
    });

    it('removes the courier name column on down', async () => {
        const queryInterface = buildQueryInterface({ columns: { delivery_personnel_name: {} } });

        await migration.down(queryInterface);

        expect(queryInterface.removeColumn).toHaveBeenCalledWith(
            'delivery_jobs',
            'delivery_personnel_name'
        );
    });
});
