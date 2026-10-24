/** @vitest-environment jsdom */
import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLayout from '../AdminLayout.jsx';
import AddTenant from '../../../Pages/AddTenant.jsx';

const mocks = vi.hoisted(() => ({
  profile: { is_master: false, permissions: ['admin.feedback'] },
  adminService: {
    getCurrentAdmin: vi.fn(),
    setAuthFailureCallback: vi.fn(),
    logout: vi.fn(),
    changeOwnPlatformAdminPassword: vi.fn(),
    createAdminProvisionedTenant: vi.fn(),
    createAdminProvisionedAccountAndTenant: vi.fn()
  },
  toast: { success: vi.fn(), error: vi.fn() },
  childMounted: vi.fn()
}));

vi.mock('@/services/adminService', () => mocks.adminService);
vi.mock('sonner', () => ({ toast: mocks.toast }));

const PageProbe = ({ name }) => {
  useEffect(() => mocks.childMounted(name), [name]);
  return <p>{name} destination</p>;
};

const renderAdmin = (initialEntry) => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route path="feedback" element={<PageProbe name="Feedback" />} />
        <Route path="tenants" element={<PageProbe name="Tenant directory" />} />
        <Route path="tenants/new" element={<AddTenant />} />
        <Route path="tenants/:id" element={<PageProbe name="Tenant overview" />} />
        <Route path="dgfy-accounts" element={<PageProbe name="DGFY accounts" />} />
        <Route path="payments" element={<PageProbe name="Payments" />} />
        <Route path="pricing" element={<PageProbe name="Pricing" />} />
        <Route path="hosting" element={<PageProbe name="Hosting" />} />
        <Route path="invoices" element={<PageProbe name="Invoices" />} />
        <Route path="push-diagnostics" element={<PageProbe name="Push diagnostics" />} />
        <Route path="platform-admins" element={<PageProbe name="Platform admins" />} />
        <Route path="store-templates" element={<PageProbe name="Store templates" />} />
        <Route path="external-discovery" element={<PageProbe name="External discovery" />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

describe('AdminLayout nested route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminService.getCurrentAdmin.mockImplementation(async () => ({
      success: true,
      data: { ...mocks.profile }
    }));
  });

  afterEach(cleanup);

  it.each([
    ['/admin/tenants/tenant-1', 'Tenant overview'],
    ['/admin/tenants/new', 'Add tenant']
  ])('redirects an unauthorized nested tenant route before its child mounts (%s)', async (path) => {
    mocks.profile = { is_master: false, permissions: ['admin.feedback'] };
    renderAdmin(path);
    expect(await screen.findByText('Feedback destination')).toBeTruthy();
    expect(mocks.childMounted).toHaveBeenCalledWith('Feedback');
    expect(mocks.childMounted).not.toHaveBeenCalledWith('Tenant overview');
    expect(screen.queryByRole('heading', { name: 'Add tenant' })).toBeNull();
  });

  it('authorizes and highlights the owning sidebar item for a nested route', async () => {
    mocks.profile = { is_master: false, permissions: ['admin.tenants'] };
    renderAdmin('/admin/tenants/tenant-1');
    expect(await screen.findByText('Tenant overview destination')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tenants' }).className).toContain('bg-slate-700');
  });

  it('keeps no-page-access for a profile with no assigned pages without mounting a child', async () => {
    mocks.profile = { is_master: false, permissions: [] };
    renderAdmin('/admin/tenants/tenant-1');
    expect(await screen.findByRole('heading', { name: 'No page access assigned' })).toBeTruthy();
    expect(mocks.childMounted).not.toHaveBeenCalled();
  });

  it('keeps Add tenant separate from the layout password-change form', async () => {
    mocks.profile = { is_master: false, permissions: ['admin.tenants', 'admin.dgfy_accounts'] };
    const user = userEvent.setup();
    renderAdmin('/admin/tenants/new');
    await screen.findByRole('heading', { name: 'Add tenant' });
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    const forms = screen.getAllByRole('button', { name: 'Provision' })[0].closest('form');
    const passwordForm = screen.getByPlaceholderText('Current password').closest('form');
    expect(forms).not.toBe(passwordForm);
    expect(passwordForm.contains(forms)).toBe(false);
    expect(forms.contains(passwordForm)).toBe(false);

    await user.click(screen.getByRole('button', { name: 'DGFY + Company' }));
    expect(mocks.adminService.changeOwnPlatformAdminPassword).not.toHaveBeenCalled();
    expect(mocks.adminService.createAdminProvisionedTenant).not.toHaveBeenCalled();
    expect(mocks.adminService.createAdminProvisionedAccountAndTenant).not.toHaveBeenCalled();
  });
});
