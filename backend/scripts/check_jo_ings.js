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
    jo_number: { type: DataTypes.STRING }
}, { tableName: 'job_orders', timestamps: false });

const JOIngredient = sequelize.define('JOIngredient', {
    jo_ingredient_id: { type: DataTypes.INTEGER, primaryKey: true },
    jo_id: { type: DataTypes.INTEGER },
    item_id: { type: DataTypes.INTEGER },
    quantity_required: { type: DataTypes.DECIMAL(12, 2) }
}, { tableName: 'jo_ingredients', timestamps: false });

async function checkIngs() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const jo = await JobOrder.findOne({ where: { jo_number: 'JO-QA-2026-001' } });
        if (!jo) {
            console.log('JO NOT FOUND');
            return;
        }
        console.log(`JO found: ${jo.jo_id}`);

        const ings = await JOIngredient.findAll({
            where: { jo_id: jo.jo_id }
        });

        console.log(`Found ${ings.length} ingredients for JO ${jo.jo_id}`);
        ings.forEach(i => {
            console.log(`- ItemID: ${i.item_id}, Req: ${i.quantity_required}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkIngs();
