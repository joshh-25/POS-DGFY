export const TENANT_REGISTRATION_APPROVAL_MODES = Object.freeze({
    MANUAL: 'manual',
    AUTO_STANDARD: 'auto_standard'
});

const ALLOWED_MODES = new Set(Object.values(TENANT_REGISTRATION_APPROVAL_MODES));

export const normalizeTenantRegistrationApprovalMode = (value, logger = null) => {
    const normalized = String(value || '').trim().toLowerCase();

    if (!normalized) {
        return TENANT_REGISTRATION_APPROVAL_MODES.MANUAL;
    }

    if (ALLOWED_MODES.has(normalized)) {
        return normalized;
    }

    logger?.warn?.('[TenantRegistration] Invalid TENANT_REGISTRATION_APPROVAL_MODE; using manual approval', {
        providedValue: value,
        allowedModes: [...ALLOWED_MODES]
    });

    return TENANT_REGISTRATION_APPROVAL_MODES.MANUAL;
};

export const getTenantRegistrationApprovalMode = (env = process.env, logger = null) => (
    normalizeTenantRegistrationApprovalMode(env.TENANT_REGISTRATION_APPROVAL_MODE, logger)
);

export default {
    TENANT_REGISTRATION_APPROVAL_MODES,
    getTenantRegistrationApprovalMode,
    normalizeTenantRegistrationApprovalMode
};
