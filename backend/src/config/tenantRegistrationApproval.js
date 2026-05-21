export const TENANT_REGISTRATION_APPROVAL_MODES = Object.freeze({
    MANUAL: 'manual',
    AUTO_STANDARD: 'auto_standard'
});

const ALLOWED_MODES = new Set(Object.values(TENANT_REGISTRATION_APPROVAL_MODES));
const DEFAULT_APPROVAL_MODE = TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD;

export const normalizeTenantRegistrationApprovalMode = (value, logger = null) => {
    const normalized = String(value || '').trim().toLowerCase();

    if (!normalized) {
        return DEFAULT_APPROVAL_MODE;
    }

    if (ALLOWED_MODES.has(normalized)) {
        return normalized;
    }

    logger?.warn?.('[TenantRegistration] Invalid TENANT_REGISTRATION_APPROVAL_MODE; using default auto-standard approval', {
        providedValue: value,
        allowedModes: [...ALLOWED_MODES]
    });

    return DEFAULT_APPROVAL_MODE;
};

export const getTenantRegistrationApprovalMode = (env = process.env, logger = null) => (
    normalizeTenantRegistrationApprovalMode(env.TENANT_REGISTRATION_APPROVAL_MODE, logger)
);

export default {
    TENANT_REGISTRATION_APPROVAL_MODES,
    DEFAULT_APPROVAL_MODE,
    getTenantRegistrationApprovalMode,
    normalizeTenantRegistrationApprovalMode
};
