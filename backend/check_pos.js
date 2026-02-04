
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false
    }
);

async function checkPOs() {
    try {
        const results = await sequelize.query("SELECT po_id, po_number, status FROM purchase_orders ORDER BY po_id DESC LIMIT 5", {
            type: Sequelize.QueryTypes.SELECT
        });
        console.log("Recent POs:", results);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await sequelize.close();
    }
}

checkPOs();
