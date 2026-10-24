import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FileCheck2, HardDrive, MapPin, Monitor, RefreshCw, ShoppingCart, Store, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';
import { normalizeApiError } from '../../../packages/web-core/src/utils/errorHandler.js';
import {
    CAPABILITY_BLOCK_TITLE,
    TENANT_CAPABILITY_MESSAGES,
    getStorefrontAccessModeMessage
} from '../../../packages/web-core/src/utils/tenantCapabilityMessages.js';

const ACCESS_MODE_OPTIONS = [
    { value: 'ghost', label: 'Map listing only', detail: 'Map, location, and contact only' },
    { value: 'catalog', label: 'Catalog only', detail: 'Browse catalog without customer actions' },
    { value: 'inquiry', label: 'Inquiry mode', detail: 'Catalog plus inquiry/contact CTAs' },
    { value: 'transaction', label: 'Online ordering mode', detail: 'Ordering and booking when ready' }
];
const REGISTRATION_STAGE_OPTIONS = [
    { value: 'informal', label: 'Informal', detail: 'Catalog maximum; checkout remains capped.' },
    { value: 'partial', label: 'Partial', detail: 'Inquiry maximum while registration evidence is incomplete.' },
    { value: 'registered', label: 'Registered', detail: 'Transaction-capable when platform max and company request also allow it.' }
];
const ACCESS_MODE_RANK = { ghost: 0, catalog: 1, inquiry: 2, transaction: 3 };
const PATCH_TO_READ_KEY = { customer_access_registration_stage: 'registration_stage' };

export const findUnreflectedCapabilityKeys = (freshCapabilities, patch = {}) => {
    if (!freshCapabilities || freshCapabilities.unavailable) return ['capabilities_unavailable'];
    return Object.entries(patch)
        .filter(([key, value]) => freshCapabilities[PATCH_TO_READ_KEY[key] || key] !== value)
        .map(([key]) => key);
};

const booleanLabel = (value) => value === true ? 'On' : value === false ? 'Off' : 'Unavailable';
const modeLabel = (value) => ACCESS_MODE_OPTIONS.find((option) => option.value === value)?.label || 'Unavailable';
const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    return Number.isNaN(date.valueOf()) ? 'Unknown time' : date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const formatCapabilitySnapshot = (snapshot = {}) => [
    `IMS ${booleanLabel(snapshot.ims_enabled)}`,
    `POS ${booleanLabel(snapshot.pos_enabled)}`,
    `Storefront ${booleanLabel(snapshot.storefront_visible)}`,
    `Downpayment ${booleanLabel(snapshot.downpayment_allowed)}`,
    `Merchant visibility editing ${booleanLabel(snapshot.store_visibility_merchant_editable)}`,
    modeLabel(snapshot.customer_access_mode)
].join(' / ');

const isCustomerAccessCapped = (capabilities = {}) => {
    const requested = String(capabilities.requested_customer_access_mode || capabilities.customer_access_mode || '').trim().toLowerCase();
    const effective = String(capabilities.effective_customer_access_mode || requested || '').trim().toLowerCase();
    return Boolean(requested && effective && requested !== effective);
};

const getImpactPreview = ({ patch = {}, capabilities = {} } = {}) => {
    if (typeof patch.downpayment_allowed === 'boolean') return {
        title: 'Tenant impact preview',
        message: patch.downpayment_allowed
            ? 'This store may configure downpayment for new checkouts.'
            : 'New checkouts will take full payment only; in-flight partially paid orders settle normally.'
    };
    if (patch.store_visibility_merchant_editable === false) return {
        title: 'Tenant impact preview',
        message: 'The merchant will no longer be able to change Storefront / Maps visibility in Settings or onboarding. Platform Admin can still change it.'
    };
    if (patch.store_visibility_merchant_editable === true) return {
        title: 'Tenant impact preview',
        message: 'The merchant will be able to change Storefront / Maps visibility again.'
    };
    if (patch.ims_enabled === false) return { title: CAPABILITY_BLOCK_TITLE, message: TENANT_CAPABILITY_MESSAGES.tenant_ims_enabled };
    if (patch.pos_enabled === false) return { title: CAPABILITY_BLOCK_TITLE, message: TENANT_CAPABILITY_MESSAGES.tenant_pos_enabled };
    if (patch.storefront_visible === false) return { title: CAPABILITY_BLOCK_TITLE, message: TENANT_CAPABILITY_MESSAGES.store_is_visible };
    if (patch.customer_access_mode) {
        if (patch.customer_access_mode !== 'transaction') return {
            title: CAPABILITY_BLOCK_TITLE,
            message: getStorefrontAccessModeMessage(patch.customer_access_mode)
        };
        const maxMode = capabilities.max_customer_access_mode || 'catalog';
        const maxRank = ACCESS_MODE_RANK[maxMode];
        if (!Number.isInteger(maxRank)) return {
            title: 'Tenant impact preview',
            message: 'Online ordering is requested, but the current platform maximum is unavailable. Review capability settings before treating checkout as enabled.'
        };
        return {
            title: 'Tenant impact preview',
            message: ACCESS_MODE_RANK.transaction > maxRank
                ? `Online ordering is requested, but checkout will remain capped at ${modeLabel(maxMode)} until registration readiness is updated.`
                : 'Online ordering mode restores cart, quote, booking, checkout, and payment actions when the tenant also passes compliance, payment, stock, and readiness checks.'
        };
    }
    if (patch.platform_max_customer_access_mode) return {
        title: 'Platform access ceiling',
        message: patch.platform_max_customer_access_mode === 'transaction'
            ? 'Platform will allow this tenant to become transaction-capable when company requested mode, registration readiness, compliance, payment, stock, and location gates also pass.'
            : `Platform will cap this tenant at ${modeLabel(patch.platform_max_customer_access_mode)} even if the company requests a higher customer access mode.`
    };
    if (patch.customer_access_registration_stage) return {
        title: 'Registration readiness',
        message: patch.customer_access_registration_stage === 'registered'
            ? 'Platform will mark registration readiness as registered. Checkout can become available when company requested mode and platform max are also Online ordering mode.'
            : `Platform will cap checkout to the ${patch.customer_access_registration_stage} registration readiness level until reviewed evidence supports registered readiness.`
    };
    if (patch.ims_enabled === true) return { title: 'Tenant impact preview', message: 'IMS access will be restored for this company after the audit reason is saved.' };
    if (patch.pos_enabled === true) return { title: 'Tenant impact preview', message: 'POS access will be restored for this company after the audit reason is saved.' };
    if (patch.storefront_visible === true) return {
        title: 'Tenant impact preview',
        message: 'Storefront / Maps visibility will be restored after the audit reason is saved, but public discovery still requires a valid active primary map pin.'
    };
    return null;
};

function CapabilityToggle({ icon: Icon, label, description, value, disabled, onClick }) {
    const stateLabel = booleanLabel(value);
    const enabled = value === true;
    return (
        <button
            type="button"
            aria-label={`${label} ${stateLabel}`}
            disabled={disabled || typeof value !== 'boolean'}
            onClick={onClick}
            className={cn(
                'flex min-h-[72px] w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition',
                enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-700',
                'disabled:cursor-not-allowed disabled:opacity-60'
            )}
        >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', enabled ? 'border-emerald-200 bg-white text-emerald-700' : 'border-slate-200 bg-white text-slate-500')}>
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight">{label}</span>
                <span className="mt-1 block text-xs leading-snug text-slate-500">{description}</span>
            </span>
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{stateLabel}</span>
        </button>
    );
}

function ModeButton({ option, selected, disabled, onClick }) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'min-h-[78px] rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                selected ? 'border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            )}
        >
            <span className="block text-sm font-semibold leading-tight">{option.label}</span>
            <span className="mt-1 block text-xs leading-snug text-slate-500">{option.detail}</span>
        </button>
    );
}

export default function TenantAccess() {
    const { tenant, refreshTenant, isArchived } = useOutletContext();
    const [currentTenant, setCurrentTenant] = useState(tenant);
    const [readLoading, setReadLoading] = useState(false);
    const [readError, setReadError] = useState('');
    const [capabilityLoading, setCapabilityLoading] = useState(false);
    const [pendingChange, setPendingChange] = useState(null);
    const [reason, setReason] = useState('');
    const [auditOpen, setAuditOpen] = useState(false);
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState('');

    useEffect(() => {
        setCurrentTenant(tenant);
        setReadError('');
        setPendingChange(null);
        setReason('');
        setAuditOpen(false);
    }, [tenant]);

    const capabilities = currentTenant?.capabilities && typeof currentTenant.capabilities === 'object' && !currentTenant.capabilities.unavailable
        ? currentTenant.capabilities
        : null;
    const activeTenant = currentTenant?.status === 'active';
    const capabilityUnavailable = activeTenant && !capabilities;
    const controlsDisabled = Boolean(isArchived || !activeTenant || capabilityUnavailable || capabilityLoading);
    const selectedMode = ACCESS_MODE_OPTIONS.find((option) => option.value === capabilities?.customer_access_mode);
    const platformMaxMode = ACCESS_MODE_OPTIONS.find((option) => option.value === capabilities?.platform_max_customer_access_mode);
    const registrationStage = REGISTRATION_STAGE_OPTIONS.find((option) => option.value === capabilities?.registration_stage);
    const requestedMode = capabilities?.requested_customer_access_mode || capabilities?.customer_access_mode;
    const effectiveMode = capabilities?.effective_customer_access_mode || requestedMode;
    const accessModesKnown = ACCESS_MODE_OPTIONS.some((option) => option.value === requestedMode)
        && ACCESS_MODE_OPTIONS.some((option) => option.value === effectiveMode);
    const accessCapped = accessModesKnown && isCustomerAccessCapped(capabilities || {});
    const impact = useMemo(() => getImpactPreview({ patch: pendingChange?.patch, capabilities: pendingChange?.tenant?.capabilities }), [pendingChange]);

    const openChange = (patch, label) => {
        if (controlsDisabled || !currentTenant?.id) return;
        setPendingChange({ tenant: currentTenant, patch, label });
        setReason('');
    };

    const closeChange = () => {
        if (capabilityLoading) return;
        setPendingChange(null);
        setReason('');
    };

    const reloadCapabilities = async () => {
        setReadLoading(true);
        setReadError('');
        try {
            const freshTenant = await refreshTenant(currentTenant.id);
            setCurrentTenant(freshTenant || currentTenant);
            if (!freshTenant?.capabilities || freshTenant.capabilities.unavailable) {
                setReadError('Tenant capability settings are still unavailable. No settings were changed.');
            }
        } catch (error) {
            setReadError(error?.message || 'Tenant capability settings could not be loaded.');
        } finally {
            setReadLoading(false);
        }
    };

    const saveChange = async (event) => {
        event?.preventDefault?.();
        const patch = pendingChange?.patch || {};
        const trimmedReason = reason.trim();
        if (!currentTenant?.id || controlsDisabled) return;
        if (trimmedReason.length < 3) {
            toast.error('Reason is required and must be at least 3 characters.');
            return;
        }
        setCapabilityLoading(true);
        let writeAccepted = false;
        try {
            await adminService.updateTenantCapabilities(currentTenant.id, { ...patch, reason: trimmedReason });
            writeAccepted = true;
            const freshTenant = await refreshTenant(currentTenant.id);
            const unreflected = findUnreflectedCapabilityKeys(freshTenant?.capabilities, patch);
            if (unreflected.length > 0) {
                toast.error(`Capability change saved, but the fresh tenant read does not reflect it (${unreflected.join(', ')}). Reload and check the audit log before retrying.`);
                return;
            }
            setCurrentTenant(freshTenant);
            setPendingChange(null);
            setReason('');
            toast.success('Tenant capabilities updated');
        } catch (error) {
            const normalized = normalizeApiError(error);
            if (!normalized.isGlobalCandidate) {
                toast.error(writeAccepted
                    ? `Capability change was accepted, but its read-back failed: ${normalized.message}. Check the audit log before retrying.`
                    : `Failed to update tenant capabilities: ${normalized.message}`);
            }
        } finally {
            setCapabilityLoading(false);
        }
    };

    const loadAudit = async () => {
        setAuditOpen(true);
        setAuditLoading(true);
        setAuditError('');
        setAuditLogs([]);
        try {
            const response = await adminService.listTenantCapabilityAuditLogs(currentTenant.id, { limit: 20 });
            setAuditLogs(response.data?.logs || []);
        } catch (error) {
            const normalized = normalizeApiError(error);
            if (!normalized.isGlobalCandidate) setAuditError(`Failed to load capability audit logs: ${normalized.message}`);
        } finally {
            setAuditLoading(false);
        }
    };

    const closeAudit = () => {
        setAuditOpen(false);
        setAuditLogs([]);
        setAuditError('');
    };

    return (
        <div className="space-y-5">
            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Access &amp; storefront</h2>
                <p className="mt-1 text-sm text-slate-600">Tenant capabilities, storefront readiness, and audited access changes.</p>
            </header>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="tenant-capability-controls-title">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 id="tenant-capability-controls-title" className="text-lg font-semibold text-slate-900">Tenant capabilities</h3>
                        <p className="mt-1 text-sm text-slate-600">Platform-admin controls. Every change requires an audit reason.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {capabilityUnavailable ? <span role="status" className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">Settings unavailable</span> : null}
                        {!activeTenant ? <span role="status" className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">Not applicable: active tenants only</span> : null}
                        <Button type="button" variant="outline" size="sm" onClick={() => void loadAudit()}>
                            <FileCheck2 className="mr-1 h-3.5 w-3.5" />Audit
                        </Button>
                    </div>
                </div>

                {capabilityUnavailable ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                        <p className="font-semibold">Capability settings are unknown</p>
                        <p className="mt-1">The tenant read did not return these settings. Values are not shown as On or Off, and all capability changes are disabled until a fresh read succeeds.</p>
                        {readError ? <p role="alert" className="mt-2">{readError}</p> : null}
                        <Button type="button" variant="outline" className="mt-3" onClick={() => void reloadCapabilities()} disabled={readLoading}>
                            {readLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {readLoading ? 'Retrying…' : 'Retry capability read'}
                        </Button>
                    </div>
                ) : !activeTenant ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Capability controls apply to active tenants. No capability values are inferred for this tenant.</p>
                ) : capabilities ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
                        <section className="rounded-lg border border-slate-100 bg-slate-50/70 p-4" aria-label="Core workspace access">
                            <div className="mb-3 flex items-center gap-2">
                                <HardDrive className="h-4 w-4 text-slate-400" />
                                <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Core access</div><div className="text-xs text-slate-500">IMS and POS gates</div></div>
                            </div>
                            <div className="space-y-3">
                                <CapabilityToggle icon={Monitor} label="IMS" description="Authenticated inventory workspace access" value={capabilities.ims_enabled} disabled={controlsDisabled} onClick={() => openChange({ ims_enabled: !capabilities.ims_enabled }, `IMS ${capabilities.ims_enabled ? 'Off' : 'On'}`)} />
                                <CapabilityToggle icon={ShoppingCart} label="POS" description="Point-of-sale route access and POS fallbacks" value={capabilities.pos_enabled} disabled={controlsDisabled} onClick={() => openChange({ pos_enabled: !capabilities.pos_enabled }, `POS ${capabilities.pos_enabled ? 'Off' : 'On'}`)} />
                            </div>
                        </section>

                        <section className="rounded-lg border border-slate-100 bg-slate-50/70 p-4" aria-label="Public storefront controls">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-start gap-2"><Store className="mt-0.5 h-4 w-4 text-slate-400" /><div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Public storefront</div><div className="text-xs text-slate-500">Maps visibility and customer access mode</div></div></div>
                                <span className={cn('inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                                    capabilities.storefront_visible === true ? (capabilities.storefront_readiness?.publishable === true ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700') : capabilities.storefront_visible === false ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800')}>
                                    {capabilities.storefront_visible === true ? (capabilities.storefront_readiness?.publishable === true ? 'Ready to publish' : capabilities.storefront_readiness?.publishable === false ? 'Needs primary map pin' : 'Readiness unavailable') : capabilities.storefront_visible === false ? 'Hidden from maps' : 'Visibility unavailable'}
                                </span>
                            </div>
                            <div className="space-y-3">
                                <CapabilityToggle icon={MapPin} label="Storefront / Maps" description="Public discovery, direct storefront access, and new commerce activity" value={capabilities.storefront_visible} disabled={controlsDisabled} onClick={() => openChange({ storefront_visible: !capabilities.storefront_visible }, `Storefront / Maps ${capabilities.storefront_visible ? 'Off' : 'On'}`)} />
                                <CapabilityToggle icon={MapPin} label="Downpayment (premium)" description="Allow this store to configure online downpayments" value={capabilities.downpayment_allowed} disabled={controlsDisabled} onClick={() => openChange({ downpayment_allowed: !capabilities.downpayment_allowed }, `Downpayment ${capabilities.downpayment_allowed ? 'Off' : 'On'}`)} />
                                <CapabilityToggle icon={MapPin} label="Merchant can edit storefront visibility" description="Allow this tenant to change Storefront / Maps from Settings or onboarding" value={capabilities.store_visibility_merchant_editable} disabled={controlsDisabled} onClick={() => openChange({ store_visibility_merchant_editable: !capabilities.store_visibility_merchant_editable }, `Merchant visibility editing ${capabilities.store_visibility_merchant_editable ? 'Off' : 'On'}`)} />
                            </div>

                            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                                <div>
                                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Storefront sub-modes</div>
                                    <p className="mt-1 text-xs text-slate-600">Requested: {modeLabel(requestedMode)}</p>
                                </div>
                                <div className={cn('rounded-lg border px-3 py-2 text-xs', !accessModesKnown || accessCapped ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-100 bg-emerald-50 text-emerald-700')}>
                                    <div className="font-semibold">Effective: {modeLabel(effectiveMode)}{capabilities.max_customer_access_mode ? ` / Max: ${modeLabel(capabilities.max_customer_access_mode)}` : ''}</div>
                                    <div className="mt-1">Platform max: {modeLabel(capabilities.platform_max_customer_access_mode)} / Registration max: {modeLabel(capabilities.registration_stage_max_customer_access_mode)}</div>
                                    <div className="mt-1">{!accessModesKnown ? 'Access mode cap status is unavailable.' : accessCapped ? (capabilities.customer_access_limitation_reason || 'Requested mode is capped by platform or registration readiness.') : 'No platform or registration-stage cap is reducing the requested mode.'}</div>
                                </div>
                                <label className="block rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm text-blue-900">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-blue-700">Platform max allowed</span>
                                    <span className="mt-1 block text-xs text-blue-700/80">Company admins can request or downgrade up to this ceiling. Registration readiness can still cap checkout.</span>
                                    <select aria-label={`Platform max allowed for ${tenant.name}`} className="mt-2 h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60" value={platformMaxMode?.value || ''} disabled={controlsDisabled || !platformMaxMode} onChange={(event) => openChange({ platform_max_customer_access_mode: event.target.value }, `Platform max storefront mode: ${modeLabel(event.target.value)}`)}>
                                        {!platformMaxMode ? <option value="">Unavailable</option> : null}
                                        {ACCESS_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                </label>
                                <label className="block rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-sm text-amber-950">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-amber-800">Registration readiness</span>
                                    <span className="mt-1 block text-xs text-amber-800/80">Platform-admin evidence review. Registered readiness is required for transaction checkout.</span>
                                    <select aria-label={`Registration readiness for ${tenant.name}`} className="mt-2 h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60" value={registrationStage?.value || ''} disabled={controlsDisabled || !registrationStage} onChange={(event) => openChange({ customer_access_registration_stage: event.target.value }, `Registration readiness: ${REGISTRATION_STAGE_OPTIONS.find((option) => option.value === event.target.value)?.label || event.target.value}`)}>
                                        {!registrationStage ? <option value="">Unavailable</option> : null}
                                        {REGISTRATION_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                    {registrationStage ? <p className="mt-2 text-xs text-amber-800/80">{registrationStage.detail}</p> : null}
                                </label>
                                <div>
                                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Company requested mode</div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {ACCESS_MODE_OPTIONS.map((option) => <ModeButton key={option.value} option={option} selected={selectedMode?.value === option.value} disabled={controlsDisabled || !selectedMode || capabilities.storefront_visible !== true} onClick={() => openChange({ customer_access_mode: option.value }, `Storefront mode: ${option.label}`)} />)}
                                    </div>
                                    {capabilities.storefront_visible === false ? <p className="mt-2 text-xs text-slate-500">Turn on Storefront / Maps before changing the customer-facing sub-mode.</p> : null}
                                    {capabilities.storefront_visible == null ? <p className="mt-2 text-xs text-amber-800">Storefront visibility is unavailable; requested mode controls are disabled.</p> : null}
                                </div>
                            </div>
                        </section>
                    </div>
                ) : null}
            </section>

            {auditOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="capability-audit-title">
                    <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
                            <div><h2 id="capability-audit-title" className="text-xl font-bold text-slate-900">Capability audit trail</h2><p className="mt-1 text-sm text-slate-600">{tenant.name}</p></div>
                            <button type="button" onClick={closeAudit} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close capability audit trail"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="max-h-[68vh] space-y-3 overflow-y-auto p-6">
                            {auditLoading ? <div role="status" className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-8 text-sm text-slate-600"><RefreshCw className="h-4 w-4 animate-spin" />Loading audit logs...</div>
                                : auditError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{auditError}</p>
                                    : auditLogs.length === 0 ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">No capability audit logs recorded yet.</div>
                                        : auditLogs.map((log) => <div key={log.id || log.created_at} className="rounded-lg border border-slate-200 bg-white p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-semibold text-slate-900">{log.actor_username || 'platform_admin'}</div><div className="text-xs text-slate-500">{formatDate(log.created_at)}</div></div>
                                            <p className="mt-2 text-sm text-slate-700">{log.reason || 'No reason recorded'}</p>
                                            <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2"><div className="rounded-md bg-slate-50 p-3"><div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Before</div><div className="text-slate-700">{formatCapabilitySnapshot(log.before_snapshot)}</div></div><div className="rounded-md bg-emerald-50 p-3"><div className="mb-1 font-semibold uppercase tracking-wide text-emerald-600">After</div><div className="text-emerald-800">{formatCapabilitySnapshot(log.after_snapshot)}</div></div></div>
                                        </div>)}
                        </div>
                    </div>
                </div>
            ) : null}

            {pendingChange ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <form onSubmit={saveChange} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" aria-labelledby="capability-confirmation-title">
                        <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="capability-confirmation-title" className="text-xl font-bold text-slate-900">Confirm capability change</h2><p className="mt-1 text-sm text-slate-600">{pendingChange.label} for {tenant.name}</p></div><button type="button" onClick={closeChange} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close capability confirmation"><X className="h-5 w-5" /></button></div>
                        {impact ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"><p className="text-sm font-semibold text-amber-900">{impact.title}</p><p className="mt-1 text-xs leading-5 text-amber-800">{impact.message}</p></div> : null}
                        <label className="block text-sm font-medium text-slate-700" htmlFor="capability-reason">Reason</label>
                        <textarea id="capability-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={500} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="State why this tenant capability is being changed." required />
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>This reason is saved in the platform-admin audit trail.</span><span>{reason.trim().length}/500</span></div>
                        <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" onClick={closeChange} disabled={capabilityLoading}>Cancel</Button><Button type="submit" disabled={capabilityLoading || reason.trim().length < 3} className="bg-slate-900 text-white hover:bg-slate-800">{capabilityLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}Apply change</Button></div>
                    </form>
                </div>
            ) : null}
        </div>
    );
}
