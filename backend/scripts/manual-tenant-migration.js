
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend root
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';

async function run() {
    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
    });

    try {
        // 1. Get all tenant databases
        console.log(`Fetching tenants from ${MAIN_DB}...`);
        await connection.query(`USE ${MAIN_DB}`);
        const [tenants] = await connection.query(`SELECT db_name FROM Tenants`);

        // Add main DB to list to be safe/double-check
        const databases = tenants.map(t => t.db_name);
        console.log('Found tenant databases:', databases);

        // 2. Migrate each
        for (const dbName of databases) {
            try {
                console.log(`Checking ${dbName}...`);
                await connection.query(`USE ${dbName}`);

                // Check if table exists first (some might be empty/broken)
                const [tables] = await connection.query(`SHOW TABLES LIKE 'jo_ingredients'`);
                if (tables.length === 0) {
                    console.log(`  Skipping ${dbName} - table jo_ingredients does not exist.`);
                    continue;
                }

                // Check if column exists
                const [columns] = await connection.query(`SHOW COLUMNS FROM jo_ingredients LIKE 'unit_of_measure'`);
                if (columns.length > 0) {
                    console.log(`  Column 'unit_of_measure' already exists in ${dbName}.`);
                } else {
                    await connection.query(`ALTER TABLE jo_ingredients ADD COLUMN unit_of_measure VARCHAR(50) NULL COMMENT 'Recipe UOM used for quantity_required'`);
                    console.log(`  ADDED 'unit_of_measure' to ${dbName}.jo_ingredients`);
                }

            } catch (err) {
                console.error(`  Failed on ${dbName}:`, err.message);
            }
        }

    } catch (err) {
        console.error('Fatal error:', err.message);
    } finally {
        await connection.end();
    }
}

run();
