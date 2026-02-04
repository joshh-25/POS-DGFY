import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

// Handle ES module interaction with CommonJS script logic if needed, but easier to just use raw query
// Actually, let's just use raw query with sequelize instance
const sequelize = new Sequelize(process.env.DB_NAME || 'sku_inventory_manager', 'root', '', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false
});

async function checkSchema() {
    try {
        const [results] = await sequelize.query('DESCRIBE users;');
        console.log('Columns:', results.map(r => r.Field));
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSchema();
