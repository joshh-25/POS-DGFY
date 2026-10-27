import React, { useState } from 'react';
import { Archive, Building2, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    formatDirectoryValue,
    getActiveFilterChips,
    getFacetOptions,
    getStatusCounts,
    hasActiveFilters
} from './tenantDirectory.js';

const STATUS_TILES = [
    { key: 'all', label: 'Total', countKey: 'total', color: 'slate' },
    { key: 'pending', label: 'Pending', countKey: 'pending', color: 'amber', Icon: Clock },
    { key: 'active', label: 'Active', countKey: 'active', color: 'green', Icon: CheckCircle },
    { key: 'inactive', label: 'Inactive', countKey: 'inactive', color: 'slate', Icon: Building2 },
    { key: 'rejected', label: 'Rejected', countKey: 'rejected', color: 'red', Icon: XCircle },
    { key: 'archived', label: 'Archived', countKey: 'archived', color: 'slate', Icon: Archive }
];

const TILE_COLORS = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    red: 'border-red-200 bg-red-50 text-red-700'
};

const COMPLIANCE_LABELS = {
    non_compliant_active: 'Non-compliant active',
    compliant_pending: 'Compliant pending',
    compliant_active: 'Compliant active',
    not_selected: 'Not selected'
};

const OWNERSHIP_LABELS = {
    unassigned: 'Unassigned',
    handover_pending: 'Handover pending',
    claimed: 'Claimed'
};

const CAPABILITY_STATES = [
    { value: '', label: 'Any' },
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' },
    { value: 'unavailable', label: 'Unavailable' },
    { value: 'na', label: 'N/A (not active)' }
];

const SELECT_CLASS = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100';

const FacetSelect = ({ label, value, options, onChange }) => (
    <label className="block min-w-0 text-xs font-semibold text-slate-600">
        <span>{label}</span>
        <select className={SELECT_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>
            {options.map((option) => (
                <option key={`${label}-${option.value || 'default'}`} value={option.value}>{option.label}</option>
            ))}
        </select>
    </label>
);

export default function TenantDirectoryToolbar({
    tenants,
    state,
    searchDraft,
    visibleCount,
    rangeLabel,
    capabilitiesLoading = false,
    capabilityError = '',
    onSearchChange,
    onFilterChange,
    onSortChange,
    onPageSizeChange,
    onRemoveFilter,
    onClearAll,
    onRetryCapabilities
}) {
    const [filtersOpen, setFiltersOpen] = useState(false);
    const counts = getStatusCounts(tenants);
    const options = getFacetOptions(tenants);
    const chips = getActiveFilterChips(state);
    const archivedHidden = state.status !== 'all' && state.status !== 'archived'
        ? (counts.archived || 0)
        : 0;

    return (
        <section className="mb-6 space-y-4" aria-label="Tenant directory search and filters">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900">Tenant search</h2>
                        <p className="mt-1 text-xs text-slate-500">Matches company name, admin email, domain, or tenant ID.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600" aria-live="polite">
                            {rangeLabel || `${visibleCount} of ${tenants.length}`}
                        </span>
                        <Button type="button" variant="outline" size="sm" aria-expanded={filtersOpen} aria-controls={filtersOpen ? 'tenant-directory-filters' : undefined} onClick={() => setFiltersOpen((open) => !open)}>
                            {filtersOpen ? 'Hide filters' : 'Filters'}{hasActiveFilters(state) ? ' · active' : ''}
                        </Button>
                    </div>
                </div>

                <div className="relative">
                    <label className="sr-only" htmlFor="tenant-directory-search">Search tenants</label>
                    <input
                        id="tenant-directory-search"
                        type="search"
                        value={searchDraft}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search by name, admin email, domain, or tenant ID"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-3 pr-24 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100"
                    />
                    {String(searchDraft || '').trim() ? (
                        <button
                            type="button"
                            onClick={() => onSearchChange('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        >
                            Clear
                        </button>
                    ) : null}
                </div>

                {filtersOpen ? <div id="tenant-directory-filters" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="Tenant counts">
                    {STATUS_TILES.map(({ key, label, countKey, color, Icon }) => {
                        const selected = state.status === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={selected}
                                aria-label={`${label} tenants: ${counts[countKey] || 0}`}
                                onClick={() => onFilterChange('status', key)}
                                className={`flex min-h-16 items-center justify-between gap-2 rounded-xl border p-3 text-left shadow-sm transition hover:shadow ${TILE_COLORS[color]} ${selected ? 'ring-2 ring-slate-400 ring-offset-1' : ''}`}
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                                    {label}
                                </span>
                                <span className="text-xl font-bold">{counts[countKey] || 0}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <FacetSelect label="Status" value={state.status} options={options.status} onChange={(value) => onFilterChange('status', value)} />
                    <FacetSelect label="Plan" value={state.plan} options={options.plan} onChange={(value) => onFilterChange('plan', value)} />
                    <FacetSelect
                        label="Compliance mode"
                        value={state.compliance}
                        options={options.compliance.map((option) => ({
                            ...option,
                            label: option.value ? COMPLIANCE_LABELS[option.value] || formatDirectoryValue(option.value) : option.label
                        }))}
                        onChange={(value) => onFilterChange('compliance', value)}
                    />
                    <FacetSelect
                        label="Ownership"
                        value={state.ownership}
                        options={options.ownership.map((option) => ({
                            ...option,
                            label: option.value ? OWNERSHIP_LABELS[option.value] || formatDirectoryValue(option.value) : option.label
                        }))}
                        onChange={(value) => onFilterChange('ownership', value)}
                    />
                    <FacetSelect label="IMS capability" value={state.ims} options={CAPABILITY_STATES} onChange={(value) => onFilterChange('ims', value)} />
                    <FacetSelect label="POS capability" value={state.pos} options={CAPABILITY_STATES} onChange={(value) => onFilterChange('pos', value)} />
                    <FacetSelect label="Storefront capability" value={state.storefront} options={CAPABILITY_STATES} onChange={(value) => onFilterChange('storefront', value)} />
                    <FacetSelect
                        label="Sort"
                        value={state.sort}
                        options={[
                            { value: 'newest', label: 'Newest first' },
                            { value: 'oldest', label: 'Oldest first' },
                            { value: 'name_asc', label: 'Name A–Z' },
                            { value: 'name_desc', label: 'Name Z–A' }
                        ]}
                        onChange={onSortChange}
                    />
                    <FacetSelect
                        label="Page size"
                        value={String(state.page_size)}
                        options={[10, 20, 50].map((size) => ({ value: String(size), label: String(size) }))}
                        onChange={onPageSizeChange}
                    />
                </div>

                <p className="text-xs text-slate-500">Capability state is read for active tenants only; &quot;Unavailable&quot; means the read failed.</p>
                {capabilitiesLoading ? <p role="status" className="text-sm text-blue-800">Loading capability data for active tenants…</p> : null}
                {capabilityError ? (
                    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        <span>{capabilityError}</span>
                        <Button type="button" size="sm" variant="outline" onClick={onRetryCapabilities}>Retry capability read</Button>
                    </div>
                ) : null}

                {archivedHidden > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span>{archivedHidden} archived hidden</span>
                        <button
                            type="button"
                            onClick={() => onFilterChange('status', 'archived')}
                            className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700"
                        >
                            Show archived
                        </button>
                    </div>
                ) : null}

                {chips.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active tenant filters">
                        {chips.map((chip) => (
                            <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 py-1 pl-3 pr-1 text-xs font-medium text-sky-900">
                                {chip.text}
                                <button
                                    type="button"
                                    aria-label={`Remove ${chip.text}`}
                                    onClick={() => onRemoveFilter(chip.key)}
                                    className="rounded-full px-1.5 py-0.5 text-sky-700 hover:bg-sky-100"
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                        {hasActiveFilters(state) ? (
                            <Button type="button" variant="ghost" size="sm" onClick={onClearAll}>Clear all</Button>
                        ) : null}
                    </div>
                ) : null}
                </div> : null}
            </div>
        </section>
    );
}
