import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const LANDING_DB = process.env.DB_NAME || 'sku_inventory_manager';

async function inspect() {
    let connection;
    try {
        console.log(`Connecting to ${LANDING_DB}...`);
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: LANDING_DB
        });

        const [columns] = await connection.query('DESCRIBE tenants');
        const fields = columns.map(c => c.Field);
        console.log('Columns in tenants table:', JSON.stringify(fields, null, 2));

        if (fields.includes('last_expiry_notified_at')) {
            console.log('SUCCESS: last_expiry_notified_at exists.');
        } else {
            console.error('FAILURE: last_expiry_notified_at MISSING.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.end();
    }
}
inspect();
