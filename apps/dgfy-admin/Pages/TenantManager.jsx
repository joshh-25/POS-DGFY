import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
    Building2,
    RefreshCw,
    Clock,
    AlertCircle,
    CheckCircle,
    XCircle,
    Archive,
    Mail,
    Calendar,
    FileText
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as adminService from '@/services/adminService';
import TenantDirectoryToolbar from '../src/features/admin/tenantDirectory/TenantDirectoryToolbar.jsx';
import TenantConsoleTabs from '../src/features/admin/tenantDirectory/TenantConsoleTabs.jsx';
import { useTenantDirectory } from '../src/features/admin/tenantDirectory/TenantDirectoryContext.jsx';
import {
    DEFAULT_DIRECTORY_STATE,
    filterTenants,
    paginateTenants,
    parseDirectoryParams,
    serializeDirectoryParams,
    sortTenants
} from '../src/features/admin/tenantDirectory/tenantDirectory.js';
import RegistrationUploadsModal from './RegistrationUploadsModal.jsx';

const STATUS_CONFIG = {
    pending: { label: 'Pending', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock },
    active: { label: 'Active', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle },
    rejected: { label: 'Rejected', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
    inactive: { label: 'Inactive', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: AlertCircle },
    archived: { label: 'Archived', color: 'text-slate-600 bg-slate-100 border-slate-200', icon: Archive },
    failed: { label: 'Failed', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
};

const getRegistrationDraftName = (draft) => draft?.company_name
    || draft?.payload?.business?.company_name
    || draft?.payload?.business?.name
    || 'Company registration';

const COMPLIANCE_MODE_LABELS = {
    non_compliant_active: 'Non-compliant',
    compliant_pending: 'Compliant (Pending)',
    compliant_active: 'Compliant (Active)'
};
const getTenantEffectivePlan = (tenant = {}) => {
    if (tenant.effective_plan) return tenant.effective_plan;
    if (tenant.status === 'pending' || tenant.status === 'active') return 'premium';
    return tenant.plan || 'premium';
};

const formatTenantPlanLabel = (plan) => {
    const normalized = String(plan || '').trim().toLowerCase();
    if (normalized === 'premium') return 'Premium-capable';
    if (normalized === 'standard') return 'Standard';
    return normalized || 'Premium-capable';
};

export default function TenantManager() {
    const { adminProfile } = useOutletContext() || {};
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const directoryState = useMemo(() => parseDirectoryParams(searchParams), [searchParams]);
    const directory = useTenantDirectory();
    const capabilityReadKey = `${directoryState.ims}|${directoryState.pos}|${directoryState.storefront}`;
    const lastCapabilityReadKey = useRef(null);
    const [searchDraft, setSearchDraft] = useState(directoryState.q);
    const [previousDirectoryQuery, setPreviousDirectoryQuery] = useState(directoryState.q);
    const [registrationDrafts, setRegistrationDrafts] = useState([]);
    const [registrationDraftLoading, setRegistrationDraftLoading] = useState(true);
    const [selectedRegistrationReview, setSelectedRegistrationReview] = useState(null);
    const tenants = directory.tenants;
    const hasLoaded = directory.hasLoaded;
    const loading = directory.status === 'loading' || directory.status === 'refreshing';
    const error = directory.error;
    const needsCapabilityRead = Boolean(directoryState.ims || directoryState.pos || directoryState.storefront);

    if (directoryState.q !== previousDirectoryQuery) {
        setPreviousDirectoryQuery(directoryState.q);
        setSearchDraft(directoryState.q);
    }

    const updateDirectoryState = useCallback((changes, replace = false, resetPage = true) => {
        const nextState = { ...directoryState, ...changes, ...(resetPage ? { page: 1 } : {}) };
        setSearchParams(serializeDirectoryParams(nextState, searchParams), { replace });
    }, [directoryState, searchParams, setSearchParams]);

    const handleDirectorySearchChange = (value) => {
        setSearchDraft(value);
        updateDirectoryState({ q: value }, true);
    };

    const handleDirectoryFilterChange = (key, value) => {
        updateDirectoryState({ [key]: value });
    };

    const handleSortChange = (value) => updateDirectoryState({ sort: value });
    const handlePageSizeChange = (value) => updateDirectoryState({ page_size: Number(value) });

    const handleRemoveDirectoryFilter = (key) => {
        if (key === 'q') setSearchDraft('');
        updateDirectoryState({ [key]: '' }, key === 'q');
    };

    const handleClearDirectoryFilters = () => {
        setSearchDraft('');
        updateDirectoryState({
            ...DEFAULT_DIRECTORY_STATE,
            sort: directoryState.sort,
            page_size: directoryState.page_size
        });
    };

    useEffect(() => {
        const legacyBillingLink = location.hash === '#revenue-settlement' && adminProfile?.is_master;
        if (legacyBillingLink) {
            navigate({ pathname: '/admin/tenants/billing', search: location.search }, { replace: true });
            return;
        }
        if (!needsCapabilityRead) lastCapabilityReadKey.current = null;
        if (!directory.hasLoaded && directory.status === 'idle') {
            void directory.loadTenants({ includeCapabilities: needsCapabilityRead });
        } else if (
            directory.hasLoaded
            && needsCapabilityRead
            && !directory.capabilitiesLoaded
            && !directory.capabilityLoading
            && lastCapabilityReadKey.current !== capabilityReadKey
        ) {
            lastCapabilityReadKey.current = capabilityReadKey;
            void directory.loadTenants({ includeCapabilities: true });
        }
    }, [adminProfile?.is_master, capabilityReadKey, directory, location.hash, location.search, navigate, needsCapabilityRead]);

    async function loadTenants() {
        return directory.refreshTenants({ includeCapabilities: needsCapabilityRead });
    }

    async function loadRegistrationDrafts() {
        setRegistrationDraftLoading(true);
        try {
            const response = await adminService.listCompanyRegistrationDrafts('pending_review');
            setRegistrationDrafts(response.data || []);
        } catch (err) {
            console.error('[TenantManager] Failed to load registration drafts', err);
        } finally {
            setRegistrationDraftLoading(false);
        }
    }

    useEffect(() => {
        void loadRegistrationDrafts();
    }, []);

    const refreshRegistrationReview = async () => {
        await Promise.all([loadRegistrationDrafts(), loadTenants()]);
    };

    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const filteredTenants = useMemo(
        () => filterTenants(tenants, directoryState, { capabilitiesLoaded: directory.capabilitiesLoaded }),
        [directory.capabilitiesLoaded, directoryState, tenants]
    );
    const sortedTenants = useMemo(() => sortTenants(filteredTenants, directoryState.sort), [directoryState.sort, filteredTenants]);
    const page = useMemo(() => paginateTenants(sortedTenants, directoryState.page, directoryState.page_size), [directoryState.page, directoryState.page_size, sortedTenants]);
    const visibleTenants = page.rows;
    const capabilityError = needsCapabilityRead && !directory.capabilitiesLoaded ? directory.error : '';

    let hashTenantId = '';
    if (location.hash.startsWith('#tenant-')) {
        try {
            hashTenantId = decodeURIComponent(location.hash.slice('#tenant-'.length));
        } catch {
            hashTenantId = location.hash.slice('#tenant-'.length);
        }
    }

    useEffect(() => {
        if (directory.hasLoaded && page.page !== directoryState.page) {
            updateDirectoryState({ page: page.page }, true, false);
        }
    }, [directory.hasLoaded, directoryState.page, page.page, searchParams, updateDirectoryState]);

    useEffect(() => {
        if (!hasLoaded || !hashTenantId) return undefined;
        const tenantIndex = sortedTenants.findIndex((tenant) => String(tenant.id) === hashTenantId);
        if (tenantIndex < 0) return undefined;
        const targetPage = Math.floor(tenantIndex / page.pageSize) + 1;
        if (targetPage !== page.page) {
            setSearchParams(serializeDirectoryParams({ ...directoryState, page: targetPage }, searchParams), { replace: true });
            return undefined;
        }
        const timer = window.setTimeout(() => {
            document.getElementById(`tenant-${encodeURIComponent(hashTenantId)}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        }, 0);
        return () => window.clearTimeout(timer);
    }, [directoryState, hashTenantId, hasLoaded, page.page, page.pageSize, searchParams, setSearchParams, sortedTenants]);

    return (
        <div className="mx-auto max-w-7xl">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <Building2 className="w-8 h-8" />
                            Tenant Management
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">
                            Manage company registrations and tenant databases
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link
                            to={{ pathname: '/admin/tenants/new', search: location.search }}
                            className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                            Add tenant
                        </Link>
                        <Button onClick={() => loadTenants()} variant="outline" disabled={loading}>
                            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                            Refresh
                        </Button>
                    </div>
                </div>

                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Subscription plan-change and billing setup actions are disabled in the admin portal.
                </div>
            </div>

            <TenantConsoleTabs adminProfile={adminProfile} location={location} />

            <TenantDirectoryToolbar
                tenants={tenants}
                state={directoryState}
                searchDraft={searchDraft}
                visibleCount={visibleTenants.length}
                rangeLabel={`Showing ${page.rangeStart}${page.rangeEnd !== page.rangeStart ? `–${page.rangeEnd}` : ''} of ${filteredTenants.length}`}
                capabilitiesLoading={directory.capabilityLoading}
                capabilityError={capabilityError}
                onSearchChange={handleDirectorySearchChange}
                onFilterChange={handleDirectoryFilterChange}
                onSortChange={handleSortChange}
                onPageSizeChange={handlePageSizeChange}
                onRemoveFilter={handleRemoveDirectoryFilter}
                onClearAll={handleClearDirectoryFilters}
                onRetryCapabilities={() => void directory.refreshTenants({ includeCapabilities: true })}
            />

            {!hasLoaded && error ? (
                <div role="alert" className="mb-6 flex w-full items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                    <Button type="button" variant="outline" onClick={() => loadTenants()}>Retry</Button>
                </div>
            ) : null}

            {hasLoaded && error && !needsCapabilityRead ? (
                <div role="alert" className="mb-6 flex w-full items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span>Couldn&apos;t refresh tenants. Showing the last loaded list.</span>
                    </div>
                    <Button type="button" variant="outline" onClick={() => loadTenants()}>Retry</Button>
                </div>
            ) : null}

            {registrationDraftLoading ? (
                <div className="mb-6 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Checking for submitted Storefront registrations...
                </div>
            ) : registrationDrafts.length > 0 ? (
                <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 p-5" aria-labelledby="registration-review-heading">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                                <FileText className="h-4 w-4" aria-hidden="true" />
                                Submitted registrations
                            </div>
                            <h2 id="registration-review-heading" className="mt-1 text-lg font-bold text-slate-900">Review before tenant setup</h2>
                            <p className="mt-1 text-sm text-slate-600">Inspect original files and registration details before approving tenant materialization.</p>
                        </div>
                        <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-800">{registrationDrafts.length} awaiting review</span>
                    </div>
                    <div className="mt-4 space-y-2">
                        {registrationDrafts.map((draft) => (
                            <div key={draft.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-4 py-3">
                                <div className="min-w-0">
                                    <div className="truncate font-semibold text-slate-900">{getRegistrationDraftName(draft)}</div>
                                    <div className="mt-1 text-xs text-slate-500">{draft.registration_email || 'No registration email'} · {draft.uploads?.length || 0} uploads · Submitted {formatDate(draft.submitted_at)}</div>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedRegistrationReview({ type: 'draft', ...draft })}>
                                    Review files
                                </Button>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* Tenant List */}
            <div className="space-y-4">
                {!hasLoaded && loading ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
                        <p className="text-slate-600">Loading tenants...</p>
                    </div>
                ) : !hasLoaded && error ? null : hasLoaded && tenants.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600 text-lg font-medium">No tenants exist yet</p>
                    </div>
                ) : hasLoaded && needsCapabilityRead && !directory.capabilitiesLoaded ? null : hasLoaded && visibleTenants.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600 text-lg font-medium">No tenants match these filters</p>
                        <Button type="button" variant="outline" className="mt-3" onClick={handleClearDirectoryFilters}>Clear filters</Button>
                    </div>
                ) : (
                    visibleTenants.map(tenant => {
                        const statusConfig = STATUS_CONFIG[tenant.status] || STATUS_CONFIG.inactive;
                        const StatusIcon = statusConfig.icon;

                        return (
                            <Link
                                key={tenant.id}
                                id={`tenant-${encodeURIComponent(tenant.id)}`}
                                aria-label={`Open ${tenant.name} tenant overview`}
                                to={{ pathname: `/admin/tenants/${encodeURIComponent(tenant.id)}`, search: location.search }}
                                className="block rounded-xl border border-slate-200 bg-white p-6 text-inherit shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                            >
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex min-w-0 flex-wrap items-center gap-3 mb-2">
                                            <h3 className="min-w-0 max-w-full truncate text-xl font-semibold text-slate-900" title={tenant.name}>
                                                {tenant.name}
                                            </h3>
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                                statusConfig.color
                                            )}>
                                                <StatusIcon className="w-3.5 h-3.5" />
                                                {statusConfig.label}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 gap-3 text-sm mt-4 md:grid-cols-2 2xl:grid-cols-4">
                                            <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Admin email</div>
                                                <div className="flex min-w-0 items-center gap-2 text-slate-700">
                                                <Mail className="w-4 h-4 text-slate-400" />
                                                <span className="truncate" title={tenant.admin_email || 'N/A'}>
                                                    {tenant.admin_email || 'N/A'}
                                                </span>
                                                </div>
                                            </div>
                                            <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Created</div>
                                                <div className="flex min-w-0 items-center gap-2 text-slate-700">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                <span className="truncate">{formatDate(tenant.createdAt || tenant.created_at)}</span>
                                                </div>
                                            </div>
                                            <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Plan & compliance</div>
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-slate-700">
                                                <span>{formatTenantPlanLabel(getTenantEffectivePlan(tenant))}</span>
                                                {tenant.payment_method && (
                                                    <span className={cn(
                                                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                                        tenant.payment_method === 'paypal'
                                                            ? "bg-blue-100 text-blue-700"
                                                            : "bg-slate-100 text-slate-500"
                                                    )}>
                                                        {tenant.payment_method}
                                                    </span>
                                                )}
                                                {tenant.pending_plan && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                                                        {'->'} {tenant.pending_plan}
                                                    </span>
                                                )}
                                                {tenant.compliance_mode_choice_required ? (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                                                        Mode Selection Required
                                                    </span>
                                                ) : tenant.compliance_mode_state ? (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                                                        {COMPLIANCE_MODE_LABELS[tenant.compliance_mode_state] || tenant.compliance_mode_state}
                                                    </span>
                                                ) : null}
                                                </div>
                                            </div>
                                        </div>

                                    </div>

                                </div>
                            </Link>
                        );
                    })
                )}
            </div>

            {hasLoaded && filteredTenants.length > 0 ? (
                <nav aria-label="Tenant directory pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <span className="text-sm text-slate-600">Page {page.page} of {page.totalPages}</span>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" disabled={page.page <= 1} onClick={() => updateDirectoryState({ page: page.page - 1 }, false, false)}>Previous</Button>
                        <Button type="button" variant="outline" disabled={page.page >= page.totalPages} onClick={() => updateDirectoryState({ page: page.page + 1 }, false, false)}>Next</Button>
                    </div>
                </nav>
            ) : null}

            <RegistrationUploadsModal
                subject={selectedRegistrationReview}
                onClose={() => setSelectedRegistrationReview(null)}
                onChanged={refreshRegistrationReview}
            />

        </div>
    );
}
