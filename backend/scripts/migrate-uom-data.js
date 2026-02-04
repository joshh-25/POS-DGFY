/**
 * UOM Data Migration Script
 * 
 * Normalizes existing UOM values in the database to standardized abbreviations.
 * This script should be run once to clean up legacy data.
 * 
 * Usage: node scripts/migrate-uom-data.js [--dry-run] [--tenant=TENANT_DB]
 * 
 * Options:
 *   --dry-run    Show what would be changed without making changes
 *   --tenant     Specify tenant database to migrate (if multi-tenant)
 */

import { normalizeUom, isValidUom } from '../src/utils/uomConverter.js';
import db from '../src/models/index.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TENANT_ARG = args.find(a => a.startsWith('--tenant='));
const TENANT_DB = TENANT_ARG ? TENANT_ARG.split('=')[1] : null;

console.log('='.repeat(60));
console.log('UOM Data Migration Script');
console.log('='.repeat(60));
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
if (TENANT_DB) console.log(`Tenant: ${TENANT_DB}`);
console.log('');

const UOM_MAPPINGS = {
    // Weight variants
    'gram': 'g',
    'grams': 'g',
    'Gram': 'g',
    'Grams': 'g',
    'G': 'g',
    'milligram': 'mg',
    'milligrams': 'mg',
    'Milligram': 'mg',
    'kilogram': 'kg',
    'kilograms': 'kg',
    'Kilogram': 'kg',
    'Kilograms': 'kg',
    'kilo': 'kg',
    'Kilo': 'kg',
    'KG': 'kg',
    'Kg': 'kg',
    'pound': 'lb',
    'pounds': 'lb',
    'Pound': 'lb',
    'Pounds': 'lb',
    'lbs': 'lb',
    'LB': 'lb',
    'ounce': 'oz',
    'ounces': 'oz',
    'Ounce': 'oz',
    'Ounces': 'oz',
    'OZ': 'oz',

    // Volume variants
    'milliliter': 'mL',
    'milliliters': 'mL',
    'Milliliter': 'mL',
    'ml': 'mL',
    'ML': 'mL',
    'Ml': 'mL',
    'liter': 'L',
    'liters': 'L',
    'Liter': 'L',
    'Liters': 'L',
    'l': 'L',
    'gallon': 'gal',
    'gallons': 'gal',
    'Gallon': 'gal',
    'Gallons': 'gal',
    'GAL': 'gal',
    'cups': 'cup',
    'Cup': 'cup',
    'Cups': 'cup',
    'tablespoon': 'tbsp',
    'tablespoons': 'tbsp',
    'Tablespoon': 'tbsp',
    'TBSP': 'tbsp',
    'teaspoon': 'tsp',
    'teaspoons': 'tsp',
    'Teaspoon': 'tsp',
    'TSP': 'tsp',

    // Count variants
    'piece': 'pcs',
    'pieces': 'pcs',
    'Piece': 'pcs',
    'Pieces': 'pcs',
    'pc': 'pcs',
    'PCS': 'pcs',
    'unit': 'units',
    'Unit': 'units',
    'Units': 'units',
    'UNITS': 'units',
    'doz': 'dozen',
    'Dozen': 'dozen',
    'Doz': 'dozen',
    'DOZ': 'dozen',
};

async function migrateTable(tableName, Model) {
    console.log(`\n--- Migrating ${tableName} ---`);

    try {
        const records = await Model.findAll({
            attributes: ['item_id', 'name', 'unit_of_measure'],
            raw: true
        });

        let total = records.length;
        let needsUpdate = 0;
        let unknownUoms = new Set();
        const updates = [];

        for (const record of records) {
            const currentUom = record.unit_of_measure;
            if (!currentUom) continue;

            const normalizedUom = normalizeUom(currentUom.trim());

            if (currentUom !== normalizedUom) {
                needsUpdate++;
                updates.push({
                    id: record.item_id,
                    name: record.name,
                    from: currentUom,
                    to: normalizedUom
                });

                if (!isValidUom(normalizedUom)) {
                    unknownUoms.add(currentUom);
                }
            }
        }

        console.log(`  Total records: ${total}`);
        console.log(`  Need update: ${needsUpdate}`);

        if (unknownUoms.size > 0) {
            console.log(`  ⚠️ Unknown UOMs found (will remain as-is):`);
            unknownUoms.forEach(uom => console.log(`     - "${uom}"`));
        }

        if (updates.length > 0) {
            console.log(`\n  Changes:`);
            updates.slice(0, 20).forEach(u => {
                console.log(`    [${u.id}] ${u.name}: "${u.from}" → "${u.to}"`);
            });
            if (updates.length > 20) {
                console.log(`    ... and ${updates.length - 20} more`);
            }

            if (!DRY_RUN) {
                console.log(`\n  Applying updates...`);
                for (const update of updates) {
                    try {
                        await Model.update(
                            { unit_of_measure: update.to },
                            { where: { item_id: update.id } }
                        );
                    } catch (err) {
                        console.log(`    ❌ Failed to update ${update.id}: ${err.message}`);
                    }
                }
                console.log(`  ✓ Applied ${updates.length} updates`);
            }
        }

        return { total, updated: DRY_RUN ? 0 : needsUpdate, unknownCount: unknownUoms.size };
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        return { total: 0, updated: 0, unknownCount: 0 };
    }
}

async function migrateProductComposition() {
    console.log(`\n--- Migrating ProductComposition ---`);

    try {
        const ProductComposition = db.ProductComposition;
        if (!ProductComposition) {
            console.log('  ProductComposition model not found');
            return { total: 0, updated: 0, unknownCount: 0 };
        }

        const records = await ProductComposition.findAll({
            attributes: ['composition_id', 'unit_of_measure'],
            raw: true
        });

        let total = records.length;
        let needsUpdate = 0;
        const updates = [];

        for (const record of records) {
            const currentUom = record.unit_of_measure;
            if (!currentUom) continue;

            const normalizedUom = normalizeUom(currentUom.trim());

            if (currentUom !== normalizedUom) {
                needsUpdate++;
                updates.push({
                    id: record.composition_id,
                    from: currentUom,
                    to: normalizedUom
                });
            }
        }

        console.log(`  Total records: ${total}`);
        console.log(`  Need update: ${needsUpdate}`);

        if (updates.length > 0 && !DRY_RUN) {
            console.log(`\n  Applying updates...`);
            for (const update of updates) {
                try {
                    await ProductComposition.update(
                        { unit_of_measure: update.to },
                        { where: { composition_id: update.id } }
                    );
                } catch (err) {
                    console.log(`    ❌ Failed to update ${update.id}: ${err.message}`);
                }
            }
            console.log(`  ✓ Applied ${updates.length} updates`);
        }

        return { total, updated: DRY_RUN ? 0 : needsUpdate, unknownCount: 0 };
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        return { total: 0, updated: 0, unknownCount: 0 };
    }
}

async function main() {
    try {
        // Wait for database connection
        await db.sequelize.authenticate();
        console.log('Database connection established.\n');

        const results = [];

        // Migrate Items table
        if (db.Item) {
            results.push({ table: 'Item', ...await migrateTable('Item', db.Item) });
        }

        // Migrate ProductComposition table
        results.push({ table: 'ProductComposition', ...await migrateProductComposition() });

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('MIGRATION SUMMARY');
        console.log('='.repeat(60));
        results.forEach(r => {
            console.log(`${r.table.padEnd(25)} Total: ${String(r.total).padStart(5)} | Updated: ${String(r.updated).padStart(5)} | Unknown: ${r.unknownCount}`);
        });

        if (DRY_RUN) {
            console.log('\n⚠️  DRY RUN - No changes were made. Run without --dry-run to apply changes.');
        } else {
            console.log('\n✓ Migration complete!');
        }

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main();
