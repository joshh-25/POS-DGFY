/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TenantManager from '../../../../../apps/dgfy-ims/Pages/admin/TenantManager.jsx';

const mocks = vi.hoisted(() => ({
  adminServiceMock: {
    getTenants: vi.fn(),
    updateTenant: vi.fn(),
    createTenant: vi.fn(),
    deleteTenant: vi.fn(),
    approveTenant: vi.fn(),
    rejectTenant: vi.fn(),
    retryTenantProvisioning: vi.fn(),
    adminReactivateTenant: vi.fn(),
    listTenantComplianceArtifacts: vi.fn(),
    listTenantCompliancePeripherals: vi.fn(),
    getTenantComplianceChecklist: vi.fn(),
    listTenantComplianceAuditLogs: vi.fn(),
    listTenantComplianceSecurityIncidents: vi.fn(),
    updateTenantComplianceArtifactVerification: vi.fn(),
    updateTenantCompliancePeripheralVerification: vi.fn(),
    acknowledgeTenantComplianceSecurityIncident: vi.fn(),
    resolveTenantComplianceSecurityIncident: vi.fn(),
    updateComplianceFinalReviewDocumentReview: vi.fn(),
    listStoreTemplates: vi.fn(),
    getTenantRevenueDashboard: vi.fn()
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/services/adminService', () => mocks.adminServiceMock);
vi.mock('sonner', () => ({ toast: mocks.toastMock }));

const renderTenants = (tenants) => {
  mocks.adminServiceMock.getTenants.mockResolvedValue({ data: tenants });
  mocks.adminServiceMock.listStoreTemplates.mockResolvedValue({ success: true, data: { templates: [] } });
  mocks.adminServiceMock.getTenantRevenueDashboard.mockResolvedValue({ data: null });
  return render(<MemoryRouter><TenantManager /></MemoryRouter>);
};

describe('TenantManager public registration approval actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not offer public approval actions for a pending tenant without an application', async () => {
    renderTenants([{
      id: 'tenant-without-application',
      name: 'Admin Provisioned Company',
      admin_email: 'owner@example.test',
      status: 'pending',
      provisioning_source: 'platform_admin',
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    }]);

    const card = await screen.findByRole('heading', { name: 'Admin Provisioned Company' });
    const tenantCard = card.closest('div.bg-white');
    expect(within(tenantCard).queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(within(tenantCard).queryByRole('button', { name: /^Reject$/i })).toBeNull();
    expect(within(tenantCard).getByText('No pending public registration is available for approval.')).toBeTruthy();
  });

  it('offers approval and rejection only for a pending public registration', async () => {
    renderTenants([{
      id: 'public-registration-tenant',
      name: 'Public Registration Company',
      admin_email: 'applicant@example.test',
      status: 'pending',
      registration_action: {
        action: 'approve',
        allowed: true,
        helper_text: 'Approve the pending public registration.'
      },
      registrationApplication: {
        review_status: 'pending',
        provisioning_status: 'not_started'
      },
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    }]);

    const card = await screen.findByRole('heading', { name: 'Public Registration Company' });
    const tenantCard = card.closest('div.bg-white');
    expect(within(tenantCard).getByRole('button', { name: /^Approve$/i })).toBeTruthy();
    expect(within(tenantCard).getByRole('button', { name: /^Reject$/i })).toBeTruthy();
  });

  it('shows retry only when the server marks setup as retryable', async () => {
    renderTenants([{
      id: 'stale-provisioning-tenant',
      name: 'Stale Provisioning Company',
      admin_email: 'applicant@example.test',
      status: 'pending',
      registration_action: {
        action: 'retry',
        allowed: true,
        helper_text: 'The previous setup attempt is stale and can be retried.'
      },
      registrationApplication: {
        review_status: 'approved',
        provisioning_status: 'in_progress'
      },
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    }]);

    const card = await screen.findByRole('heading', { name: 'Stale Provisioning Company' });
    const tenantCard = card.closest('div.bg-white');
    expect(within(tenantCard).getByRole('button', { name: /Retry setup/i })).toBeTruthy();
    expect(within(tenantCard).queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(within(tenantCard).queryByRole('button', { name: /^Reject$/i })).toBeNull();
  });

  it('shows setup status for a pending tenant whose application is not actionable', async () => {
    renderTenants([{
      id: 'setting-up-tenant',
      name: 'Setting Up Company',
      admin_email: 'applicant@example.test',
      status: 'pending',
      registration_action: {
        action: 'setting_up',
        allowed: false,
        helper_text: 'Company setup is already in progress.'
      },
      registrationApplication: {
        review_status: 'approved',
        provisioning_status: 'in_progress'
      },
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    }]);

    const card = await screen.findByRole('heading', { name: 'Setting Up Company' });
    const tenantCard = card.closest('div.bg-white');
    expect(within(tenantCard).queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(within(tenantCard).getByRole('status').textContent).toContain('Company setup is already in progress.');
  });
});
