import dbStore from '../../../utils/dbStore.js';
import { normalizePosTaxPolicies, POS_TAX_POLICY_SETTING_KEY } from '../../shared/constants/posTaxPolicy.js';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const policySnapshot = (value) => normalizePosTaxPolicies(value).categories;

export const touchesPosTaxPolicy = (settingsData = {}) => hasOwn(settingsData, POS_TAX_POLICY_SETTING_KEY);

export const resolvePosTaxPolicyAuditBeforeValue = async ({ settingsRepository, settingsData = {} } = {}) => {
    if (!touchesPosTaxPolicy(settingsData) || typeof settingsRepository?.getSettingByKey !== 'function') {
        return null;
    }
    try {
        const current = await settingsRepository.getSettingByKey(POS_TAX_POLICY_SETTING_KEY);
        return current?.value ?? null;
    } catch {
        // The first Taxes save legitimately creates this new EAV setting row.
        return null;
    }
};

export const applyPosTaxPolicyAuditLog = async ({
    settingsData = {},
    beforeValue = null,
    actorUser = null
} = {}) => {
    if (!touchesPosTaxPolicy(settingsData)) return null;

    const before = policySnapshot(beforeValue);
    const after = policySnapshot(settingsData[POS_TAX_POLICY_SETTING_KEY]);
    if (JSON.stringify(before) === JSON.stringify(after)) return null;

    const AuditLog = typeof dbStore?.get === 'function' ? dbStore.get('AuditLog') : null;
    if (!AuditLog) return null;

    return AuditLog.create({
        user_id: actorUser?.user_id || null,
        entity_type: 'pos_tax_policy',
        entity_id: null,
        action: 'UPDATE',
        event_type: 'pos_tax_policy_updated',
        actor_username: actorUser?.username || null,
        reason: 'Future POS transactions only',
        changes: {
            setting_key: POS_TAX_POLICY_SETTING_KEY,
            effective_scope: 'tenant',
            effective_for: 'future_transactions',
            before,
            after
        }
    });
};
