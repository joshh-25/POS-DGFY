/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TenantManager from '../../../Pages/admin/TenantManager.jsx';

const mocks = vi.hoisted(() => ({
  adminService: {
    getTenants: vi.fn(),
    createAdminProvisionedTenant: vi.fn(),
    createAdminProvisionedAccountAndTenant: vi.fn()
  },
  toast: { success: vi.fn(), error: vi.fn() }
}));

vi.mock('@/services/adminService', () => mocks.adminService);
vi.mock('sonner', () => ({ toast: mocks.toast }));

const fillShared = async (user) => {
  await user.type(screen.getByPlaceholderText('Company name'), 'Assisted Foods');
  await user.type(screen.getByPlaceholderText('Audit reason'), 'Merchant onboarding');
};
const renderTenantManager = () => render(<MemoryRouter><TenantManager /></MemoryRouter>);

describe('TenantManager assisted provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminService.getTenants.mockResolvedValue({ data: [] });
    mocks.adminService.createAdminProvisionedTenant.mockResolvedValue({ data: {} });
    mocks.adminService.createAdminProvisionedAccountAndTenant.mockResolvedValue({
      data: { temporary_password: 'OneTime123!' }
    });
  });

  afterEach(cleanup);

  it('removes the legacy add-tenant entry point while retaining unrelated controls', async () => {
    renderTenantManager();
    await screen.findByText('Assisted provisioning');

    expect(screen.queryByText('+ Add Tenant')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Add New Tenant' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search tenants, tokens, plans, or capabilities')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Company only' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'DGFY + Company' })).toBeTruthy();
    expect(screen.getByText(/DGFY login, company switching, owner actions, and POS access require owner assignment/)).toBeTruthy();
  });

  it('switches modes without submitting and posts company-only data to the retained service', async () => {
    const user = userEvent.setup();
    renderTenantManager();
    await screen.findByText('Assisted provisioning');

    await user.click(screen.getByRole('button', { name: 'DGFY + Company' }));
    await user.click(screen.getByRole('button', { name: 'Company only' }));
    expect(mocks.adminService.createAdminProvisionedTenant).not.toHaveBeenCalled();
    expect(mocks.adminService.createAdminProvisionedAccountAndTenant).not.toHaveBeenCalled();

    await fillShared(user);
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
    expect(mocks.toast.success).toHaveBeenCalledWith('Assisted provisioning completed');
  });

  it('posts DGFY plus company data and clears the one-time password on the next attempt', async () => {
    const user = userEvent.setup();
    renderTenantManager();
    await screen.findByText('Assisted provisioning');
    await user.click(screen.getByRole('button', { name: 'DGFY + Company' }));
    await fillShared(user);
    await user.type(screen.getByPlaceholderText('DGFY first name'), 'Ada');
    await user.type(screen.getByPlaceholderText('DGFY last name'), 'Lovelace');
    await user.type(screen.getByPlaceholderText('DGFY email'), 'ada@example.test');
    await user.type(screen.getByPlaceholderText('DGFY phone'), '+639222222222');
    await user.click(screen.getByRole('button', { name: 'Provision' }));

    expect(await screen.findByText(/OneTime123!/)).toBeTruthy();
    expect(mocks.adminService.createAdminProvisionedAccountAndTenant).toHaveBeenCalledWith(expect.objectContaining({
      dgfy_account: expect.objectContaining({ email: 'ada@example.test' }),
      company: { name: 'Assisted Foods', workflowMode: 'food_manufacturing', templateKey: null }
    }));

    mocks.adminService.createAdminProvisionedAccountAndTenant.mockRejectedValueOnce(new Error('duplicate account'));
    await user.type(screen.getByPlaceholderText('Company name'), 'Retry Foods');
    await user.type(screen.getByPlaceholderText('Audit reason'), 'Retry onboarding');
    await user.type(screen.getByPlaceholderText('DGFY first name'), 'Ada');
    await user.type(screen.getByPlaceholderText('DGFY last name'), 'Lovelace');
    await user.type(screen.getByPlaceholderText('DGFY email'), 'ada@example.test');
    await user.type(screen.getByPlaceholderText('DGFY phone'), '+639222222222');
    await user.click(screen.getByRole('button', { name: 'Provision' }));
    await waitFor(() => expect(screen.queryByText(/OneTime123!/)).toBeNull());
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('duplicate account'));
  }, 15000);

  it('shows loading state and reports API validation failures without a success toast', async () => {
    const user = userEvent.setup();
    let rejectRequest;
    mocks.adminService.createAdminProvisionedTenant.mockReturnValue(new Promise((_, reject) => { rejectRequest = reject; }));
    renderTenantManager();
    await screen.findByText('Assisted provisioning');
    await fillShared(user);
    await user.type(screen.getByPlaceholderText('Admin email'), 'ops@example.test');
    await user.type(screen.getByPlaceholderText('Admin phone'), '+639111111111');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'Company123!');
    await user.click(screen.getByRole('button', { name: 'Provision' }));

    expect((await screen.findByRole('button', { name: 'Provisioning...' })).hasAttribute('disabled')).toBe(true);
    rejectRequest(new Error('Company name is required'));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('Company name is required')));
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });
});
