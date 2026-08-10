import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAMES = ['sku_test_tenant_a', 'sku_test_tenant_b', 'sku_inventory_manager'];

async function fix() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD, multipleStatements: true
        });

        for (const db of DB_NAMES) {
            console.log(`Fixing ${db}...`);
            await connection.query(`USE \`${db}\``);
            try {
                // Try to add deleted_by
                await connection.query(`ALTER TABLE items ADD COLUMN deleted_by INT NULL`);
                console.log(`✓ Added deleted_by to ${db}`);
            } catch (e) {
                console.log(`- deleted_by exists in ${db} or error: ${e.code}`);
            }
            try {
                // Try to add deleted_at
                await connection.query(`ALTER TABLE items ADD COLUMN deleted_at DATETIME NULL`);
                console.log(`✓ Added deleted_at to ${db}`);
            } catch (e) {
                console.log(`- deleted_at exists in ${db} or error: ${e.code}`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.end();
    }
}
fix();
