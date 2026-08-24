import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const parkedSaleMigration = require('../../dgfy-migration-runner/migrations/20260815000002-add-pos-parked-sale-origin-ownership.cjs');
const auditMigration = require('../../dgfy-migration-runner/migrations/20260815000003-align-audit-log-context.cjs');

const Sequelize = {
    INTEGER: 'INTEGER',
    BIGINT: 'BIGINT',
    STRING: jest.fn((length) => `STRING(${length})`)
};

describe('parked-sale and audit compatibility migrations', () => {
    it('adds only missing parked-sale indexes and propagates index failures', async () => {
        const queryInterface = {
            describeTable: jest.fn().mockResolvedValue({
                cashier_id: {},
                shift_id: {},
                origin_cashier_id: {},
                origin_shift_id: {}
            }),
            showIndex: jest.fn().mockResolvedValue([
                { name: 'idx_pos_parked_sales_origin_cashier_status' }
            ]),
            addColumn: jest.fn(),
            addIndex: jest.fn().mockRejectedValue(new Error('index creation failed')),
            sequelize: { query: jest.fn().mockResolvedValue([]) }
        };

        await expect(parkedSaleMigration.up(queryInterface, Sequelize))
            .rejects.toThrow('index creation failed');
        expect(queryInterface.addIndex).toHaveBeenCalledTimes(1);
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'pos_parked_sales',
            ['origin_shift_id', 'status'],
            { name: 'idx_pos_parked_sales_origin_shift_status' }
        );
    });

    it('uses the canonical audit index name and is idempotent', async () => {
        const queryInterface = {
            describeTable: jest.fn().mockResolvedValue({
                event_type: {},
                actor_username: {},
                terminal_id: {},
                shift_id: {},
                location_id: {},
                reason: {},
                request_id: {}
            }),
            showIndex: jest.fn()
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ name: 'idx_audit_event_timestamp' }]),
            addColumn: jest.fn(),
            addIndex: jest.fn().mockResolvedValue(undefined)
        };

        await auditMigration.up(queryInterface, Sequelize);
        await auditMigration.up(queryInterface, Sequelize);

        expect(queryInterface.addIndex).toHaveBeenCalledTimes(1);
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'audit_logs',
            ['event_type', 'timestamp'],
            { name: 'idx_audit_event_timestamp' }
        );
    });

    it('does not hide audit index creation failures', async () => {
        const queryInterface = {
            describeTable: jest.fn().mockResolvedValue({}),
            showIndex: jest.fn().mockResolvedValue([]),
            addColumn: jest.fn().mockResolvedValue(undefined),
            addIndex: jest.fn().mockRejectedValue(new Error('index creation failed'))
        };

        await expect(auditMigration.up(queryInterface, Sequelize))
            .rejects.toThrow('index creation failed');
    });
});
