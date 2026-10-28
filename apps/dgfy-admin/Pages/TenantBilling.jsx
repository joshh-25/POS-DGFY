import React, { useEffect } from 'react';
import { AlertCircle, Building2, RefreshCw } from 'lucide-react';
import { useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import TenantRevenueSettlementPanel from '../src/features/admin/tenantRevenue/TenantRevenueSettlementPanel.jsx';
import TenantConsoleTabs from '../src/features/admin/tenantDirectory/TenantConsoleTabs.jsx';
import { useTenantDirectory } from '../src/features/admin/tenantDirectory/TenantDirectoryContext.jsx';

export default function TenantBilling() {
    const { adminProfile } = useOutletContext() || {};
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const directory = useTenantDirectory();

    useEffect(() => {
        if (adminProfile?.is_master && !directory.hasLoaded && directory.status === 'idle') {
            void directory.loadTenants({ includeCapabilities: false });
        }
    }, [adminProfile?.is_master, directory]);

    if (!adminProfile?.is_master) {
        return <main role="alert" className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-white p-6 text-sm text-amber-900">Revenue &amp; Settlement is available to the Platform Master Admin.</main>;
    }

    return (
        <div className="mx-auto max-w-7xl">
            <header className="mb-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900"><Building2 className="h-8 w-8" />Tenant Management</h1>
                <p className="mt-1 text-sm text-slate-500">Review the tenant directory or open the global billing workspace.</p>
            </header>
            <TenantConsoleTabs adminProfile={adminProfile} location={location} />

            {!directory.hasLoaded && directory.status !== 'error' ? (
                <div role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Loading the authorized tenant list…</div>
            ) : null}
            {!directory.hasLoaded && directory.status === 'error' ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <span><AlertCircle className="mr-2 inline h-4 w-4" />{directory.error || 'The tenant list could not be loaded.'}</span>
                    <Button type="button" variant="outline" onClick={() => void directory.refreshTenants({ includeCapabilities: false })}>Retry</Button>
                </div>
            ) : null}
            {directory.hasLoaded ? (
                <TenantRevenueSettlementPanel
                    tenants={directory.tenants}
                    preselectTenantId={searchParams.get('tenant_id') || ''}
                    preselectionReady
                />
            ) : null}
        </div>
    );
}
