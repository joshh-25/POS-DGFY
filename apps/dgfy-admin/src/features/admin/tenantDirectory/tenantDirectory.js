/**
 * Pure tenant-directory search, facets, and URL state.
 *
 * URL keys are ordered as q, status, plan, compliance, ownership, ims, pos,
 * storefront. An empty status is the default view (all statuses except
 * archived); status=all includes archived, and status=archived selects only
 * archived tenants. The module preserves query parameters owned by other
 * routes/features when it serializes directory state.
 */

export const DIRECTORY_PARAMETER_KEYS = Object.freeze([
    'q',
    'status',
    'plan',
    'compliance',
    'ownership',
    'ims',
    'pos',
    'storefront'
]);

export const DEFAULT_DIRECTORY_STATE = Object.freeze({
    q: '',
    status: '',
    plan: '',
    compliance: '',
    ownership: '',
    ims: '',
    pos: '',
    storefront: ''
});

const CAPABILITY_KEYS = Object.freeze({
    ims: 'ims_enabled',
    pos: 'pos_enabled',
    storefront: 'storefront_visible'
});

const CAPABILITY_STATES = new Set(['on', 'off', 'unavailable', 'na']);
const FIXED_STATUSES = Object.freeze(['pending', 'active', 'inactive', 'rejected', 'archived']);
const FIXED_OWNERSHIP = Object.freeze(['unassigned', 'handover_pending', 'claimed']);

const FIXED_LABELS = {
    all: 'All statuses',
    not_selected: 'Not selected',
    unavailable: 'Unavailable',
    na: 'N/A',
    on: 'On',
    off: 'Off'
};

const titleCase = (value) => String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

export const formatDirectoryValue = (value) => FIXED_LABELS[value] || titleCase(value);

const normalizeParams = (params) => {
    if (params instanceof URLSearchParams) return new URLSearchParams(params);
    return new URLSearchParams(params || '');
};

export function parseDirectoryParams(params) {
    const searchParams = normalizeParams(params);
    const state = { ...DEFAULT_DIRECTORY_STATE };

    state.q = searchParams.get('q') || '';
    state.status = searchParams.get('status') || '';
    state.plan = searchParams.get('plan') || '';
    state.compliance = searchParams.get('compliance') || '';
    state.ownership = searchParams.get('ownership') || '';

    Object.keys(CAPABILITY_KEYS).forEach((key) => {
        const value = searchParams.get(key) || '';
        state[key] = CAPABILITY_STATES.has(value) ? value : '';
    });

    return state;
}

export function serializeDirectoryParams(state = DEFAULT_DIRECTORY_STATE, baseParams) {
    const source = normalizeParams(baseParams);
    const directoryKeys = new Set(DIRECTORY_PARAMETER_KEYS);
    const output = new URLSearchParams();

    for (const [key, value] of source) {
        if (!directoryKeys.has(key)) output.append(key, value);
    }

    DIRECTORY_PARAMETER_KEYS.forEach((key) => {
        const rawValue = state[key];
        const value = String(rawValue || '');
        if (key === 'q' && !value.trim()) return;
        if (!value) return;
        if (CAPABILITY_KEYS[key] && !CAPABILITY_STATES.has(value)) return;
        output.append(key, value);
    });

    return output;
}

const capabilityState = (capabilities, key) => {
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return 'na';
    if (capabilities.unavailable === true) return 'unavailable';
    if (capabilities[key] === true) return 'on';
    if (capabilities[key] === false) return 'off';
    return 'unavailable';
};

export function deriveTenantFacets(tenant = {}) {
    const status = tenant.status || '';
    const complianceState = String(tenant.compliance_mode_state || '').trim();
    const capabilities = tenant.capabilities;

    return {
        status,
        plan: tenant.effective_plan
            || (status === 'pending' || status === 'active' ? 'premium' : '')
            || tenant.plan
            || 'premium',
        compliance: tenant.compliance_mode_choice_required === true || !complianceState
            ? 'not_selected'
            : complianceState,
        ownership: tenant.ownership_status || '',
        ims: capabilityState(capabilities, CAPABILITY_KEYS.ims),
        pos: capabilityState(capabilities, CAPABILITY_KEYS.pos),
        storefront: capabilityState(capabilities, CAPABILITY_KEYS.storefront)
    };
}

const normalizedText = (value) => (value === null || value === undefined ? '' : String(value)).toLowerCase();

export function matchesSearch(tenant = {}, query = '') {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return true;

    const identityValues = [tenant.name, tenant.admin_email, tenant.domain];
    if (identityValues.some((value) => normalizedText(value).includes(normalizedQuery))) return true;
    return normalizedText(tenant.id).startsWith(normalizedQuery);
}

export function filterTenants(tenants = [], state = DEFAULT_DIRECTORY_STATE) {
    const rows = Array.isArray(tenants) ? tenants : [];
    const filters = { ...DEFAULT_DIRECTORY_STATE, ...state };

    return rows.filter((tenant) => {
        if (!matchesSearch(tenant, filters.q)) return false;

        const facets = deriveTenantFacets(tenant);
        if (!filters.status && facets.status === 'archived') return false;
        if (filters.status && filters.status !== 'all' && facets.status !== filters.status) return false;
        if (filters.plan && facets.plan !== filters.plan) return false;
        if (filters.compliance && facets.compliance !== filters.compliance) return false;
        if (filters.ownership && facets.ownership !== filters.ownership) return false;
        if (filters.ims && facets.ims !== filters.ims) return false;
        if (filters.pos && facets.pos !== filters.pos) return false;
        if (filters.storefront && facets.storefront !== filters.storefront) return false;
        return true;
    });
}

export function getStatusCounts(tenants = []) {
    const counts = { total: Array.isArray(tenants) ? tenants.length : 0 };
    if (!Array.isArray(tenants)) return counts;

    tenants.forEach((tenant) => {
        const status = tenant?.status;
        if (!status) return;
        counts[status] = (counts[status] || 0) + 1;
    });

    return counts;
}

const uniqueValues = (values) => Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));

export function getFacetOptions(tenants = []) {
    const rows = Array.isArray(tenants) ? tenants : [];
    const statuses = new Set(FIXED_STATUSES);
    const plans = [];
    const compliance = [];
    const ownership = new Set(FIXED_OWNERSHIP);

    rows.forEach((tenant) => {
        const facets = deriveTenantFacets(tenant);
        if (facets.status) statuses.add(facets.status);
        plans.push(facets.plan);
        compliance.push(facets.compliance);
        if (facets.ownership) ownership.add(facets.ownership);
    });

    const statusOptions = [
        { value: '', label: 'All except archived' },
        { value: 'all', label: 'All statuses' },
        ...Array.from(statuses)
            .sort((left, right) => {
                const leftIndex = FIXED_STATUSES.indexOf(left);
                const rightIndex = FIXED_STATUSES.indexOf(right);
                const leftOrder = leftIndex === -1 ? FIXED_STATUSES.length : leftIndex;
                const rightOrder = rightIndex === -1 ? FIXED_STATUSES.length : rightIndex;
                return leftOrder - rightOrder || left.localeCompare(right);
            })
            .map((value) => ({ value, label: formatDirectoryValue(value) }))
    ];

    const optionsFor = (values, anyLabel) => [
        { value: '', label: anyLabel },
        ...uniqueValues(values).map((value) => ({ value, label: formatDirectoryValue(value) }))
    ];

    return {
        status: statusOptions,
        plan: optionsFor(plans, 'Any plan'),
        compliance: optionsFor(compliance, 'Any compliance mode'),
        ownership: optionsFor(Array.from(ownership), 'Any ownership')
    };
}

export function getActiveFilterChips(state = DEFAULT_DIRECTORY_STATE) {
    const filters = { ...DEFAULT_DIRECTORY_STATE, ...state };
    const chips = [];
    const addChip = (key, label, value, displayValue) => {
        if (!value) return;
        chips.push({ key, label, value, text: `${label}: ${displayValue || formatDirectoryValue(value)}` });
    };

    addChip('q', 'Search', String(filters.q || '').trim(), String(filters.q || '').trim());
    addChip('status', 'Status', filters.status, formatDirectoryValue(filters.status));
    addChip('plan', 'Plan', filters.plan, formatDirectoryValue(filters.plan));
    addChip('compliance', 'Compliance', filters.compliance, formatDirectoryValue(filters.compliance));
    addChip('ownership', 'Ownership', filters.ownership, formatDirectoryValue(filters.ownership));
    addChip('ims', 'IMS', filters.ims, formatDirectoryValue(filters.ims));
    addChip('pos', 'POS', filters.pos, formatDirectoryValue(filters.pos));
    addChip('storefront', 'Storefront', filters.storefront, formatDirectoryValue(filters.storefront));

    return chips;
}

export function hasActiveFilters(state = DEFAULT_DIRECTORY_STATE) {
    return DIRECTORY_PARAMETER_KEYS.some((key) => {
        if (key === 'q') return Boolean(String(state.q || '').trim());
        return Boolean(state[key]);
    });
}
