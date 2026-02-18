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
const StockMovement = sequelize.define('StockMovement', {
    movement_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    item_id: { type: DataTypes.INTEGER },
    quantity: { type: DataTypes.DECIMAL(12, 2) },
    movement_type: { type: DataTypes.STRING },
    reference_id: { type: DataTypes.STRING },
    created_at: { type: DataTypes.DATE }
}, { tableName: 'stock_movements', timestamps: false });

const Item = sequelize.define('Item', {
    item_id: { type: DataTypes.INTEGER, primaryKey: true },
    name: { type: DataTypes.STRING },
    current_stock: { type: DataTypes.DECIMAL(12, 2) }
}, { tableName: 'items', timestamps: false });

async function checkMovements() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const joNumber = 'JO-QA-2026-001';
        console.log(`Checking movements for ${joNumber}...`);

        const movements = await StockMovement.findAll({
            where: { reference_id: joNumber }
        });

        if (movements.length === 0) {
            console.log('No movements found for this JO.');
        } else {
            for (const m of movements) {
                const item = await Item.findByPk(m.item_id);
                console.log(`- Item: ${item ? item.name : m.item_id}, Qty: ${m.quantity}, Type: ${m.movement_type}`);
            }
        }

        const sugar = await Item.findOne({ where: { name: 'QA Sugar Test' } });
        if (sugar) {
            console.log(`\nSugar Stock: ${sugar.current_stock}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkMovements();
