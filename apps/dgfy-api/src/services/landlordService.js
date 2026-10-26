
import { Op } from 'sequelize';
import { Tenant, UserTenantMapping, UserInvitation, DgfyAccountTenantMembership, sequelize } from '../models/index.js';
import crypto from 'crypto';
import logger from '../config/logger.js';

// Keep tenant lookups resilient when landlord schemas are slightly behind
// (e.g., test fixtures not yet migrated with optional billing columns).
const ESSENTIAL_TENANT_LOOKUP_ATTRIBUTES = [
    'id',
    'name',
    'company_token',
    'db_name',
    'db_host',
    'status',
    'plan'
];

const OPTIONAL_TENANT_LOOKUP_ATTRIBUTES = [
    'subscription_status',
    'current_period_end',
    'grace_period_end',
    'payment_method',
    'rejection_reason',
    'compliance_mode_state',
    'compliance_mode_choice_required',
    'compliance_mode_selected_at',
    'compliance_mode_selected_by',
    'compliance_activated_at',
    'compliance_policy_version',
    'compliance_profile'
];

const TENANT_LOOKUP_ATTRIBUTE_CANDIDATES = [
    ...ESSENTIAL_TENANT_LOOKUP_ATTRIBUTES,
    ...OPTIONAL_TENANT_LOOKUP_ATTRIBUTES
];

export const hashInvitationToken = (token) => (
    crypto.createHash('sha256').update(String(token || '').trim()).digest('hex')
);

let tenantLookupAttributeCache = {
    attributes: TENANT_LOOKUP_ATTRIBUTE_CANDIDATES,
    expiresAt: 0
};

const TENANT_LOOKUP_ATTRIBUTE_CACHE_TTL_MS = 5 * 60 * 1000;

const resolveTenantLookupAttributes = async () => {
    if (tenantLookupAttributeCache.expiresAt > Date.now()) {
        return tenantLookupAttributeCache.attributes;
    }

    try {
        const queryInterface = sequelize.getQueryInterface();
        const tableDef = await queryInterface.describeTable('tenants');
        const availableColumns = new Set(Object.keys(tableDef || {}));

        const resolvedAttributes = TENANT_LOOKUP_ATTRIBUTE_CANDIDATES.filter((column) => (
            availableColumns.has(column)
        ));

        const missingOptional = OPTIONAL_TENANT_LOOKUP_ATTRIBUTES.filter((column) => !availableColumns.has(column));
        if (missingOptional.length > 0) {
            logger.warn(`[LandlordService] Optional tenants columns missing: ${missingOptional.join(', ')}. Compatibility fallback applied.`);
        }

        const missingEssential = ESSENTIAL_TENANT_LOOKUP_ATTRIBUTES.filter((column) => !availableColumns.has(column));
        if (missingEssential.length > 0) {
            logger.error(`[LandlordService] Essential tenants columns missing: ${missingEssential.join(', ')}. Tenant lookup may be degraded.`);
        }

        tenantLookupAttributeCache = {
            attributes: resolvedAttributes.length > 0 ? resolvedAttributes : ESSENTIAL_TENANT_LOOKUP_ATTRIBUTES,
            expiresAt: Date.now() + TENANT_LOOKUP_ATTRIBUTE_CACHE_TTL_MS
        };
        return tenantLookupAttributeCache.attributes;
    } catch (error) {
        logger.error(`[LandlordService] Failed to resolve tenant lookup attributes from schema: ${error.message}`);
        tenantLookupAttributeCache = {
            attributes: ESSENTIAL_TENANT_LOOKUP_ATTRIBUTES,
            expiresAt: Date.now() + TENANT_LOOKUP_ATTRIBUTE_CACHE_TTL_MS
        };
        return tenantLookupAttributeCache.attributes;
    }
};

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
    const attributes = await resolveTenantLookupAttributes();
    return await Tenant.findOne({
        where: { company_token: token },
        attributes
    });
};

export const findTenantById = async (tenantId) => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) return null;

    const attributes = await resolveTenantLookupAttributes();
    return await Tenant.findOne({
        where: { id: normalizedTenantId },
        attributes
    });
};

export const findInvitationByToken = async (token, options = {}) => {
    const tokenHash = hashInvitationToken(token);
    return UserInvitation.findOne({
        where: {
            token_hash: tokenHash,
            ...(options.status ? { status: options.status } : {})
        },
        include: [{
            model: Tenant,
            as: 'tenant',
            attributes: await resolveTenantLookupAttributes()
        }]
    });
};

export const resolveInvitationTenantTokenByToken = async (token) => {
    const invitation = await findInvitationByToken(token, { status: 'pending' });
    if (!invitation || !invitation.tenant) return null;
    return invitation.tenant.company_token || null;
};

export const upsertUserInvitationRegistry = async ({
    tenantId,
    tenantUserId,
    email,
    role,
    token,
    status = 'pending',
    deliveryStatus = 'manual_link',
    deliveryError = null,
    staffRoleId = null,
    staffRoleName = null,
    cancellationReason = null,
    invitedByUserId = null,
    invitedByName = null,
    expiresAt,
    lastSentAt = null
}) => {
    const tokenHash = hashInvitationToken(token);
    const where = {
        tenant_id: tenantId,
        tenant_user_id: tenantUserId
    };
    const defaults = {
        tenant_id: tenantId,
        tenant_user_id: tenantUserId,
        email: String(email || '').trim().toLowerCase(),
        role,
        staff_role_id: staffRoleId,
        staff_role_name: staffRoleName,
        cancellation_reason: cancellationReason,
        token_hash: tokenHash,
        status,
        delivery_status: deliveryStatus,
        delivery_error: deliveryError,
        invited_by_user_id: invitedByUserId,
        invited_by_name: invitedByName,
        expires_at: expiresAt,
        last_sent_at: lastSentAt,
        accepted_at: null,
        cancelled_at: null,
        cancelled_by_user_id: null
    };

    const [row, created] = await UserInvitation.findOrCreate({ where, defaults });
    if (!created) {
        await row.update(defaults);
    }
    return created ? row : row.reload();
};

export const updateInvitationRegistryByTenantUser = async ({
    tenantId,
    tenantUserId,
    updates = {}
}) => {
    const row = await UserInvitation.findOne({
        where: {
            tenant_id: tenantId,
            tenant_user_id: tenantUserId
        }
    });
    if (!row) return null;
    await row.update(updates);
    return row.reload();
};

export const findInvitationRegistryByTenantUser = async ({ tenantId, tenantUserId }) => UserInvitation.findOne({
    where: { tenant_id: tenantId, tenant_user_id: tenantUserId }
});

export const listInvitationRegistryMetadataByTenantUsers = async ({ tenantId, tenantUserIds = [] }) => {
    const ids = [...new Set((tenantUserIds || []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
    if (!tenantId || ids.length === 0) return [];
    return UserInvitation.findAll({
        where: { tenant_id: tenantId, tenant_user_id: { [Op.in]: ids } },
        attributes: ['tenant_user_id', 'staff_role_id', 'staff_role_name', 'cancellation_reason', 'status']
    });
};

export const transitionInvitationRegistryByTenantUser = async ({
    tenantId,
    tenantUserId,
    expectedStatus,
    updates = {}
}) => {
    const [updatedCount] = await UserInvitation.update(updates, {
        where: { tenant_id: tenantId, tenant_user_id: tenantUserId, status: expectedStatus }
    });
    if (updatedCount !== 1) return null;
    return findInvitationRegistryByTenantUser({ tenantId, tenantUserId });
};

export const deleteInvitationRegistryByTenantUser = async ({ tenantId, tenantUserId }) => {
    return UserInvitation.destroy({ where: { tenant_id: tenantId, tenant_user_id: tenantUserId } });
};

export const syncStaffRoleInvitationCancellations = async ({
    tenantId,
    staffRoleId,
    actorUserId = null,
    cancelledAt = new Date()
}) => {
    const rows = await UserInvitation.findAll({
        where: {
            tenant_id: tenantId,
            staff_role_id: staffRoleId,
            [Op.or]: [
                { status: 'pending' },
                { status: 'cancelled', cancellation_reason: 'staff_role_unavailable' }
            ]
        },
        attributes: ['tenant_user_id', 'status']
    });
    const tenantUserIds = [...new Set(rows.map((row) => Number(row.tenant_user_id)).filter((id) => Number.isInteger(id) && id > 0))];
    let cancelledCount = 0;

    for (const row of rows) {
        if (row.status !== 'pending') continue;
        const [updatedCount] = await UserInvitation.update({
            status: 'cancelled',
            cancellation_reason: 'staff_role_unavailable',
            cancelled_at: cancelledAt,
            cancelled_by_user_id: actorUserId
        }, {
            where: {
                tenant_id: tenantId,
                tenant_user_id: row.tenant_user_id,
                staff_role_id: staffRoleId,
                status: 'pending'
            }
        });
        cancelledCount += updatedCount === 1 ? 1 : 0;
    }

    if (tenantUserIds.length > 0) {
        await DgfyAccountTenantMembership.update({ status: 'removed' }, {
            where: {
                tenant_id: tenantId,
                tenant_user_id: { [Op.in]: tenantUserIds },
                source: 'invite',
                status: 'pending'
            }
        });
    }

    return { cancelled_count: cancelledCount, synchronized_tenant_user_count: tenantUserIds.length };
};

/**
 * Find tenant by database name (used for reverse lookup if needed)
 * @param {string} dbName 
 */
export const findTenantByDbName = async (dbName) => {
    const attributes = await resolveTenantLookupAttributes();
    return await Tenant.findOne({
        where: { db_name: dbName },
        attributes
    });
};

/**
 * Check if a domain/subdomain is available
 */
export const isDomainAvailable = async (domain) => {
    const tenant = await Tenant.findOne({
        where: { domain },
        attributes: ['id']
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
    const attributes = await resolveTenantLookupAttributes();

    const mappings = await UserTenantMapping.findAll({
        where: { email: normalizedEmail },
        include: [{
            model: Tenant,
            as: 'tenant',
            attributes,
            where: {
                status: {
                    [sequelize.Sequelize.Op.in]: ['active', 'pending', 'inactive']
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
export const addEmailTenantMapping = async (email, tenantId, options = {}) => {
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
            },
            ...options
        });

        if (created) {
            logger.info(`Created email-tenant mapping: ${normalizedEmail} -> ${tenantId}`);
        }

        return { mapping, created };
    } catch (error) {
        // Handle unique constraint violation gracefully
        if (error.name === 'SequelizeUniqueConstraintError') {
            const existing = await UserTenantMapping.findOne({
                where: { email: normalizedEmail, tenant_id: tenantId },
                ...options
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
export const updateEmailTenantMapping = async (oldEmail, newEmail, tenantId, options = {}) => {
    const normalizedOldEmail = oldEmail.toLowerCase().trim();
    const normalizedNewEmail = newEmail.toLowerCase().trim();

    if (normalizedOldEmail === normalizedNewEmail) {
        return; // No change needed
    }

    const ownsTransaction = !options.transaction;
    const transaction = options.transaction || await sequelize.transaction();
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

        if (ownsTransaction) await transaction.commit();
        logger.info(`Updated email-tenant mapping: ${normalizedOldEmail} -> ${normalizedNewEmail} for tenant ${tenantId}`);
    } catch (error) {
        if (ownsTransaction) await transaction.rollback();
        throw error;
    }
};

export default {
    createTenant,
    findTenantByToken,
    findTenantById,
    findTenantByDbName,
    findInvitationByToken,
    resolveInvitationTenantTokenByToken,
    upsertUserInvitationRegistry,
    updateInvitationRegistryByTenantUser,
    hashInvitationToken,
    isDomainAvailable,
    findTenantsByEmail,
    addEmailTenantMapping,
    removeEmailTenantMapping,
    updateEmailTenantMapping
};
