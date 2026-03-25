/**
 * testTenantHelper.js
 *
 * Creates a real, isolated test tenant in the landlord DB with its own MySQL database.
 * Use this to exercise the full multi-tenant code path (x-company-token header) in tests.
 *
 * Usage:
 *   const ctx = await createTestTenant();
 *   // ... run tests with ctx.token as x-company-token header
 *   // ... create fixture data with ctx.models.StockMovement.create(...)
 *   await destroyTestTenant(ctx);
 */

import { Sequelize } from 'sequelize';
import { Tenant, sequelize as landlordSequelize } from '../../src/models/index.js';
import { getTenantModels } from '../../src/utils/tenantModelFactory.js';
import logger from '../../src/config/logger.js';

/**
 * Create a fully-provisioned test tenant:
 *  1. Insert a Tenant row in the landlord DB (status: active)
 *  2. CREATE DATABASE for the tenant
 *  3. Connect to the new DB and sync all models (create tables)
 *  4. Return the company_token, db name, Sequelize instance, and bound models
 *
 * @returns {Promise<{tenant, token, dbName, tenantSeq, models}>}
 */
export async function createTestTenant(label = 'default') {
    const ts = Date.now();
    const token = `test-tok-${label}-${ts}`;
    const dbName = `test_tenant_${label}_${ts}`;

    // 1. Create landlord-side Tenant record
    const tenant = await Tenant.create({
        name: `Test Tenant [${label}] ${ts}`,
        db_name: dbName,
        company_token: token,
        status: 'active',
        plan: 'premium',
        subscription_status: 'active',
        db_host: process.env.DB_HOST || 'localhost'
    });

    // 2. Create the actual MySQL database
    await landlordSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    logger.info(`[TestTenantHelper] Created test database: ${dbName}`);

    // 3. Open a Sequelize connection to the tenant DB
    const tenantSeq = new Sequelize(
        dbName,
        process.env.DB_USER || 'root',
        process.env.DB_PASSWORD || '',
        {
            host: process.env.DB_HOST || 'localhost',
            dialect: 'mysql',
            logging: false,
            pool: { max: 3, min: 0, acquire: 10000, idle: 5000 }
        }
    );
    await tenantSeq.authenticate();

    // 4. Bind all app models to this connection
    const models = getTenantModels(tenantSeq);

    // 5. Sync schema (create all tables)
    await tenantSeq.sync({ force: true });
    logger.info(`[TestTenantHelper] Synced schema into: ${dbName}`);

    return { tenant, token, dbName, tenantSeq, models };
}

/**
 * Tear down a test tenant created by createTestTenant():
 *  1. Close the tenant Sequelize connection
 *  2. DROP the tenant database
 *  3. Delete the Tenant row from the landlord DB
 */
export async function destroyTestTenant({ tenant, dbName, tenantSeq }) {
    try {
        await tenantSeq.close();
        await landlordSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await Tenant.destroy({ where: { id: tenant.id } });
        logger.info(`[TestTenantHelper] Destroyed test tenant: ${dbName}`);
    } catch (err) {
        logger.warn(`[TestTenantHelper] Cleanup error for ${dbName}:`, err.message);
    }
}
