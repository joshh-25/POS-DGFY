
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const LANDING_DB = process.env.DB_NAME || 'sku_inventory_manager';

async function checkMeta() {
    let connection;
    try {
        console.log(`Connecting to ${LANDING_DB}...`);
        connection = await mysql.createConnection({
            host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: LANDING_DB
        });

        const [rows] = await connection.query('SELECT * FROM SequelizeMeta');
        console.log('Executed Migrations:');
        rows.forEach(r => console.log(r.name));

        const migrationName = '20260217161100-add-notification-tracking-to-tenants.cjs';
        if (rows.find(r => r.name === migrationName)) {
            console.log(`\nMigration ${migrationName} is marked as EXECUTED.`);
        } else {
            console.log(`\nMigration ${migrationName} is NOT executed.`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.end();
    }
}
checkMeta();
