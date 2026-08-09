/** @vitest-environment jsdom */
// issue #178 final-touch hardening: pins the fix for a real bug found while
// auditing the curation surface - TenantManager.jsx read `response.data`
// instead of `response.data?.templates` from listStoreTemplates(), which
// returns `{ success, data: { templates } }`. That made `templates.length`
// evaluate `undefined > 0` (always false), so the Phase 17 apply-template
// picker never rendered for any tenant. This test fails against the
// pre-fix code and passes after the one-line fix in TenantManager.jsx.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TenantManager from '../../../Pages/admin/TenantManager.jsx';

const mocks = vi.hoisted(() => ({
  adminService: {
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

const renderTenantManager = () => render(<MemoryRouter><TenantManager /></MemoryRouter>);

describe('TenantManager apply-template picker (issue #178 final-touch hardening)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminService.getTenants.mockResolvedValue({
      data: [
        {
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
      ]
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
    mocks.adminService.getTenantRevenueDashboard.mockResolvedValue({ data: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the apply-template picker with the published templates for an active tenant', async () => {
    renderTenantManager();

    await screen.findByRole('heading', { name: 'Lean Retail Co' });

    const picker = await screen.findByLabelText('Apply Store Template to Lean Retail Co');
    // The base mode is shown as its human label (Retail), not the raw
    // base_mode key (retail) - issue #178 final-touch pass.
    expect(within(picker).getByText('Retail Store (Retail)')).toBeTruthy();
  });
});
