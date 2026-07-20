import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import logger from '../src/config/logger.js';
import db from '../src/models/index.js'; // To get models
import { getTenantModels } from '../src/utils/tenantModelFactory.js';

dotenv.config();

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dialect: 'mysql',
    logging: false
};

const DATABASES = ['tenant_standard', 'tenant_premium'];

async function setupDatabases() {
    console.log('🔧 Setting up Test Tenant Databases...');

    // 1. Connect to Server (no DB) to create databases
    const rootSequelize = new Sequelize('', DB_CONFIG.user, DB_CONFIG.password, {
        host: DB_CONFIG.host,
        dialect: DB_CONFIG.dialect,
        logging: false
    });

    try {
        for (const dbName of DATABASES) {
            console.log(`\nChecking database: ${dbName}...`);
            await rootSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
            console.log(`✅ Database ${dbName} ready.`);

            // 2. Connect to specific DB and Sync Schema
            const dbSequelize = new Sequelize(dbName, DB_CONFIG.user, DB_CONFIG.password, {
                host: DB_CONFIG.host,
                dialect: DB_CONFIG.dialect,
                logging: false,
                define: {
                    underscored: true,
                    timestamps: true,
                    createdAt: 'created_at',
                    updatedAt: 'updated_at'
                }
            });

            console.log(`   Syncing schema for ${dbName}...`);

            // We need to define models on this instance to sync them
            // We can use the logic from TenantConnector/ModelFactory or just import models and init?
            // Since we are in ES modules and models are defined via imports/init, 
            // the `db` object in `models/index.js` uses the MAIN sequelize instance.
            // We need to re-init models on THIS instance.

            // Simplest way: Logic from TenantConnector uses `getTenantModels`.
            // Let's rely on that if available, or just manually init critical ones?
            // `getTenantModels` (imported above) binds models to the instance.

            // Wait, models/index.js does `db[modelName] = model(sequelize, Sequelize.DataTypes)`. 
            // But our models are class based `init`.

            // Let's use `getTenantModels` which supposedly does exactly this.
            getTenantModels(dbSequelize);

            // Sync
            await dbSequelize.sync({ alter: true });
            console.log(`   ✅ Schema synced for ${dbName}.`);

            await dbSequelize.close();
        }

    } catch (error) {
        console.error('❌ Error setting up databases:', error);
    } finally {
        await rootSequelize.close();
    }
}

setupDatabases();
