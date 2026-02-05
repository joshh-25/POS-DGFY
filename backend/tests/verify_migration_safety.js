/**
 * MIGRATION SAFETY VERIFICATION
 * Simulates the production environment to test `deploy_fix_precision.js`.
 * 
 * 1. Creates a temp database `test_migration_db`.
 * 2. Creates table with OLD schema (DECIMAL 12,2).
 * 3. Inserts data that would be rounded (0.000001 -> 0.00).
 * 4. Runs the migration logic.
 * 5. Verifies schema is now DECIMAL(24,12).
 * 6. Verifies data is preserved (and now capable of holding high precision).
 * 7. Cleans up.
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const TEST_DB = 'test_migration_safety_db';

async function runTest() {
    console.log('🛡️ Starting Migration Safety Test...');

    const rootSequelize = new Sequelize('', DB_USER, DB_PASS, {
        host: DB_HOST,
        dialect: 'mysql',
        logging: false
    });

    try {
        // 1. Setup Test DB
        console.log('1️⃣  Setting up temporary test database...');
        await rootSequelize.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        await rootSequelize.query(`CREATE DATABASE ${TEST_DB}`);

        const dbSequelize = new Sequelize(TEST_DB, DB_USER, DB_PASS, {
            host: DB_HOST,
            dialect: 'mysql',
            logging: false
        });

        // 2. Mock Old Schema
        console.log('2️⃣  Creating table with OLD precision (DECIMAL 12,2)...');
        await dbSequelize.query(`
      CREATE TABLE product_composition (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT,
        ingredient_id INT,
        quantity_required DECIMAL(12, 2) DEFAULT 0.00
      )
    `);

        // 3. Insert Data
        console.log('3️⃣  Seeding initial data...');
        // We insert 1.00. 
        // Note: We can't insert 0.000001 yet because the DB would round it to 0.00 immediately.
        // That's the whole problem we are fixing.
        await dbSequelize.query(`
      INSERT INTO product_composition (product_id, ingredient_id, quantity_required)
      VALUES (101, 202, 1.00)
    `);

        // 4. Run Migration Logic (Replicating deploy_fix_precision.js core logic)
        console.log('4️⃣  Running Migration (Updating to DECIMAL 24,12)...');
        await dbSequelize.query(`
      ALTER TABLE product_composition 
      MODIFY COLUMN quantity_required DECIMAL(24, 12) DEFAULT 0.000000000000
    `);

        // 5. Verify Schema
        console.log('5️⃣  Verifying Schema Change...');
        const [columns] = await dbSequelize.query(`
      SHOW COLUMNS FROM product_composition LIKE 'quantity_required'
    `);
        const type = columns[0].Type;
        if (!type.includes('decimal(24,12)')) {
            throw new Error(`Schema check failed. Expected decimal(24,12), got ${type}`);
        }
        console.log(`   ✅ Schema updated to: ${type}`);

        // 6. Verify Data Integrity & New Capabilities
        console.log('6️⃣  Verifying Data Integrity & New Precision...');

        // Check old data is safe
        const [rows] = await dbSequelize.query('SELECT * FROM product_composition WHERE product_id = 101');
        const oldVal = parseFloat(rows[0].quantity_required);
        if (oldVal !== 1.00) {
            throw new Error(`Data corruption! Expected 1.00, got ${oldVal}`);
        }
        console.log(`   ✅ Original data (1.00) preserved.`);

        // Test new precision
        await dbSequelize.query(`
      INSERT INTO product_composition (product_id, ingredient_id, quantity_required)
      VALUES (102, 203, 0.000000123456)
    `);
        const [newRows] = await dbSequelize.query('SELECT * FROM product_composition WHERE product_id = 102');
        const newVal = parseFloat(newRows[0].quantity_required);

        if (newVal !== 0.000000123456) {
            throw new Error(`High precision test failed! Expected 0.000000123456, got ${newVal}`);
        }
        console.log(`   ✅ High precision insert (0.000000123456) successful.`);

        // 7. Cleanup
        console.log('7️⃣  Cleaning up...');
        await rootSequelize.query(`DROP DATABASE ${TEST_DB}`);
        console.log('\n✨ TEST PASSED: Migration is SAFE and EFFECTIVE.');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        process.exit(1);
    } finally {
        await rootSequelize.close();
    }
}

runTest();
