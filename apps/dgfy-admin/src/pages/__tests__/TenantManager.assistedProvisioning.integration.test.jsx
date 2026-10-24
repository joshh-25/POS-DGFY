/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import AddTenant from '../../../Pages/AddTenant.jsx';

const mocks = vi.hoisted(() => ({
  adminService: {
    createAdminProvisionedTenant: vi.fn(),
    createAdminProvisionedAccountAndTenant: vi.fn()
  },
  toast: { success: vi.fn(), error: vi.fn() }
}));

vi.mock('@/services/adminService', () => mocks.adminService);
vi.mock('sonner', () => ({ toast: mocks.toast }));

const ProfileOutlet = ({ profile }) => <Outlet context={{ adminProfile: profile }} />;
const DirectoryStub = () => {
  const location = useLocation();
  return <div>Tenant directory <output data-testid="return-search">{location.search}</output></div>;
};

const renderAddTenant = ({
  profile = { is_master: true, permissions: [] },
  initialEntry = '/admin/tenants/new'
} = {}) => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route path="/admin" element={<ProfileOutlet profile={profile} />}>
        <Route path="tenants/new" element={<AddTenant />} />
        <Route path="tenants" element={<DirectoryStub />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const fillCompany = async (user, { name = 'Assisted Foods', reason = 'Merchant onboarding' } = {}) => {
  await user.type(screen.getByPlaceholderText('Company name'), name);
  await user.type(screen.getByPlaceholderText('Audit reason'), reason);
};

const fillAccount = async (user) => {
  await user.type(screen.getByPlaceholderText('DGFY first name'), 'Ada');
  await user.type(screen.getByPlaceholderText('DGFY last name'), 'Lovelace');
  await user.type(screen.getByPlaceholderText('DGFY email'), 'ada@example.test');
  await user.type(screen.getByPlaceholderText('DGFY phone'), '+639222222222');
};

describe('Add tenant assisted provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminService.createAdminProvisionedTenant.mockResolvedValue({
      data: { tenant: { id: 'tenant-new', name: 'Assisted Foods' }, temporary_password: 'OneTime123!' }
    });
    mocks.adminService.createAdminProvisionedAccountAndTenant.mockResolvedValue({
      data: { tenant: { id: 'tenant-new', name: 'Assisted Foods' }, temporary_password: 'OneTime123!' }
    });
  });

  afterEach(cleanup);

  it('posts company-only provisioning and leaves success with an explicit Overview link', async () => {
    const user = userEvent.setup();
    renderAddTenant({ initialEntry: '/admin/tenants/new?status=active&custom=keep' });
    await screen.findByRole('heading', { name: 'Add tenant' });

    await fillCompany(user);
    await user.type(screen.getByPlaceholderText('Admin email'), 'OPS@EXAMPLE.TEST');
    await user.type(screen.getByPlaceholderText('Admin phone'), '+639111111111');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'Company123!');
    await user.click(screen.getByRole('button', { name: 'Provision' }));

    await waitFor(() => expect(mocks.adminService.createAdminProvisionedTenant).toHaveBeenCalledWith({
      name: 'Assisted Foods',
      workflowMode: 'food_manufacturing',
      templateKey: null,
      adminEmail: 'OPS@EXAMPLE.TEST',
      adminPhone: '+639111111111',
      adminPassword: 'Company123!',
      reason: 'Merchant onboarding'
    }));
    expect(await screen.findByRole('heading', { name: 'Tenant created' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open tenant overview' }).getAttribute('href'))
      .toBe('/admin/tenants/tenant-new?status=active&custom=keep');
    expect(await screen.findByText(/OneTime123!/)).toBeTruthy();
    expect(mocks.toast.success).toHaveBeenCalledWith('Assisted provisioning completed');
  });

  it('requires both page grants before combined DGFY account provisioning is available', async () => {
    renderAddTenant({ profile: { permissions: ['admin.tenants'] } });
    const combinedMode = screen.getByRole('button', { name: 'DGFY + Company' });
    expect(combinedMode.disabled).toBe(true);
    expect(screen.getByText(/requires both tenant and DGFY account access/)).toBeTruthy();

    cleanup();
    renderAddTenant({ profile: { permissions: ['admin.tenants', 'admin.dgfy_accounts'] } });
    expect(screen.getByRole('button', { name: 'DGFY + Company' }).disabled).toBe(false);
  });

  it('posts the combined payload, keeps its one-time password visible, and clears it before retry', async () => {
    const user = userEvent.setup();
    renderAddTenant();
    await user.click(screen.getByRole('button', { name: 'DGFY + Company' }));
    await fillCompany(user);
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: 'Provision' }));

    expect(await screen.findByText(/OneTime123!/)).toBeTruthy();
    expect(mocks.adminService.createAdminProvisionedAccountAndTenant).toHaveBeenCalledWith({
      reason: 'Merchant onboarding',
      dgfy_account: {
        first_name: 'Ada', middle_name: '', last_name: 'Lovelace', email: 'ada@example.test',
        phone: '+639222222222', temporary_password: ''
      },
      company: { name: 'Assisted Foods', workflowMode: 'food_manufacturing', templateKey: null }
    });

    let rejectRetry;
    mocks.adminService.createAdminProvisionedAccountAndTenant.mockReturnValueOnce(new Promise((_, reject) => { rejectRetry = reject; }));
    await fillCompany(user, { name: 'Retry Foods', reason: 'Retry onboarding' });
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: 'Provision' }));
    expect(screen.queryByText(/OneTime123!/)).toBeNull();
    expect((await screen.findByRole('button', { name: 'Provisioning...' })).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Provisioning...' }));
    expect(mocks.adminService.createAdminProvisionedAccountAndTenant).toHaveBeenCalledTimes(2);
    rejectRetry(new Error('duplicate account'));
    expect((await screen.findByRole('alert')).textContent).toContain('duplicate account');
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('duplicate account'));
  }, 15000);

  it('uses the IndustryPicker workflow and template values without submitting during selection', async () => {
    const user = userEvent.setup();
    renderAddTenant();
    await user.click(await screen.findByRole('radio', { name: /Micro Food & Beverage/i }));
    expect(mocks.adminService.createAdminProvisionedTenant).not.toHaveBeenCalled();
    await fillCompany(user);
    await user.type(screen.getByPlaceholderText('Admin email'), 'ops@example.test');
    await user.type(screen.getByPlaceholderText('Admin phone'), '+639111111111');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'Company123!');
    await user.click(screen.getByRole('button', { name: 'Provision' }));

    await waitFor(() => expect(mocks.adminService.createAdminProvisionedTenant).toHaveBeenCalledWith({
      name: 'Assisted Foods', workflowMode: 'fnb', templateKey: 'fnb_counter_service',
      adminEmail: 'ops@example.test', adminPhone: '+639111111111', adminPassword: 'Company123!',
      reason: 'Merchant onboarding'
    }));
    expect(mocks.adminService.createAdminProvisionedTenant.mock.calls[0][0]).not.toHaveProperty('industryKey');
  });

  it('keeps mode controls out of form submission and requires an audit reason', async () => {
    const user = userEvent.setup();
    renderAddTenant();
    const form = screen.getByPlaceholderText('Company name').closest('form');
    expect(within(form).getByRole('button', { name: 'Company only' }).getAttribute('type')).toBe('button');
    await user.click(screen.getByRole('button', { name: 'DGFY + Company' }));
    await user.click(screen.getByRole('button', { name: 'Company only' }));
    expect(mocks.adminService.createAdminProvisionedTenant).not.toHaveBeenCalled();
    expect(mocks.adminService.createAdminProvisionedAccountAndTenant).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText('Company name'), 'No Reason Foods');
    await user.type(screen.getByPlaceholderText('Admin email'), 'ops@example.test');
    await user.type(screen.getByPlaceholderText('Admin phone'), '+639111111111');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'Company123!');
    await user.click(screen.getByRole('button', { name: 'Provision' }));
    expect(mocks.adminService.createAdminProvisionedTenant).not.toHaveBeenCalled();
  });

  it('returns to the directory with its original search context without submitting', async () => {
    const user = userEvent.setup();
    renderAddTenant({ initialEntry: '/admin/tenants/new?q=North&status=active&unrelated=kept' });
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(await screen.findByText('Tenant directory')).toBeTruthy();
    expect(screen.getByTestId('return-search').textContent).toBe('?q=North&status=active&unrelated=kept');
    expect(mocks.adminService.createAdminProvisionedTenant).not.toHaveBeenCalled();
    expect(mocks.adminService.createAdminProvisionedAccountAndTenant).not.toHaveBeenCalled();
  });
});
