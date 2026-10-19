import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261019000002-add-dgfy-customer-address-details.cjs');
const Sequelize = { STRING: (length) => `STRING(${length})` };

const buildQueryInterface = ({ table = true, detailsColumn = false } = {}) => {
    const state = {
        columns: table ? {
            address_line: { type: 'TEXT' },
            ...(detailsColumn ? { address_details: { type: 'VARCHAR(255)' } } : {})
        } : null
    };
    const queryInterface = {
        describeTable: jest.fn(async () => {
            if (!state.columns) throw new Error('No description found for "dgfy_customer_addresses" table.');
            return { ...state.columns };
        }),
        addColumn: jest.fn(async (_table, name, definition) => { state.columns[name] = definition; }),
        removeColumn: jest.fn(async (_table, name) => { delete state.columns[name]; })
    };
    return { queryInterface, state };
};

describe('add dgfy customer address details migration (#2594)', () => {
    it('adds a nullable address_details column after address_line', async () => {
        const { queryInterface, state } = buildQueryInterface();

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).toHaveBeenCalledWith('dgfy_customer_addresses', 'address_details', expect.objectContaining({
            type: 'STRING(255)',
            allowNull: true,
            after: 'address_line'
        }));
        expect(state.columns.address_details).toBeDefined();
    });

    it('is a no-op when the column already exists or the table is missing', async () => {
        const existing = buildQueryInterface({ detailsColumn: true });
        await migration.up(existing.queryInterface, Sequelize);
        expect(existing.queryInterface.addColumn).not.toHaveBeenCalled();

        const missing = buildQueryInterface({ table: false });
        await migration.up(missing.queryInterface, Sequelize);
        expect(missing.queryInterface.addColumn).not.toHaveBeenCalled();
    });

    it('removes the column on down, and only when it exists', async () => {
        const { queryInterface, state } = buildQueryInterface({ detailsColumn: true });

        await migration.down(queryInterface);
        expect(queryInterface.removeColumn).toHaveBeenCalledWith('dgfy_customer_addresses', 'address_details');
        expect(state.columns.address_details).toBeUndefined();

        await migration.down(queryInterface);
        expect(queryInterface.removeColumn).toHaveBeenCalledTimes(1);
    });
});
