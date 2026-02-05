
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false
});

async function explore() {
    try {
        // 1. List Tables
        console.log('--- Tables ---');
        const [tables] = await sequelize.query('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);
        console.log(tableNames.join(', '));

        // 2. Check for tenants
        if (tableNames.includes('tenants')) {
            console.log('\n--- Tenants ---');
            const [tenants] = await sequelize.query('SELECT * FROM tenants');
            console.log(JSON.stringify(tenants, null, 2));
        }

        // 3. Search Items for "Test"
        console.log('\n--- Items matching %Test% ---');
        const [items] = await sequelize.query("SELECT item_id, name, unit_of_measure FROM items WHERE name LIKE '%Test%' LIMIT 10");
        console.log(JSON.stringify(items, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

explore();
