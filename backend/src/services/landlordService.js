
import { Tenant, UserTenantMapping, sequelize } from '../models/index.js';
import crypto from 'crypto';
import logger from '../config/logger.js';

/**
 * Generate a secure random token for company invites/identification
 */
const generateCompanyToken = () => {
    return crypto.randomBytes(16).toString('hex'); // 32 chars
};

/**
 * Create a new tenant (Company)
 * @param {Object} data - { name, email, plan, ... }
 * @returns {Promise<Object>} Created tenant
 */
export const createTenant = async (data) => {
    const transaction = await sequelize.transaction();
    try {
        // Generate unique DB name
        const dbName = `sku_tenant_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        // Generate company token
        const companyToken = generateCompanyToken();

        // Create tenant record
        const tenant = await Tenant.create({
            name: data.name,
            domain: data.domain || null,
            subdomain: data.subdomain || null,
            db_name: dbName,
            company_token: companyToken,
            plan: data.plan || 'free',
            status: 'active',
            settings: {
                founder_email: data.email
            }
        }, { transaction });

        await transaction.commit();
        logger.info(`Created new tenant: ${tenant.name} (${tenant.id})`);
        return tenant;
    } catch (error) {
        await transaction.rollback();
        logger.error('Failed to create tenant:', error);
        throw error;
    }
};

/**
 * Find tenant by company token
 * @param {string} token 
 * @returns {Promise<Object|null>}
 */
export const findTenantByToken = async (token) => {
    return await Tenant.findOne({
        where: { company_token: token, status: 'active' }
    });
};

/**
 * Find tenant by database name (used for reverse lookup if needed)
 * @param {string} dbName 
 */
export const findTenantByDbName = async (dbName) => {
    return await Tenant.findOne({
        where: { db_name: dbName }
    });
};

/**
 * Check if a domain/subdomain is available
 */
export const isDomainAvailable = async (domain) => {
    const tenant = await Tenant.findOne({
        where: { domain }
    });
    return !tenant;
};

/**
 * Find tenant(s) by user email from the centralized mapping table
 * @param {string} email - User email (case-insensitive)
 * @returns {Promise<Array>} Array of tenants the email is associated with
 */
export const findTenantsByEmail = async (email) => {
    const normalizedEmail = email.toLowerCase().trim();

    const mappings = await UserTenantMapping.findAll({
        where: { email: normalizedEmail },
        include: [{
            model: Tenant,
            as: 'tenant',
            where: {
                status: {
                    [sequelize.Sequelize.Op.in]: ['active', 'pending']
                }
            }
        }]
    });

    return mappings.map(m => m.tenant);
};

/**
 * Add email-to-tenant mapping (idempotent - won't error if already exists)
 * @param {string} email - User email
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object>} Created or existing mapping
 */
export const addEmailTenantMapping = async (email, tenantId) => {
    const normalizedEmail = email.toLowerCase().trim();

    try {
        const [mapping, created] = await UserTenantMapping.findOrCreate({
            where: {
                email: normalizedEmail,
                tenant_id: tenantId
            },
            defaults: {
                email: normalizedEmail,
                tenant_id: tenantId
            }
        });

        if (created) {
            logger.info(`Created email-tenant mapping: ${normalizedEmail} -> ${tenantId}`);
        }

        return { mapping, created };
    } catch (error) {
        // Handle unique constraint violation gracefully
        if (error.name === 'SequelizeUniqueConstraintError') {
            const existing = await UserTenantMapping.findOne({
                where: { email: normalizedEmail, tenant_id: tenantId }
            });
            return { mapping: existing, created: false };
        }
        throw error;
    }
};

/**
 * Remove email-to-tenant mapping
 * @param {string} email - User email
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<number>} Number of deleted rows
 */
export const removeEmailTenantMapping = async (email, tenantId) => {
    const normalizedEmail = email.toLowerCase().trim();

    const deleted = await UserTenantMapping.destroy({
        where: {
            email: normalizedEmail,
            tenant_id: tenantId
        }
    });

    if (deleted > 0) {
        logger.info(`Removed email-tenant mapping: ${normalizedEmail} -> ${tenantId}`);
    }

    return deleted;
};

/**
 * Update email mapping when a user changes their email
 * @param {string} oldEmail - Previous email
 * @param {string} newEmail - New email
 * @param {string} tenantId - Tenant UUID
 */
export const updateEmailTenantMapping = async (oldEmail, newEmail, tenantId) => {
    const normalizedOldEmail = oldEmail.toLowerCase().trim();
    const normalizedNewEmail = newEmail.toLowerCase().trim();

    if (normalizedOldEmail === normalizedNewEmail) {
        return; // No change needed
    }

    const transaction = await sequelize.transaction();
    try {
        // Remove old mapping
        await UserTenantMapping.destroy({
            where: { email: normalizedOldEmail, tenant_id: tenantId },
            transaction
        });

        // Add new mapping
        await UserTenantMapping.findOrCreate({
            where: { email: normalizedNewEmail, tenant_id: tenantId },
            defaults: { email: normalizedNewEmail, tenant_id: tenantId },
            transaction
        });

        await transaction.commit();
        logger.info(`Updated email-tenant mapping: ${normalizedOldEmail} -> ${normalizedNewEmail} for tenant ${tenantId}`);
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

export default {
    createTenant,
    findTenantByToken,
    findTenantByDbName,
    isDomainAvailable,
    findTenantsByEmail,
    addEmailTenantMapping,
    removeEmailTenantMapping,
    updateEmailTenantMapping
};
