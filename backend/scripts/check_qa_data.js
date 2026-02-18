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

// Define Models (Minimal)
const JobOrder = sequelize.define('JobOrder', {
    jo_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    jo_number: { type: DataTypes.STRING },
    product_id: { type: DataTypes.INTEGER },
    tenant_id: { type: DataTypes.INTEGER },
    status: { type: DataTypes.ENUM('draft', 'in_progress', 'partial', 'completed', 'cancelled') }
}, { tableName: 'job_orders', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const Item = sequelize.define('Item', {
    item_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING },
    tenant_id: { type: DataTypes.INTEGER }
}, { tableName: 'items', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const User = sequelize.define('User', {
    user_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING },
    tenant_id: { type: DataTypes.INTEGER } // This might be via a join table in real app, but checking direct column first just in case
}, { tableName: 'users', timestamps: true });

async function checkData() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const jo = await JobOrder.findOne({ where: { jo_number: 'JO-QA-2026-001' } });
        if (jo) {
            console.log(`Found Job Order: ${jo.jo_number} (ID: ${jo.jo_id}, Status: ${jo.status}, TenantID: ${jo.tenant_id})`);
            const product = await Item.findByPk(jo.product_id);
            console.log(`Linked Product: ${product ? product.name : 'UNKNOWN'} (TenantID: ${product ? product.tenant_id : 'N/A'})`);
        } else {
            console.log('Job Order JO-QA-2026-001 NOT FOUND.');
        }

        const user = await User.findOne({ where: { email: 'admin@test.com' } });
        if (user) {
            console.log(`Admin User: ${user.email} (TenantID: ${user.tenant_id})`);
        }

        const product = await Item.findOne({ where: { name: 'QA Test Product 2026-02-18' } });
        if (product) {
            console.log(`Found Product: ${product.name} (ID: ${product.item_id})`);
        } else {
            console.log('Product QA Test Product 2026-02-18 NOT FOUND');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkData();
