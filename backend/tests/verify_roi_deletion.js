
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

async function verifyDeletion() {
    console.log('🔍 Verifying deletion of tenant "ROI"...');

    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_CONFIG.host,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password
        });

        // 1. Check Main Database for Tenant Record
        console.log(`\n1. Checking 'Tenants' table in '${DB_CONFIG.database}'...`);
        const [rows] = await connection.execute(
            `SELECT * FROM \`${DB_CONFIG.database}\`.Tenants WHERE name = 'ROI' OR company_token LIKE '%roi%'`
        );

        if (rows.length === 0) {
            console.log('✅ PASS: Tenant record NOT found in main database.');
        } else {
            console.error('❌ FAIL: Tenant record STILL EXISTS:', rows);
        }

        // 2. Check for Tenant Database
        // Based on screenshot token: token-roi-9f584a3d -> uuid prefix 9f584a3d
        // Expected DB Name pattern: sku_tenant_roi_9f584a3d
        const expectedDbName = 'sku_tenant_roi_9f584a3d';
        console.log(`\n2. Checking for existence of database '${expectedDbName}'...`);

        const [dbs] = await connection.execute(
            `SHOW DATABASES LIKE '${expectedDbName}'`
        );

        if (dbs.length === 0) {
            console.log(`✅ PASS: Database '${expectedDbName}' does NOT exist.`);
        } else {
            console.error(`❌ FAIL: Database '${expectedDbName}' STILL EXISTS.`);
        }

    } catch (err) {
        console.error('An error occurred during verification:', err);
    } finally {
        if (connection) await connection.end();
    }
}

verifyDeletion();
