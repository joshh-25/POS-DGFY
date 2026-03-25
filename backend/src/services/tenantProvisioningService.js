import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database.js'; // Landlord connection
import dbStore from '../utils/dbStore.js';
import bcrypt from 'bcryptjs';
import logger from '../config/logger.js';
import { Sequelize } from 'sequelize';
import * as landlordService from './landlordService.js';

// Strict allowlist pattern for all tenant database names.
// Guards every DDL path against invalid or maliciously crafted identifiers.
const DB_NAME_PATTERN = /^sku_tenant_[a-z0-9]+_[a-z0-9]+$/;

/**
 * Provision a tenant - supports both:
 * 1. Full provisioning (new request with name, adminEmail, adminPassword)
 * 2. Approval provisioning (existing pending tenant with pre-stored data)
 */
export const provisionTenant = async (options) => {
    const {
        // Option 1: Direct provisioning (legacy/manual)
        name,
        adminEmail,
        adminPassword,
        plan = 'standard',        // Default to standard if not provided
        subscriptionId = null,    // Optional subscription ID for manual entry
        // Option 2: Approval provisioning (new workflow)
        tenantId,
        dbName: providedDbName,
        companyToken: providedCompanyToken,
        adminPasswordHash: providedPasswordHash
    } = options;

    // Determine if this is an approval (existing tenant) or new provisioning
    const isApproval = !!tenantId;

    let uuid, dbName, companyToken, passwordHash, tenantName, email;
    let subscriptionStatus = 'inactive';
    let currentPeriodEnd = null;

    if (isApproval) {
        // Approval flow - use existing tenant data
        uuid = tenantId;
        dbName = providedDbName;
        if (!DB_NAME_PATTERN.test(dbName)) {
            throw new Error(`Security: Invalid database name in approval flow: ${dbName}`);
        }
        companyToken = providedCompanyToken;
        passwordHash = providedPasswordHash;
        tenantName = name;
        email = adminEmail || options.adminEmail;

        logger.info(`[Provisioning] Approving existing tenant: ${tenantId} (DB: ${dbName})`);
    } else {
        // Legacy/Manual provisioning flow
        uuid = uuidv4();
        const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        dbName = `sku_tenant_${safeName}_${uuid.split('-')[0]}`;
        if (!DB_NAME_PATTERN.test(dbName)) {
            throw new Error(`Security: Invalid database name generated: ${dbName}`);
        }
        const subdomain = `${safeName}-${uuid.split('-')[0]}`;
        companyToken = `token-${safeName}-${uuid.split('-')[0]}`;
        passwordHash = await bcrypt.hash(adminPassword, 10);
        tenantName = name;
        email = adminEmail;

        // Set initial subscription status based on plan for manual entries
        if (plan === 'premium') {
            subscriptionStatus = 'active'; // Assume active if manually creating premium
            currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        } else if (plan === 'standard') {
            // Standard usually pending, but if manually provisioning, assume approval given
            subscriptionStatus = 'inactive'; // Standard doesn't have "subscription" per se
        }

        logger.info(`[Provisioning] Starting new provision for: ${name} (DB: ${dbName})`);

        // Create tenant record first
        const transaction = await sequelize.transaction();
        try {
            const Tenant = dbStore.get('Tenant');
            await Tenant.create({
                id: uuid,
                name,
                domain: subdomain,
                db_name: dbName,
                company_token: companyToken,
                status: 'inactive', // Will be updated to active upon success
                admin_email: email,
                admin_password_hash: passwordHash,
                plan: plan,
                subscription_status: subscriptionStatus,
                paypal_subscription_id: subscriptionId,
                current_period_end: currentPeriodEnd
            }, { transaction });
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    try {
        // 1. Create Database
        logger.info(`[Provisioning] Creating database ${dbName}...`);
        const safeCreateIdentifier = sequelize.getQueryInterface().quoteIdentifier(dbName);
        await sequelize.query(`CREATE DATABASE IF NOT EXISTS ${safeCreateIdentifier}`);

        // 2. Setup Connection for Sync & Seed
        const tenantSequelize = new Sequelize(dbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
            host: process.env.DB_HOST || 'localhost',
            dialect: 'mysql',
            logging: false
        });

        try {
            // 3. Sync Schema (Create Tables)
            logger.info(`[Provisioning] Syncing schema for ${dbName}...`);
            const { getTenantModels } = await import('../utils/tenantModelFactory.js');
            getTenantModels(tenantSequelize);
            await tenantSequelize.sync({ alter: true });
            logger.info(`[Provisioning] Schema synced successfully`);

            // 4. Seed Admin User
            logger.info(`[Provisioning] Seeding Admin User...`);
            await tenantSequelize.query(
                `INSERT INTO users (username, email, password_hash, role, is_active, is_master_admin, created_at, updated_at)
                 VALUES (?, ?, ?, 'admin', 1, 1, NOW(), NOW())`,
                {
                    replacements: ['Admin', email, passwordHash]
                }
            );

            // 5. Update tenant status to active
            const Tenant = dbStore.get('Tenant');
            await Tenant.update({ status: 'active' }, { where: { id: uuid } });

            // 6. Add email-tenant mapping
            try {
                await landlordService.addEmailTenantMapping(email, uuid);
                logger.info(`[Provisioning] Email-tenant mapping created for ${email}`);
            } catch (mappingError) {
                logger.warn(`[Provisioning] Failed to create email-tenant mapping: ${mappingError.message}`);
            }

            logger.info(`[Provisioning] Tenant provisioned successfully!`);
            return {
                id: uuid,
                name: tenantName,
                company_token: companyToken,
                admin_email: email,
                status: 'active'
            };

        } finally {
            await tenantSequelize.close();
        }

    } catch (error) {
        logger.error(`[Provisioning] Error: ${error.message}`);

        // 1. Mark tenant record as failed
        try {
            const Tenant = dbStore.get('Tenant');
            await Tenant.update({ status: 'failed' }, { where: { id: uuid } });
        } catch (cleanupError) {
            logger.warn(`[Provisioning] Failed to mark tenant as failed: ${cleanupError.message}`);
        }

        // 2. Drop the zombie database (compensating transaction)
        // The DB_NAME_PATTERN guard inside deleteTenantDatabase makes this safe.
        if (dbName && DB_NAME_PATTERN.test(dbName)) {
            try {
                await deleteTenantDatabase(dbName);
                logger.info(`[Provisioning] Zombie database ${dbName} dropped during cleanup`);
            } catch (dropError) {
                logger.error(`[Provisioning] CRITICAL: Failed to drop zombie database ${dbName}: ${dropError.message}`);
            }
        }

        throw error;
    }
};

/**
 * Safely drop a tenant database
 * CAUTION: This is a destructive operation!
 */
export const deleteTenantDatabase = async (dbName) => {
    if (!dbName || !DB_NAME_PATTERN.test(dbName)) {
        throw new Error('Invalid database name for deletion (must match sku_tenant_<name>_<uuid>)');
    }

    logger.warn(`[Provisioning] PERMANENTLY DELETING database: ${dbName}`);

    try {
        const safeDropIdentifier = sequelize.getQueryInterface().quoteIdentifier(dbName);
        await sequelize.query(`DROP DATABASE IF EXISTS ${safeDropIdentifier}`);
        logger.info(`[Provisioning] Database ${dbName} deleted successfully`);
        return true;
    } catch (error) {
        logger.error(`[Provisioning] Failed to delete database ${dbName}: ${error.message}`);
        throw error;
    }
};
