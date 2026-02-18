
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'SKU'
};

const TARGET_TENANT = 'TestCorp_1770866164111';
const TARGET_DB = 'sku_tenant_testcorp1770866164111_5745e475';

async function verifyDeletion() {
    console.log(`🔍 Verifying deletion of tenant "${TARGET_TENANT}"...\n`);

    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_CONFIG.host,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password
        });

        // 1. Check Main Database for Tenant Record
        console.log(`1. Checking 'Tenants' table for name='${TARGET_TENANT}'...`);
        const [rows] = await connection.execute(
            `SELECT * FROM \`${DB_CONFIG.database}\`.Tenants WHERE name = ?`,
            [TARGET_TENANT]
        );

        if (rows.length === 0) {
            console.log('✅ PASS: Tenant record NOT found in main database.');
        } else {
            console.error('❌ FAIL: Tenant record STILL EXISTS:', rows);
        }

        // 2. Check for Tenant Database
        console.log(`\n2. Checking for existence of database '${TARGET_DB}'...`);

        const [dbs] = await connection.execute(
            `SHOW DATABASES LIKE '${TARGET_DB}'`
        );

        if (dbs.length === 0) {
            console.log(`✅ PASS: Database '${TARGET_DB}' does NOT exist.`);
        } else {
            console.error(`❌ FAIL: Database '${TARGET_DB}' STILL EXISTS.`);
        }

    } catch (err) {
        console.error('An error occurred during verification:', err);
    } finally {
        if (connection) await connection.end();
    }
}

verifyDeletion();
