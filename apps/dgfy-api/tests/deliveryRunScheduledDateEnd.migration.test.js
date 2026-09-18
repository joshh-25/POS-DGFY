import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';
import {
    buildTenantSchemaRepairSql,
    buildTenantSchemaTableRepairSql,
    REQUIRED_TENANT_SCHEMA_COLUMNS,
    REQUIRED_TENANT_SCHEMA_INDEXES
} from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260907000001-add-delivery-run-scheduled-date-end.cjs');

const Sequelize = { DATEONLY: 'DATEONLY' };

const buildQueryInterface = ({ columns = {}, indexes = [] } = {}) => {
    const currentColumns = { ...columns };
    const currentIndexes = new Set(indexes.map(({ name }) => name));

    return {
        describeTable: jest.fn().mockImplementation(async () => currentColumns),
        showIndex: jest.fn().mockImplementation(async () => (
            [...currentIndexes].map((name) => ({ name }))
        )),
        addColumn: jest.fn().mockImplementation(async (_table, column) => {
            currentColumns[column] = {};
        }),
        removeColumn: jest.fn().mockImplementation(async (_table, column) => {
            delete currentColumns[column];
        }),
        addIndex: jest.fn().mockImplementation(async (_table, _fields, { name }) => {
            currentIndexes.add(name);
        }),
        removeIndex: jest.fn().mockImplementation(async (_table, name) => {
            currentIndexes.delete(name);
        })
    };
};

describe('DeliveryRun scheduled date range tenant schema contract', () => {
    it('registers the nullable range-end column and replacement index', () => {
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_runs.scheduled_date_end.sql)
            .toBe('ALTER TABLE `delivery_runs` ADD COLUMN `scheduled_date_end` DATE NULL');
        expect(REQUIRED_TENANT_SCHEMA_INDEXES.delivery_runs.idx_delivery_runs_status_scheduled_range.sql)
            .toBe('ALTER TABLE `delivery_runs` ADD INDEX `idx_delivery_runs_status_scheduled_range` (`status`,`scheduled_date`,`scheduled_date_end`)');

        const [tableRepair] = buildTenantSchemaTableRepairSql(['delivery_runs']);
        expect(tableRepair.sql).toContain('`scheduled_date_end` date DEFAULT NULL');
        expect(tableRepair.sql).toContain('idx_delivery_runs_status_scheduled_range');
        expect(tableRepair.sql).not.toContain('idx_delivery_runs_status_scheduled`');

        expect(buildTenantSchemaRepairSql([
            { table: 'delivery_runs', column: 'scheduled_date_end' }
        ])).toEqual([{
            table: 'delivery_runs',
            column: 'scheduled_date_end',
            sql: 'ALTER TABLE `delivery_runs` ADD COLUMN `scheduled_date_end` DATE NULL'
        }]);
    });

    it('adds the range column and replaces the legacy index when missing', async () => {
        const queryInterface = buildQueryInterface({
            columns: { delivery_run_id: {} },
            indexes: [{ name: 'idx_delivery_runs_status_scheduled' }]
        });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).toHaveBeenCalledWith(
            'delivery_runs',
            'scheduled_date_end',
            { type: 'DATEONLY', allowNull: true }
        );
        expect(queryInterface.removeIndex).toHaveBeenCalledWith(
            'delivery_runs',
            'idx_delivery_runs_status_scheduled'
        );
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'delivery_runs',
            ['status', 'scheduled_date', 'scheduled_date_end'],
            { name: 'idx_delivery_runs_status_scheduled_range' }
        );
    });

    it('is idempotent when the range column and index already exist', async () => {
        const queryInterface = buildQueryInterface({
            columns: { scheduled_date_end: {} },
            indexes: [{ name: 'idx_delivery_runs_status_scheduled_range' }]
        });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
        expect(queryInterface.removeIndex).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });

    it('restores the legacy index and removes the range column on down', async () => {
        const queryInterface = buildQueryInterface({
            columns: { scheduled_date_end: {} },
            indexes: [{ name: 'idx_delivery_runs_status_scheduled_range' }]
        });

        await migration.down(queryInterface);

        expect(queryInterface.removeIndex).toHaveBeenCalledWith(
            'delivery_runs',
            'idx_delivery_runs_status_scheduled_range'
        );
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'delivery_runs',
            ['status', 'scheduled_date'],
            { name: 'idx_delivery_runs_status_scheduled' }
        );
        expect(queryInterface.removeColumn).toHaveBeenCalledWith(
            'delivery_runs',
            'scheduled_date_end'
        );
    });
});
