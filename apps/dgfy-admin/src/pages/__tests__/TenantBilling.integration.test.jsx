/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import TenantBilling from '../../../Pages/TenantBilling.jsx';
import TenantBillingDetail from '../../../Pages/TenantBillingDetail.jsx';
import TenantDetailLayout from '../../../Pages/TenantDetailLayout.jsx';
import { TenantDirectoryProvider } from '../../features/admin/tenantDirectory/TenantDirectoryContext.jsx';

const mocks = vi.hoisted(() => ({
    adminService: {
        getTenants: vi.fn(),
        getTenant: vi.fn(),
        listCompanyRegistrationDrafts: vi.fn(),
        getTenantRevenueDashboard: vi.fn(),
        listTenantRevenueTransactions: vi.fn(),
        listTenantSettlementBatches: vi.fn(),
        listTenantRevenueReconciliation: vi.fn(),
        listTenantRevenueFeePolicies: vi.fn(),
        listTenantRevenueAdjustments: vi.fn()
    }
}));

vi.mock('@/services/adminService', () => mocks.adminService);

const activeTenant = {
    id: 'tenant-1',
    name: 'North Market',
    status: 'active',
    capabilities: null
};

const archivedTenant = { ...activeTenant, status: 'archived' };

const revenueResults = () => {
    mocks.adminService.getTenantRevenueDashboard.mockResolvedValue({
        data: { totals: { gross_centavos: 10000, dgfy_fee_centavos: 500, pending_centavos: 2500, settled_centavos: 7000 }, counts: { open_exceptions: 1 } }
    });
    mocks.adminService.listTenantRevenueTransactions.mockResolvedValue({ data: { transactions: [{ revenue_transaction_id: 'txn-1', provider_payment_id: 'pay-1', gross_amount_centavos: 10000, settlement_status: 'pending' }] } });
    mocks.adminService.listTenantSettlementBatches.mockResolvedValue({ data: { batches: [{ settlement_batch_id: 'batch-1', batch_number: 'B-1', period_start: '2026-10-01', period_end: '2026-10-07', payout_centavos: 2500, status: 'pending' }] } });
    mocks.adminService.listTenantRevenueReconciliation.mockResolvedValue({ data: { records: [{ reconciliation_id: 'rec-1', exception_type: 'amount_mismatch', reason: 'Review the provider record.' }] } });
    mocks.adminService.listTenantRevenueFeePolicies.mockResolvedValue({ data: { policies: [{ policy_id: 'policy-1', version: 2, dgfy_rate_bps: 500, settlement_cycle_days: 7, reason: 'Recorded policy.' }] } });
    mocks.adminService.listTenantRevenueAdjustments.mockResolvedValue({ data: { adjustments: [{ adjustment_id: 'adj-1', revenue_transaction_id: 'txn-1', amount_centavos: -100, status: 'approved', reason: 'Recorded adjustment', requested_by: 'admin-1', created_at: '2026-10-20T00:00:00Z' }] } });
};

const renderBillingRoute = (path, tenant, adminProfile = { is_master: true, permissions: ['admin.tenants'] }) => {
    mocks.adminService.getTenant.mockResolvedValue({ data: tenant });
    return render(
        <TenantDirectoryProvider>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/admin" element={<Outlet context={{ adminProfile }} />}>
                        <Route path="tenants/billing" element={<TenantBilling />} />
                        <Route path="tenants/:id" element={<TenantDetailLayout />}>
                            <Route path="billing" element={<TenantBillingDetail />} />
                        </Route>
                    </Route>
                </Routes>
            </MemoryRouter>
        </TenantDirectoryProvider>
    );
};

describe('tenant Billing routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.adminService.getTenants.mockResolvedValue({ data: [activeTenant] });
        mocks.adminService.listCompanyRegistrationDrafts.mockResolvedValue({ data: [] });
        mocks.adminService.getTenant.mockResolvedValue({ data: activeTenant });
        revenueResults();
    });

    afterEach(cleanup);

    it('locks active tenant financial reads to the detail tenant', async () => {
        renderBillingRoute('/admin/tenants/tenant-1/billing', activeTenant);

        expect(await screen.findByRole('heading', { name: 'Revenue & settlement · North Market' })).toBeTruthy();
        expect(screen.queryByRole('combobox', { name: 'Tenant' })).toBeNull();
        expect(screen.getByLabelText('Tenant').value).toBe('North Market');
        await waitFor(() => expect(mocks.adminService.getTenantRevenueDashboard).toHaveBeenCalledTimes(1));
        expect(mocks.adminService.getTenantRevenueDashboard).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-1' }));
        expect(mocks.adminService.listTenantRevenueTransactions).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-1' }));
        expect(mocks.adminService.listTenantSettlementBatches).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-1' }));
        expect(mocks.adminService.listTenantRevenueReconciliation).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-1' }));
        expect(mocks.adminService.listTenantRevenueAdjustments).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-1' }));
        expect(mocks.adminService.listTenantRevenueFeePolicies).toHaveBeenCalledExactlyOnceWith('tenant-1');
    });

    it('shows archived financial records with read-only controls and scoped requests', async () => {
        renderBillingRoute('/admin/tenants/tenant-1/billing', archivedTenant);

        expect(await screen.findByText('Archived tenant financial records are read-only.')).toBeTruthy();
        expect(await screen.findByText('Recorded adjustment')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /create|approve|resolve|schedule|cancel|reconcile|export/i })).toBeNull();
        await waitFor(() => expect(mocks.adminService.getTenantRevenueDashboard).toHaveBeenCalledTimes(1));
        expect(mocks.adminService.getTenantRevenueDashboard).toHaveBeenCalledWith({ tenant_id: 'tenant-1' });
        expect(mocks.adminService.listTenantRevenueTransactions).toHaveBeenCalledWith({ tenant_id: 'tenant-1', limit: 100 });
        expect(mocks.adminService.listTenantSettlementBatches).toHaveBeenCalledWith({ tenant_id: 'tenant-1' });
        expect(mocks.adminService.listTenantRevenueReconciliation).toHaveBeenCalledWith({ tenant_id: 'tenant-1', status: 'open', limit: 100 });
        expect(mocks.adminService.listTenantRevenueAdjustments).toHaveBeenCalledWith({ tenant_id: 'tenant-1', limit: 100 });
        expect(mocks.adminService.listTenantRevenueFeePolicies).toHaveBeenCalledExactlyOnceWith('tenant-1');
    });
});
