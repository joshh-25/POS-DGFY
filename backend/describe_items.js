
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

async function describe() {
    try {
        const [results] = await sequelize.query('DESCRIBE items;');
        console.log(JSON.stringify(results, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

describe();
