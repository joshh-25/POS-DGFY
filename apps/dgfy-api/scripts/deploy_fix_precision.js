/**
 * PRODUCTION MIGRATION SCRIPT
 * Updates 'product_composition.quantity_required' to DECIMAL(24, 12) across ALL databases.
 * 
 * Usage: node apps/dgfy-api/scripts/deploy_fix_precision.js
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

// 1. Connect to MySQL Server (no specific DB) to list databases
const rootSequelize = new Sequelize('', DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    dialect: 'mysql',
    logging: false
});

async function migrateAll() {
    console.log('🚀 Starting Universal Precision Migration (DECIMAL 24,12)...');

    try {
        // 2. Get list of all relevant databases (Main DB + Tenants)
        const [dbs] = await rootSequelize.query('SHOW DATABASES');

        // Filter for our app's databases: 'sku_inventory_manager' and 'tenant_%'
        const targetDBs = dbs
            .map(row => row.Database)
            .filter(name => name === 'sku_inventory_manager' || name.startsWith('tenant_') || name.startsWith('sku_tenant_'));

        console.log(`📋 Found ${targetDBs.length} databases to update:`, targetDBs.join(', '));

        // 3. Iterate and Update
        for (const dbName of targetDBs) {
            console.log(`\n🔹 Processing database: ${dbName}...`);

            const dbSequelize = new Sequelize(dbName, DB_USER, DB_PASSWORD, {
                host: DB_HOST,
                dialect: 'mysql',
                logging: false
            });

            try {
                // Check if table exists
                const [tables] = await dbSequelize.query(`SHOW TABLES LIKE 'product_composition'`);
                if (tables.length === 0) {
                    console.log(`   ⚠️ Table 'product_composition' not found in ${dbName}. Skipping.`);
                    await dbSequelize.close();
                    continue;
                }

                // Run the ALTER command
                await dbSequelize.query(`
          ALTER TABLE product_composition 
          MODIFY COLUMN quantity_required DECIMAL(24, 12) DEFAULT 0.000000000000
        `);
                console.log(`   ✅ Successfully updated 'quantity_required' precision.`);

            } catch (err) {
                console.error(`   ❌ Error updating ${dbName}:`, err.message);
            } finally {
                await dbSequelize.close();
            }
        }

        console.log('\n✨ Migration Complete! All databases should now support high precision decimals.');

    } catch (error) {
        console.error('🔥 Fatal Error fetching databases:', error);
    } finally {
        await rootSequelize.close();
    }
}

migrateAll();
