import { resolveTenantEffectivePlan } from './tenantPlanPolicy.js';
import { buildTenantRegistrationAction } from './tenantRegistrationActionPolicy.js';

const FORCE_NON_COMPLIANT_ALLOWED_STATES = new Set(['compliant_pending', 'compliant_active']);
const PRIVATE_TENANT_FIELDS = Object.freeze([
    'settings',
    'db_name',
    'company_token',
    'password_hash',
    'password',
    'temporary_password'
]);

export const toPlainAdminTenant = (tenant) => {
    if (!tenant) return {};
    if (typeof tenant.get === 'function') {
        return tenant.get({ plain: true });
    }
    return { ...tenant };
};

const buildAdminComplianceModeAction = (tenant) => {
    const modeState = String(tenant?.compliance_mode_state || '').trim();
    const choiceRequired = tenant?.compliance_mode_choice_required === true;

    if (choiceRequired || !modeState) {
        return {
            action: 'select_mode',
            allowed: true,
            label: 'Set compliance mode',
            helper_text: 'Select non-compliant POS access or move the tenant into compliant pending mode.',
            options: ['non_compliant', 'compliant']
        };
    }

    if (modeState === 'non_compliant_active') {
        return {
            action: 'upgrade_to_compliant_pending',
            allowed: true,
            label: 'Move to compliant pending',
            helper_text: 'Moves the tenant into the compliant path. Fiscal activation still requires the checklist.',
            options: []
        };
    }

    if (FORCE_NON_COMPLIANT_ALLOWED_STATES.has(modeState)) {
        return {
            action: 'force_non_compliant',
            allowed: true,
            label: 'Force non-compliant',
            helper_text: 'Returns the tenant to non-fiscal POS access and disables fiscal output.',
            options: []
        };
    }

    return {
        action: 'none',
        allowed: false,
        label: 'Compliance mode unavailable',
        helper_text: 'Compliance lifecycle state is not supported for a platform-admin action.',
        options: []
    };
};

const buildForceNonCompliantEligibility = (tenant) => {
    const modeState = String(tenant?.compliance_mode_state || '').trim();

    if (modeState === 'non_compliant_active') {
        return {
            can_force_non_compliant: false,
            force_non_compliant_block_reason: 'Tenant is already in non_compliant_active mode.'
        };
    }

    if (FORCE_NON_COMPLIANT_ALLOWED_STATES.has(modeState)) {
        return {
            can_force_non_compliant: true,
            force_non_compliant_block_reason: null
        };
    }

    if (!modeState) {
        return {
            can_force_non_compliant: false,
            force_non_compliant_block_reason: 'Compliance mode has not been selected yet.'
        };
    }

    return {
        can_force_non_compliant: false,
        force_non_compliant_block_reason: 'Platform force non-compliant override is only allowed from compliant_pending or compliant_active'
    };
};

export const presentAdminTenant = (tenant, capabilities = null) => {
    const baseTenant = toPlainAdminTenant(tenant);
    const registrationDraftId = baseTenant.settings?.registration_draft_id || null;
    const safeTenant = { ...baseTenant };
    PRIVATE_TENANT_FIELDS.forEach((field) => delete safeTenant[field]);

    const effectivePlan = resolveTenantEffectivePlan(baseTenant);

    return {
        ...safeTenant,
        registration_draft_id: registrationDraftId,
        effective_plan: effectivePlan,
        plan_policy: effectivePlan !== baseTenant.plan ? 'registered_tenant_premium_capable' : 'stored_plan',
        capabilities,
        admin_compliance_mode_action: buildAdminComplianceModeAction(baseTenant),
        registration_action: buildTenantRegistrationAction(baseTenant),
        ...buildForceNonCompliantEligibility(baseTenant)
    };
};
