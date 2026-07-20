
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

async function checkRoles() {
    const sequelize = new Sequelize(DB_CONFIG.database, DB_CONFIG.user, DB_CONFIG.password, {
        host: DB_CONFIG.host,
        dialect: DB_CONFIG.dialect,
        logging: false
    });

    try {
        const [results] = await sequelize.query(`SELECT email, is_master_admin FROM users WHERE email IN ('standard@test.com', 'premium@test.com')`);
        console.table(results);
    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}

checkRoles();
