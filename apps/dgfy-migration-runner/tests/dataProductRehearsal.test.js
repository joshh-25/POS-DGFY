import { jest } from '@jest/globals';
import { Sequelize } from 'sequelize';

import { runDataDryRun, runDataApply } from '../src/commands/data.js';
import { runVerify } from '../src/commands/verify.js';
import { loadMigrationTargetManifest } from '../src/data/targetManifest.js';

const RUN_REHEARSAL = process.env.RUN_PHASE13_PRODUCT_REHEARSAL === 'true';

const REQUIRED_ENV = [
    'SOURCE_DB_HOST',
    'SOURCE_DB_USER',
    'SOURCE_DB_PASSWORD',
    'SOURCE_DB_NAME',
    'TARGET_DB_HOST',
    'TARGET_DB_USER',
    'TARGET_DB_PASSWORD',
    'TARGET_DB_NAME',
    'DGFY_MIGRATION_TARGET_MANIFEST',
    'DGFY_BUSINESS_DB_NAMES'
];

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
const describeIfRehearsal = RUN_REHEARSAL && missingEnv.length === 0 ? describe : describe.skip;

if (!RUN_REHEARSAL || missingEnv.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
        '[dataProductRehearsal.test.js] SKIPPED — set RUN_PHASE13_PRODUCT_REHEARSAL=true ' +
        'with SOURCE_DB_*, TARGET_DB_*, DGFY_MIGRATION_TARGET_MANIFEST, and DGFY_BUSINESS_DB_NAMES ' +
        'to run the real Phase 13 product/inventory dry-run/apply/retry/verify rehearsal.'
    );
    if (RUN_REHEARSAL && missingEnv.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[dataProductRehearsal.test.js] Missing env: ${missingEnv.join(', ')}`);
    }
}

function createBusinessConnection(databaseName) {
    return new Sequelize(databaseName, process.env.TARGET_DB_USER, process.env.TARGET_DB_PASSWORD, {
        host: process.env.TARGET_DB_HOST,
        port: Number(process.env.TARGET_DB_PORT || 3306),
        dialect: 'mysql',
        logging: false
    });
}

async function loadTargets() {
    const result = await loadMigrationTargetManifest(process.env.DGFY_MIGRATION_TARGET_MANIFEST);
    if (!result.valid) {
        throw new Error(`Invalid migration target manifest: ${result.errors.join('; ')}`);
    }
    const configuredTargets = new Set(
        String(process.env.DGFY_BUSINESS_DB_NAMES || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
    );
    return result.targets.filter((target) => configuredTargets.has(target.target_business_db_name));
}

function hasEntity(entries, entityType) {
    return entries.some((entry) => entry.entity_type === entityType);
}

function countRowsWritten(report, entityType) {
    return (report.results || [])
        .filter((entry) => entry.entity_type === entityType && ['inserted', 'reconciled', 'mapped_existing'].includes(entry.status))
        .length;
}

async function fetchProductEvidence(target) {
    const connection = createBusinessConnection(target.target_business_db_name);
    try {
        const [products] = await connection.query('SELECT id, name, stock_count, attributes FROM products ORDER BY id LIMIT 20');
        const [productFolders] = await connection.query('SELECT id, name FROM product_folders ORDER BY id LIMIT 20');
        const [openingBalances] = await connection.query(`
            SELECT product_id, SUM(quantity) AS quantity
            FROM inventory_movements
            WHERE reference_type = 'legacy_opening_balance'
            GROUP BY product_id
        `);
        const [movementTypeTotals] = await connection.query(`
            SELECT movement_type, SUM(quantity) AS quantity
            FROM inventory_movements
            GROUP BY movement_type
            ORDER BY movement_type
        `);
        const [embeddings] = await connection.query('SELECT product_id, COUNT(*) AS count FROM product_embeddings GROUP BY product_id');
        return { products, productFolders, openingBalances, movementTypeTotals, embeddings };
    } finally {
        await connection.close();
    }
}

describeIfRehearsal('Phase 13 real product/inventory migration rehearsal', () => {
    jest.setTimeout(300000);

    test('dry-run, apply, retry-apply, and verify prove product-domain fidelity', async () => {
        const targets = await loadTargets();
        expect(targets.length).toBeGreaterThan(0);

        const dryRunReport = await runDataDryRun({});
        expect(dryRunReport.summary.planned_inserts).toBeGreaterThan(0);
        expect(hasEntity(dryRunReport.results, 'product_folder')).toBe(true);
        expect(hasEntity(dryRunReport.results, 'product')).toBe(true);
        expect(hasEntity(dryRunReport.results, 'inventory_movement')).toBe(true);
        expect(hasEntity(dryRunReport.results, 'product_embedding')).toBe(true);

        const firstFolderIndex = dryRunReport.results.findIndex((entry) => entry.entity_type === 'product_folder');
        const firstProductIndex = dryRunReport.results.findIndex((entry) => entry.entity_type === 'product');
        expect(firstFolderIndex).toBeGreaterThanOrEqual(0);
        expect(firstProductIndex).toBeGreaterThan(firstFolderIndex);

        const firstApplyReport = await runDataApply({ confirmDestructive: true });
        expect(firstApplyReport.summary.rows_written).toBeGreaterThan(0);
        expect(countRowsWritten(firstApplyReport, 'product')).toBeGreaterThan(0);
        expect(countRowsWritten(firstApplyReport, 'inventory_movement')).toBeGreaterThan(0);

        const retryApplyReport = await runDataApply({ confirmDestructive: true });
        expect(countRowsWritten(retryApplyReport, 'inventory_movement')).toBe(0);

        const verifyReport = await runVerify({});
        expect(verifyReport.data_migration.ok).toBe(true);
        expect(verifyReport.data_migration.open_findings.blocking_count).toBe(0);

        const verifiedTarget = (verifyReport.data_migration.targets || []).find(
            (targetResult) => targetResult.ok && targetResult.product_reconciliation?.ok
        );
        expect(verifiedTarget).toBeTruthy();
        expect(verifiedTarget.product_reconciliation.movement_type_totals.length).toBeGreaterThan(0);
        expect(verifiedTarget.product_reconciliation.product_category_distribution).toEqual(
            expect.arrayContaining([expect.objectContaining({ category: 'retail' })])
        );
        expect(verifiedTarget.product_reconciliation.stock_opening_balance.ok).toBe(true);
        expect(verifiedTarget.product_reconciliation.embedding_coverage.ok).toBe(true);

        const target = targets.find((entry) => entry.target_business_db_name === verifiedTarget.target_business_db_name) || targets[0];
        const productEvidence = await fetchProductEvidence(target);
        expect(productEvidence.productFolders.length).toBeGreaterThan(0);
        expect(productEvidence.products.length).toBeGreaterThan(0);
        expect(productEvidence.openingBalances.length).toBeGreaterThan(0);
        expect(productEvidence.movementTypeTotals.length).toBeGreaterThan(0);
        expect(productEvidence.embeddings.length).toBeGreaterThan(0);

        const productWithAttributes = productEvidence.products.find((product) => product.attributes);
        expect(productWithAttributes).toBeTruthy();
        const attributes = typeof productWithAttributes.attributes === 'string'
            ? JSON.parse(productWithAttributes.attributes)
            : productWithAttributes.attributes;
        if (Object.prototype.hasOwnProperty.call(attributes, 'barcodes')) {
            expect(Array.isArray(attributes.barcodes)).toBe(true);
        }
    });
});
