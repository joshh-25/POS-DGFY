
import sequelize from '../src/config/database.js';
import logger from '../src/config/logger.js';

const fixTenantTable = async () => {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Connected.');

        console.log('Checking tenants table schema...');
        const [results] = await sequelize.query('DESCRIBE tenants');
        const columns = results.map(r => r.Field);

        if (!columns.includes('admin_email')) {
            console.log('Adding admin_email column...');
            await sequelize.query('ALTER TABLE tenants ADD COLUMN admin_email VARCHAR(255) NULL');
            console.log('admin_email column added.');
        } else {
            console.log('admin_email column already exists.');
        }

        if (!columns.includes('admin_password_hash')) {
            console.log('Adding admin_password_hash column...');
            await sequelize.query('ALTER TABLE tenants ADD COLUMN admin_password_hash VARCHAR(255) NULL');
            console.log('admin_password_hash column added.');
        } else {
            console.log('admin_password_hash column already exists.');
        }

        if (!columns.includes('plan')) {
            console.log('Adding plan column...');
            await sequelize.query("ALTER TABLE tenants ADD COLUMN plan VARCHAR(255) DEFAULT 'free'");
            console.log('plan column added.');
        } else {
            console.log('plan column already exists.');
        }

        if (!columns.includes('settings')) {
            console.log('Adding settings column...');
            await sequelize.query('ALTER TABLE tenants ADD COLUMN settings JSON NULL');
            console.log('settings column added.');
        } else {
            console.log('settings column already exists.');
        }

        console.log('Fix complete.');
        process.exit(0);
    } catch (error) {
        console.error('Error fixing table:', error);
        process.exit(1);
    }
};

fixTenantTable();
