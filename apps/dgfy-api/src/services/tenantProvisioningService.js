import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database.js'; // Landlord connection
import dbStore from '../utils/dbStore.js';
import bcrypt from 'bcryptjs';
import logger from '../config/logger.js';
import { Sequelize } from 'sequelize';
import * as landlordService from './landlordService.js';
import { syncStorefrontDiscoveryWithReliability } from './storefrontDiscoverySyncReliabilityService.js';
import {
    STORE_PROFILE_SETTING_KEY,
    buildStoreProfile,
    applyTemplateProvenance
} from '../modules/shared/constants/storeProfile.js';
import { storeConfigurationTemplateRepository, materializeTemplateModuleSelection } from '../modules/templates/index.js';
import {
    normalizeWorkflowMode,
    WORKFLOW_MODE_VALUES,
    ENABLED_CAPABILITIES_SETTING_KEY,
    DISABLED_CAPABILITIES_SETTING_KEY
} from '../modules/shared/constants/workflowModes.js';
import {
    DEFAULT_CUSTOMER_ACCESS_MODE,
    DEFAULT_INVENTORY_DISPLAY_MODE,
    DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD,
    resolveDefaultGuestCheckoutEnabledForWorkflowMode
} from '../modules/shared/utils/customerAccessPolicy.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';

// Strict allowlist pattern for all tenant database names.
// Guards every DDL path against invalid or maliciously crafted identifiers.
const DB_NAME_PATTERN = /^sku_tenant_[a-z0-9]+_[a-z0-9]+$/;

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const ONBOARDING_STATE_SETTING_KEY = 'tenant_onboarding_state';
const ONBOARDING_STARTED_AT_SETTING_KEY = 'tenant_onboarding_started_at';
const ONBOARDING_COMPLETED_AT_SETTING_KEY = 'tenant_onboarding_completed_at';
const ONBOARDING_PROGRESS_SETTING_KEY = 'tenant_onboarding_progress';
const STORE_IS_VISIBLE_SETTING_KEY = 'store_is_visible';
const CUSTOMER_ACCESS_MODE_SETTING_KEY = 'customer_access_mode';
const INVENTORY_DISPLAY_MODE_SETTING_KEY = 'inventory_display_mode';
const INVENTORY_LOW_STOCK_DISPLAY_THRESHOLD_SETTING_KEY = 'inventory_low_stock_display_threshold';
const GUEST_CHECKOUT_ENABLED_SETTING_KEY = 'storefront_guest_checkout_enabled';

const parsePositiveId = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const readInsertId = (...candidates) => {
    for (const candidate of candidates) {
        const direct = parsePositiveId(candidate?.insertId);
        if (direct) return direct;
        if (Array.isArray(candidate)) {
            for (const entry of candidate) {
                const nested = parsePositiveId(entry?.insertId ?? entry?.user_id);
                if (nested) return nested;
            }
        }
    }
    return null;
};

export const resolveSeededAdminUserId = async ({
    tenantSequelize,
    insertResult,
    insertMetadata,
    email
}) => {
    const fromInsert = readInsertId(insertResult, insertMetadata);
    if (fromInsert) return fromInsert;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!tenantSequelize || !normalizedEmail) return null;

    const [rows] = await tenantSequelize.query(
        'SELECT user_id FROM users WHERE LOWER(email) = ? ORDER BY user_id DESC LIMIT 1',
        { replacements: [normalizedEmail] }
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return parsePositiveId(row?.user_id);
};

const buildRegisteredOnboardingProgress = () => ({
    step_payloads: {
        business_classification: {
            legitimacy: {
                registration_status: 'registered'
            }
        }
    },
    classification_snapshot: {
        payload: {
            legitimacy: {
                registration_status: 'registered'
            }
        }
    },
    checklist_snapshot: {
        checklist: {
            store_name_ready: true,
            has_primary_storefront_location: false,
            has_priced_starter_item: false
        },
        required_keys: [
            'store_name_ready',
            'has_primary_storefront_location',
            'has_priced_starter_item'
        ],
        required_total: 3,
        completed_required_count: 1,
        is_ready: false,
        missing_requirements: [
            'has_primary_storefront_location',
            'has_priced_starter_item'
        ]
    }
});

// Issue #178 Phase 17: which template (if any) selects a fresh tenant's
// initial module list. A caller-chosen templateKey wins ONLY when it is
// published and its base_mode matches the tenant's requested workflow mode
// - templateKey never overrides the mode itself, it only refines within it,
// so a client can't smuggle a different mode in via a template. Absent a
// (usable) templateKey, this falls back to the pre-Phase-17 canonical-for-
// mode lookup unchanged. Lookup is best-effort throughout - a landlord DB
// hiccup or an unseeded catalog must never block provisioning. This is the
// ONLY place a template row is ever read at provisioning time; nothing
// reads it again afterward (ADR 0056 clause 2).
const resolveProvisioningTemplateSelection = async (normalizedWorkflowMode, templateKey = null) => {
    try {
        let template = null;
        if (templateKey) {
            const candidate = await storeConfigurationTemplateRepository.findByKey(templateKey);
            if (candidate?.status === 'published' && candidate.base_mode === normalizedWorkflowMode) {
                template = candidate;
            } else if (candidate) {
                logger.warn('[TenantProvisioning] requested template ignored - not published or mode mismatch', {
                    template_key: templateKey,
                    template_status: candidate.status,
                    template_base_mode: candidate.base_mode,
                    requested_mode: normalizedWorkflowMode
                });
            }
        }
        if (!template) {
            template = await storeConfigurationTemplateRepository.findPublishedCanonicalForMode(normalizedWorkflowMode);
        }
        if (!template) {
            return { template: null, enabledCapabilities: [], disabledCapabilities: [] };
        }
        const { enabledCapabilities, disabledCapabilities } = materializeTemplateModuleSelection(template);
        return { template, enabledCapabilities, disabledCapabilities };
    } catch (error) {
        logger.warn('[TenantProvisioning] template provenance lookup failed; provisioning without it', {
            workflow_mode: normalizedWorkflowMode,
            error: error?.message
        });
        return { template: null, enabledCapabilities: [], disabledCapabilities: [] };
    }
};

// Builds the freshly-provisioned Store Profile, stamped with template
// provenance when a template was selected (Phase 13, extended Phase 17 to
// accept an explicit templateKey rather than only the canonical-for-mode
// default). enabledCapabilities/disabledCapabilities resolve from the same
// selection this profile's provenance is stamped from, so the two can never
// disagree - see seedWorkflowModeSetting for where those two settings
// themselves get seeded from the identical selection.
export const buildProvisioningStoreProfile = async (normalizedWorkflowMode, { templateKey = null } = {}) => {
    const { template, enabledCapabilities, disabledCapabilities } = await resolveProvisioningTemplateSelection(
        normalizedWorkflowMode,
        templateKey
    );
    const profile = buildStoreProfile({ workflowMode: normalizedWorkflowMode, enabledCapabilities, disabledCapabilities });
    if (!template) return profile;
    return applyTemplateProvenance(profile, {
        templateId: template.template_id,
        templateVersion: template.version
    });
};

const upsertJsonSystemSetting = async (tenantSequelize, key, value, description) => tenantSequelize.query(
    `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
     VALUES (?, ?, 'json', ?, NOW())
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       data_type = VALUES(data_type),
       description = VALUES(description),
       updated_at = NOW()`,
    { replacements: [key, JSON.stringify(value), description] }
);

const seedWorkflowModeSetting = async (tenantSequelize, workflowMode, templateKey = null) => {
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
                `Tenant operations workflow mode (${WORKFLOW_MODE_VALUES.join(' | ')})`
            ]
        }
    );

    // Issue #178 Phase 17: a single template lookup drives both the
    // enabled/disabled overlay settings (what the runtime actually enforces
    // today) and the Profile's provenance below, so the two can never
    // disagree. Only seeded when non-empty - the common canonical/no-template
    // path stays byte-identical to pre-Phase-17 provisioning (no extra rows).
    const { template, enabledCapabilities, disabledCapabilities } = await resolveProvisioningTemplateSelection(
        normalizedWorkflowMode,
        templateKey
    );
    if (enabledCapabilities.length > 0) {
        await upsertJsonSystemSetting(
            tenantSequelize,
            ENABLED_CAPABILITIES_SETTING_KEY,
            enabledCapabilities,
            'Capabilities additionally granted on top of the base workflow mode (composed-capability overlay)'
        );
    }
    if (disabledCapabilities.length > 0) {
        await upsertJsonSystemSetting(
            tenantSequelize,
            DISABLED_CAPABILITIES_SETTING_KEY,
            disabledCapabilities,
            'Capabilities removed from the base workflow mode (subtractive template overlay, issue #178 Phase 16)'
        );
    }

    // Shadow-written Store Profile (issue #178 Phase 11): derived from the
    // same selection as the two overlay settings above, stamped with
    // template provenance when a template was resolved (issue #178 Phase 13/17).
    const provisioningProfile = buildStoreProfile({
        workflowMode: normalizedWorkflowMode,
        enabledCapabilities,
        disabledCapabilities
    });
    const provisioningProfileWithProvenance = template
        ? applyTemplateProvenance(provisioningProfile, { templateId: template.template_id, templateVersion: template.version })
        : provisioningProfile;
    await upsertJsonSystemSetting(
        tenantSequelize,
        STORE_PROFILE_SETTING_KEY,
        provisioningProfileWithProvenance,
        'Server-derived Store Profile (read by frontend affordance consumers directly, and by the fail-closed capability gate when ops_store_profile_read is enabled for this tenant - issue #178 Phases 18-19)'
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
            value: JSON.stringify(buildRegisteredOnboardingProgress()),
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

const seedDefaultCustomerAccessSettings = async (tenantSequelize, workflowMode = null) => {
    const defaults = [
        {
            key: STORE_IS_VISIBLE_SETTING_KEY,
            value: false,
            dataType: 'boolean',
            description: 'Controls whether the tenant appears in public discovery and public storefront profile reads',
            overwriteExisting: true
        },
        {
            key: CUSTOMER_ACCESS_MODE_SETTING_KEY,
            value: DEFAULT_CUSTOMER_ACCESS_MODE,
            dataType: 'string',
            description: 'Requested storefront customer access mode (ghost | catalog | inquiry | transaction)'
        },
        {
            key: INVENTORY_DISPLAY_MODE_SETTING_KEY,
            value: DEFAULT_INVENTORY_DISPLAY_MODE,
            dataType: 'string',
            description: 'Customer-facing inventory display mode (hidden | availability | low_stock | exact_quantity)'
        },
        {
            key: INVENTORY_LOW_STOCK_DISPLAY_THRESHOLD_SETTING_KEY,
            value: String(DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD),
            dataType: 'number',
            description: 'Public low-stock display threshold for storefront inventory labels'
        },
        {
            // #622 (Pat, 2026-08-18): vertical-dependent default (enabled on FnB, disabled on
            // Retail) -- only seeded here, at provisioning time. resolveAccessPolicyFromSettings's
            // own runtime default (customerAccessPolicy.js) stays unconditionally `true` so an
            // existing tenant with no row here (every tenant provisioned before this shipped) keeps
            // guest checkout on. NOT overwriteExisting -- a re-run of provisioning must never stomp
            // a merchant's own toggle choice.
            key: GUEST_CHECKOUT_ENABLED_SETTING_KEY,
            value: resolveDefaultGuestCheckoutEnabledForWorkflowMode(workflowMode),
            dataType: 'boolean',
            description: 'Allows customers to check out or book without a DGFY account'
        }
    ];

    for (const setting of defaults) {
        await tenantSequelize.query(
            `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
             VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               ${setting.overwriteExisting === true
                ? 'setting_value = VALUES(setting_value), data_type = VALUES(data_type), description = VALUES(description), updated_at = NOW()'
                : 'setting_key = setting_key'}`,
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
        adminPhone = null,
        adminUsername = 'Admin',
        adminPassword,
        subscriptionId = null,    // Optional subscription ID for manual entry
        complianceMode = 'non_compliant',
        workflowMode = 'food_manufacturing',
        // Issue #178 Phase 17: optional - selects a published, non-canonical
        // template whose base_mode matches workflowMode instead of the
        // canonical preset for that mode. Ignored (with a warning) if it
        // doesn't resolve to a published template matching workflowMode.
        templateKey = null,
        // Option 2: Approval provisioning (new workflow)
        tenantId,
        dbName: providedDbName,
        companyToken: providedCompanyToken,
        adminPasswordHash: providedPasswordHash
    } = options;

    // Determine if this is an approval (existing tenant) or new provisioning
    const isApproval = !!tenantId;

    let uuid, dbName, companyToken, passwordHash, tenantName, email, phoneNumber, founderUsername;
    let subscriptionStatus;
    let currentPeriodEnd;
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
        phoneNumber = String(adminPhone || options.adminPhone || '').trim() || null;
        founderUsername = String(options.adminUsername || adminUsername || 'Admin').trim() || 'Admin';

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
        phoneNumber = String(adminPhone || '').trim() || null;
        founderUsername = String(adminUsername || 'Admin').trim() || 'Admin';

        const effectivePlan = 'premium';

        // Premium capability is plan metadata. Subscription state is active only
        // when a provider subscription id is supplied and verified upstream.
        if (effectivePlan === 'premium' && subscriptionId) {
            subscriptionStatus = 'active';
            currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else {
            subscriptionStatus = 'inactive';
            currentPeriodEnd = null;
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
                admin_phone: phoneNumber,
                admin_password_hash: passwordHash,
                plan: effectivePlan,
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
            // This database was just created. Create the declared model graph
            // without running Sequelize's destructive schema-diff algorithm.
            await tenantSequelize.sync();
            // #1071/#1124: routed through one seam (schema repairs + the Phase 157 tenant-bootstrap
            // migrations) instead of importing the repair function and two migration files
            // separately by literal path here -- see tenantSchemaBootstrap.js's own comment for why.
            const { applyPostSyncTenantSchema } = await import('./tenantSchemaBootstrap.js');
            await applyPostSyncTenantSchema(tenantSequelize, Sequelize, { dbName });
            logger.info(`[Provisioning] Schema synced successfully`);

            // 4. Seed Admin User
            logger.info(`[Provisioning] Seeding Admin User...`);
            const adminDefaultPermissions = JSON.stringify(DEFAULT_ROLE_PERMISSIONS.admin || []);
            const [adminInsertResult, adminInsertMetadata] = await tenantSequelize.query(
                `INSERT INTO users (username, email, phone_number, password_hash, role, is_active, is_master_admin, permissions, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'admin', 1, 1, ?, NOW(), NOW())`,
                {
                    replacements: [founderUsername, email, phoneNumber, passwordHash, adminDefaultPermissions]
                }
            );
            const adminUserId = await resolveSeededAdminUserId({
                tenantSequelize,
                insertResult: adminInsertResult,
                insertMetadata: adminInsertMetadata,
                email
            });

            const seededWorkflowMode = await seedWorkflowModeSetting(tenantSequelize, normalizedWorkflowMode, templateKey);
            logger.info('[Provisioning] Workflow mode setting seeded', {
                tenantId: uuid,
                workflowMode: seededWorkflowMode
            });

            await seedDefaultOnboardingSettings(tenantSequelize);
            logger.info('[Provisioning] Onboarding baseline settings seeded', {
                tenantId: uuid
            });
            await seedDefaultCustomerAccessSettings(tenantSequelize, seededWorkflowMode);
            logger.info('[Provisioning] Customer access settings seeded', {
                tenantId: uuid
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

            // 7. Run discovery bootstrap. New tenants default public-hidden, so
            // this removes/skips the index row until the merchant opts in with a real pin.
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
                admin_user_id: adminUserId,
                status: 'active'
            };

        } finally {
            await tenantSequelize.close();
        }

    } catch (error) {
        logger.error(`[Provisioning] Error: ${error.message}`);

        // 1. Restore tenant record to a valid lifecycle state.
        // Approval failures must remain retryable from the admin portal; direct
        // provisioning failures are archived because no tenant DB is usable.
        try {
            const Tenant = dbStore.get('Tenant');
            await Tenant.update(
                { status: isApproval ? 'pending' : 'archived' },
                { where: { id: uuid } }
            );
        } catch (cleanupError) {
            logger.warn(`[Provisioning] Failed to restore tenant lifecycle state: ${cleanupError.message}`);
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
