import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const sequelize = new Sequelize(
    'sku_inventory_manager',
    process.env.DB_USER,
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST,
        dialect: process.env.DB_DIALECT,
        logging: false
    }
);

// Define Models
const JobOrder = sequelize.define('JobOrder', {
    jo_id: { type: DataTypes.INTEGER, primaryKey: true },
    jo_number: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING }
}, { tableName: 'job_orders', timestamps: false });

const JOIngredient = sequelize.define('JOIngredient', {
    jo_ingredient_id: { type: DataTypes.INTEGER, primaryKey: true },
    jo_id: { type: DataTypes.INTEGER },
    item_id: { type: DataTypes.INTEGER }
}, { tableName: 'jo_ingredients', timestamps: false });

async function listAll() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const jos = await JobOrder.findAll();
        console.log(`\nALL JOB ORDERS (${jos.length}):`);
        jos.forEach(j => {
            console.log(`- ID: ${j.jo_id}, Number: ${j.jo_number}, Status: ${j.status}`);
        });

        const ings = await JOIngredient.findAll();
        console.log(`\nALL JO INGREDIENTS (${ings.length}):`);
        ings.forEach(i => {
            console.log(`- JOID: ${i.jo_id}, ItemID: ${i.item_id}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

listAll();
