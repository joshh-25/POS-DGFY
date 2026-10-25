import { describe, expect, it } from 'vitest';
import {
    DEFAULT_DIRECTORY_STATE,
    deriveTenantFacets,
    filterTenants,
    getActiveFilterChips,
    getFacetOptions,
    getStatusCounts,
    hasActiveFilters,
    matchesSearch,
    parseDirectoryParams,
    paginateTenants,
    serializeDirectoryParams,
    sortTenants
} from '../tenantDirectory.js';

const tenants = [
    {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Kate Market',
        admin_email: 'kate@example.test',
        domain: 'kate-market.test',
        company_token: 'tok-secret',
        status: 'active',
        plan: 'standard',
        compliance_mode_state: 'compliant_active',
        ownership_status: 'claimed',
        capabilities: { ims_enabled: true, pos_enabled: false, storefront_visible: true }
    },
    {
        id: 'tenant-pending-1',
        name: 'Nori House',
        admin_email: 'nori@example.test',
        domain: 'nori.test',
        status: 'pending',
        compliance_mode_choice_required: true,
        ownership_status: 'unassigned',
        capabilities: null
    },
    {
        id: 'tenant-archived-1',
        name: 'Archived Market',
        status: 'archived',
        plan: 'standard',
        compliance_mode_state: '',
        ownership_status: 'handover_pending',
        capabilities: { unavailable: true }
    },
    {
        id: 'tenant-inactive-1',
        name: 'Closed Shop',
        status: 'inactive',
        plan: 'standard',
        capabilities: { ims_enabled: false }
    },
    {
        id: 'tenant-future-1',
        name: 'Future Tenant',
        status: 'reviewing',
        effective_plan: 'enterprise',
        compliance_mode_state: 'compliant_pending',
        ownership_status: 'claimed',
        capabilities: { ims_enabled: true, pos_enabled: true, storefront_visible: false }
    }
];

describe('tenant directory search', () => {
    it('matches identity fields case-insensitively and trims one contiguous query', () => {
        expect(matchesSearch(tenants[0], '  KATE MARKET ')).toBe(true);
        expect(matchesSearch(tenants[0], 'KATE@EXAMPLE.TEST')).toBe(true);
        expect(matchesSearch(tenants[0], 'market.test')).toBe(true);
        expect(matchesSearch(tenants[0], '550e8400-e29b')).toBe(true);
        expect(matchesSearch(tenants[0], '8400-e29b')).toBe(false);
        expect(matchesSearch(tenants[0], '   ')).toBe(true);
    });

    it('does not search tokens, status, plan, or synthetic capability phrases', () => {
        expect(matchesSearch(tenants[0], 'tok-secret')).toBe(false);
        expect(matchesSearch(tenants[0], 'active')).toBe(false);
        expect(matchesSearch(tenants[0], 'premium')).toBe(false);
        expect(matchesSearch(tenants[0], 'pos disabled')).toBe(false);
    });
});

describe('tenant directory facets', () => {
    it('mirrors the TenantManager effective-plan fallback and derives not-selected compliance', () => {
        expect(deriveTenantFacets({ status: 'pending', plan: 'standard' }).plan).toBe('premium');
        expect(deriveTenantFacets({ status: 'active', plan: 'standard' }).plan).toBe('premium');
        expect(deriveTenantFacets({ status: 'inactive', plan: 'standard' }).plan).toBe('standard');
        expect(deriveTenantFacets({ effective_plan: 'enterprise', status: 'active' }).plan).toBe('enterprise');
        expect(deriveTenantFacets({ plan: 'standard', status: 'pending' }).plan).toBe('premium');
        expect(deriveTenantFacets({ compliance_mode_choice_required: true, compliance_mode_state: 'compliant_active' }).compliance).toBe('not_selected');
        expect(deriveTenantFacets({ compliance_mode_state: '' }).compliance).toBe('not_selected');
        expect(deriveTenantFacets({ compliance_mode_state: 'compliant_pending' }).compliance).toBe('compliant_pending');
    });

    it('keeps capability on, off, unavailable, and n/a distinct', () => {
        expect(deriveTenantFacets({ status: 'active', capabilities: { ims_enabled: true } }).ims).toBe('on');
        expect(deriveTenantFacets({ status: 'active', capabilities: { ims_enabled: false } }).ims).toBe('off');
        expect(deriveTenantFacets({ status: 'active', capabilities: { unavailable: true, ims_enabled: false } }).ims).toBe('unavailable');
        expect(deriveTenantFacets({ capabilities: null }).ims).toBe('na');
        expect(deriveTenantFacets({ capabilities: 'invalid' }).ims).toBe('na');
        expect(deriveTenantFacets({ status: 'active', capabilities: {} }).ims).toBe('unavailable');
        expect(deriveTenantFacets({ status: 'active', capabilities: null }, { capabilitiesLoaded: false }).ims).toBe('loading');
        expect(deriveTenantFacets({ status: 'active', capabilities: null }).ims).toBe('unavailable');
        expect(deriveTenantFacets({ status: 'archived', capabilities: null }, { capabilitiesLoaded: false }).ims).toBe('na');
        expect(deriveTenantFacets({ ownership_status: 'handover_pending' }).ownership).toBe('handover_pending');
        expect(filterTenants([
            { id: 'off', status: 'active', capabilities: { ims_enabled: false } },
            { id: 'unavailable', status: 'active', capabilities: { unavailable: true } },
            { id: 'na', status: 'inactive', capabilities: null }
        ], { ...DEFAULT_DIRECTORY_STATE, status: 'all', ims: 'off' }).map((tenant) => tenant.id)).toEqual(['off']);
    });
});

describe('tenant directory filtering', () => {
    it('hides archived by default and supports all and archived status views', () => {
        expect(filterTenants(tenants).map((tenant) => tenant.id)).not.toContain('tenant-archived-1');
        expect(filterTenants(tenants, { ...DEFAULT_DIRECTORY_STATE, status: 'all' })).toHaveLength(tenants.length);
        expect(filterTenants(tenants, { ...DEFAULT_DIRECTORY_STATE, status: 'archived' }).map((tenant) => tenant.id)).toEqual(['tenant-archived-1']);
        expect(filterTenants(tenants, { ...DEFAULT_DIRECTORY_STATE, status: 'reviewing' }).map((tenant) => tenant.id)).toEqual(['tenant-future-1']);
    });

    it('ANDs search with status, plan, compliance, capability, and ownership facets', () => {
        const state = {
            ...DEFAULT_DIRECTORY_STATE,
            q: 'kate',
            status: 'active',
            plan: 'premium',
            compliance: 'compliant_active',
            ownership: 'claimed',
            ims: 'on',
            pos: 'off',
            storefront: 'on'
        };
        expect(filterTenants(tenants, state).map((tenant) => tenant.id)).toEqual([tenants[0].id]);
        expect(filterTenants(tenants, { ...state, ownership: 'unassigned' })).toEqual([]);
    });
});

describe('tenant directory URL state', () => {
    it('round-trips non-default values and keeps unrelated parameters in stable order', () => {
        const state = {
            ...DEFAULT_DIRECTORY_STATE,
            q: ' kate ',
            status: 'active',
            plan: 'premium',
            compliance: 'not_selected',
            ownership: 'unassigned',
            ims: 'off',
            pos: 'unavailable',
            storefront: 'na'
        };
        const serialized = serializeDirectoryParams(state, 'returnTo=%2Fadmin%2Ftenants%2F42&status=archived&trace=1&q=old');
        expect(serialized.toString()).toBe('returnTo=%2Fadmin%2Ftenants%2F42&trace=1&q=+kate+&status=active&plan=premium&compliance=not_selected&ownership=unassigned&ims=off&pos=unavailable&storefront=na');
        expect(parseDirectoryParams(serialized)).toEqual(state);
    });

    it('omits defaults and empty values and ignores invalid capability values', () => {
        expect(serializeDirectoryParams(DEFAULT_DIRECTORY_STATE, 'q=&status=&ims=disabled&other=keep').toString()).toBe('other=keep');
        expect(serializeDirectoryParams({ ...DEFAULT_DIRECTORY_STATE, q: '   ' }, 'other=keep').toString()).toBe('other=keep');
        expect(parseDirectoryParams('q=&status=all&ims=disabled&pos=off')).toEqual({
            ...DEFAULT_DIRECTORY_STATE,
            status: 'all',
            pos: 'off'
        });
        expect(hasActiveFilters(DEFAULT_DIRECTORY_STATE)).toBe(false);
    });

    it('validates sort, page, and page size while preserving unrelated route context', () => {
        expect(parseDirectoryParams('sort=name_desc&page=3&page_size=50&returnTo=%2Fadmin%2Ftenants%2Fx')).toEqual({
            ...DEFAULT_DIRECTORY_STATE,
            sort: 'name_desc',
            page: 3,
            page_size: 50
        });
        expect(parseDirectoryParams('sort=unknown&page=0&page_size=25')).toEqual(DEFAULT_DIRECTORY_STATE);
        expect(serializeDirectoryParams({ ...DEFAULT_DIRECTORY_STATE, sort: 'oldest', page: 3, page_size: 50 }, 'returnTo=%2Fadmin%2Ftenants%2Fx').toString())
            .toBe('returnTo=%2Fadmin%2Ftenants%2Fx&sort=oldest&page=3&page_size=50');
        expect(hasActiveFilters({ ...DEFAULT_DIRECTORY_STATE, sort: 'oldest', page: 3, page_size: 50 })).toBe(false);
    });
});

describe('tenant directory ordering and paging', () => {
    const rows = [
        { id: 'b', name: 'Beta', created_at: '2026-01-01T00:00:00Z' },
        { id: 'a', name: 'alpha', created_at: '2026-01-01T00:00:00Z' },
        { id: 'c', name: 'Gamma', created_at: 'not-a-date' }
    ];

    it('sorts by name or creation date with deterministic ties and keeps the source order untouched', () => {
        expect(sortTenants(rows, 'name_asc').map((row) => row.id)).toEqual(['a', 'b', 'c']);
        expect(sortTenants(rows, 'name_desc').map((row) => row.id)).toEqual(['c', 'b', 'a']);
        expect(sortTenants(rows, 'newest').map((row) => row.id)).toEqual(['a', 'b', 'c']);
        expect(rows.map((row) => row.id)).toEqual(['b', 'a', 'c']);
    });

    it('clamps an out-of-range page and reports an empty range clearly', () => {
        const largeSet = Array.from({ length: 25 }, (_, index) => ({ id: String(index + 1) }));
        expect(paginateTenants(largeSet, 8, 10)).toMatchObject({ page: 3, totalPages: 3, rangeStart: 21, rangeEnd: 25, rows: largeSet.slice(20) });
        expect(paginateTenants([], 1, 20)).toMatchObject({ page: 1, totalPages: 1, rangeStart: 0, rangeEnd: 0, rows: [] });
    });
});

describe('tenant directory counts, options, and chips', () => {
    it('counts every status independently of the active filters and offers extra statuses', () => {
        expect(getStatusCounts(tenants)).toEqual({ total: 5, active: 1, pending: 1, archived: 1, inactive: 1, reviewing: 1 });
        const options = getFacetOptions(tenants);
        expect(options.status.map((option) => option.value)).toContain('reviewing');
        expect(options.plan.map((option) => option.value)).toContain('enterprise');
        expect(options.ownership.map((option) => option.value)).toEqual(['', 'claimed', 'handover_pending', 'unassigned']);
    });

    it('formats active chips with labels and values', () => {
        expect(getActiveFilterChips({ ...DEFAULT_DIRECTORY_STATE, q: 'kate', pos: 'off', status: 'all' }).map((chip) => chip.text)).toEqual([
            'Search: kate',
            'Status: All statuses',
            'POS: Off'
        ]);
        expect(hasActiveFilters({ ...DEFAULT_DIRECTORY_STATE, q: 'kate' })).toBe(true);
    });
});
