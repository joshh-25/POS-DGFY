
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
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

async function checkMigrations() {
    try {
        await sequelize.authenticate();
        const [results] = await sequelize.query('SELECT * FROM SequelizeMeta');
        console.log('Executed Migrations:', results);
        process.exit(0);
    } catch (error) {
        console.error('Error checking migrations:', error);
        process.exit(1);
    }
}

checkMigrations();
