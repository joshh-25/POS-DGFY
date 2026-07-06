import './env.js';
import { Sequelize } from 'sequelize';

const resolveDatabaseName = () => {
    if (process.env.NODE_ENV === 'test') {
        return process.env.DB_NAME_TEST || (process.env.CI ? process.env.DB_NAME : null) || 'sku_test';
    }
    return process.env.DB_NAME || 'sku_inventory_manager';
};

// Points at the same landlord/global database as backend — DGFY accounts are
// global, not tenant-scoped, so this service owns its own connection to the
// same physical database rather than proxying through backend.
const sequelize = new Sequelize(
    resolveDatabaseName(),
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: process.env.DB_DIALECT || 'mysql',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
            max: 10,
            min: 0,
            acquire: 10000,
            idle: 10000
        },
        define: {
            timestamps: true,
            underscored: false,
            freezeTableName: true
        }
    }
);

export const testConnection = async () => {
    try {
        await sequelize.authenticate();
        return true;
    } catch (error) {
        return false;
    }
};

export default sequelize;
