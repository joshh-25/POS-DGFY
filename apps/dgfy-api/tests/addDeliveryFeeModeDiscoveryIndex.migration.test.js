// Unit tests for Phase 242 (#1333, epic #1321)'s migration:
//   - 20260905000001-add-delivery-fee-mode-to-discovery-index.cjs (landlord-only, single additive
//     column on storefront_discovery_index).
//
// Mirrors the landlord-migration half of addDeliveryFeeBreakdown.migration.test.js's own
// test-double shape (describeTable-based, no tenant fan-out).
//
// Deliberately NOT a sync-tenant-schemas.js drift test, unlike addDeliveryVoucherBenefit
// .migration.test.js's own suite -- storefront_discovery_index is a landlord-only table, not one of
// REQUIRED_TENANT_SCHEMA_COLUMNS' tenant tables, so a sync-tenant-schemas.js entry would be wrong,
// not merely unnecessary. Asserted here as a source-contract instead (the migration issues no
// tenant-fan-out query at all), so that landlord-only property is a tested one, not just a comment.

import { describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260905000001-add-delivery-fee-mode-to-discovery-index.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPath = path.resolve(__dirname, '../../dgfy-migration-runner/migrations/20260905000001-add-delivery-fee-mode-to-discovery-index.cjs');

const Sequelize = { STRING: (n) => `STRING(${n})` };

const buildQueryInterface = ({ columns = {} } = {}) => ({
    describeTable: jest.fn().mockResolvedValue(columns),
    addColumn: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined)
});

describe('20260905000001-add-delivery-fee-mode-to-discovery-index up()', () => {
    it('adds the NOT NULL delivery_fee_mode column, defaulted to fixed, when absent', async () => {
        const queryInterface = buildQueryInterface({ columns: { tenant_id: {} } });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).toHaveBeenCalledWith(
            'storefront_discovery_index',
            'delivery_fee_mode',
            { type: 'STRING(32)', allowNull: false, defaultValue: 'fixed' }
        );
    });

    it('is idempotent -- a second run with the column already present issues no addColumn', async () => {
        const queryInterface = buildQueryInterface({ columns: { delivery_fee_mode: {} } });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
    });
});

describe('20260905000001-add-delivery-fee-mode-to-discovery-index down()', () => {
    it('removes the column when present', async () => {
        const queryInterface = buildQueryInterface({ columns: { delivery_fee_mode: {} } });

        await migration.down(queryInterface);

        expect(queryInterface.removeColumn).toHaveBeenCalledWith('storefront_discovery_index', 'delivery_fee_mode');
    });

    it('is a no-op when the column is already absent', async () => {
        const queryInterface = buildQueryInterface({ columns: { tenant_id: {} } });

        await migration.down(queryInterface);

        expect(queryInterface.removeColumn).not.toHaveBeenCalled();
    });
});

describe('landlord-only: no tenant fan-out', () => {
    it('the migration source issues no tenant-database fan-out query', () => {
        const migrationSource = fs.readFileSync(migrationPath, 'utf8');
        expect(migrationSource).not.toContain('SELECT DISTINCT db_name FROM tenants');
    });

    it('the queryInterface double records no per-tenant query -- describeTable/addColumn/removeColumn are the only calls made', async () => {
        const queryInterface = buildQueryInterface({ columns: {} });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.describeTable).toHaveBeenCalledTimes(1);
        expect(queryInterface.describeTable).toHaveBeenCalledWith('storefront_discovery_index');
    });
});
