
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

async function cleanupTestTenants() {
    console.log('🧹 Starting Cleanup of Test Tenants...\n');

    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_CONFIG.host,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password
        });

        // 1. Identify Test Tenants
        // We look for patterns used in testing: TestCorp%, Prem Co%, Std Co%
        const query = `
            SELECT id, name, db_name 
            FROM \`${DB_CONFIG.database}\`.Tenants 
            WHERE name LIKE 'TestCorp%' 
               OR name LIKE 'Prem Co%' 
               OR name LIKE 'Std Co%'
               OR name LIKE 'Test Tenant%'
               OR name LIKE 'Auto Provisioned Tenant%'
        `;

        const [tenants] = await connection.execute(query);

        if (tenants.length === 0) {
            console.log('✅ No test tenants found matching criteria.');
            return;
        }

        console.log(`Found ${tenants.length} test tenants to delete:`);
        tenants.forEach(t => console.log(` - [${t.id}] ${t.name} (DB: ${t.db_name || 'None'})`));
        console.log('\nProceeding with deletion...\n');

        // 2. Iterate and Delete
        for (const tenant of tenants) {
            console.log(`Processing '${tenant.name}'...`);

            // A. Drop Tenant Database
            if (tenant.db_name) {
                try {
                    console.log(`   > Dropping database '${tenant.db_name}'...`);
                    await connection.query(`DROP DATABASE IF EXISTS \`${tenant.db_name}\``);
                    console.log(`   > ✅ Database dropped.`);
                } catch (dbErr) {
                    console.error(`   > ❌ Failed to drop database: ${dbErr.message}`);
                }
            } else {
                console.log(`   > No database assigned.`);
            }

            // B. Delete Tenant Record
            try {
                console.log(`   > Deleting record from Tenants table...`);
                await connection.execute(
                    `DELETE FROM \`${DB_CONFIG.database}\`.Tenants WHERE id = ?`,
                    [tenant.id]
                );
                console.log(`   > ✅ Record deleted.`);
            } catch (recErr) {
                console.error(`   > ❌ Failed to delete record: ${recErr.message}`);
            }
            console.log('-------------------------------------------');
        }

        console.log('\n✨ Cleanup Complete.');

    } catch (err) {
        console.error('An error occurred during cleanup:', err);
    } finally {
        if (connection) await connection.end();
    }
}

cleanupTestTenants();
