/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TenantManager from '../../../Pages/admin/TenantManager.jsx';

const mocks = vi.hoisted(() => ({
  adminServiceMock: {
    getTenants: vi.fn(),
    updateTenant: vi.fn(),
    updateTenantCapabilities: vi.fn(),
    listTenantCapabilityAuditLogs: vi.fn(),
    createTenant: vi.fn(),
    deleteTenant: vi.fn(),
    approveTenant: vi.fn(),
    rejectTenant: vi.fn(),
    adminReactivateTenant: vi.fn(),
    forceTenantNonCompliant: vi.fn(),
    listTenantComplianceArtifacts: vi.fn(),
    listTenantCompliancePeripherals: vi.fn(),
    getTenantComplianceChecklist: vi.fn(),
    listTenantComplianceAuditLogs: vi.fn(),
    listTenantComplianceSecurityIncidents: vi.fn(),
    updateTenantComplianceArtifactVerification: vi.fn(),
    updateTenantCompliancePeripheralVerification: vi.fn(),
    acknowledgeTenantComplianceSecurityIncident: vi.fn(),
    resolveTenantComplianceSecurityIncident: vi.fn(),
    updateComplianceFinalReviewDocumentReview: vi.fn()
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/services/adminService', () => mocks.adminServiceMock);
vi.mock('sonner', () => ({ toast: mocks.toastMock }));

describe('TenantManager capability controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminServiceMock.getTenants.mockResolvedValue({
      data: [
        {
          id: 'tenant-kusina',
          name: 'Kusina & Cafe',
          admin_email: 'kusina@example.test',
          company_token: 'token-kusina',
          status: 'active',
          plan: 'premium',
          compliance_mode_state: 'non_compliant_active',
          compliance_mode_choice_required: false,
          can_force_non_compliant: false,
          force_non_compliant_block_reason: 'Tenant is already in non_compliant_active mode.',
          created_at: '2026-06-05T05:24:00.000Z',
          capabilities: {
            ims_enabled: true,
            pos_enabled: false,
            storefront_visible: true,
            customer_access_mode: 'catalog'
          }
        },
        {
          id: 'tenant-kate',
          name: 'Kate Store',
          admin_email: 'kate@example.test',
          company_token: 'token-kate',
          status: 'active',
          plan: 'premium',
          capabilities: {
            ims_enabled: true,
            pos_enabled: true,
            storefront_visible: false,
            customer_access_mode: 'ghost'
          }
        }
      ]
    });
    mocks.adminServiceMock.updateTenantCapabilities.mockResolvedValue({ success: true });
    mocks.adminServiceMock.listTenantCapabilityAuditLogs.mockResolvedValue({
      data: {
        logs: [
          {
            id: 10,
            actor_username: 'skupervisor',
            reason: 'Tenant requested POS restoration',
            created_at: '2026-06-07T03:00:00.000Z',
            before_snapshot: {
              ims_enabled: true,
              pos_enabled: false,
              storefront_visible: true,
              customer_access_mode: 'catalog'
            },
            after_snapshot: {
              ims_enabled: true,
              pos_enabled: true,
              storefront_visible: true,
              customer_access_mode: 'catalog'
            }
          }
        ]
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('filters tenants by search and updates capability switches with an audit reason', async () => {
    const user = userEvent.setup();
    render(<TenantManager />);

    await screen.findByText('Kusina & Cafe');
    await user.type(screen.getByPlaceholderText('Search tenants'), 'kusina');

    expect(screen.getByText('Kusina & Cafe')).toBeTruthy();
    expect(screen.queryByText('Kate Store')).toBeNull();

    await user.click(screen.getByRole('button', { name: /POS Off/i }));
    await screen.findByText('Confirm capability change');
    await user.type(screen.getByLabelText('Reason'), 'Tenant requested POS restoration');
    await user.click(screen.getByRole('button', { name: /Apply change/i }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenCalledWith(
        'tenant-kusina',
        { pos_enabled: true, reason: 'Tenant requested POS restoration' }
      );
    });
    expect(mocks.toastMock.success).toHaveBeenCalledWith('Tenant capabilities updated');
  });

  it('shows storefront readiness gaps for visible tenants without a publishable pin', async () => {
    render(<TenantManager />);

    await screen.findByText('Kusina & Cafe');
    expect(screen.getByText('Needs primary map pin')).toBeTruthy();
  });

  it('loads and renders recent capability audit logs', async () => {
    const user = userEvent.setup();
    render(<TenantManager />);

    await screen.findByText('Kusina & Cafe');
    await user.click(screen.getAllByRole('button', { name: /Audit/i })[0]);

    await waitFor(() => {
      expect(mocks.adminServiceMock.listTenantCapabilityAuditLogs).toHaveBeenCalledWith(
        'tenant-kusina',
        { limit: 20 }
      );
    });
    expect(await screen.findByText('Tenant requested POS restoration')).toBeTruthy();
    expect(screen.getByText(/POS Off/i)).toBeTruthy();
    expect(screen.getByText(/POS On/i)).toBeTruthy();
  });
});
