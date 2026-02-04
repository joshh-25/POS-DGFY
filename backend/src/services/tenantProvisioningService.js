import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database.js'; // Landlord connection
import dbStore from '../utils/dbStore.js';
import util from 'util';
import { exec } from 'child_process';
import path from 'path';
import bcrypt from 'bcryptjs';
import logger from '../config/logger.js';
import { Sequelize } from 'sequelize';
import { fileURLToPath } from 'url';
import * as landlordService from './landlordService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../../');

const execPromise = util.promisify(exec);

/**
 * Provision a tenant - supports both:
 * 1. Full provisioning (new request with name, adminEmail, adminPassword)
 * 2. Approval provisioning (existing pending tenant with pre-stored data)
 */
export const provisionTenant = async (options) => {
    const {
        // Option 1: Direct provisioning (legacy)
        name,
        adminEmail,
        adminPassword,
        // Option 2: Approval provisioning (new workflow)
        tenantId,
        dbName: providedDbName,
        companyToken: providedCompanyToken,
        adminPasswordHash: providedPasswordHash
    } = options;

    // Determine if this is an approval (existing tenant) or new provisioning
    const isApproval = !!tenantId;

    let uuid, dbName, companyToken, passwordHash, tenantName, email;

    if (isApproval) {
        // Approval flow - use existing tenant data
        uuid = tenantId;
        dbName = providedDbName;
        companyToken = providedCompanyToken;
        passwordHash = providedPasswordHash;
        tenantName = name;
        email = adminEmail || options.adminEmail;

        logger.info(`[Provisioning] Approving existing tenant: ${tenantId} (DB: ${dbName})`);
    } else {
        // Legacy direct provisioning flow
        uuid = uuidv4();
        const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        dbName = `sku_tenant_${safeName}_${uuid.split('-')[0]}`;
        const subdomain = `${safeName}-${uuid.split('-')[0]}`;
        companyToken = `token-${safeName}-${uuid.split('-')[0]}`;
        passwordHash = await bcrypt.hash(adminPassword, 10);
        tenantName = name;
        email = adminEmail;

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
                status: 'inactive',
                admin_email: email,
                admin_password_hash: passwordHash
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
        await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);

        // 2. Run Migrations
        logger.info(`[Provisioning] Running migrations for ${dbName}...`);
        try {
            logger.info(`[Provisioning] Running migrations from: ${backendRoot}`);
            const env = { ...process.env, DB_NAME: dbName };
            const { stdout, stderr } = await execPromise('npx -y sequelize-cli db:migrate', {
                env,
                cwd: backendRoot
            });
            logger.info(`[Provisioning] Migration Output: ${stdout}`);
        } catch (migError) {
            logger.error(`[Provisioning] Migration Failed: ${migError.message}`);
            logger.error(migError.stderr);
            throw new Error('Migration failed');
        }

        // 3. Seed Admin User with is_master_admin = true (for their tenant)
        logger.info(`[Provisioning] Seeding Admin User...`);
        const tenantSequelize = new Sequelize(dbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
            host: process.env.DB_HOST || 'localhost',
            dialect: 'mysql',
            logging: false
        });

        try {
            await tenantSequelize.query(
                `INSERT INTO users (username, email, password_hash, role, is_active, is_master_admin, created_at, updated_at)
                 VALUES (?, ?, ?, 'admin', 1, 1, NOW(), NOW())`,
                {
                    replacements: ['Admin', email, passwordHash]
                }
            );
        } finally {
            await tenantSequelize.close();
        }

        // 4. Update tenant status to active
        const Tenant = dbStore.get('Tenant');
        await Tenant.update({ status: 'active' }, { where: { id: uuid } });

        // 5. Add email-tenant mapping for the admin user
        try {
            await landlordService.addEmailTenantMapping(email, uuid);
            logger.info(`[Provisioning] Email-tenant mapping created for ${email}`);
        } catch (mappingError) {
            // Log but don't fail provisioning if mapping fails
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

    } catch (error) {
        logger.error(`[Provisioning] Error: ${error.message}`);
        // Mark as failed
        try {
            const Tenant = dbStore.get('Tenant');
            await Tenant.update({ status: 'failed' }, { where: { id: uuid } });
        } catch (cleanupError) {
            // ignore
        }
        throw error;
    }
};
