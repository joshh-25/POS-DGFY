import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = 'sku_test_tenant_a';

async function fix() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: DB_NAME
        });

        const MIGRATION = '20250101000001-create-item-physical-properties.js';
        console.log(`Inserting ${MIGRATION} into SequelizeMeta...`);

        await connection.query(
            `INSERT INTO SequelizeMeta (name) VALUES (?) 
             ON DUPLICATE KEY UPDATE name=name`,
            [MIGRATION]
        );
        console.log('✓ Fixed.');

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.end();
    }
}
fix();
