
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'SKU',
    dialect: 'mysql',
    logging: false
};

async function promoteUsers() {

    const tenantDBs = ['tenant_standard', 'tenant_premium'];

    for (const dbName of tenantDBs) {
        console.log(`Promoting users in ${dbName}...`);
        const sequelize = new Sequelize(dbName, DB_CONFIG.user, DB_CONFIG.password, {
            host: DB_CONFIG.host,
            dialect: DB_CONFIG.dialect,
            logging: false
        });

        try {
            await sequelize.query(`UPDATE users SET is_master_admin = 1 WHERE email IN ('standard@test.com', 'premium@test.com')`);
            console.log(`- Success for ${dbName}`);
        } catch (e) {
            console.error(`- Error in ${dbName}:`, e.message);
        } finally {
            await sequelize.close();
        }
    }
}

promoteUsers();
