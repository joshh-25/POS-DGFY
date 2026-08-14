/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('TenantManager compliance modal partial-load resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminServiceMock.getTenants.mockResolvedValue({
      data: [
        {
          id: 'tenant-1',
          name: 'Acme Foods',
          admin_email: 'owner@acme.test',
          status: 'active',
          plan: 'standard',
          compliance_mode_state: 'compliant_active',
          compliance_mode_choice_required: false,
          created_at: '2026-04-21T00:00:00.000Z'
        }
      ]
    });

    mocks.adminServiceMock.listTenantComplianceArtifacts.mockResolvedValue({
      data: { artifacts: [] }
    });
    mocks.adminServiceMock.listTenantCompliancePeripherals.mockResolvedValue({
      data: { peripherals: [] }
    });
    mocks.adminServiceMock.getTenantComplianceChecklist.mockResolvedValue({
      data: {
        ready_for_compliant_activation: true,
        section_progress: {},
        activation_blockers: []
      }
    });
    mocks.adminServiceMock.listTenantComplianceAuditLogs.mockRejectedValue(new Error('audit timeout'));
    mocks.adminServiceMock.listTenantComplianceSecurityIncidents.mockResolvedValue({
      data: { incidents: [] }
    });
    mocks.adminServiceMock.listStoreTemplates.mockResolvedValue({ success: true, data: { templates: [] } });
    mocks.adminServiceMock.getTenantRevenueDashboard.mockResolvedValue({ data: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps modal open and renders partial data when one compliance section fails', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Acme Foods' });
    await user.click(screen.getByRole('button', { name: /^Compliance$/i }));

    expect(await screen.findByText('Compliance Verification Review')).toBeTruthy();

    await waitFor(() => {
      expect(mocks.adminServiceMock.listTenantComplianceArtifacts).toHaveBeenCalledWith('tenant-1');
      expect(mocks.adminServiceMock.listTenantComplianceAuditLogs).toHaveBeenCalledWith('tenant-1', { limit: 120 });
    });

    expect(mocks.toastMock.error).toHaveBeenCalledWith(
      expect.stringContaining('Some compliance sections failed to load: audit history')
    );
    expect(screen.getByText(/Activation readiness: Ready/i)).toBeTruthy();
  });
});
