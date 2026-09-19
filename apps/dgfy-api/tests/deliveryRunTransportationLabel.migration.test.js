import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';
import {
    buildTenantSchemaRepairSql,
    buildTenantSchemaTableRepairSql,
    REQUIRED_TENANT_SCHEMA_COLUMNS
} from '../scripts/sync-tenant-schemas.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260913000001-add-delivery-run-transportation-label.cjs');

const Sequelize = { STRING: (length) => `STRING(${length})` };

const buildQueryInterface = ({ columns = {} } = {}) => {
    const currentColumns = { ...columns };

    return {
        describeTable: jest.fn().mockImplementation(async () => currentColumns),
        addColumn: jest.fn().mockImplementation(async (_table, column) => {
            currentColumns[column] = {};
        }),
        removeColumn: jest.fn().mockImplementation(async (_table, column) => {
            delete currentColumns[column];
        })
    };
};

describe('DeliveryRun transportation label tenant schema contract', () => {
    it('registers the nullable column for repair and fresh provisioning', () => {
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.delivery_runs.transportation_label.sql)
            .toBe('ALTER TABLE `delivery_runs` ADD COLUMN `transportation_label` VARCHAR(120) NULL');

        const [tableRepair] = buildTenantSchemaTableRepairSql(['delivery_runs']);
        expect(tableRepair.sql).toContain('`transportation_label` varchar(120) DEFAULT NULL');
        expect(buildTenantSchemaRepairSql([
            { table: 'delivery_runs', column: 'transportation_label' }
        ])).toEqual([{
            table: 'delivery_runs',
            column: 'transportation_label',
            sql: 'ALTER TABLE `delivery_runs` ADD COLUMN `transportation_label` VARCHAR(120) NULL'
        }]);
    });

    it('adds the nullable column when the delivery_runs table exists without it', async () => {
        const queryInterface = buildQueryInterface({ columns: { delivery_run_id: {} } });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).toHaveBeenCalledWith(
            'delivery_runs',
            'transportation_label',
            { type: 'STRING(120)', allowNull: true }
        );
    });

    it('is idempotent when the transportation label column already exists', async () => {
        const queryInterface = buildQueryInterface({ columns: { transportation_label: {} } });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
    });

    it('removes the transportation label column on down when present', async () => {
        const queryInterface = buildQueryInterface({ columns: { transportation_label: {} } });

        await migration.down(queryInterface);

        expect(queryInterface.removeColumn).toHaveBeenCalledWith(
            'delivery_runs',
            'transportation_label'
        );
    });
});
