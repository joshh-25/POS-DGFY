import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const TENANT_DB = 'sku_inventory_manager';

async function inspect() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: TENANT_DB
        });

        const [columns] = await connection.query('DESCRIBE items');
        console.log(JSON.stringify(columns.map(c => c.Field), null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.end();
    }
}
inspect();
