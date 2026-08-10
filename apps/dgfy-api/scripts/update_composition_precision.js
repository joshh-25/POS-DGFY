
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: console.log
});

async function run() {
    try {
        console.log('Updating product_composition table...');

        // Check if table exists
        const [results] = await sequelize.query("SHOW TABLES LIKE 'product_composition'");
        if (results.length === 0) {
            console.error("Table product_composition does not exist!");
            return;
        }

        // ALTER TABLE
        // DECIMAL(24, 12) allows for very small numbers
        await sequelize.query(
            "ALTER TABLE `product_composition` MODIFY COLUMN `quantity_required` DECIMAL(24, 12) NOT NULL;"
        );

        console.log("Successfully updated quantity_required precision to DECIMAL(24, 12).");

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await sequelize.close();
    }
}

run();
