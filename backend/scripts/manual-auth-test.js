import { Sequelize } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import * as authService from '../src/services/authService.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const TENANT_DB = 'sku_test_tenant_a'; // Hardcoded
const USER_EMAIL = 'admin@tenant-a.com';
const USER_PASS = 'Admin123!';

async function testAuth() {
    console.log('--- Starting Manual Auth Test ---');

    // 1. Setup Connection
    const sequelize = new Sequelize(TENANT_DB, DB_USER, DB_PASSWORD, {
        host: DB_HOST,
        dialect: 'mysql',
        logging: false
    });

    try {
        await sequelize.authenticate();
        console.log('✓ Connected to Tenant DB');

        // 2. Setup Context
        const tenantModels = getTenantModels(sequelize);

        const context = {
            sequelize,
            tenantId: 'test-uuid',
            ...tenantModels
        };

        // 3. Run Login in Context
        await dbStore.run(context, async () => {
            console.log('Inside dbStore context...');
            try {
                const user = await authService.loginUser(USER_EMAIL, USER_PASS);
                console.log('✓ Login SUCCESS:', user.email, user.role);
            } catch (error) {
                console.error('❌ Login FAILED:', error.message);
                console.error(error);
            }
        });

    } catch (error) {
        console.error('Setup failed:', error);
    } finally {
        await sequelize.close();
    }
}

testAuth();
