import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = 'sku_test_tenant_a';

async function reset() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD
        });

        console.log(`Dropping ${DB_NAME}...`);
        await connection.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
        console.log(`Creating ${DB_NAME}...`);
        await connection.query(`CREATE DATABASE \`${DB_NAME}\``);
        console.log('✓ Reset complete');
    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.end();
    }
}
reset();
