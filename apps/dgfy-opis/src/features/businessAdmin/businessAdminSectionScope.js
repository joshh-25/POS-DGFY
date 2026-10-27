const normalizeScopeString = (value) => String(value ?? '').trim();

const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonicalize(value[key])])
        );
    }
    return value;
};

const stableSerialize = (value) => JSON.stringify(canonicalize(value));

const normalizeIdList = (value) => (
    Array.isArray(value)
        ? value.map(normalizeScopeString).filter(Boolean).sort()
        : []
);
const buildAuthorizationScope = (bootstrap = null) => ({
    tenantId: normalizeScopeString(bootstrap?.business?.tenant_id || bootstrap?.user?.company?.id),
    userId: normalizeScopeString(bootstrap?.user?.user_id || bootstrap?.user?.id),
    role: normalizeScopeString(bootstrap?.user?.role).toLowerCase(),
    rolePresetKey: normalizeScopeString(bootstrap?.user?.role_preset_key),
    masterAdmin: bootstrap?.user?.is_master_admin === true,
    access: {
        scope: normalizeScopeString(bootstrap?.access?.scope).toLowerCase(),
        locationIds: normalizeIdList(bootstrap?.access?.location_ids),
        capabilities: bootstrap?.access?.capabilities || {},
        settingsSections: bootstrap?.access?.settings_sections || {},
        tenantCapabilities: bootstrap?.access?.tenant_capabilities || {}
    },
    workflow: {
        mode: normalizeScopeString(bootstrap?.workflow?.mode).toLowerCase(),
        capabilities: bootstrap?.workflow?.capabilities || {}
    }
});

/**
 * Build a stable authorization identity for OPIS request results.
 * The bootstrap contract does not expose a synthetic auth revision, so the
 * projected tenant/user/access snapshot is the invalidation boundary.
 */
export const buildBusinessAdminAuthorizationScopeKey = (bootstrap) => (
    stableSerialize(buildAuthorizationScope(bootstrap))
);

/**
 * Build the exact request-input portion of the scope key. Callers should pass
 * only values that are sent to the corresponding API request(s).
 */
export const buildBusinessAdminSectionScopeKey = ({
    bootstrap,
    activeSection,
    requestInputs = {}
} = {}) => stableSerialize({
    authorization: buildAuthorizationScope(bootstrap),
    section: normalizeScopeString(activeSection),
    requestInputs
});

export const buildBusinessAdminDetailScopeKey = ({
    sectionScopeKey,
    recordType,
    recordId
} = {}) => stableSerialize({
    sectionScopeKey: normalizeScopeString(sectionScopeKey),
    recordType: normalizeScopeString(recordType),
    recordId: normalizeScopeString(recordId)
});

export const isBusinessAdminSectionResultCurrent = ({
    result,
    activeSection,
    currentScopeKey,
    authorized = true
} = {}) => Boolean(
    authorized
    && result
    && result.section === normalizeScopeString(activeSection)
    && result.scopeKey === normalizeScopeString(currentScopeKey)
);
