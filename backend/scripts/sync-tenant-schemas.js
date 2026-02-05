import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Sequelize } from 'sequelize';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend root
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';

async function run() {
    console.log('🚀 Starting Tenant Schema Sync...');

    // 1. Connect to MySQL to list tenants
    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
    });

    try {
        console.log(`📋 Fetching tenants from ${MAIN_DB}...`);
        await connection.query(`USE ${MAIN_DB}`);
        const [tenants] = await connection.query(`SELECT id, name, db_name, company_token FROM tenants WHERE status = 'active'`);

        console.log(`✅ Found ${tenants.length} active tenants.`);

        // 2. Iterate and Sync each tenant
        for (const tenant of tenants) {
            console.log(`\n🔄 Syncing Tenant: ${tenant.name} (${tenant.db_name})...`);

            const tenantSequelize = new Sequelize(tenant.db_name, DB_USER, DB_PASSWORD, {
                host: DB_HOST,
                dialect: 'mysql',
                logging: false // reduced noise
            });

            try {
                // Initialize models on this connection
                getTenantModels(tenantSequelize);

                // Run Sync (Alter) - this adds missing columns/tables
                await tenantSequelize.sync({ alter: true });
                console.log(`   ✅ Schema synced successfully.`);

            } catch (err) {
                console.error(`   ❌ Failed to sync ${tenant.db_name}:`, err.message);
            } finally {
                await tenantSequelize.close();
            }
        }

        console.log('\n✨ All tenant schemas processed.');

    } catch (err) {
        console.error('❌ Fatal error:', err.message);
    } finally {
        await connection.end();
    }
}

run();
