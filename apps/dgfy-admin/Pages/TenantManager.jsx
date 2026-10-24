import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import {
    Building2,
    RefreshCw,
    X,
    Clock,
    AlertCircle,
    CheckCircle,
    XCircle,
    Archive,
    Mail,
    Calendar,
    FileCheck2,
    HardDrive,
    Monitor,
    ShoppingCart,
    MapPin,
    Store,
    FileText
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';
import { normalizeApiError } from '../../../packages/web-core/src/utils/errorHandler.js';
import {
    CAPABILITY_BLOCK_TITLE,
    TENANT_CAPABILITY_MESSAGES,
    getStorefrontAccessModeMessage
} from '../../../packages/web-core/src/utils/tenantCapabilityMessages.js';
import TenantRevenueSettlementPanel from '../src/features/admin/tenantRevenue/TenantRevenueSettlementPanel.jsx';
import TenantDirectoryToolbar from '../src/features/admin/tenantDirectory/TenantDirectoryToolbar.jsx';
import {
    DEFAULT_DIRECTORY_STATE,
    filterTenants,
    parseDirectoryParams,
    serializeDirectoryParams
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
const CUSTOMER_ACCESS_MODE_OPTIONS = [
    { value: 'ghost', label: 'Map listing only' },
    { value: 'catalog', label: 'Catalog only' },
    { value: 'inquiry', label: 'Inquiry mode' },
    { value: 'transaction', label: 'Online ordering mode' }
];
const CUSTOMER_ACCESS_MODE_DETAILS = {
    ghost: 'Map, location, and contact only',
    catalog: 'Browse catalog without customer actions',
    inquiry: 'Catalog plus inquiry/contact CTAs',
    transaction: 'Ordering and booking when ready'
};
const CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS = [
    { value: 'informal', label: 'Informal', detail: 'Catalog maximum; checkout remains capped.' },
    { value: 'partial', label: 'Partial', detail: 'Inquiry maximum while registration evidence is incomplete.' },
    { value: 'registered', label: 'Registered', detail: 'Transaction-capable when platform max and company request also allow it.' }
];
const CUSTOMER_ACCESS_MODE_RANK = {
    ghost: 0,
    catalog: 1,
    inquiry: 2,
    transaction: 3
};
const DEFAULT_TENANT_CAPABILITIES = {
    ims_enabled: true,
    pos_enabled: true,
    storefront_visible: false,
    store_visibility_merchant_editable: true,
    downpayment_allowed: false,
    customer_access_mode: 'catalog',
    requested_customer_access_mode: 'catalog',
    effective_customer_access_mode: 'catalog',
    max_customer_access_mode: 'catalog',
    platform_max_customer_access_mode: 'transaction',
    registration_stage_max_customer_access_mode: 'catalog',
    registration_stage: 'informal',
    customer_access_limitation_reason: null,
    customer_access_modes_enabled: true,
    access_capabilities: null
};
const getTenantEffectivePlan = (tenant = {}) => {
    if (tenant.effective_plan) return tenant.effective_plan;
    if (tenant.status === 'pending' || tenant.status === 'active') return 'premium';
    return tenant.plan || 'premium';
};

const getTenantCapabilities = (tenant = {}) => ({
    ...DEFAULT_TENANT_CAPABILITIES,
    ...(tenant.capabilities && typeof tenant.capabilities === 'object' ? tenant.capabilities : {})
});

// Issue #1923: a 2xx PATCH only proves the write was accepted, not that the
// value is durable and readable through the same list path the UI renders
// after reload. Compare every patched consumer key against the fresh list
// read before claiming success; a missing/unavailable read or any mismatch
// must fail loud instead of toasting success for a rolled-back state.
// The registration-stage PATCH key differs from the read-model key; every
// other capability PATCH key matches its read key exactly.
const CAPABILITY_PATCH_TO_READ_KEY = {
    customer_access_registration_stage: 'registration_stage'
};

export const findUnreflectedCapabilityKeys = (freshCapabilities, patch = {}) => {
    if (!freshCapabilities || freshCapabilities.unavailable) return ['capabilities_unavailable'];
    return Object.entries(patch)
        .filter(([key, value]) => {
            const readKey = CAPABILITY_PATCH_TO_READ_KEY[key] || key;
            return freshCapabilities[readKey] !== value;
        })
        .map(([key]) => key);
};

const getCustomerAccessModeLabel = (mode) => (
    CUSTOMER_ACCESS_MODE_OPTIONS.find((option) => option.value === String(mode || '').trim().toLowerCase())?.label
    || mode
    || 'N/A'
);

const isCustomerAccessCapped = (capabilities = {}) => {
    const requested = String(capabilities.requested_customer_access_mode || capabilities.customer_access_mode || '').trim().toLowerCase();
    const effective = String(capabilities.effective_customer_access_mode || requested || '').trim().toLowerCase();
    return Boolean(requested && effective && requested !== effective);
};

const getCapabilityImpactPreview = (change = {}) => {
    const patch = change?.patch || {};
    const currentCapabilities = getTenantCapabilities(change?.tenant || {});
    if (typeof patch.downpayment_allowed === 'boolean') {
        return { title: 'Tenant impact preview', message: patch.downpayment_allowed
            ? 'This store may configure downpayment for new checkouts.'
            : 'New checkouts will take full payment only; in-flight partially paid orders settle normally.' };
    }
    if (patch.store_visibility_merchant_editable === false) {
        return { title: 'Tenant impact preview', message: 'The merchant will no longer be able to change Storefront / Maps visibility in Settings or onboarding. Platform Admin can still change it.' };
    }
    if (patch.store_visibility_merchant_editable === true) {
        return { title: 'Tenant impact preview', message: 'The merchant will be able to change Storefront / Maps visibility again.' };
    }
    if (patch.ims_enabled === false) {
        return {
            title: CAPABILITY_BLOCK_TITLE,
            message: TENANT_CAPABILITY_MESSAGES.tenant_ims_enabled
        };
    }
    if (patch.pos_enabled === false) {
        return {
            title: CAPABILITY_BLOCK_TITLE,
            message: TENANT_CAPABILITY_MESSAGES.tenant_pos_enabled
        };
    }
    if (patch.storefront_visible === false) {
        return {
            title: CAPABILITY_BLOCK_TITLE,
            message: TENANT_CAPABILITY_MESSAGES.store_is_visible
        };
    }
    if (patch.customer_access_mode) {
        const mode = String(patch.customer_access_mode || '').trim().toLowerCase();
        if (mode !== 'transaction') {
            return {
                title: CAPABILITY_BLOCK_TITLE,
                message: getStorefrontAccessModeMessage(mode)
            };
        }
        return {
            title: 'Tenant impact preview',
            message: CUSTOMER_ACCESS_MODE_RANK.transaction > CUSTOMER_ACCESS_MODE_RANK[currentCapabilities.max_customer_access_mode || 'catalog']
                ? `Online ordering is requested, but checkout will remain capped at ${getCustomerAccessModeLabel(currentCapabilities.max_customer_access_mode)} until registration readiness is updated.`
                : 'Online ordering mode restores cart, quote, booking, checkout, and payment actions when the tenant also passes compliance, payment, stock, and readiness checks.'
        };
    }
    if (patch.platform_max_customer_access_mode) {
        const mode = String(patch.platform_max_customer_access_mode || '').trim().toLowerCase();
        return {
            title: 'Platform access ceiling',
            message: mode === 'transaction'
                ? 'Platform will allow this tenant to become transaction-capable when company requested mode, registration readiness, compliance, payment, stock, and location gates also pass.'
                : `Platform will cap this tenant at ${getCustomerAccessModeLabel(mode)} even if the company requests a higher customer access mode.`
        };
    }
    if (patch.customer_access_registration_stage) {
        const stage = String(patch.customer_access_registration_stage || '').trim().toLowerCase();
        return {
            title: 'Registration readiness',
            message: stage === 'registered'
                ? 'Platform will mark registration readiness as registered. Checkout can become available when company requested mode and platform max are also Online ordering mode.'
                : `Platform will cap checkout to the ${stage} registration readiness level until reviewed evidence supports registered readiness.`
        };
    }
    if (patch.ims_enabled === true) {
        return {
            title: 'Tenant impact preview',
            message: 'IMS access will be restored for this company after the audit reason is saved.'
        };
    }
    if (patch.pos_enabled === true) {
        return {
            title: 'Tenant impact preview',
            message: 'POS access will be restored for this company after the audit reason is saved.'
        };
    }
    if (patch.storefront_visible === true) {
        return {
            title: 'Tenant impact preview',
            message: 'Storefront / Maps visibility will be restored after the audit reason is saved, but public discovery still requires a valid active primary map pin.'
        };
    }
    return null;
};

const formatTenantPlanLabel = (plan) => {
    const normalized = String(plan || '').trim().toLowerCase();
    if (normalized === 'premium') return 'Premium-capable';
    if (normalized === 'standard') return 'Standard';
    return normalized || 'Premium-capable';
};

const CapabilityToggle = ({
    icon: Icon,
    label,
    description,
    value,
    disabled,
    onClick
}) => (
    <button
        type="button"
        aria-label={`${label} ${value ? 'On' : 'Off'}`}
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'flex min-h-[72px] w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition',
            value
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-slate-200 bg-slate-50 text-slate-700',
            'disabled:cursor-not-allowed disabled:opacity-60'
        )}
    >
        <span className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            value ? 'border-emerald-200 bg-white text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
        )}>
            <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight">{label}</span>
            <span className="mt-1 block text-xs leading-snug text-slate-500">{description}</span>
        </span>
        <span className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
            value ? 'bg-white text-emerald-700' : 'bg-white text-slate-500'
        )}>
            {value ? 'On' : 'Off'}
        </span>
    </button>
);

const StorefrontModeButton = ({ option, selected, disabled, onClick }) => (
    <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'min-h-[78px] rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
            selected
                ? 'border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        )}
    >
        <span className="block text-sm font-semibold leading-tight">{option.label}</span>
        <span className="mt-1 block text-xs leading-snug text-slate-500">
            {CUSTOMER_ACCESS_MODE_DETAILS[option.value]}
        </span>
    </button>
);

export default function TenantManager() {
    const { adminProfile } = useOutletContext() || {};
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const directoryState = useMemo(() => parseDirectoryParams(searchParams), [searchParams]);
    const [searchDraft, setSearchDraft] = useState(directoryState.q);
    const [previousDirectoryQuery, setPreviousDirectoryQuery] = useState(directoryState.q);
    const [tenants, setTenants] = useState([]);
    const [registrationDrafts, setRegistrationDrafts] = useState([]);
    const [registrationDraftLoading, setRegistrationDraftLoading] = useState(true);
    const [selectedRegistrationReview, setSelectedRegistrationReview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [error, setError] = useState('');
    const [capabilityLoading, setCapabilityLoading] = useState('');
    const [pendingCapabilityChange, setPendingCapabilityChange] = useState(null);
    const [capabilityReason, setCapabilityReason] = useState('');
    const [capabilityAuditTenant, setCapabilityAuditTenant] = useState(null);
    const [capabilityAuditLogs, setCapabilityAuditLogs] = useState([]);
    const [capabilityAuditLoading, setCapabilityAuditLoading] = useState(false);

    if (directoryState.q !== previousDirectoryQuery) {
        setPreviousDirectoryQuery(directoryState.q);
        setSearchDraft(directoryState.q);
    }

    const updateDirectoryState = (changes, replace = false) => {
        const nextState = { ...directoryState, ...changes };
        setSearchParams(serializeDirectoryParams(nextState, searchParams), { replace });
    };

    const handleDirectorySearchChange = (value) => {
        setSearchDraft(value);
        updateDirectoryState({ q: value }, true);
    };

    const handleDirectoryFilterChange = (key, value) => {
        updateDirectoryState({ [key]: value });
    };

    const handleRemoveDirectoryFilter = (key) => {
        if (key === 'q') setSearchDraft('');
        updateDirectoryState({ [key]: '' }, key === 'q');
    };

    const handleClearDirectoryFilters = () => {
        setSearchDraft('');
        updateDirectoryState(DEFAULT_DIRECTORY_STATE);
    };

    useEffect(() => {
        void loadTenants();
    }, []);

    useEffect(() => {
        if (!hasLoaded) return undefined;
        const targetId = location.hash === '#revenue-settlement'
            ? 'revenue-settlement'
            : location.hash.startsWith('#tenant-') ? location.hash.slice(1) : '';
        if (!targetId) return undefined;
        const timer = window.setTimeout(() => document.getElementById(targetId)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0);
        return () => window.clearTimeout(timer);
    }, [hasLoaded, location.hash]);

    async function loadTenants({ silent = false } = {}) {
        if (!silent) {
            setLoading(true);
            setError('');
        }
        try {
            const response = await adminService.getTenants('all');
            const freshTenants = response.data || [];
            setTenants(freshTenants);
            setHasLoaded(true);
            return freshTenants;
        } catch (err) {
            if (!silent) setError('Failed to load tenants');
            console.error('[TenantManager] Failed to load tenants', err);
            return null;
        } finally {
            if (!silent) setLoading(false);
        }
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
        await Promise.all([loadRegistrationDrafts(), loadTenants({ silent: true })]);
    };

    const openCapabilityChange = (tenant, patch, label) => {
        if (!tenant?.id) return;
        setPendingCapabilityChange({ tenant, patch, label });
        setCapabilityReason('');
    };

    const closeCapabilityChange = () => {
        if (capabilityLoading) return;
        setPendingCapabilityChange(null);
        setCapabilityReason('');
    };

    const handleUpdateCapabilities = async (event) => {
        event?.preventDefault?.();
        const tenant = pendingCapabilityChange?.tenant;
        const patch = pendingCapabilityChange?.patch || {};
        const reason = capabilityReason.trim();
        if (!tenant?.id) return;
        if (reason.length < 3) {
            toast.error('Reason is required and must be at least 3 characters.');
            return;
        }
        const loadingKey = `${tenant.id}:${Object.keys(patch).join(',')}`;
        setCapabilityLoading(loadingKey);
        try {
            await adminService.updateTenantCapabilities(tenant.id, { ...patch, reason });
            const freshTenants = await loadTenants();
            const freshTenant = (freshTenants || []).find((entry) => entry?.id === tenant.id);
            // Issue #1923: never toast success for a state that was rolled back
            // or that the fresh list read cannot see. Keep the confirmation open
            // so the operator can inspect the audit log or retry deliberately.
            const unreflectedKeys = findUnreflectedCapabilityKeys(freshTenant?.capabilities, patch);
            if (unreflectedKeys.length > 0) {
                toast.error(`Capability change saved, but the fresh tenant read does not reflect it (${unreflectedKeys.join(', ')}). Reload and check the audit log before retrying.`);
                return;
            }
            setPendingCapabilityChange(null);
            setCapabilityReason('');
            toast.success('Tenant capabilities updated');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to update tenant capabilities: ${normalized.message}`);
            }
        } finally {
            setCapabilityLoading('');
        }
    };

    const openCapabilityAuditLogs = async (tenant) => {
        if (!tenant?.id) return;
        setCapabilityAuditTenant(tenant);
        setCapabilityAuditLogs([]);
        setCapabilityAuditLoading(true);
        try {
            const response = await adminService.listTenantCapabilityAuditLogs(tenant.id, { limit: 20 });
            setCapabilityAuditLogs(response.data?.logs || []);
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to load capability audit logs: ${normalized.message}`);
            }
        } finally {
            setCapabilityAuditLoading(false);
        }
    };

    const closeCapabilityAuditLogs = () => {
        setCapabilityAuditTenant(null);
        setCapabilityAuditLogs([]);
        setCapabilityAuditLoading(false);
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

    const formatCapabilitySnapshot = (snapshot = {}) => {
        const modeLabel = getCustomerAccessModeLabel(snapshot?.customer_access_mode);
        return [
            `IMS ${snapshot?.ims_enabled ? 'On' : 'Off'}`,
            `POS ${snapshot?.pos_enabled ? 'On' : 'Off'}`,
            `Storefront ${snapshot?.storefront_visible ? 'On' : 'Off'}`,
            `Downpayment ${snapshot?.downpayment_allowed === true ? 'On' : 'Off'}`,
            `Merchant visibility editing ${snapshot?.store_visibility_merchant_editable !== false ? 'On' : 'Off'}`,
            modeLabel
        ].join(' / ');
    };

    const visibleTenants = useMemo(
        () => filterTenants(tenants, directoryState),
        [directoryState, tenants]
    );
    const pendingCapabilityImpact = getCapabilityImpactPreview(pendingCapabilityChange);

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

            {adminProfile?.is_master ? (
                <div id="revenue-settlement" className="scroll-mt-6">
                    <TenantRevenueSettlementPanel tenants={tenants} preselectTenantId={searchParams.get('tenant_id') || ''} preselectionReady={hasLoaded} />
                </div>
            ) : null}

            <TenantDirectoryToolbar
                tenants={tenants}
                state={directoryState}
                searchDraft={searchDraft}
                visibleCount={visibleTenants.length}
                onSearchChange={handleDirectorySearchChange}
                onFilterChange={handleDirectoryFilterChange}
                onRemoveFilter={handleRemoveDirectoryFilter}
                onClearAll={handleClearDirectoryFilters}
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

            {hasLoaded && error ? (
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
                ) : hasLoaded && visibleTenants.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600 text-lg font-medium">No tenants match these filters</p>
                        <Button type="button" variant="outline" className="mt-3" onClick={handleClearDirectoryFilters}>Clear filters</Button>
                    </div>
                ) : (
                    visibleTenants.map(tenant => {
                        const statusConfig = STATUS_CONFIG[tenant.status] || STATUS_CONFIG.inactive;
                        const StatusIcon = statusConfig.icon;
                        const capabilities = getTenantCapabilities(tenant);
                        const storefrontReadiness = capabilities.storefront_readiness || {};
                        const storefrontPublishable = storefrontReadiness.publishable === true;
                        const selectedAccessMode = CUSTOMER_ACCESS_MODE_OPTIONS.find(
                            (option) => option.value === capabilities.customer_access_mode
                        ) || CUSTOMER_ACCESS_MODE_OPTIONS[1];
                        const selectedPlatformMaxAccessMode = CUSTOMER_ACCESS_MODE_OPTIONS.find(
                            (option) => option.value === capabilities.platform_max_customer_access_mode
                        ) || CUSTOMER_ACCESS_MODE_OPTIONS[3];
                        const selectedRegistrationStage = CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS.find(
                            (option) => option.value === capabilities.registration_stage
                        ) || CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS[0];
                        const effectiveAccessModeLabel = getCustomerAccessModeLabel(capabilities.effective_customer_access_mode || selectedAccessMode.value);
                        const maxAccessModeLabel = getCustomerAccessModeLabel(capabilities.max_customer_access_mode);
                        const platformMaxAccessModeLabel = getCustomerAccessModeLabel(capabilities.platform_max_customer_access_mode);
                        const registrationMaxAccessModeLabel = getCustomerAccessModeLabel(capabilities.registration_stage_max_customer_access_mode);
                        const accessModeCapped = isCustomerAccessCapped(capabilities);
                        const capabilityDisabled = tenant.status !== 'active' || capabilityLoading.startsWith(`${tenant.id}:`) || capabilities.unavailable;
                        const capabilityControls = [
                            {
                                key: 'ims_enabled',
                                icon: Monitor,
                                label: 'IMS',
                                description: 'Authenticated inventory workspace access',
                                value: capabilities.ims_enabled,
                                patch: { ims_enabled: !capabilities.ims_enabled }
                            },
                            {
                                key: 'pos_enabled',
                                icon: ShoppingCart,
                                label: 'POS',
                                description: 'Point-of-sale route access and POS fallbacks',
                                value: capabilities.pos_enabled,
                                patch: { pos_enabled: !capabilities.pos_enabled }
                            }
                        ];

                        return (
                            <div
                                key={tenant.id}
                                id={`tenant-${encodeURIComponent(tenant.id)}`}
                                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
                            >
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex min-w-0 flex-wrap items-center gap-3 mb-2">
                                            <h3 className="min-w-0 max-w-full truncate text-xl font-semibold text-slate-900" title={tenant.name}>
                                                <Link
                                                    to={{ pathname: `/admin/tenants/${encodeURIComponent(tenant.id)}`, search: location.search }}
                                                    className="hover:underline"
                                                    title={`View ${tenant.name}`}
                                                >
                                                    {tenant.name}
                                                </Link>
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

                                        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                                            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900">Tenant capabilities</div>
                                                    <div className="text-xs text-slate-500">Platform-admin controls. Every change requires an audit reason.</div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                                    {capabilities.unavailable ? (
                                                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Settings unavailable</span>
                                                    ) : null}
                                                    {tenant.status !== 'active' ? (
                                                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Active tenants only</span>
                                                    ) : null}
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openCapabilityAuditLogs(tenant)}
                                                        className="h-8 px-2 text-xs"
                                                    >
                                                        <FileCheck2 className="mr-1 h-3.5 w-3.5" />
                                                        Audit
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.55fr)]">
                                                <section className="rounded-lg border border-slate-100 bg-slate-50/70 p-3" aria-label="Core workspace access">
                                                    <div className="mb-3 flex items-center gap-2">
                                                        <HardDrive className="h-4 w-4 text-slate-400" />
                                                        <div>
                                                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Core access</div>
                                                            <div className="text-xs text-slate-500">IMS and POS gates</div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                                                        {capabilityControls.map((control) => {
                                                            const nextState = control.value ? 'Off' : 'On';
                                                            return (
                                                                <CapabilityToggle
                                                                    key={control.key}
                                                                    icon={control.icon}
                                                                    label={control.label}
                                                                    description={control.description}
                                                                    value={control.value}
                                                                    disabled={capabilityDisabled}
                                                                    onClick={() => openCapabilityChange(tenant, control.patch, `${control.label} ${nextState}`)}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </section>

                                                <section className="rounded-lg border border-slate-100 bg-slate-50/70 p-3" aria-label="Public storefront controls">
                                                    <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                        <div className="flex items-start gap-2">
                                                            <Store className="mt-0.5 h-4 w-4 text-slate-400" />
                                                            <div>
                                                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Public Storefront</div>
                                                                <div className="text-xs text-slate-500">Maps visibility and customer access mode</div>
                                                            </div>
                                                        </div>
                                                        <span className={cn(
                                                            'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                                                            capabilities.storefront_visible
                                                                ? (storefrontPublishable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
                                                                : 'bg-slate-100 text-slate-600'
                                                        )}>
                                                            {capabilities.storefront_visible
                                                                ? (storefrontPublishable ? 'Ready to publish' : 'Needs primary map pin')
                                                                : 'Hidden from maps'}
                                                        </span>
                                                    </div>
                                                    <CapabilityToggle
                                                        icon={MapPin}
                                                        label="Storefront / Maps"
                                                        description="Public discovery, direct storefront access, and new commerce activity"
                                                        value={capabilities.storefront_visible}
                                                        disabled={capabilityDisabled}
                                                        onClick={() => openCapabilityChange(
                                                            tenant,
                                                            { storefront_visible: !capabilities.storefront_visible },
                                                            `Storefront / Maps ${capabilities.storefront_visible ? 'Off' : 'On'}`
                                                        )}
                                                    />
                                                    <CapabilityToggle
                                                        icon={MapPin}
                                                        label="Downpayment (premium)"
                                                        description="Allow this store to configure online downpayments"
                                                        value={capabilities.downpayment_allowed === true}
                                                        disabled={capabilityDisabled}
                                                        onClick={() => openCapabilityChange(
                                                            tenant,
                                                            { downpayment_allowed: capabilities.downpayment_allowed !== true },
                                                            `Downpayment ${capabilities.downpayment_allowed === true ? 'Off' : 'On'}`
                                                        )}
                                                    />
                                                    <CapabilityToggle
                                                        icon={MapPin}
                                                        label="Merchant can edit storefront visibility"
                                                        description="Allow this tenant to change Storefront / Maps from Settings or onboarding"
                                                        value={capabilities.store_visibility_merchant_editable !== false}
                                                        disabled={capabilityDisabled}
                                                        onClick={() => openCapabilityChange(
                                                            tenant,
                                                            { store_visibility_merchant_editable: capabilities.store_visibility_merchant_editable === false },
                                                            `Merchant visibility editing ${capabilities.store_visibility_merchant_editable === false ? 'On' : 'Off'}`
                                                        )}
                                                    />
                                                    <div className="mt-3 border-t border-slate-200 pt-3">
                                                        <div className="mb-2 flex items-center justify-between gap-2">
                                                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Storefront sub-modes</div>
                                                            <div className="text-xs text-slate-500">Requested: {selectedAccessMode.label}</div>
                                                        </div>
                                                        <div className={cn(
                                                            'mb-3 rounded-lg border px-3 py-2 text-xs',
                                                            accessModeCapped
                                                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                                                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                                        )}>
                                                            <div className="font-semibold">
                                                                Effective: {effectiveAccessModeLabel}
                                                                {capabilities.max_customer_access_mode ? ` / Max: ${maxAccessModeLabel}` : ''}
                                                            </div>
                                                            <div className="mt-1">
                                                                Platform max: {platformMaxAccessModeLabel} / Registration max: {registrationMaxAccessModeLabel}
                                                            </div>
                                                            <div className="mt-1">
                                                                {accessModeCapped
                                                                    ? (capabilities.customer_access_limitation_reason || 'Requested mode is capped by platform or registration readiness.')
                                                                    : 'No platform or registration-stage cap is reducing the requested mode.'}
                                                            </div>
                                                        </div>
                                                        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                                                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,220px)] lg:items-center">
                                                                <div>
                                                                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Platform max allowed</div>
                                                                    <div className="text-xs text-blue-700/80">
                                                                        Company admins can request or downgrade up to this ceiling. Registration readiness can still cap checkout.
                                                                    </div>
                                                                </div>
                                                                <select
                                                                    aria-label={`Platform max allowed for ${tenant.name}`}
                                                                    className="h-10 rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    value={selectedPlatformMaxAccessMode.value}
                                                                    disabled={capabilityDisabled}
                                                                    onChange={(event) => {
                                                                        const option = CUSTOMER_ACCESS_MODE_OPTIONS.find((modeOption) => modeOption.value === event.target.value) || CUSTOMER_ACCESS_MODE_OPTIONS[1];
                                                                        openCapabilityChange(
                                                                            tenant,
                                                                            { platform_max_customer_access_mode: option.value },
                                                                            `Platform max storefront mode: ${option.label}`
                                                                        );
                                                                    }}
                                                                >
                                                                    {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => (
                                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3">
                                                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,220px)] lg:items-center">
                                                                <div>
                                                                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Registration readiness</div>
                                                                    <div className="text-xs text-amber-800/80">
                                                                        Platform-admin evidence review. Registered readiness is required for transaction checkout.
                                                                    </div>
                                                                </div>
                                                                <select
                                                                    aria-label={`Registration readiness for ${tenant.name}`}
                                                                    className="h-10 rounded-lg border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    value={selectedRegistrationStage.value}
                                                                    disabled={capabilityDisabled}
                                                                    onChange={(event) => {
                                                                        const option = CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS.find((stageOption) => stageOption.value === event.target.value) || CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS[0];
                                                                        openCapabilityChange(
                                                                            tenant,
                                                                            { customer_access_registration_stage: option.value },
                                                                            `Registration readiness: ${option.label}`
                                                                        );
                                                                    }}
                                                                >
                                                                    {CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS.map((option) => (
                                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <p className="mt-2 text-xs text-amber-800/80">{selectedRegistrationStage.detail}</p>
                                                        </div>
                                                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Company requested mode</div>
                                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                            {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => (
                                                                <StorefrontModeButton
                                                                    key={option.value}
                                                                    option={option}
                                                                    selected={selectedAccessMode.value === option.value}
                                                                    disabled={capabilityDisabled || !capabilities.storefront_visible}
                                                                    onClick={() => openCapabilityChange(tenant, { customer_access_mode: option.value }, `Storefront mode: ${option.label}`)}
                                                                />
                                                            ))}
                                                        </div>
                                                        {!capabilities.storefront_visible ? (
                                                            <p className="mt-2 text-xs text-slate-500">
                                                                Turn on Storefront / Maps before changing the customer-facing sub-mode.
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </section>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-full xl:w-auto xl:min-w-[320px] xl:max-w-[380px]">
                                        <div className="text-sm font-semibold text-slate-900">Tenant detail sections</div>
                                        <p className="mt-1 text-xs text-slate-500">Open the tenant to manage its lifecycle, registration, compliance, and store setup.</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <Link to={{ pathname: `/admin/tenants/${encodeURIComponent(tenant.id)}`, search: location.search }} className="inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">Open overview</Link>
                                            <Link to={{ pathname: `/admin/tenants/${encodeURIComponent(tenant.id)}/lifecycle`, search: location.search }} className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Lifecycle</Link>
                                            <Link to={{ pathname: `/admin/tenants/${encodeURIComponent(tenant.id)}/registration`, search: location.search }} className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Registration</Link>
                                            <Link to={{ pathname: `/admin/tenants/${encodeURIComponent(tenant.id)}/compliance`, search: location.search }} className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Compliance</Link>
                                            <Link to={{ pathname: `/admin/tenants/${encodeURIComponent(tenant.id)}/store-setup`, search: location.search }} className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Store setup</Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Capability Audit Modal */}
            {capabilityAuditTenant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Capability audit trail</h2>
                                <p className="mt-1 text-sm text-slate-600">{capabilityAuditTenant.name}</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeCapabilityAuditLogs}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Close capability audit trail"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[68vh] overflow-y-auto p-6">
                            {capabilityAuditLoading ? (
                                <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-8 text-sm text-slate-600">
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    Loading audit logs...
                                </div>
                            ) : capabilityAuditLogs.length === 0 ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
                                    No capability audit logs recorded yet.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {capabilityAuditLogs.map((log) => (
                                        <div key={log.id || log.created_at} className="rounded-lg border border-slate-200 bg-white p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="text-sm font-semibold text-slate-900">
                                                    {log.actor_username || 'platform_admin'}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {log.created_at ? formatDate(log.created_at) : 'Unknown time'}
                                                </div>
                                            </div>
                                            <p className="mt-2 text-sm text-slate-700">{log.reason || 'No reason recorded'}</p>
                                            <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                                                <div className="rounded-md bg-slate-50 p-3">
                                                    <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Before</div>
                                                    <div className="text-slate-700">{formatCapabilitySnapshot(log.before_snapshot)}</div>
                                                </div>
                                                <div className="rounded-md bg-emerald-50 p-3">
                                                    <div className="mb-1 font-semibold uppercase tracking-wide text-emerald-600">After</div>
                                                    <div className="text-emerald-800">{formatCapabilitySnapshot(log.after_snapshot)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Capability Confirmation Modal */}
            {pendingCapabilityChange && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <form
                        onSubmit={handleUpdateCapabilities}
                        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
                    >
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Confirm capability change</h2>
                                <p className="mt-1 text-sm text-slate-600">
                                    {pendingCapabilityChange.label} for {pendingCapabilityChange.tenant?.name}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeCapabilityChange}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Close capability confirmation"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        {pendingCapabilityImpact && (
                            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                                <p className="text-sm font-semibold text-amber-900">{pendingCapabilityImpact.title}</p>
                                <p className="mt-1 text-xs leading-5 text-amber-800">{pendingCapabilityImpact.message}</p>
                            </div>
                        )}
                        <label className="block text-sm font-medium text-slate-700" htmlFor="capability-reason">
                            Reason
                        </label>
                        <textarea
                            id="capability-reason"
                            value={capabilityReason}
                            onChange={(event) => setCapabilityReason(event.target.value)}
                            rows={4}
                            maxLength={500}
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            placeholder="State why this tenant capability is being changed."
                            required
                        />
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>This reason is saved in the platform-admin audit trail.</span>
                            <span>{capabilityReason.trim().length}/500</span>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={closeCapabilityChange}
                                disabled={Boolean(capabilityLoading)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={Boolean(capabilityLoading) || capabilityReason.trim().length < 3}
                                className="bg-slate-900 text-white hover:bg-slate-800"
                            >
                                {capabilityLoading ? (
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Apply change
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            <RegistrationUploadsModal
                subject={selectedRegistrationReview}
                onClose={() => setSelectedRegistrationReview(null)}
                onChanged={refreshRegistrationReview}
            />

        </div>
    );
}
