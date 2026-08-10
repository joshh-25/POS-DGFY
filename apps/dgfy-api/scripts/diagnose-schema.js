import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DBS = ['sku_inventory_manager', 'sku_test_tenant_a', 'sku_test_tenant_b'];

async function diagnose() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD
        });

        console.log('=== SCHEMA DIAGNOSTIC ===');

        for (const db of DBS) {
            console.log(`\n--- DATABASE: ${db} ---`);
            try {
                // 1. Check Items Table Columns
                const [columns] = await connection.query(`DESCRIBE \`${db}\`.items`);
                const deletedBy = columns.find(c => c.Field === 'deleted_by');
                const deletedAt = columns.find(c => c.Field === 'deleted_at');

                console.log(`items.deleted_by: ${deletedBy ? '✅ PRESENT' : '❌ MISSING'}`);
                console.log(`items.deleted_at: ${deletedAt ? '✅ PRESENT' : '❌ MISSING'}`);

                // 2. Check Migrations
                const [migrations] = await connection.query(`SELECT name FROM \`${db}\`.SequelizeMeta ORDER BY name DESC LIMIT 5`);
                console.log('Last 5 Migrations:');
                migrations.forEach(m => console.log(`  - ${m.name}`));

            } catch (error) {
                console.error(`Error checking ${db}: ${error.code || error.message}`);
                if (error.code === 'ER_BAD_DB_ERROR') console.log('(Database does not exist)');
            }
        }

    } catch (e) {
        console.error('Diagnostic failed:', e);
    } finally {
        if (connection) await connection.end();
    }
}
diagnose();
