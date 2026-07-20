
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

async function findLandlord() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    });

    const [databases] = await connection.query('SHOW DATABASES');
    for (const db of databases) {
        const dbName = db.Database;
        try {
            const [tables] = await connection.query(`SHOW TABLES FROM \`${dbName}\` LIKE 'tenants'`);
            if (tables.length > 0) {
                const [rows] = await connection.query(`SELECT COUNT(*) as count FROM \`${dbName}\`.tenants`);
                console.log(`Database: ${dbName}, Tenants Count: ${rows[0].count}`);
                if (rows[0].count > 0) {
                    const [tenants] = await connection.query(`SELECT id, name, db_name FROM \`${dbName}\`.tenants`);
                    console.log('Tenants:', tenants);
                }
            }
        } catch (e) {
            // Ignore errors for system DBs
        }
    }
    await connection.end();
}

findLandlord().catch(console.error);
