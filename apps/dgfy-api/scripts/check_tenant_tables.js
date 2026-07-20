
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

async function checkTenantTables() {
    const dbName = 'sku_tenant_vonvv_24796542';
    const sequelize = new Sequelize(
        dbName,
        process.env.DB_USER || 'root',
        process.env.DB_PASSWORD || '',
        {
            host: process.env.DB_HOST || 'localhost',
            dialect: 'mysql',
            logging: false
        }
    );

    try {
        console.log(`Checking tables in tenant DB: ${dbName}`);
        const [tables] = await sequelize.query("SHOW TABLES");
        console.table(tables);
    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await sequelize.close();
    }
}

checkTenantTables();
