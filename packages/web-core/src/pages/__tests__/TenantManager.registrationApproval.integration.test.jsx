/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

const renderTenant = (tenant) => {
  mocks.adminServiceMock.getTenants.mockResolvedValue({ data: [tenant] });
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
    renderTenant({
      id: 'tenant-without-application',
      name: 'Admin Provisioned Company',
      admin_email: 'owner@example.test',
      status: 'pending',
      provisioning_source: 'platform_admin',
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    });

    await screen.findByRole('heading', { name: 'Admin Provisioned Company' });

    expect(screen.queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Reject$/i })).toBeNull();
    expect(screen.getByText('No pending public registration is available for approval.')).toBeTruthy();
  });

  it('offers approval and rejection only for a pending public registration', async () => {
    renderTenant({
      id: 'public-registration-tenant',
      name: 'Public Registration Company',
      admin_email: 'applicant@example.test',
      status: 'pending',
      registrationApplication: {
        review_status: 'pending',
        provisioning_status: 'not_started'
      },
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    });

    await screen.findByRole('heading', { name: 'Public Registration Company' });

    expect(screen.getByRole('button', { name: /^Approve$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Reject$/i })).toBeTruthy();
  });
});
