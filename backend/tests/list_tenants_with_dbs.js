
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

async function listTenants() {
    console.log('🔍 Scanning for Tenants and Databases...\n');

    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_CONFIG.host,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password
        });

        // 1. Get all tenants
        const [tenants] = await connection.execute(
            `SELECT id, name, status, db_name, created_at FROM \`${DB_CONFIG.database}\`.Tenants ORDER BY created_at DESC`
        );

        if (tenants.length === 0) {
            console.log('No tenants found in the main database.');
            return;
        }

        console.log(`Found ${tenants.length} tenant records. Checking for databases...\n`);
        console.log('----------------------------------------------------------------------------------------------------------------');
        console.log('| Name                           | Status       | Database Name                        | DB Exists? | Created At          |');
        console.log('----------------------------------------------------------------------------------------------------------------');

        for (const tenant of tenants) {
            let dbExists = 'NO';
            let dbName = tenant.db_name || 'N/A';

            if (tenant.db_name) {
                const [dbs] = await connection.execute(
                    `SHOW DATABASES LIKE '${tenant.db_name}'`
                );
                if (dbs.length > 0) {
                    dbExists = 'YES';
                }
            }

            console.log(
                `| ${tenant.name.padEnd(30)} | ${tenant.status.padEnd(12)} | ${dbName.padEnd(36)} | ${dbExists.padEnd(10)} | ${new Date(tenant.created_at).toISOString().split('T')[0]}          |`
            );
        }
        console.log('----------------------------------------------------------------------------------------------------------------');

    } catch (err) {
        console.error('An error occurred:', err);
    } finally {
        if (connection) await connection.end();
    }
}

listTenants();
