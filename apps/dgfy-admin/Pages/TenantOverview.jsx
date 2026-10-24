import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AlertCircle, Building2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as adminService from '@/services/adminService';

const COMPLIANCE_LABELS = {
    non_compliant_active: 'Non-compliant active',
    compliant_pending: 'Compliant pending',
    compliant_active: 'Compliant active'
};

const OWNERSHIP_LABELS = {
    unassigned: 'Unassigned',
    claimed: 'Claimed',
    handover_pending: 'Handover pending'
};

const capabilityLabel = (capabilities, key) => {
    if (!capabilities) return 'Not applicable for this tenant status';
    if (capabilities.unavailable === true) return 'Currently unavailable';
    if (typeof capabilities[key] !== 'boolean') return 'Not reported';
    return capabilities[key] ? 'Enabled' : 'Disabled';
};

const DetailItem = ({ label, value }) => (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || 'Not available'}</dd>
    </div>
);

const isTenantNotFound = (error) => error?.response?.status === 404
    || error?.response?.data?.code === 'TENANT_NOT_FOUND'
    || error?.response?.data?.error?.code === 'TENANT_NOT_FOUND';

export default function TenantOverview() {
    const { id } = useParams();
    const location = useLocation();
    const [requestState, setRequestState] = useState({ id: null, tenant: null, status: 'loading', error: '' });
    const requestGeneration = useRef(0);
    const directoryTarget = { pathname: '/admin/tenants', search: location.search };

    const applyTenantResponse = useCallback((tenantId, response, generation) => {
        if (requestGeneration.current !== generation) return;
        setRequestState({
            id: tenantId,
            tenant: response?.data || null,
            status: response?.data ? 'loaded' : 'not_found',
            error: ''
        });
    }, []);

    const applyTenantError = useCallback((tenantId, requestError, generation) => {
        if (requestGeneration.current !== generation) return;
        if (isTenantNotFound(requestError)) {
            setRequestState({ id: tenantId, tenant: null, status: 'not_found', error: '' });
        } else {
            setRequestState({
                id: tenantId,
                tenant: null,
                status: 'error',
                error: 'Tenant details could not be loaded. Retry the request.'
            });
        }
    }, []);

    useEffect(() => {
        const generation = requestGeneration.current + 1;
        requestGeneration.current = generation;
        adminService.getTenant(id)
            .then((response) => applyTenantResponse(id, response, generation))
            .catch((requestError) => applyTenantError(id, requestError, generation));
        return () => { requestGeneration.current += 1; };
    }, [id, applyTenantError, applyTenantResponse]);

    const currentRequest = requestState.id === id;
    const currentTenant = currentRequest ? requestState.tenant : null;
    const status = currentRequest ? requestState.status : 'loading';
    const error = currentRequest ? requestState.error : '';
    const loadTenant = () => {
        const generation = requestGeneration.current + 1;
        requestGeneration.current = generation;
        setRequestState({ id, tenant: null, status: 'loading', error: '' });
        adminService.getTenant(id)
            .then((response) => applyTenantResponse(id, response, generation))
            .catch((requestError) => applyTenantError(id, requestError, generation));
    };

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <Link to={directoryTarget} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                    ← Back to tenants
                </Link>
                <div className="mt-4 flex items-start gap-3">
                    <Building2 className="mt-1 h-7 w-7 shrink-0 text-slate-700" aria-hidden="true" />
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant overview</p>
                        <h1 className="mt-1 text-2xl font-bold text-slate-900">{currentTenant?.name || 'Tenant details'}</h1>
                    </div>
                </div>
            </header>

            {status === 'loading' ? (
                <div role="status" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-slate-700">
                    <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Loading tenant details...
                </div>
            ) : null}

            {status === 'not_found' ? (
                <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
                    <h2 className="font-semibold">Tenant not found</h2>
                    <p className="mt-1 text-sm">This tenant may have been removed or the link may be incorrect.</p>
                    <Link to={directoryTarget} className="mt-3 inline-flex font-medium underline">Return to tenants</Link>
                </section>
            ) : null}

            {status === 'error' ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
                    <div className="flex items-center gap-2 text-sm">
                        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                        {error}
                    </div>
                    <Button type="button" variant="outline" onClick={loadTenant}>Retry</Button>
                </div>
            ) : null}

            {status === 'loaded' && currentTenant ? (
                <>
                    {currentTenant.status === 'archived' ? (
                        <div role="status" className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
                            This tenant is archived. The overview is read-only.
                        </div>
                    ) : null}
                    <section aria-labelledby="tenant-summary-heading" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h2 id="tenant-summary-heading" className="text-lg font-semibold text-slate-900">Tenant summary</h2>
                        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <DetailItem label="Tenant ID" value={currentTenant.id} />
                            <DetailItem label="Admin email" value={currentTenant.admin_email} />
                            <DetailItem label="Domain" value={currentTenant.domain} />
                            <DetailItem label="Status" value={currentTenant.status} />
                            <DetailItem label="Effective plan" value={currentTenant.effective_plan || currentTenant.plan} />
                            <DetailItem label="Ownership" value={OWNERSHIP_LABELS[currentTenant.ownership_status] || currentTenant.ownership_status} />
                            <DetailItem label="DGFY owner ID" value={currentTenant.owner_dgfy_account_id} />
                            <DetailItem label="Compliance" value={COMPLIANCE_LABELS[currentTenant.compliance_mode_state] || (currentTenant.compliance_mode_choice_required ? 'Selection required' : 'Not selected')} />
                            <DetailItem label="Compliance policy" value={currentTenant.compliance_policy_version} />
                        </dl>
                    </section>

                    <section aria-labelledby="tenant-capabilities-heading" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h2 id="tenant-capabilities-heading" className="text-lg font-semibold text-slate-900">Capability summary</h2>
                        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <DetailItem label="IMS" value={capabilityLabel(currentTenant.capabilities, 'ims_enabled')} />
                            <DetailItem label="POS" value={capabilityLabel(currentTenant.capabilities, 'pos_enabled')} />
                            <DetailItem label="Storefront" value={capabilityLabel(currentTenant.capabilities, 'storefront_visible')} />
                            <DetailItem label="Down payment" value={capabilityLabel(currentTenant.capabilities, 'downpayment_allowed')} />
                        </dl>
                    </section>
                    <p className="text-sm text-slate-600">Compliance history, ownership changes, and capability controls are unavailable in this wave.</p>
                </>
            ) : null}
        </div>
    );
}
