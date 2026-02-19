
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function checkTable() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sku_inventory_manager'
    });

    const [rows] = await conn.query('DESCRIBE tenants');
    console.log(rows.map(r => r.Field));
    await conn.end();
}

checkTable();
