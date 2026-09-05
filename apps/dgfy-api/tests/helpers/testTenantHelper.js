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
import {
    Tenant,
    UserInvitation,
    UserTenantMapping,
    sequelize as landlordSequelize
} from '../../src/models/index.js';
import { getTenantModels } from '../../src/utils/tenantModelFactory.js';
import tenantConnector from '../../src/utils/TenantConnector.js';
import logger from '../../src/config/logger.js';
import { ensureLandlordTenantSchemaReady } from './landlordSchemaReadiness.js';

const ensureAuthPhoneSchema = async () => {
    if (process.env.NODE_ENV !== 'test') return;
    await ensureLandlordTenantSchemaReady();
};

// RF-4 (PR #1638 review): the matrix-generated shape is `test_tenant_template_<sha-or-"local"
// discriminator>` (see buildTemplateTenantDbName() in scripts/run-backend-test-matrix.js) --
// enforced here too since templateDbName arrives via BACKEND_TEST_MATRIX_TEMPLATE_DB, external
// environment input, not something purely metadata-derived like the table names below.
const TEMPLATE_DB_NAME_PATTERN = /^test_tenant_template_[A-Za-z0-9._-]+$/;

// RF-4: one shared escaping helper for every backtick-quoted identifier this module interpolates --
// both templateDbName (external env input, gated above by the strict shape check) and the table
// names information_schema returns (metadata-derived, but given the same treatment rather than
// assuming two trust tiers need two different helpers). Doubles a literal backtick per MySQL's own
// identifier-escaping rule.
const escapeIdentifier = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

// #1015: when the matrix runner has built a shared template tenant database (one
// tenantSeq.sync({force:true}) per matrix invocation instead of one per tenant -- see
// provisionTemplateTenantDatabase() in scripts/run-backend-test-matrix.js), clone every table from
// it instead of re-running the ~235s full-schema sync for this tenant. FK-preserving by
// construction: SHOW CREATE TABLE returns the exact CREATE statement sync() itself produced,
// including every FOREIGN KEY constraint, and every statement here executes on `tenantSeq` (already
// connected to *this* tenant's own database) with unqualified identifiers -- both the table being
// created and any FK targets it references resolve against tenantSeq's current database, i.e. this
// tenant, not the template. FOREIGN_KEY_CHECKS is a session variable, so every statement is pinned
// to one physical connection via an explicit transaction -- table creation order need not match FK
// dependency order either way, since checks are off for the whole clone.
//
// `landlordSeq` defaults to the module-level landlordSequelize singleton and is only overridable so
// a unit test can pass a fake instead of a real DB connection (see
// testTenantHelper.cloneFromTemplateDatabase.unit.test.js) -- production call sites never pass it.
export const cloneFromTemplateDatabase = async (tenantSeq, templateDbName, landlordSeq = landlordSequelize) => {
    if (!TEMPLATE_DB_NAME_PATTERN.test(String(templateDbName))) {
        throw new Error(`Refusing to clone from template tenant database with unexpected name shape: ${templateDbName}`);
    }

    const [tables] = await landlordSeq.query(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
        { replacements: [templateDbName] }
    );
    const tableNames = tables.map((row) => row.name);
    if (tableNames.length === 0) {
        throw new Error(`Template tenant database ${templateDbName} has no tables to clone`);
    }

    const createStatements = [];
    for (const tableName of tableNames) {
        const [rows] = await landlordSeq.query(
            `SHOW CREATE TABLE ${escapeIdentifier(templateDbName)}.${escapeIdentifier(tableName)}`
        );
        const createStatement = rows?.[0]?.['Create Table'];
        if (!createStatement) {
            throw new Error(`Unable to read CREATE TABLE for ${templateDbName}.${tableName}`);
        }
        createStatements.push(createStatement);
    }

    await tenantSeq.transaction(async (t) => {
        await tenantSeq.query('SET FOREIGN_KEY_CHECKS=0', { transaction: t });
        // RF-1 (PR #1638 review): previously SET FOREIGN_KEY_CHECKS=1 was the last statement in this
        // callback, so a CREATE TABLE failure mid-loop threw past it. FOREIGN_KEY_CHECKS is a session
        // variable, not transactional state -- Sequelize's own rollback of `t` releases the pooled
        // physical connection back to the pool without restoring it, silently corrupting FK
        // enforcement for whichever caller acquires that connection next. The try/finally guarantees
        // the restore always runs, still on this same `t` (same physical connection), before the
        // error is rethrown and `transaction()` rolls back -- the exception path is exercised by
        // testTenantHelper.cloneFromTemplateDatabase.unit.test.js.
        try {
            for (const createStatement of createStatements) {
                await tenantSeq.query(createStatement, { transaction: t });
            }
        } finally {
            await tenantSeq.query('SET FOREIGN_KEY_CHECKS=1', { transaction: t });
        }
    });
};

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

    await ensureAuthPhoneSchema();

    // 1. Create landlord-side Tenant record
    const tenant = await Tenant.create({
        name: `Test Tenant [${label}] ${ts}`,
        db_name: dbName,
        company_token: token,
        status: 'active',
        admin_phone: '+63 912 345 6789',
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

    // 5. Create the tables -- clone from the matrix's shared template DB when one exists,
    //    otherwise fall back to exactly today's full sync (so a bare `npm test`, or any
    //    single-file `npx jest`, keeps working unchanged with zero new env setup).
    const templateDbName = process.env.BACKEND_TEST_MATRIX_TEMPLATE_DB;
    if (templateDbName) {
        await cloneFromTemplateDatabase(tenantSeq, templateDbName);
        logger.info(`[TestTenantHelper] Cloned schema into: ${dbName} (template: ${templateDbName})`);
    } else {
        await tenantSeq.sync({ force: true });
        logger.info(`[TestTenantHelper] Synced schema into: ${dbName}`);
    }

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
        await tenantConnector.closeConnection(tenant.id);
        await tenantSeq.close();
        await landlordSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await UserInvitation.destroy({ where: { tenant_id: tenant.id } }).catch(() => null);
        await UserTenantMapping.destroy({ where: { tenant_id: tenant.id } }).catch(() => null);
        await Tenant.destroy({ where: { id: tenant.id } });
        logger.info(`[TestTenantHelper] Destroyed test tenant: ${dbName}`);
    } catch (err) {
        logger.warn(`[TestTenantHelper] Cleanup error for ${dbName}: ${err.message}`);
    }
}
