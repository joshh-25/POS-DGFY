import { Sequelize, DataTypes, Op } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

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

const Item = sequelize.define('Item', {
    item_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sku_code: { type: DataTypes.STRING(50) },
    name: { type: DataTypes.STRING(255) },
    category: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING }
}, {
    tableName: 'items',
    timestamps: false
});

async function check() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB.');

        const items = await Item.findAll({
            where: {
                sku_code: {
                    [Op.in]: ['PKG-006', 'PKG-007', 'PKG-008', 'PKG-009', 'PKG-010'] // PKG-010 was visible
                }
            }
        });

        console.log('Found items:', items.map(i => ({ sku: i.sku_code, name: i.name, status: i.status })));
        console.log('Total found:', items.length);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

check();
