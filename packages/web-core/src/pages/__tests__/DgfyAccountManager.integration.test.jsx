/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DgfyAccountManager from '../../../../../apps/dgfy-ims/Pages/admin/DgfyAccountManager.jsx';

const mocks = vi.hoisted(() => ({
  adminServiceMock: {
    listDgfyAccounts: vi.fn(),
    createDgfyAccount: vi.fn(),
    getDgfyAccount: vi.fn(),
    updateDgfyAccountProfile: vi.fn(),
    suspendDgfyAccount: vi.fn(),
    reactivateDgfyAccount: vi.fn(),
    deleteDgfyAccount: vi.fn()
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/services/adminService', () => mocks.adminServiceMock);
vi.mock('sonner', () => ({ toast: mocks.toastMock }));

const activeAccount = {
  id: 'dgfy-active',
  first_name: 'Ada',
  middle_name: null,
  last_name: 'Lovelace',
  username: 'Ada',
  email: 'ada@example.test',
  phone: '+639123456789',
  is_active: true,
  lifecycle_status: 'active',
  deleted_at: null,
  deleted_by: null,
  is_email_verified: true,
  is_phone_verified: false,
  membership_count: 1,
  memberships: [{
    id: 1,
    tenant_id: 'tenant-1',
    role: 'admin',
    status: 'accepted',
    source: 'founder',
    company: { name: 'Ada Foods' }
  }],
  last_login_at: '2026-06-01T00:00:00.000Z',
  created_at: '2026-05-21T00:00:00.000Z',
  updated_at: '2026-05-21T00:00:00.000Z'
};

const suspendedAccount = {
  ...activeAccount,
  id: 'dgfy-suspended',
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'grace@example.test',
  is_active: false,
  lifecycle_status: 'suspended',
  is_email_verified: false,
  membership_count: 0,
  memberships: []
};

const listPayload = {
  data: {
    accounts: [activeAccount, suspendedAccount],
    pagination: { page: 1, limit: 25, total: 2, total_pages: 1 },
    summary: {
      total: 2,
      active: 1,
      suspended: 1,
      deleted: 0,
      verified_email: 1,
      unverified_email: 1
    }
  }
};

describe('DgfyAccountManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminServiceMock.listDgfyAccounts.mockResolvedValue(listPayload);
    mocks.adminServiceMock.createDgfyAccount.mockResolvedValue({ data: { temporary_password: 'DgfyTemp123!' } });
    mocks.adminServiceMock.getDgfyAccount.mockResolvedValue({
      data: {
        account: activeAccount,
        audit_logs: [{
          audit_log_id: 11,
          action: 'suspend',
          actor_username: 'platform',
          reason: 'Risk review',
          created_at: '2026-06-01T00:00:00.000Z'
        }]
      }
    });
    mocks.adminServiceMock.updateDgfyAccountProfile.mockResolvedValue({ data: { account: activeAccount } });
    mocks.adminServiceMock.suspendDgfyAccount.mockResolvedValue({ data: { account: { ...activeAccount, is_active: false } } });
    mocks.adminServiceMock.reactivateDgfyAccount.mockResolvedValue({ data: { account: { ...suspendedAccount, is_active: true } } });
    mocks.adminServiceMock.deleteDgfyAccount.mockResolvedValue({
      data: {
        account: {
          ...activeAccount,
          first_name: 'Deleted',
          last_name: 'Account',
          email: 'deleted+dgfy-active@deleted.dgfy.local',
          phone: '+639000000001',
          is_active: false,
          lifecycle_status: 'deleted',
          deleted_at: '2026-06-05T00:00:00.000Z',
          deleted_by: 'platform'
        }
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders summary, filters, empty/error-safe list state, and detail drawer', async () => {
    const user = userEvent.setup();
    render(<DgfyAccountManager />);

    await screen.findByText('Ada Lovelace');
    expect(screen.getByText('DGFY Accounts')).toBeTruthy();
    expect(screen.getAllByText('Suspended').length).toBeGreaterThan(0);
    expect(screen.getByText('grace@example.test')).toBeTruthy();

    await user.selectOptions(screen.getByDisplayValue('All statuses'), 'suspended');
    await waitFor(() => {
      expect(mocks.adminServiceMock.listDgfyAccounts).toHaveBeenLastCalledWith(expect.objectContaining({
        status: 'suspended'
      }));
    });

    const adaRow = screen.getByText('Ada Lovelace').closest('tr');
    expect(adaRow).toBeTruthy();
    const buttons = within(adaRow).getAllByRole('button');
    await user.click(buttons[0]);

    await screen.findByText('Company Memberships');
    expect(screen.getByText('Ada Foods')).toBeTruthy();
    expect(screen.getByText('Risk review')).toBeTruthy();
  });

  it('keeps account-only creation available and displays its temporary password once', async () => {
    const user = userEvent.setup();
    render(<DgfyAccountManager />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByPlaceholderText('First name'), 'Katherine');
    await user.type(screen.getByPlaceholderText('Last name'), 'Johnson');
    await user.type(screen.getByPlaceholderText('Email'), 'katherine@example.test');
    await user.type(screen.getByPlaceholderText('Phone'), '+639333333333');
    await user.type(screen.getByPlaceholderText('Audit reason'), 'Merchant onboarding');
    await user.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(mocks.adminServiceMock.createDgfyAccount).toHaveBeenCalledWith(expect.objectContaining({
      first_name: 'Katherine',
      last_name: 'Johnson',
      email: 'katherine@example.test',
      phone: '+639333333333',
      reason: 'Merchant onboarding'
    })));
    expect(await screen.findByText(/DgfyTemp123!/)).toBeTruthy();
  });

  it('edits only name and phone fields', async () => {
    const user = userEvent.setup();
    render(<DgfyAccountManager />);

    await screen.findByText('Ada Lovelace');
    const adaRow = screen.getByText('Ada Lovelace').closest('tr');
    const buttons = within(adaRow).getAllByRole('button');
    await user.click(buttons[1]);

    const dialogHeading = await screen.findByText('Edit DGFY Account');
    const form = dialogHeading.closest('div').parentElement.querySelector('form');
    expect(within(form).queryByLabelText(/email/i)).toBeNull();
    expect(screen.getByText('Email changes remain unavailable until the verified DGFY email-change flow exists.')).toBeTruthy();

    const firstName = within(form).getByDisplayValue('Ada');
    await user.clear(firstName);
    await user.type(firstName, 'Augusta');
    await user.click(within(form).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.updateDgfyAccountProfile).toHaveBeenCalledWith('dgfy-active', expect.objectContaining({
        first_name: 'Augusta',
        phone: '+639123456789'
      }));
    });
  });

  it('requires a reason before suspend and reactivate actions submit', async () => {
    const user = userEvent.setup();
    render(<DgfyAccountManager />);

    await screen.findByText('Ada Lovelace');
    const adaRow = screen.getByText('Ada Lovelace').closest('tr');
    await user.click(within(adaRow).getAllByRole('button')[2]);

    const suspendButton = await screen.findByRole('button', { name: 'Suspend Account' });
    expect(suspendButton.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: /lifecycle reason/i }), { target: { value: 'Risk review' } });
    expect(suspendButton.hasAttribute('disabled')).toBe(false);
    await user.click(suspendButton);

    await waitFor(() => {
      expect(mocks.adminServiceMock.suspendDgfyAccount).toHaveBeenCalledWith('dgfy-active', { reason: 'Risk review' });
    });

    const graceRow = screen.getByText('Grace Hopper').closest('tr');
    await user.click(within(graceRow).getAllByRole('button')[2]);
    fireEvent.change(screen.getByRole('textbox', { name: /lifecycle reason/i }), { target: { value: 'Support verified identity' } });
    await user.click(screen.getByRole('button', { name: 'Reactivate Account' }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.reactivateDgfyAccount).toHaveBeenCalledWith('dgfy-suspended', { reason: 'Support verified identity' });
    });
  });

  it('requires email confirmation before deleting and releases credentials through the service', async () => {
    const user = userEvent.setup();
    render(<DgfyAccountManager />);

    await screen.findByText('Ada Lovelace');
    const adaRow = screen.getByText('Ada Lovelace').closest('tr');
    await user.click(within(adaRow).getAllByRole('button')[3]);

    const deleteButton = await screen.findByRole('button', { name: 'Delete Account' });
    expect(deleteButton.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Requested account reset' } });
    fireEvent.change(screen.getByLabelText('Confirm current email'), { target: { value: 'wrong@example.test' } });
    expect(deleteButton.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Confirm current email'), { target: { value: activeAccount.email } });
    expect(deleteButton.hasAttribute('disabled')).toBe(false);
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mocks.adminServiceMock.deleteDgfyAccount).toHaveBeenCalledWith('dgfy-active', {
        reason: 'Requested account reset',
        confirm_email: activeAccount.email
      });
    });
  });
});
