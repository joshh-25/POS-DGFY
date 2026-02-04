import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DATA_DB = 'sku_test_tenant_a';
const MIGRATION = '20250101000001-create-item-physical-properties.js';

async function check() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: DATA_DB
        });

        const [rows] = await connection.query('SELECT name FROM SequelizeMeta WHERE name = ?', [MIGRATION]);
        console.log(`Migration ${MIGRATION}: ${rows.length > 0 ? 'EXECUTED' : 'NOT EXECUTED'}`);

        // Also check table
        const [tables] = await connection.query("SHOW TABLES LIKE 'item_physical_properties'");
        console.log(`Table item_physical_properties: ${tables.length > 0 ? 'EXISTS' : 'MISSING'}`);

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.end();
    }
}
check();
