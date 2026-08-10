/**
 * PRODUCTION MIGRATION SCRIPT — v2
 * Upgrades physical quantity columns to DECIMAL(24, 12) across ALL databases.
 *
 * Covers tables NOT handled by deploy_fix_precision.js (which only patched product_composition):
 *   - jo_ingredients:  quantity_required, quantity_consumed, stock_before, stock_after
 *   - job_orders:      quantity_to_produce, quantity_produced
 *   - po_line_items:   quantity_ordered, quantity_received
 *   - stock_movements: quantity
 *   - fifo_batches:    quantity, quantity_consumed
 *   - items:           current_stock, max_capacity, min_threshold, purchase_allowance, batch_size
 *
 * Safe: DECIMAL widening is always non-destructive — no existing data is lost.
 *
 * Usage: node apps/dgfy-api/scripts/deploy_fix_precision_v2.js
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

// Each entry: { table, columns[] }
const MIGRATIONS = [
    {
        table: 'jo_ingredients',
        columns: ['quantity_required', 'quantity_consumed', 'stock_before', 'stock_after']
    },
    {
        table: 'job_orders',
        columns: ['quantity_to_produce', 'quantity_produced']
    },
    {
        table: 'po_line_items',
        columns: ['quantity_ordered', 'quantity_received']
    },
    {
        table: 'stock_movements',
        columns: ['quantity']
    },
    {
        table: 'fifo_batches',
        columns: ['quantity', 'quantity_consumed']
    },
    {
        table: 'items',
        columns: ['current_stock', 'max_capacity', 'min_threshold', 'purchase_allowance', 'batch_size']
    }
];

const rootSequelize = new Sequelize('', DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    dialect: 'mysql',
    logging: false
});

async function migrateDatabase(dbName) {
    const db = new Sequelize(dbName, DB_USER, DB_PASSWORD, {
        host: DB_HOST,
        dialect: 'mysql',
        logging: false
    });

    try {
        for (const { table, columns } of MIGRATIONS) {
            // Check table exists
            const [tables] = await db.query(`SHOW TABLES LIKE '${table}'`);
            if (tables.length === 0) {
                console.log(`   ⏭  Table '${table}' not found — skipping.`);
                continue;
            }

            // Build ALTER TABLE with all columns at once
            const modifications = columns
                .map(col => `MODIFY COLUMN \`${col}\` DECIMAL(24, 12)`)
                .join(', ');

            await db.query(`ALTER TABLE \`${table}\` ${modifications}`);
            console.log(`   ✅ ${table}: updated [${columns.join(', ')}]`);
        }
    } catch (err) {
        console.error(`   ❌ Error in ${dbName}:`, err.message);
    } finally {
        await db.close();
    }
}

async function main() {
    console.log('🚀 Starting Precision Migration v2 (DECIMAL 24,12) — quantity columns...\n');

    try {
        const [dbs] = await rootSequelize.query('SHOW DATABASES');
        const targetDBs = dbs
            .map(row => row.Database)
            .filter(name => name === 'sku_inventory_manager' || name.startsWith('sku_tenant_'));

        console.log(`📋 Found ${targetDBs.length} databases: ${targetDBs.join(', ')}\n`);

        for (const dbName of targetDBs) {
            console.log(`🔹 Processing: ${dbName}`);
            await migrateDatabase(dbName);
        }

        console.log('\n✨ Precision Migration v2 complete!');
    } catch (err) {
        console.error('🔥 Fatal error:', err.message);
        process.exit(1);
    } finally {
        await rootSequelize.close();
    }
}

main();
