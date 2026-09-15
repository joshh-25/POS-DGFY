const normalizeKey = (value) => String(value || '').trim().toLowerCase();

export const BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS = Object.freeze([
    {
        key: 'profile',
        label: 'Business & receipts',
        description: 'Business identity, receipt details, and tenant-wide profile values.',
        scope: 'tenant',
        ownerViewMode: 'settings_profile',
        ownerLabel: 'Open business settings'
    },
    {
        key: 'pos',
        label: 'POS configuration',
        description: 'POS preferences, discount rules, and operational defaults.',
        scope: 'tenant',
        ownerViewMode: 'settings_pos',
        ownerLabel: 'Open POS settings'
    },
    {
        key: 'storefront',
        label: 'Storefront settings',
        description: 'Storefront identity, visibility, presentation, and public access policy.',
        scope: 'tenant',
        ownerViewMode: 'settings_storefront',
        ownerLabel: 'Open Storefront settings'
    },
    {
        key: 'delivery',
        label: 'Delivery pricing',
        description: 'Tenant-wide delivery fee policy used by Storefront checkout.',
        scope: 'tenant',
        ownerViewMode: 'settings_storefront',
        ownerLabel: 'Open delivery settings'
    },
    {
        key: 'branches',
        label: 'Branches & locations',
        description: 'Branch address, hours, fulfillment, and location-specific operating values.',
        scope: 'branch',
        ownerViewMode: 'settings_storefront',
        ownerLabel: 'Open branch settings'
    },
    {
        key: 'team',
        label: 'Team & access',
        description: 'User access, cashier administration, branch grants, and employee ownership.',
        scope: 'branch',
        ownerViewMode: 'settings_pos',
        ownerLabel: 'Open team settings'
    },
    {
        key: 'attendance',
        label: 'Attendance settings',
        description: 'Cashier attendance configuration scoped to the selected branch set.',
        scope: 'branch',
        ownerViewMode: 'settings_pos',
        ownerLabel: 'Open attendance settings'
    },
    {
        key: 'payments',
        label: 'Payment policies',
        description: 'Downpayment and partial-payment policy for the tenant.',
        scope: 'tenant',
        ownerViewMode: 'settings_pos',
        ownerLabel: 'Open payment settings'
    },
    {
        key: 'registers',
        label: 'Registers & terminal policy',
        description: 'Terminal registry and branch binding policy. Device enrollment remains POS-owned.',
        scope: 'branch',
        ownerViewMode: 'settings_pos',
        ownerLabel: 'Open register settings'
    }
]);

const definitionsByKey = new Map(
    BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS.map((definition) => [definition.key, definition])
);

export const getBusinessAdminSettingsSectionDefinition = (key) => (
    definitionsByKey.get(normalizeKey(key)) || null
);

export const normalizeBusinessAdminSettingsCapabilities = (rawCapabilities) => {
    const source = rawCapabilities && typeof rawCapabilities === 'object' && !Array.isArray(rawCapabilities)
        ? rawCapabilities
        : {};

    return Object.fromEntries(BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS.map((definition) => {
        const sourceEntry = source[definition.key];
        return [definition.key, {
            scope: sourceEntry?.scope === 'branch' ? 'branch' : definition.scope,
            view: sourceEntry?.view === true,
            edit: sourceEntry?.edit === true,
            branding: sourceEntry?.branding === true,
            employee_edit: sourceEntry?.employee_edit === true,
            employee_credit_edit: sourceEntry?.employee_credit_edit === true,
            user_view: sourceEntry?.user_view === true,
            user_edit: sourceEntry?.user_edit === true
        }];
    }));
};

// Business Admin embeds the canonical POS settings editor, which expects the same
// permission-shaped user object as the terminal surface. Build a narrow projection
// from the server-authorized section only; never copy an untrusted/raw permission list
// into another section's editor.
export const buildBusinessAdminSettingsEditorUser = ({
    baseUser = {},
    sectionKey = '',
    rawCapabilities = {}
} = {}) => {
    const definition = getBusinessAdminSettingsSectionDefinition(sectionKey);
    const capabilities = normalizeBusinessAdminSettingsCapabilities(rawCapabilities);
    const capability = definition ? capabilities[definition.key] : null;
    const permissions = [];
    const addPermission = (permission, enabled) => {
        if (enabled && permission) permissions.push(permission);
    };

    if (capability?.view) addPermission('settings:view', ['profile', 'pos', 'storefront', 'delivery', 'branches', 'attendance', 'registers'].includes(definition?.key));
    if (capability?.edit) addPermission('settings:edit', ['profile', 'pos', 'storefront', 'delivery', 'branches', 'attendance', 'registers'].includes(definition?.key));
    if (definition?.key === 'storefront') {
        addPermission('settings:storefront_branding_edit', capability?.branding === true);
    }
    if (definition?.key === 'team') {
        addPermission('users:view', capability?.user_view === true);
        addPermission('users:manage', capability?.user_edit === true);
        addPermission('pos:employees:manage', capability?.employee_edit === true);
        addPermission('pos:employee_credit:manage', capability?.employee_credit_edit === true);
    }
    if (definition?.key === 'payments') {
        addPermission('downpayment:view', capability?.view === true);
        addPermission('downpayment:settings', capability?.edit === true);
    }

    return {
        ...baseUser,
        permissions: Array.from(new Set(permissions)),
        is_master_admin: baseUser?.is_master_admin === true
    };
};

export const getVisibleBusinessAdminSettingsSections = (rawCapabilities) => {
    const capabilities = normalizeBusinessAdminSettingsCapabilities(rawCapabilities);
    return BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS.filter((definition) => (
        capabilities[definition.key]?.view === true
    ));
};

export const canAccessBusinessAdminSettingsSection = (rawCapabilities, key, action = 'view') => {
    const capabilities = normalizeBusinessAdminSettingsCapabilities(rawCapabilities);
    const normalizedAction = action === 'edit' ? 'edit' : 'view';
    return capabilities[normalizeKey(key)]?.[normalizedAction] === true;
};

export const resolveBusinessAdminSettingsSectionKey = (requestedKey, rawCapabilities) => {
    const requested = normalizeKey(requestedKey);
    const visible = getVisibleBusinessAdminSettingsSections(rawCapabilities);
    if (requested && visible.some((definition) => definition.key === requested)) return requested;
    return visible[0]?.key || '';
};

export const parseBusinessAdminPath = (pathname, rootPath = '/business-admin') => {
    const normalizedPath = String(pathname || '').replace(/\/+$/, '') || '/';
    const normalizedRoot = String(rootPath || '/business-admin').replace(/\/+$/, '') || '/business-admin';
    const suffix = normalizedPath === normalizedRoot
        ? ''
        : normalizedPath.startsWith(`${normalizedRoot}/`)
            ? normalizedPath.slice(normalizedRoot.length + 1)
            : '';
    const segments = suffix.split('/').map((segment) => normalizeKey(segment)).filter(Boolean);
    const activeSection = segments[0] || 'overview';
    return {
        activeSection,
        settingsSection: activeSection === 'settings' ? (segments[1] || 'profile') : '',
        segments
    };
};

export const buildBusinessAdminSettingsPath = (rootPath, sectionKey = 'profile') => {
    const root = String(rootPath || '/business-admin').replace(/\/+$/, '') || '/business-admin';
    const key = getBusinessAdminSettingsSectionDefinition(sectionKey)?.key || 'profile';
    return `${root}/settings/${key}`;
};

export const buildPosSettingsOwnerPath = (viewMode = 'settings_profile') => {
    const normalizedMode = String(viewMode || '').trim();
    return `/terminal?view=${encodeURIComponent(normalizedMode || 'settings_profile')}`;
};

export const resolveSettingsBranchId = ({
    requestedId = '',
    scope = 'assigned',
    branches = [],
    allowedLocationIds = []
} = {}) => {
    const visibleIds = new Set((Array.isArray(branches) ? branches : [])
        .map((branch) => Number(branch?.branch_id ?? branch?.location_id))
        .filter((id) => Number.isInteger(id) && id > 0));
    const allowedIds = new Set((Array.isArray(allowedLocationIds) ? allowedLocationIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0));
    const candidate = Number(requestedId);
    if (Number.isInteger(candidate) && candidate > 0 && visibleIds.has(candidate)
        && (scope === 'all' || allowedIds.has(candidate))) {
        return String(candidate);
    }

    const fallback = Array.from(visibleIds).find((id) => scope === 'all' || allowedIds.has(id));
    return fallback ? String(fallback) : '';
};

export const settingsScopeLabel = (scope, sectionScope = 'tenant') => {
    if (sectionScope === 'tenant') return 'Tenant-wide setting';
    return scope === 'all' ? 'Selected visible branch' : 'Assigned branch scope';
};

export const shouldBlockSettingsNavigation = (isDirty) => isDirty === true;
