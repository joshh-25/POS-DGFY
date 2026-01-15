
import { Sequelize } from 'sequelize';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false
    }
);

async function diagnose() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 2. Check VONVV Batch & Item Status
        console.log('\n=== VONVV Batch (Batch 33) & Item Status ===');
        const [batches] = await sequelize.query(`
      SELECT fb.batch_id, fb.expiry_date, fb.quantity, fb.quantity_consumed, 
             i.name, i.status, i.shelf_life_days, i.fifo_enabled
      FROM fifo_batches fb
      JOIN items i ON fb.item_id = i.item_id
      WHERE i.name LIKE '%VONVV%'
    `);
        console.table(batches);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

diagnose();
