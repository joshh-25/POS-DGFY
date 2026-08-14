/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TenantManager from '../../../Pages/admin/TenantManager.jsx';

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

describe('TenantManager edit plan flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminServiceMock.getTenants.mockResolvedValue({
      data: [
        {
          id: 17,
          name: 'Policy Sietiz',
          admin_email: 'owner@policy.test',
          status: 'active',
          plan: 'standard',
          created_at: '2026-04-14T00:00:00.000Z'
        }
      ]
    });
    mocks.adminServiceMock.updateTenant.mockResolvedValue({ success: true });
    mocks.adminServiceMock.listStoreTemplates.mockResolvedValue({ success: true, data: { templates: [] } });
    mocks.adminServiceMock.getTenantRevenueDashboard.mockResolvedValue({ data: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not submit plan metadata from the admin edit modal', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Policy Sietiz' });
    await user.click(screen.getByRole('button', { name: /^Edit$/i }));

    await screen.findByRole('heading', { name: 'Edit Tenant' });
    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    const editForm = saveButton.closest('form');
    expect(editForm).toBeTruthy();

    const statusSelect = within(editForm).getByRole('combobox');

    expect(statusSelect.value).toBe('active');
    expect(within(editForm).getByDisplayValue('premium')).toBeTruthy();
    expect(screen.getAllByText('Premium-capable').length).toBeGreaterThan(0);

    await user.selectOptions(statusSelect, 'inactive');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mocks.adminServiceMock.updateTenant).toHaveBeenCalledWith(17, {
        status: 'inactive'
      });
    });
    expect(mocks.toastMock.success).toHaveBeenCalledWith('Tenant updated successfully');
  });
});
