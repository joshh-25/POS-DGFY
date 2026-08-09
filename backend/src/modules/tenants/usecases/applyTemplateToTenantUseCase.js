import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';
import dbStore from '../../../utils/dbStore.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import { storeConfigurationTemplateRepository, materializeTemplateModuleSelection } from '../../templates/index.js';
import {
    STORE_PROFILE_SETTING_KEY,
    buildStoreProfile,
    applyTemplateProvenance
} from '../../shared/constants/storeProfile.js';
import {
    ENABLED_CAPABILITIES_SETTING_KEY,
    DISABLED_CAPABILITIES_SETTING_KEY
} from '../../shared/constants/workflowModes.js';
import { applyWorkflowModeAuditLog } from '../../settings/usecases/workflowModeAuditLog.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const SETTINGS_KEYS = [WORKFLOW_MODE_SETTING_KEY, ENABLED_CAPABILITIES_SETTING_KEY, DISABLED_CAPABILITIES_SETTING_KEY];

const requireTemplateKey = (templateKey) => {
    const normalized = String(templateKey || '').trim();
    if (!normalized) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'templateKey is required',
            { statusCode: 422 }
        );
    }
    return normalized;
};

// Mirrors updateTenantCapabilitiesUseCase.js's requireReason shape exactly -
// every audited platform-admin write to tenant-visible configuration in
// this codebase requires a human-readable reason of the same minimum
// length. Thrown as a DomainError (rather than a plain Error) so the
// catch block below can hand it straight to fail() with the correct 422,
// instead of a message-sniffing heuristic.
const requireReason = (reason) => {
    const normalized = String(reason || '').trim();
    if (normalized.length < 3) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'reason is required and must be at least 3 characters',
            { statusCode: 422 }
        );
    }
    return normalized.slice(0, 500);
};

const parseSettingValue = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (!['{', '[', '"'].includes(trimmed.charAt(0))) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
};

const readTemplateApplicationSettings = async (SystemSetting, { transaction = null } = {}) => {
    const rows = await SystemSetting.findAll({
        where: { setting_key: SETTINGS_KEYS },
        attributes: ['setting_key', 'setting_value'],
        transaction
    });
    const map = {};
    rows.forEach((row) => {
        const plain = typeof row?.get === 'function' ? row.get({ plain: true }) : row;
        if (plain?.setting_key) {
            map[plain.setting_key] = parseSettingValue(plain.setting_value);
        }
    });
    return {
        [WORKFLOW_MODE_SETTING_KEY]: map[WORKFLOW_MODE_SETTING_KEY] ?? null,
        [ENABLED_CAPABILITIES_SETTING_KEY]: map[ENABLED_CAPABILITIES_SETTING_KEY] ?? [],
        [DISABLED_CAPABILITIES_SETTING_KEY]: map[DISABLED_CAPABILITIES_SETTING_KEY] ?? []
    };
};

const upsertSetting = async (SystemSetting, key, value, dataType, description, { transaction = null } = {}) => {
    const settingValue = dataType === 'json' ? JSON.stringify(value) : value;
    const existing = await SystemSetting.findOne({ where: { setting_key: key }, transaction });
    if (existing) {
        await existing.update({ setting_value: settingValue, data_type: dataType }, { transaction });
        return;
    }
    await SystemSetting.create({
        setting_key: key,
        setting_value: settingValue,
        data_type: dataType,
        description
    }, { transaction });
};

/**
 * Applies a published Store Template to an already-provisioned tenant
 * (issue #178 Phase 17). Platform-admin only, audited, and non-destructive
 * per ADR 0008/0019: a settings write, never a data migration - switching
 * to a different template later restores whatever the previous one granted.
 *
 * Mirrors updateTenantCapabilitiesUseCase.js structurally (dbStore.run +
 * tenantSequelize.transaction, before/after snapshots,
 * createTenantAdminAuditLog) since this is the same shape of action:
 * an audited platform-admin write into a tenant's own settings.
 *
 * Shares materializeTemplateModuleSelection with tenant provisioning
 * (tenantProvisioningService.js) so the two paths can never compute a
 * template's effective {mode, enabled, disabled} differently.
 */
export const buildApplyTemplateToTenantUseCase = ({
    tenantAdminRepository,
    tenantConnector,
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
                    'A template can only be applied to an active tenant.',
                    { statusCode: 422 }
                ));
            }

            const templateKey = requireTemplateKey(body?.templateKey ?? body?.template_key);
            const reason = requireReason(body?.reason);

            const template = await storeConfigurationTemplateRepository.findByKey(templateKey);
            if (!template) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Template '${templateKey}' not found`,
                    { statusCode: 404 }
                ));
            }
            if (template.status !== 'published') {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `Template '${templateKey}' is not published and cannot be applied to a tenant.`,
                    { statusCode: 422, details: { reason_code: 'TEMPLATE_NOT_PUBLISHED', status: template.status } }
                ));
            }

            const { workflowMode, enabledCapabilities, disabledCapabilities } = materializeTemplateModuleSelection(template);
            const nextProfile = applyTemplateProvenance(
                buildStoreProfile({ workflowMode, enabledCapabilities, disabledCapabilities }),
                { templateId: template.template_id, templateVersion: template.version }
            );

            const tenantSequelize = await tenantConnector.getConnection(tenant);
            const tenantModels = getTenantModels(tenantSequelize);

            const transactionResult = await dbStore.run({
                ...tenantModels,
                sequelize: tenantSequelize,
                tenantId: tenant.id,
                tenantToken: tenant.company_token,
                tenantName: tenant.name
            }, async () => {
                const SystemSetting = dbStore.get('SystemSetting');
                const result = await tenantSequelize.transaction(async (transaction) => {
                    const before = await readTemplateApplicationSettings(SystemSetting, { transaction });

                    await upsertSetting(
                        SystemSetting,
                        WORKFLOW_MODE_SETTING_KEY,
                        workflowMode,
                        'string',
                        'Tenant operations workflow mode',
                        { transaction }
                    );
                    await upsertSetting(
                        SystemSetting,
                        ENABLED_CAPABILITIES_SETTING_KEY,
                        enabledCapabilities,
                        'json',
                        'Capabilities additionally granted on top of the base workflow mode (composed-capability overlay)',
                        { transaction }
                    );
                    await upsertSetting(
                        SystemSetting,
                        DISABLED_CAPABILITIES_SETTING_KEY,
                        disabledCapabilities,
                        'json',
                        'Capabilities removed from the base workflow mode (subtractive template overlay, issue #178 Phase 16)',
                        { transaction }
                    );
                    await upsertSetting(
                        SystemSetting,
                        STORE_PROFILE_SETTING_KEY,
                        nextProfile,
                        'json',
                        'Server-derived Store Profile (shadow-write; not read at runtime)',
                        { transaction }
                    );

                    const after = await readTemplateApplicationSettings(SystemSetting, { transaction });
                    return { before, after };
                });

                // Best-effort, appended AFTER the settings transaction commits -
                // mirrors updateSettingsUseCase.js's safelyLogWorkflowModeAudit:
                // a logging failure must never roll back or mask an otherwise-
                // successful template application.
                try {
                    await applyWorkflowModeAuditLog({
                        settingsData: {
                            [WORKFLOW_MODE_SETTING_KEY]: workflowMode,
                            [ENABLED_CAPABILITIES_SETTING_KEY]: enabledCapabilities,
                            [DISABLED_CAPABILITIES_SETTING_KEY]: disabledCapabilities
                        },
                        beforeValues: result.before,
                        actorUser: actor
                    });
                } catch (error) {
                    logger?.warn?.('[ApplyTemplate] failed to record workflow mode change log', {
                        tenantId: tenant.id,
                        error: error?.message
                    });
                }

                return result;
            });

            await tenantAdminRepository.createTenantAdminAuditLog({
                tenant_id: tenant.id,
                action: 'apply_template',
                actor_username: String(actor?.username || 'platform_admin').slice(0, 120),
                reason,
                request_id: metadata?.request_id || null,
                ip_address: metadata?.ip_address || null,
                user_agent: metadata?.user_agent || null,
                before_snapshot: transactionResult.before,
                after_snapshot: transactionResult.after,
                metadata: {
                    template_key: templateKey,
                    template_id: template.template_id,
                    template_version: template.version
                }
            });

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    message: `Template '${templateKey}' applied successfully`,
                    data: {
                        tenant_id: tenant.id,
                        template_key: templateKey,
                        template_id: template.template_id,
                        template_version: template.version,
                        ...transactionResult.after
                    }
                }
            });
        } catch (error) {
            logger?.error?.('Apply template to tenant error:', error);
            if (isDomainError(error)) {
                return fail(error);
            }
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to apply template to tenant',
                { statusCode: 500 }
            ));
        }
    };
};
