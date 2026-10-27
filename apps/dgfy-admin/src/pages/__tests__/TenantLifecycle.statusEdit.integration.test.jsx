/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import TenantDetailLayout from '../../../Pages/TenantDetailLayout.jsx';
import TenantLifecycle from '../../../Pages/TenantLifecycle.jsx';

const mocks = vi.hoisted(() => ({
  adminServiceMock: {
    getTenants: vi.fn(),
    getTenant: vi.fn(),
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
    mocks.adminServiceMock.getTenant.mockResolvedValue({
      data: {
        id: 17,
        name: 'Policy Sietiz',
        admin_email: 'owner@policy.test',
        status: 'active',
        plan: 'standard',
        effective_plan: 'premium',
        created_at: '2026-04-14T00:00:00.000Z'
      }
    });
    mocks.adminServiceMock.updateTenant.mockResolvedValue({ success: true });
    mocks.adminServiceMock.listStoreTemplates.mockResolvedValue({ success: true, data: { templates: [] } });
    mocks.adminServiceMock.getTenantRevenueDashboard.mockResolvedValue({ data: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps lifecycle status edits status-only and does not submit plan metadata', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/tenants/17/lifecycle']}>
        <Routes>
          <Route path="/admin/tenants/:id" element={<Outlet context={{ adminProfile: { permissions: ['admin.tenants'] } }} />}>
            <Route element={<TenantDetailLayout />}>
              <Route path="lifecycle" element={<TenantLifecycle />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Policy Sietiz' });
    await user.click(screen.getByRole('button', { name: 'Edit status' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit tenant status' });
    const statusSelect = within(dialog).getByRole('combobox', { name: 'Status' });
    expect(statusSelect.value).toBe('active');
    expect(within(dialog).queryByDisplayValue('premium')).toBeNull();

    await user.selectOptions(statusSelect, 'inactive');
    await user.click(within(dialog).getByRole('button', { name: 'Save status' }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.updateTenant).toHaveBeenCalledExactlyOnceWith(17, {
        status: 'inactive'
      });
    });
    expect(mocks.toastMock.success).toHaveBeenCalledWith('Tenant status updated.');
  });
});
