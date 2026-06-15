import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import dbStore from '../../../utils/dbStore.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import {
    normalizeTenantCapabilities,
    normalizeTenantCapabilityPatch,
    readTenantCapabilities
} from './tenantCapabilitySettings.js';

const normalizeReason = (reason) => String(reason || '').trim();
const requireReason = (reason) => {
    const normalized = normalizeReason(reason);
    if (normalized.length < 3) {
        throw new Error('reason is required and must be at least 3 characters');
    }
    return normalized.slice(0, 500);
};

const toSettingsMap = (rows = []) => {
    const map = {};
    rows.forEach((row) => {
        const plain = typeof row?.get === 'function' ? row.get({ plain: true }) : row;
        if (plain?.setting_key) {
            map[plain.setting_key] = plain.setting_value;
        }
    });
    return map;
};

const readCapabilitiesFromSettings = async (SystemSetting, keys, { transaction = null } = {}) => {
    const rows = await SystemSetting.findAll({
        where: { setting_key: keys },
        attributes: ['setting_key', 'setting_value'],
        transaction
    });
    return normalizeTenantCapabilities(toSettingsMap(rows));
};

const upsertSetting = async (SystemSetting, key, value, { transaction = null } = {}) => {
    const existing = await SystemSetting.findOne({
        where: { setting_key: key },
        transaction
    });
    if (existing) {
        await existing.update({ setting_value: value }, { transaction });
        return;
    }
    await SystemSetting.create({
        setting_key: key,
        setting_value: value,
        data_type: value === 'true' || value === 'false' ? 'boolean' : 'string',
        description: `Auto-created by platform admin tenant capability controls for key '${key}'`
    }, { transaction });
};

const includesStorefrontPatch = (patch = {}) => (
    Object.prototype.hasOwnProperty.call(patch, 'store_is_visible')
    || Object.prototype.hasOwnProperty.call(patch, 'customer_access_mode')
    || Object.prototype.hasOwnProperty.call(patch, 'platform_max_customer_access_mode')
);

export const buildUpdateTenantCapabilitiesUseCase = ({
    tenantAdminRepository,
    tenantConnector,
    syncStorefrontDiscoveryIndexForTenant,
    logger
}) => {
    return async ({ id, body, actor = {}, metadata = {} }) => {
        try {
            const tenant = await tenantAdminRepository.findTenantById(id);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }
            if (tenant.status !== 'active') {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Tenant capabilities can only be changed for active tenants.',
                    { statusCode: 422 }
                ));
            }

            const reason = requireReason(body?.reason);
            const patch = normalizeTenantCapabilityPatch(body || {});
            if (Object.keys(patch).length === 0) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'At least one tenant capability field is required.',
                    { statusCode: 422 }
                ));
            }

            const tenantSequelize = await tenantConnector.getConnection(tenant);
            const tenantModels = getTenantModels(tenantSequelize);
            const capabilityKeys = [
                'tenant_ims_enabled',
                'tenant_pos_enabled',
                'store_is_visible',
                'customer_access_mode',
                'platform_max_customer_access_mode'
            ];

            const transactionResult = await dbStore.run({
                ...tenantModels,
                sequelize: tenantSequelize,
                tenantId: tenant.id,
                tenantToken: tenant.company_token,
                tenantName: tenant.name
            }, async () => {
                const SystemSetting = dbStore.get('SystemSetting');
                return tenantSequelize.transaction(async (transaction) => {
                    const before = await readCapabilitiesFromSettings(SystemSetting, capabilityKeys, { transaction });
                    for (const [key, value] of Object.entries(patch)) {
                        await upsertSetting(SystemSetting, key, value, { transaction });
                    }
                    const after = await readCapabilitiesFromSettings(SystemSetting, capabilityKeys, { transaction });
                    return { before, after };
                });
            });

            if (includesStorefrontPatch(patch)) {
                try {
                    await syncStorefrontDiscoveryIndexForTenant({ tenantId: tenant.id });
                } catch (syncError) {
                    await dbStore.run({
                        ...tenantModels,
                        sequelize: tenantSequelize,
                        tenantId: tenant.id,
                        tenantToken: tenant.company_token,
                        tenantName: tenant.name
                    }, async () => {
                        const SystemSetting = dbStore.get('SystemSetting');
                        await tenantSequelize.transaction(async (transaction) => {
                            const rollbackPatch = normalizeTenantCapabilityPatch(transactionResult.before);
                            for (const [key, value] of Object.entries(rollbackPatch)) {
                                await upsertSetting(SystemSetting, key, value, { transaction });
                            }
                        });
                    });
                    try {
                        await syncStorefrontDiscoveryIndexForTenant({ tenantId: tenant.id });
                    } catch (rollbackSyncError) {
                        logger?.error?.('[TenantCapabilities] Storefront sync rollback reconciliation failed', {
                            tenantId: tenant.id,
                            error: rollbackSyncError.message
                        });
                    }
                    throw new Error(
                        `Storefront discovery sync failed; capability changes were rolled back. ${syncError.message || ''}`.trim(),
                        { cause: syncError }
                    );
                }
            }

            const refreshed = await readTenantCapabilities({ tenant, tenantConnector });
            await tenantAdminRepository.createTenantAdminAuditLog({
                tenant_id: tenant.id,
                action: 'capability_update',
                actor_username: String(actor?.username || 'platform_admin').slice(0, 120),
                reason,
                request_id: metadata?.request_id || null,
                ip_address: metadata?.ip_address || null,
                user_agent: metadata?.user_agent || null,
                before_snapshot: transactionResult.before,
                after_snapshot: refreshed,
                metadata: {
                    changed_fields: Object.keys(patch),
                    storefront_sync_required: includesStorefrontPatch(patch)
                }
            });
            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    message: 'Tenant capabilities updated successfully',
                    data: {
                        tenant_id: tenant.id,
                        capabilities: refreshed
                    }
                }
            });
        } catch (error) {
            logger?.error?.('Update tenant capabilities error:', error);
            const statusCode = /customer_access_mode|capability field/i.test(error.message) ? 422 : 500;
            return fail(new DomainError(
                statusCode === 422 ? DomainErrorCode.VALIDATION_FAILED : DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to update tenant capabilities',
                { statusCode }
            ));
        }
    };
};
