/**
 * Pure tenant-directory search, facets, and URL state.
 *
 * An empty status is the default view (all statuses except archived);
 * status=all includes archived, and status=archived selects only archived
 * tenants. Sort, page, and page size are validated and serialized alongside
 * the filters. Unrelated query parameters are preserved.
 */

export const DIRECTORY_PARAMETER_KEYS = Object.freeze([
    'q',
    'status',
    'plan',
    'compliance',
    'ownership',
    'ims',
    'pos',
    'storefront',
    'sort',
    'page',
    'page_size'
]);

export const DIRECTORY_SORTS = Object.freeze(['newest', 'oldest', 'name_asc', 'name_desc']);
export const DIRECTORY_PAGE_SIZES = Object.freeze([10, 20, 50]);
export const DEFAULT_DIRECTORY_SORT = 'newest';
export const DEFAULT_DIRECTORY_PAGE_SIZE = 20;

export const DEFAULT_DIRECTORY_STATE = Object.freeze({
    q: '',
    status: '',
    plan: '',
    compliance: '',
    ownership: '',
    ims: '',
    pos: '',
    storefront: '',
    sort: DEFAULT_DIRECTORY_SORT,
    page: 1,
    page_size: DEFAULT_DIRECTORY_PAGE_SIZE
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

const parsePositiveInteger = (value, fallback) => {
    const normalized = String(value || '');
    if (!/^[1-9]\d*$/.test(normalized)) return fallback;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
};

export function parseDirectoryParams(params) {
    const searchParams = normalizeParams(params);
    const state = { ...DEFAULT_DIRECTORY_STATE };

    state.q = searchParams.get('q') || '';
    state.status = searchParams.get('status') || '';
    state.plan = searchParams.get('plan') || '';
    state.compliance = searchParams.get('compliance') || '';
    state.ownership = searchParams.get('ownership') || '';
    const sort = searchParams.get('sort') || '';
    state.sort = DIRECTORY_SORTS.includes(sort) ? sort : DEFAULT_DIRECTORY_SORT;
    state.page = parsePositiveInteger(searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(searchParams.get('page_size'), DEFAULT_DIRECTORY_PAGE_SIZE);
    state.page_size = DIRECTORY_PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_DIRECTORY_PAGE_SIZE;

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
        if (key === 'sort') {
            if (DIRECTORY_SORTS.includes(rawValue) && rawValue !== DEFAULT_DIRECTORY_SORT) output.append(key, rawValue);
            return;
        }
        if (key === 'page') {
            const page = parsePositiveInteger(rawValue, 1);
            if (page > 1) output.append(key, String(page));
            return;
        }
        if (key === 'page_size') {
            const pageSize = parsePositiveInteger(rawValue, DEFAULT_DIRECTORY_PAGE_SIZE);
            if (DIRECTORY_PAGE_SIZES.includes(pageSize) && pageSize !== DEFAULT_DIRECTORY_PAGE_SIZE) output.append(key, String(pageSize));
            return;
        }
        const value = String(rawValue || '');
        if (key === 'q' && !value.trim()) return;
        if (!value) return;
        if (CAPABILITY_KEYS[key] && !CAPABILITY_STATES.has(value)) return;
        output.append(key, value);
    });

    return output;
}

const capabilityState = (tenant, capabilitiesLoaded, key) => {
    if (tenant.status !== 'active') return 'na';
    const capabilities = tenant.capabilities;
    if (!capabilitiesLoaded) return 'loading';
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return 'unavailable';
    if (capabilities.unavailable === true) return 'unavailable';
    if (capabilities[key] === true) return 'on';
    if (capabilities[key] === false) return 'off';
    return 'unavailable';
};

export function deriveTenantFacets(tenant = {}, { capabilitiesLoaded = true } = {}) {
    const status = tenant.status || '';
    const complianceState = String(tenant.compliance_mode_state || '').trim();

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
        ims: capabilityState(tenant, capabilitiesLoaded, CAPABILITY_KEYS.ims),
        pos: capabilityState(tenant, capabilitiesLoaded, CAPABILITY_KEYS.pos),
        storefront: capabilityState(tenant, capabilitiesLoaded, CAPABILITY_KEYS.storefront)
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

export function filterTenants(tenants = [], state = DEFAULT_DIRECTORY_STATE, options = {}) {
    const rows = Array.isArray(tenants) ? tenants : [];
    const filters = { ...DEFAULT_DIRECTORY_STATE, ...state };

    return rows.filter((tenant) => {
        if (!matchesSearch(tenant, filters.q)) return false;

        const facets = deriveTenantFacets(tenant, options);
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

const compareName = (left, right) => String(left?.name || '').localeCompare(
    String(right?.name || ''),
    undefined,
    { sensitivity: 'base', numeric: true }
);
const compareId = (left, right) => String(left?.id || '').localeCompare(String(right?.id || ''), undefined, { numeric: true });

export function sortTenants(tenants = [], sort = DEFAULT_DIRECTORY_SORT) {
    const rows = Array.isArray(tenants) ? tenants : [];
    const direction = DIRECTORY_SORTS.includes(sort) ? sort : DEFAULT_DIRECTORY_SORT;
    return rows.slice().sort((left, right) => {
        let primary = 0;
        if (direction === 'name_asc' || direction === 'name_desc') {
            primary = compareName(left, right) * (direction === 'name_desc' ? -1 : 1);
        } else {
            const leftDate = Date.parse(left?.createdAt || left?.created_at || '');
            const rightDate = Date.parse(right?.createdAt || right?.created_at || '');
            const leftValid = Number.isFinite(leftDate);
            const rightValid = Number.isFinite(rightDate);
            if (leftValid !== rightValid) return leftValid ? -1 : 1;
            if (leftValid && rightValid) primary = (leftDate - rightDate) * (direction === 'newest' ? -1 : 1);
        }
        return primary || compareId(left, right) || compareName(left, right);
    });
}

export function paginateTenants(tenants = [], page = 1, pageSize = DEFAULT_DIRECTORY_PAGE_SIZE) {
    const rows = Array.isArray(tenants) ? tenants : [];
    const safePageSize = DIRECTORY_PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : DEFAULT_DIRECTORY_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(rows.length / safePageSize));
    const safePage = Math.min(parsePositiveInteger(page, 1), totalPages);
    const startIndex = (safePage - 1) * safePageSize;
    const pageRows = rows.slice(startIndex, startIndex + safePageSize);
    return {
        rows: pageRows,
        page: safePage,
        pageSize: safePageSize,
        totalPages,
        rangeStart: pageRows.length ? startIndex + 1 : 0,
        rangeEnd: startIndex + pageRows.length
    };
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
    return ['q', 'status', 'plan', 'compliance', 'ownership', 'ims', 'pos', 'storefront'].some((key) => {
        if (key === 'q') return Boolean(String(state.q || '').trim());
        return Boolean(state[key]);
    });
}
