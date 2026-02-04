import { Sequelize } from 'sequelize';
import sequelize from '../src/config/database.js';

const searchForUser = async () => {
    const email = 'admin@test.com';
    console.log(`Searching for user: ${email}`);

    try {
        // 1. Search Landlord DB (Tenants)
        await sequelize.authenticate();
        const [tenants] = await sequelize.query(`SELECT * FROM tenants WHERE admin_email = '${email}'`);
        if (tenants.length > 0) {
            console.log('✅ Found in Landlord DB (Tenants):', JSON.stringify(tenants, null, 2));
        } else {
            console.log('❌ Not found in Landlord DB (Tenants).');
        }

        // 2. Search Tenant A DB (Users)
        const tenantDbName = 'sku_test_tenant_a';
        const tenantSeq = new Sequelize(tenantDbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
            host: process.env.DB_HOST || 'localhost',
            dialect: 'mysql',
            logging: false
        });

        const [users] = await tenantSeq.query(`SELECT * FROM users WHERE email = '${email}'`);
        if (users.length > 0) {
            console.log('✅ Found in Tenant A DB (Users):', JSON.stringify(users, null, 2));
        } else {
            console.log('❌ Not found in Tenant A DB (Users).');
        }
        await tenantSeq.close();

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await sequelize.close();
    }
};

searchForUser();
