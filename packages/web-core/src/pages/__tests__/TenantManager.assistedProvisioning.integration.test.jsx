/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TenantManager from '../../../../../apps/dgfy-ims/Pages/admin/TenantManager.jsx';

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
    // The tenant-revenue workspace card below also has its own Refresh
    // button, so scope to the page header card that owns this one.
    const header = screen.getByRole('heading', { name: 'Tenant Management' }).closest('div.bg-white');
    expect(within(header).getByRole('button', { name: 'Refresh' })).toBeTruthy();
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

  // Phase 40: closes the coverage gap noted since Phase 33 - TenantManager
  // is the one IndustryPicker consumer that reads the derived
  // workflow_mode/template_key fields (assisted provisioning sends those
  // directly, never industryKey, so hidden-industry enforcement in
  // registerCompanyRequestUseCase.js can't affect it - see Phase 39).
  it('derives workflowMode/templateKey from an Industry selection and sends no industryKey', async () => {
    const user = userEvent.setup();
    renderTenantManager();
    await screen.findByText('Assisted provisioning');

    await user.click(screen.getByRole('radio', { name: /Micro Food & Beverage/i }));
    await fillShared(user);
    await user.type(screen.getByPlaceholderText('Admin email'), 'ops@example.test');
    await user.type(screen.getByPlaceholderText('Admin phone'), '+639111111111');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'Company123!');
    await user.click(screen.getByRole('button', { name: 'Provision' }));

    await waitFor(() => expect(mocks.adminService.createAdminProvisionedTenant).toHaveBeenCalledWith({
      name: 'Assisted Foods',
      workflowMode: 'fnb',
      templateKey: 'fnb_counter_service',
      adminEmail: 'ops@example.test',
      adminPhone: '+639111111111',
      adminPassword: 'Company123!',
      reason: 'Merchant onboarding'
    }));
    const payload = mocks.adminService.createAdminProvisionedTenant.mock.calls[0][0];
    expect(payload).not.toHaveProperty('industryKey');
  });

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
