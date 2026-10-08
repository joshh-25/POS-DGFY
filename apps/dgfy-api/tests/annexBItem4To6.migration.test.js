import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261003000001-add-annex-b-item-4-6-evidence-contract.cjs');

const Sequelize = {
    ENUM: jest.fn((...values) => ({ type: 'ENUM', values })),
    STRING: jest.fn((length) => ({ type: 'STRING', length }))
};

describe('Annex B Items 4-6 evidence migration', () => {
    it('adds the return adjustment value and Z-reading payload hash idempotently', async () => {
        const queryInterface = {
            describeTable: jest.fn(async (tableName) => {
                if (tableName === 'pos_transaction_adjustments') return { adjustment_type: {} };
                return { generated_at: {} };
            }),
            changeColumn: jest.fn().mockResolvedValue(undefined),
            addColumn: jest.fn().mockResolvedValue(undefined)
        };

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.changeColumn).toHaveBeenCalledWith(
            'pos_transaction_adjustments',
            'adjustment_type',
            expect.objectContaining({
                type: expect.objectContaining({ values: expect.arrayContaining(['return']) })
            })
        );
        expect(queryInterface.addColumn).toHaveBeenCalledWith(
            'pos_z_reading_snapshots',
            'reading_payload_hash',
            expect.objectContaining({ type: { type: 'STRING', length: 64 } })
        );
    });

    it('down migration removes only the additive hash and restores the prior enum values', async () => {
        const queryInterface = {
            describeTable: jest.fn(async (tableName) => {
                if (tableName === 'pos_transaction_adjustments') return { adjustment_type: {} };
                return { reading_payload_hash: {} };
            }),
            changeColumn: jest.fn().mockResolvedValue(undefined),
            removeColumn: jest.fn().mockResolvedValue(undefined)
        };

        await migration.down(queryInterface, Sequelize);

        expect(queryInterface.removeColumn).toHaveBeenCalledWith('pos_z_reading_snapshots', 'reading_payload_hash');
        expect(queryInterface.changeColumn).toHaveBeenCalledWith(
            'pos_transaction_adjustments',
            'adjustment_type',
            expect.objectContaining({
                type: expect.objectContaining({ values: expect.not.arrayContaining(['return']) })
            })
        );
    });
});
