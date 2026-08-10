import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function inspectData() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'tenant_premium'
    });

    try {
        console.log('--- Inspecting tenant_premium database ---');
        
        const [items] = await connection.query('SELECT item_id, name, current_stock, cost_per_unit FROM items WHERE name = ?', ['QA Sugar Test']);
        console.log('Sugar Test Item:', items[0] || 'NOT FOUND');

        const [suppliers] = await connection.query('SELECT supplier_id, name FROM suppliers');
        console.log('Suppliers:', suppliers);

        const [jos] = await connection.query('SELECT jo_id, jo_number, status FROM job_orders');
        console.log('Job Orders:', jos);

        const [batches] = await connection.query('SELECT batch_id, item_id, quantity, quantity_consumed FROM fifo_batches');
        console.log('FIFO Batches Count:', batches.length);
        if (batches.length > 0) {
            console.log('Sample Batch:', batches[0]);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await connection.end();
    }
}

inspectData();
