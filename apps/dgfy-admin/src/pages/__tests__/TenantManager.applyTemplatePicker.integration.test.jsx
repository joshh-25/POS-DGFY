/** @vitest-environment jsdom */
// The published catalog remains Platform Master only after applying templates
// moved to the tenant's Store setup section.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import TenantDetailLayout from '../../../Pages/TenantDetailLayout.jsx';
import TenantStoreSetup from '../../../Pages/TenantStoreSetup.jsx';

const mocks = vi.hoisted(() => ({
  adminService: {
    getTenant: vi.fn(),
    getTenants: vi.fn(),
    listStoreTemplates: vi.fn(),
    applyTenantTemplate: vi.fn(),
    updateTenantCapabilities: vi.fn(),
    listTenantCapabilityAuditLogs: vi.fn(),
    createAdminProvisionedTenant: vi.fn(),
    createAdminProvisionedAccountAndTenant: vi.fn(),
    deleteTenant: vi.fn(),
    approveTenant: vi.fn(),
    rejectTenant: vi.fn(),
    adminReactivateTenant: vi.fn(),
    forceTenantNonCompliant: vi.fn(),
    selectTenantComplianceMode: vi.fn(),
    upgradeTenantComplianceMode: vi.fn(),
    listTenantComplianceArtifacts: vi.fn(),
    listTenantCompliancePeripherals: vi.fn(),
    getTenantComplianceChecklist: vi.fn(),
    listTenantComplianceAuditLogs: vi.fn(),
    listTenantComplianceSecurityIncidents: vi.fn(),
    updateTenantComplianceArtifactVerification: vi.fn(),
    updateTenantCompliancePeripheralVerification: vi.fn(),
    acknowledgeTenantComplianceSecurityIncident: vi.fn(),
    resolveTenantComplianceSecurityIncident: vi.fn(),
    updateTenant: vi.fn(),
    getTenantPosMetadata: vi.fn(),
    listTenantPosMetadataAuditLogs: vi.fn(),
    updateTenantPosMetadata: vi.fn(),
    retryTenantProvisioning: vi.fn(),
    setupPayPalRecurring: vi.fn(),
    getTenantRevenueDashboard: vi.fn()
  },
  toast: { success: vi.fn(), error: vi.fn() }
}));

vi.mock('@/services/adminService', () => mocks.adminService);
vi.mock('sonner', () => ({ toast: mocks.toast }));

const renderStoreSetup = () => render(<MemoryRouter initialEntries={['/admin/tenants/tenant-lean-retail/store-setup']}><Routes>
  <Route path="/admin" element={<Outlet context={{ adminProfile: { is_master: true, permissions: ['admin.tenants'] } }} />}>
    <Route path="tenants/:id" element={<TenantDetailLayout />}>
      <Route path="store-setup" element={<TenantStoreSetup />} />
    </Route>
  </Route>
</Routes></MemoryRouter>);

describe('Tenant Store setup template application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminService.getTenant.mockResolvedValue({
      data: {
          id: 'tenant-lean-retail',
          name: 'Lean Retail Co',
          admin_email: 'owner@example.test',
          company_token: 'token-lean-retail',
          status: 'active',
          plan: 'starter',
          capabilities: {
            ims_enabled: true,
            pos_enabled: true,
            storefront_visible: true,
            customer_access_mode: 'catalog'
          }
        }
    });
    // The real API response shape: { success, data: { templates } }.
    mocks.adminService.listStoreTemplates.mockResolvedValue({
      success: true,
      data: {
        templates: [
          { template_id: 1, template_key: 'retail_store', label: 'Retail Store', base_mode: 'retail', status: 'published' }
        ]
      },
      message: null
    });
    mocks.adminService.getTenantPosMetadata.mockResolvedValue({ data: { current: {} } });
    mocks.adminService.listTenantPosMetadataAuditLogs.mockResolvedValue({ data: { logs: [] } });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the apply-template picker with the published templates for an active tenant', async () => {
    renderStoreSetup();

    await screen.findByRole('heading', { name: 'Lean Retail Co' });

    const picker = await screen.findByLabelText('Published Store Template');
    // The base mode is shown as its human label (Retail), not the raw
    // base_mode key (retail) - issue #178 final-touch pass.
    expect(within(picker).getByText('Retail Store (Retail)')).toBeTruthy();
  });
});
