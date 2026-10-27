import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, RefreshCw } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import * as adminService from '@/services/adminService';

const SECTIONS = [
    { path: '', label: 'Overview' },
    { path: 'lifecycle', label: 'Lifecycle' },
    { path: 'registration', label: 'Registration' },
    { path: 'compliance', label: 'Compliance' },
    { path: 'store-setup', label: 'Store setup' },
    { path: 'access', label: 'Access & storefront' },
    { path: 'billing', label: 'Billing', masterOnly: true }
];

const isTenantNotFound = (error) => error?.response?.status === 404
    || error?.response?.data?.code === 'TENANT_NOT_FOUND'
    || error?.response?.data?.error?.code === 'TENANT_NOT_FOUND';

export default function TenantDetailLayout() {
    const { id } = useParams();
    const location = useLocation();
    const adminContext = useOutletContext() || {};
    const [requestState, setRequestState] = useState({ id: null, tenant: null, status: 'loading', error: '' });
    const generationRef = useRef(0);

    const loadTenant = useCallback(async (tenantId = id, { silent = false } = {}) => {
        const generation = generationRef.current + 1;
        generationRef.current = generation;
        if (!silent) setRequestState({ id: tenantId, tenant: null, status: 'loading', error: '' });
        try {
            const response = await adminService.getTenant(tenantId);
            if (generationRef.current !== generation) return null;
            const tenant = response?.data || null;
            setRequestState({ id: tenantId, tenant, status: tenant ? 'loaded' : 'not_found', error: '' });
            return tenant;
        } catch (error) {
            if (generationRef.current !== generation) return null;
            if (silent) return null;
            if (isTenantNotFound(error)) {
                setRequestState({ id: tenantId, tenant: null, status: 'not_found', error: '' });
            } else {
                setRequestState({
                    id: tenantId,
                    tenant: null,
                    status: 'error',
                    error: 'Tenant details could not be loaded. Retry the request.'
                });
            }
            return null;
        }
    }, [id]);

    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(() => {
            if (active) void loadTenant(id);
        }, 0);
        return () => {
            active = false;
            window.clearTimeout(timer);
            generationRef.current += 1;
        };
    }, [id, loadTenant]);

    const refreshTenant = useCallback((tenantId = id, options = {}) => (
        loadTenant(tenantId, { ...options, silent: options.silent ?? true })
    ), [id, loadTenant]);

    const currentRequest = requestState.id === id;
    const tenant = currentRequest ? requestState.tenant : null;
    const status = currentRequest ? requestState.status : 'loading';
    const error = currentRequest ? requestState.error : '';
    const directoryTarget = { pathname: '/admin/tenants', search: location.search };
    const tenantPath = `/admin/tenants/${encodeURIComponent(id)}`;

    return (
        <main className="mx-auto max-w-6xl space-y-5 pb-10">
            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <Link to={directoryTarget} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                    ← Back to tenants
                </Link>
                <div className="mt-4 flex items-start gap-3">
                    <Building2 className="mt-1 h-7 w-7 shrink-0 text-slate-700" aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant management</p>
                        <h1 className="mt-1 truncate text-2xl font-bold text-slate-900">{tenant?.name || 'Tenant details'}</h1>
                        {tenant ? <p className="mt-1 break-all text-sm text-slate-600">Tenant ID: {tenant.id}</p> : null}
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
                    <p className="text-sm">{error}</p>
                    <Button type="button" variant="outline" onClick={() => void loadTenant(id)}>Retry</Button>
                </div>
            ) : null}

            {status === 'loaded' && tenant ? (
                <>
                    {tenant.status === 'archived' ? (
                        <div role="status" className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
                            This tenant is archived. Details and audit history are read-only.
                        </div>
                    ) : null}
                    <nav aria-label="Tenant detail sections" className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                        {SECTIONS.filter((section) => !section.masterOnly || adminContext.adminProfile?.is_master).map((section) => {
                            const to = section.path ? `${tenantPath}/${section.path}` : tenantPath;
                            return (
                                <NavLink
                                    key={section.path || 'overview'}
                                    to={{ pathname: to, search: location.search }}
                                    end={!section.path}
                                    className={({ isActive }) => `shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                                >
                                    {section.label}
                                </NavLink>
                            );
                        })}
                    </nav>
                    <Outlet
                        key={id}
                        context={{
                            ...adminContext,
                            tenant,
                            refreshTenant,
                            isArchived: tenant.status === 'archived',
                            directoryTarget
                        }}
                    />
                </>
            ) : null}
        </main>
    );
}
