import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB = 'sku_inventory_manager';

async function check() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: DB
        });

        const [tables] = await connection.query('SHOW TABLES LIKE "item_physical_properties"');
        console.log(`item_physical_properties in ${DB}: ${tables.length > 0 ? 'YES' : 'NO'}`);

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.end();
    }
}
check();
