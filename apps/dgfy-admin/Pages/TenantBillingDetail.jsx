import React from 'react';
import TenantRevenueSettlementPanel from '../src/features/admin/tenantRevenue/TenantRevenueSettlementPanel.jsx';
import TenantRevenueReadOnlyPanel from '../src/features/admin/tenantRevenue/TenantRevenueReadOnlyPanel.jsx';
import { useOutletContext } from 'react-router-dom';

export default function TenantBillingDetail() {
    const { adminProfile, tenant, isArchived } = useOutletContext() || {};

    if (!adminProfile?.is_master) {
        return <section role="alert" className="rounded-xl border border-amber-200 bg-white p-5 text-sm text-amber-900">Tenant revenue and settlement is available to the Platform Master Admin.</section>;
    }

    return (
        <section aria-labelledby="tenant-billing-detail-title" className="space-y-4">
            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 id="tenant-billing-detail-title" className="text-xl font-semibold text-slate-900">Revenue &amp; settlement · {tenant.name}</h2>
                <p className="mt-1 text-sm text-slate-600">Financial records and controls are scoped to this tenant.</p>
                {isArchived ? <p role="status" className="mt-3 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">Archived tenant financial records are read-only.</p> : null}
            </header>
            {isArchived ? (
                <TenantRevenueReadOnlyPanel tenant={tenant} />
            ) : (
                <TenantRevenueSettlementPanel
                    tenants={[tenant]}
                    preselectTenantId={tenant.id}
                    preselectionReady
                    lockedTenantId={tenant.id}
                />
            )}
        </section>
    );
}
