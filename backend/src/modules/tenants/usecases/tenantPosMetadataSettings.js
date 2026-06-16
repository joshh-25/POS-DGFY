import dbStore from '../../../utils/dbStore.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import {
    PLATFORM_CONTROLLED_POS_SOFTWARE_KEYS,
    PLATFORM_POS_METADATA_KEYS,
    POS_RECEIPT_METADATA_PENDING_SETTING_KEY,
    TENANT_REVIEWED_POS_RECEIPT_KEYS
} from '../../settings/usecases/posReceiptMetadataApprovalPolicy.js';

const parseJsonValue = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const parseSettingValue = (row) => {
    if (!row) return null;
    const plain = typeof row?.get === 'function' ? row.get({ plain: true }) : row;
    const raw = plain?.setting_value;
    if (plain?.data_type === 'boolean') return raw === true || raw === 'true' || raw === '1';
    if (plain?.data_type === 'number') {
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    }
    if (plain?.data_type === 'json') return parseJsonValue(raw);
    return raw == null ? '' : String(raw);
};

const inferDataType = (value) => {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number' && Number.isFinite(value)) return 'number';
    if (value && typeof value === 'object') return 'json';
    return 'string';
};

const serialize = (value, dataType = inferDataType(value)) => {
    if (dataType === 'json') return JSON.stringify(value);
    if (dataType === 'boolean') return value ? 'true' : 'false';
    if (dataType === 'number') return String(value);
    return String(value ?? '');
};

const readRowsPayload = (rows = []) => {
    const current = {};
    let pendingReview = null;
    rows.forEach((row) => {
        const plain = typeof row?.get === 'function' ? row.get({ plain: true }) : row;
        if (plain.setting_key === POS_RECEIPT_METADATA_PENDING_SETTING_KEY) {
            pendingReview = parseSettingValue(plain);
            return;
        }
        current[plain.setting_key] = parseSettingValue(plain);
    });
    return {
        current,
        pending_review: pendingReview?.status === 'pending_review' ? pendingReview : null
    };
};

const buildTenantDbContext = (tenant, tenantModels, tenantSequelize) => ({
    ...tenantModels,
    sequelize: tenantSequelize,
    tenantId: tenant.id,
    tenantToken: tenant.company_token,
    tenantName: tenant.name,
    tenantComplianceModeState: tenant.compliance_mode_state || null,
    tenantComplianceModeChoiceRequired: tenant.compliance_mode_choice_required === true,
    tenantComplianceProfile: tenant.compliance_profile || null,
    tenantCompliancePolicyVersion: tenant.compliance_policy_version || null
});

const withTenantPosMetadataContext = async ({ tenant, tenantConnector }, callback) => {
    const tenantSequelize = await tenantConnector.getConnection(tenant);
    const tenantModels = getTenantModels(tenantSequelize);
    return dbStore.run(buildTenantDbContext(tenant, tenantModels, tenantSequelize), callback);
};

const readMetadataRows = async (SystemSetting, transaction = null) => (
    SystemSetting.findAll({
        where: {
            setting_key: [...PLATFORM_POS_METADATA_KEYS, POS_RECEIPT_METADATA_PENDING_SETTING_KEY]
        },
        attributes: ['setting_key', 'setting_value', 'data_type', 'updated_at'],
        ...(transaction ? { transaction } : {})
    })
);

const upsertSetting = async (SystemSetting, key, value, transaction) => {
    const dataType = inferDataType(value);
    const existing = await SystemSetting.findOne({ where: { setting_key: key }, transaction });
    if (existing) {
        await existing.update({
            setting_value: serialize(value, dataType),
            data_type: dataType
        }, { transaction });
        return;
    }
    await SystemSetting.create({
        setting_key: key,
        setting_value: serialize(value, dataType),
        data_type: dataType,
        description: `Auto-created by platform admin POS metadata controls for key '${key}'`
    }, { transaction });
};

export const readTenantPosMetadataSettings = async ({ tenant, tenantConnector }) => (
    withTenantPosMetadataContext({ tenant, tenantConnector }, async () => {
        const SystemSetting = dbStore.get('SystemSetting');
        const rows = await readMetadataRows(SystemSetting);
        return readRowsPayload(rows);
    })
);

export const updateTenantPosMetadataSettings = async ({
    tenant,
    tenantConnector,
    payload = {},
    actorUser = null,
    applyApprovedSettings = null,
    beforePendingRejectAudit = null
}) => {
    return withTenantPosMetadataContext({ tenant, tenantConnector }, async () => {
        const tenantSequelize = dbStore.get('sequelize');
        const SystemSetting = dbStore.get('SystemSetting');
        const beforeRows = await readMetadataRows(SystemSetting);
        const beforePayload = readRowsPayload(beforeRows);
        const pendingRow = beforeRows.find((row) => {
            const plain = typeof row?.get === 'function' ? row.get({ plain: true }) : row;
            return plain.setting_key === POS_RECEIPT_METADATA_PENDING_SETTING_KEY;
        });
        const pendingReview = parseSettingValue(pendingRow);

        await tenantSequelize.transaction(async (transaction) => {
            const softwareSettings = payload.software_settings || {};
            for (const key of PLATFORM_CONTROLLED_POS_SOFTWARE_KEYS) {
                if (Object.prototype.hasOwnProperty.call(softwareSettings, key)) {
                    await upsertSetting(SystemSetting, key, String(softwareSettings[key] ?? '').trim().slice(0, 120), transaction);
                }
            }
        });

        const action = String(payload.pending_action || '').trim().toLowerCase();
        if (action === 'approve' && pendingReview?.status === 'pending_review') {
            const changes = pendingReview?.changes && typeof pendingReview.changes === 'object'
                ? TENANT_REVIEWED_POS_RECEIPT_KEYS.reduce((acc, key) => {
                    if (Object.prototype.hasOwnProperty.call(pendingReview.changes, key)) {
                        acc[key] = pendingReview.changes[key];
                    }
                    return acc;
                }, {})
                : {};
            if (Object.keys(changes).length > 0) {
                if (typeof applyApprovedSettings !== 'function') {
                    throw new Error('POS metadata approval requires the settings update use case');
                }
                const approvalResult = await applyApprovedSettings({
                    settingsData: changes,
                    actorUser: {
                        ...(actorUser || {}),
                        is_platform_admin: true
                    }
                });
                if (!approvalResult?.success) {
                    const approvalError = approvalResult?.error || new Error('Settings policy rejected POS metadata approval');
                    throw approvalError;
                }
            }
            await tenantSequelize.transaction(async (transaction) => {
                await upsertSetting(SystemSetting, POS_RECEIPT_METADATA_PENDING_SETTING_KEY, {
                    ...pendingReview,
                    status: 'approved',
                    reviewed_at: new Date().toISOString()
                }, transaction);
            });
        } else if (action === 'reject' && pendingReview?.status === 'pending_review') {
            if (typeof beforePendingRejectAudit === 'function') {
                await beforePendingRejectAudit({
                    before: beforePayload.current,
                    pending_review: pendingReview
                });
            }
            await tenantSequelize.transaction(async (transaction) => {
                await upsertSetting(SystemSetting, POS_RECEIPT_METADATA_PENDING_SETTING_KEY, {
                    ...pendingReview,
                    status: 'rejected',
                    reviewed_at: new Date().toISOString()
                }, transaction);
            });
        }

        const afterRows = await readMetadataRows(SystemSetting);
        const afterPayload = readRowsPayload(afterRows);
        return {
            before: beforePayload.current,
            after: afterPayload.current,
            pending_review: afterPayload.pending_review,
            audit_logged: action === 'reject' && pendingReview?.status === 'pending_review'
        };
    });
};
