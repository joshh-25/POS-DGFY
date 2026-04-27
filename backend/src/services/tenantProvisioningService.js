import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database.js'; // Landlord connection
import dbStore from '../utils/dbStore.js';
import bcrypt from 'bcryptjs';
import logger from '../config/logger.js';
import { Sequelize } from 'sequelize';
import * as landlordService from './landlordService.js';
import { syncStorefrontDiscoveryWithReliability } from './storefrontDiscoverySyncReliabilityService.js';
import { normalizeWorkflowMode } from '../modules/shared/constants/workflowModes.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';

// Strict allowlist pattern for all tenant database names.
// Guards every DDL path against invalid or maliciously crafted identifiers.
const DB_NAME_PATTERN = /^sku_tenant_[a-z0-9]+_[a-z0-9]+$/;

const readNumericEnv = (key, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) => {
    const raw = process.env[key];
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        return fallback;
    }
    if (value < min || value > max) {
        logger.warn('[Provisioning] Invalid storefront default env value; using fallback', {
            key,
            providedValue: raw,
            min,
            max,
            fallback
        });
        return fallback;
    }
    return value;
};

const readTextEnv = (key, fallback) => {
    const value = String(process.env[key] || '').trim();
    return value || fallback;
};

const DEFAULT_STOREFRONT_LOCATION = Object.freeze({
    name: readTextEnv('STOREFRONT_DEFAULT_LOCATION_NAME', 'Main Branch'),
    address_line: readTextEnv('STOREFRONT_DEFAULT_LOCATION_ADDRESS', 'Iloilo City'),
    latitude: readNumericEnv('STOREFRONT_DEFAULT_LATITUDE', 10.699817, { min: -90, max: 90 }),
    longitude: readNumericEnv('STOREFRONT_DEFAULT_LONGITUDE', 122.559893, { min: -180, max: 180 }),
    delivery_radius_km: readNumericEnv('STOREFRONT_DEFAULT_DELIVERY_RADIUS_KM', 5, { min: 0.1, max: 100 }),
    current_wait_time_minutes: Math.round(readNumericEnv('STOREFRONT_DEFAULT_WAIT_MINUTES', 15, { min: 0, max: 240 }))
});

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const ONBOARDING_STATE_SETTING_KEY = 'tenant_onboarding_state';
const ONBOARDING_STARTED_AT_SETTING_KEY = 'tenant_onboarding_started_at';
const ONBOARDING_COMPLETED_AT_SETTING_KEY = 'tenant_onboarding_completed_at';
const ONBOARDING_PROGRESS_SETTING_KEY = 'tenant_onboarding_progress';

const seedDefaultStorefrontLocation = async (tenantSequelize) => {
    const { getTenantModels } = await import('../utils/tenantModelFactory.js');
    const { TenantLocation } = getTenantModels(tenantSequelize);

    if (!TenantLocation) {
        return { status: 'skipped', reason: 'tenant_location_model_unavailable' };
    }

    const existingCount = await TenantLocation.count();
    if (existingCount > 0) {
        const currentPrimary = await TenantLocation.findOne({
            where: {
                is_active: true,
                is_primary_storefront: true
            }
        });
        if (!currentPrimary) {
            const fallback = await TenantLocation.findOne({
                where: { is_active: true },
                order: [
                    ['is_open', 'DESC'],
                    ['updated_at', 'DESC'],
                    ['location_id', 'DESC']
                ]
            });
            if (fallback) {
                await fallback.update({ is_primary_storefront: true });
                return { status: 'updated_existing_primary', locationId: fallback.location_id || null };
            }
        }
        return { status: 'existing' };
    }

    const created = await TenantLocation.create({
        ...DEFAULT_STOREFRONT_LOCATION,
        is_open: true,
        is_active: true,
        is_primary_storefront: true,
        allow_out_of_stock_sales: false,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true
    });

    return { status: 'created', locationId: created.location_id || null };
};

const seedWorkflowModeSetting = async (tenantSequelize, workflowMode) => {
    const normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);
    await tenantSequelize.query(
        `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
         VALUES (?, ?, 'string', ?, NOW())
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value),
           data_type = VALUES(data_type),
           description = VALUES(description),
           updated_at = NOW()`,
        {
            replacements: [
                WORKFLOW_MODE_SETTING_KEY,
                normalizedWorkflowMode,
                'Tenant operations workflow mode (manufacturing | msme)'
            ]
        }
    );
    return normalizedWorkflowMode;
};

const seedDefaultOnboardingSettings = async (tenantSequelize) => {
    const defaults = [
        {
            key: ONBOARDING_STATE_SETTING_KEY,
            value: 'not_started',
            dataType: 'string',
            description: 'Tenant onboarding state (not_started | in_progress | completed)'
        },
        {
            key: ONBOARDING_STARTED_AT_SETTING_KEY,
            value: '',
            dataType: 'string',
            description: 'ISO timestamp for tenant onboarding start'
        },
        {
            key: ONBOARDING_COMPLETED_AT_SETTING_KEY,
            value: '',
            dataType: 'string',
            description: 'ISO timestamp for tenant onboarding completion'
        },
        {
            key: ONBOARDING_PROGRESS_SETTING_KEY,
            value: JSON.stringify({
                step_payloads: {},
                checklist_snapshot: {
                    checklist: {
                        store_name_ready: true,
                        has_active_location: false,
                        has_primary_storefront_location: false,
                        has_sellable_item: false
                    },
                    required_keys: [
                        'store_name_ready',
                        'has_active_location',
                        'has_primary_storefront_location',
                        'has_sellable_item'
                    ],
                    required_total: 4,
                    completed_required_count: 1,
                    is_ready: false,
                    missing_requirements: [
                        'has_active_location',
                        'has_primary_storefront_location',
                        'has_sellable_item'
                    ]
                }
            }),
            dataType: 'json',
            description: 'Tenant onboarding progress and checklist snapshot'
        }
    ];

    for (const setting of defaults) {
        await tenantSequelize.query(
            `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
             VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               setting_value = VALUES(setting_value),
               data_type = VALUES(data_type),
               description = VALUES(description),
               updated_at = NOW()`,
            {
                replacements: [
                    setting.key,
                    setting.value,
                    setting.dataType,
                    setting.description
                ]
            }
        );
    }
};

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
        complianceMode = 'non_compliant',
        workflowMode = 'manufacturing',
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
    let normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);

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
        const normalizedComplianceMode = typeof complianceMode === 'string'
            ? complianceMode.trim().toLowerCase()
            : '';
        normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);
        const complianceModeState = normalizedComplianceMode === 'compliant'
            ? 'compliant_pending'
            : 'non_compliant_active';

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
                current_period_end: currentPeriodEnd,
                compliance_mode_state: complianceModeState,
                compliance_mode_choice_required: false,
                compliance_mode_selected_at: new Date(),
                compliance_mode_selected_by: 'legacy_provisioning',
                compliance_policy_version: '2026.04.07',
                compliance_profile: {},
                settings: {
                    workflow_mode: normalizedWorkflowMode
                }
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
            const adminDefaultPermissions = JSON.stringify(DEFAULT_ROLE_PERMISSIONS.admin || []);
            await tenantSequelize.query(
                `INSERT INTO users (username, email, password_hash, role, is_active, is_master_admin, permissions, created_at, updated_at)
                 VALUES (?, ?, ?, 'admin', 1, 1, ?, NOW(), NOW())`,
                {
                    replacements: ['Admin', email, passwordHash, adminDefaultPermissions]
                }
            );

            const seededWorkflowMode = await seedWorkflowModeSetting(tenantSequelize, normalizedWorkflowMode);
            logger.info('[Provisioning] Workflow mode setting seeded', {
                tenantId: uuid,
                workflowMode: seededWorkflowMode
            });

            await seedDefaultOnboardingSettings(tenantSequelize);
            logger.info('[Provisioning] Onboarding baseline settings seeded', {
                tenantId: uuid
            });

            // 4.5 Seed a default primary storefront location so every active tenant
            // immediately has a resolvable public storefront page.
            const locationSeed = await seedDefaultStorefrontLocation(tenantSequelize);
            logger.info('[Provisioning] Storefront location bootstrap completed', {
                tenantId: uuid,
                status: locationSeed.status,
                locationId: locationSeed.locationId || null
            });

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

            // 7. Bootstrap the storefront discovery index row immediately so
            // the tenant slug route works right after registration/approval.
            const storefrontSync = await syncStorefrontDiscoveryWithReliability({
                tenantId: uuid,
                source: 'tenant_provisioning_bootstrap'
            });
            if (!storefrontSync.ok) {
                logger.warn('[Provisioning] Storefront index bootstrap remained degraded after retries and fallback', {
                    tenantId: uuid,
                    attempts: storefrontSync.attempts,
                    errors: storefrontSync.errors || []
                });
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
