/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserInvitationModal from '../UserInvitationModal.jsx';

const mocks = vi.hoisted(() => ({
  userService: {
    searchDgfyBusinessAccounts: vi.fn(),
    inviteDgfyAccountToCompany: vi.fn(),
    listActiveStaffRoles: vi.fn()
  },
  locationService: {
    listTenantLocations: vi.fn()
  },
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../../src/services/userService.js', () => mocks.userService);
vi.mock('../../../src/services/tenantLocationService.js', () => mocks.locationService);
vi.mock('sonner', () => ({ toast: mocks.toast }));

describe('UserInvitationModal DGFY-only invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locationService.listTenantLocations.mockResolvedValue([
      { location_id: 1, name: 'Main Branch', is_active: true },
      { location_id: 2, name: 'Pickup Counter', is_active: true }
    ]);
    mocks.userService.searchDgfyBusinessAccounts.mockResolvedValue({
      accounts: [
        {
          dgfy_account_id: 'dgfy-new',
          display_name: 'Ada Lovelace',
          email: 'ada@example.test',
          masked_phone: '+63******6789',
          account_status: 'active',
          already_connected: false
        },
        {
          dgfy_account_id: 'dgfy-linked',
          display_name: 'Grace Hopper',
          email: 'grace@example.test',
          masked_phone: '+63******1111',
          account_status: 'active',
          already_connected: true
        }
      ]
    });
    mocks.userService.inviteDgfyAccountToCompany.mockResolvedValue({ email_sent: true });
    mocks.userService.listActiveStaffRoles.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('searches registered DGFY accounts and blocks already-connected accounts', async () => {
    render(
      <UserInvitationModal
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('Invite DGFY Account')).toBeTruthy();
    expect(screen.getByText(/Invitations can only be sent to active users who already registered a DGFY account/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search registered DGFY account'), {
      target: { value: 'ada' }
    });

    await waitFor(() => expect(mocks.userService.searchDgfyBusinessAccounts).toHaveBeenCalledWith('ada'));
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Grace Hopper/i }).disabled).toBe(true);
  });

  it('keeps DGFY account search available when POS fixes the invitation role to cashier', async () => {
    render(
      <UserInvitationModal
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        fixedRole="cashier"
        canManageCustomStaffRoles
        title="Invite DGFY Cashier"
        submitLabel="Send Cashier Invitation"
      />
    );

    expect(screen.getByText('Invite DGFY Cashier')).toBeTruthy();
    expect(screen.getByText(/cashier authorization profile/)).toBeTruthy();
    expect(mocks.userService.listActiveStaffRoles).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Search registered DGFY account'), {
      target: { value: 'ada' }
    });

    fireEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/i }));
    fireEvent.click(await screen.findByLabelText('Main Branch'));
    fireEvent.click(screen.getByRole('button', { name: 'Send Cashier Invitation' }));

    await waitFor(() => expect(mocks.userService.inviteDgfyAccountToCompany).toHaveBeenCalledWith({
      dgfyAccountId: 'dgfy-new',
      role: 'cashier',
      rolePresetKey: null,
      locationIds: [1]
    }));
  });

  it('lists active custom staff roles and preserves account and locations while switching assigned roles', async () => {
    mocks.userService.listActiveStaffRoles.mockResolvedValue([
      { staff_role_id: 7, name: 'Warehouse', is_active: true },
      { staff_role_id: 8, name: 'Delivery', is_active: true },
      { staff_role_id: 9, name: 'Archived', is_active: false }
    ]);
    render(
      <UserInvitationModal
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        canManageCustomStaffRoles
        locationOptions={[
          { location_id: 1, name: 'Main Branch', is_active: true },
          { location_id: 2, name: 'Pickup Counter', is_active: true }
        ]}
      />
    );

    await waitFor(() => expect(mocks.userService.listActiveStaffRoles).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Search registered DGFY account'), { target: { value: 'ada' } });
    fireEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/i }));
    fireEvent.click(screen.getByLabelText('Role'));
    fireEvent.click(await screen.findByRole('option', { name: 'Warehouse' }));
    fireEvent.click(screen.getByLabelText('Main Branch'));
    fireEvent.click(screen.getByLabelText('Role'));
    fireEvent.click(await screen.findByRole('option', { name: 'Delivery' }));

    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Archived' })).toBeNull();
    expect(screen.getByLabelText('Main Branch').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Send DGFY Invitation' }));

    await waitFor(() => expect(mocks.userService.inviteDgfyAccountToCompany).toHaveBeenCalledWith({
      dgfyAccountId: 'dgfy-new',
      role: 'staff',
      rolePresetKey: null,
      staffRoleId: 8,
      locationIds: [1]
    }));
  });

  it('shows custom-role loading errors with a retry action', async () => {
    mocks.userService.listActiveStaffRoles
      .mockRejectedValueOnce({ response: { data: { message: 'Staff roles unavailable.' } } })
      .mockResolvedValueOnce([{ staff_role_id: 7, name: 'Warehouse', is_active: true }]);
    render(
      <UserInvitationModal
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        canManageCustomStaffRoles
      />
    );

    expect(await screen.findByText('Staff roles unavailable.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Staff roles unavailable.')).toBeNull());
    fireEvent.click(screen.getByLabelText('Role'));
    expect(await screen.findByRole('option', { name: 'Warehouse' })).toBeTruthy();
  });

  it('uses provided company locations instead of refetching ambient tenant locations', async () => {
    render(
      <UserInvitationModal
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        fixedRole="cashier"
        title="Invite DGFY Cashier"
        submitLabel="Send Cashier Invitation"
        locationOptions={[
          { location_id: 41, name: 'Selected Company Branch', is_active: true },
          { location_id: 42, name: 'Selected Company Counter', is_active: true }
        ]}
      />
    );

    expect(mocks.locationService.listTenantLocations).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Selected Company Branch')).toBeTruthy();
    expect(screen.getByLabelText('Selected Company Counter')).toBeTruthy();
    expect(screen.queryByLabelText('Main Branch')).toBeNull();
  });

  it('requires a selected registered DGFY account before submit', async () => {
    render(
      <UserInvitationModal
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send DGFY Invitation' }));

    expect(mocks.userService.inviteDgfyAccountToCompany).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith('Select a registered DGFY account to invite');
  });

  it('shows DGFY search rate-limit copy without claiming no account exists', async () => {
    mocks.userService.searchDgfyBusinessAccounts.mockRejectedValue({
      response: {
        status: 429,
        headers: { 'retry-after': '75' },
        data: {
          message: 'Too many DGFY account searches. Wait a moment, then try again.',
          retryAfterSeconds: 75
        }
      }
    });

    render(
      <UserInvitationModal
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Search registered DGFY account'), {
      target: { value: 'ada@example.test' }
    });

    expect(await screen.findByText(/Too many DGFY account searches/)).toBeTruthy();
    expect(screen.getByText(/Try again in about 2 minutes/)).toBeTruthy();
    expect(screen.queryByText('No registered active DGFY account found for this search.')).toBeNull();
  });

  it('reports that successful invitations are visible by email and DGFY My Account Business', async () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    render(
      <UserInvitationModal
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText('Search registered DGFY account'), {
      target: { value: 'ada' }
    });

    const adaButton = await screen.findByRole('button', { name: /Ada Lovelace/i });
    fireEvent.click(adaButton);
    fireEvent.click(await screen.findByLabelText('Main Branch'));
    fireEvent.click(screen.getByRole('button', { name: 'Send DGFY Invitation' }));

    await waitFor(() => expect(mocks.userService.inviteDgfyAccountToCompany).toHaveBeenCalledWith(expect.objectContaining({
      dgfyAccountId: 'dgfy-new'
    })));
    expect(mocks.toast.success).toHaveBeenCalledWith(
      'Invitation sent by email to ada@example.test and visible in DGFY My Account > Business.'
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('reports Business visibility when email delivery fails or is not configured', async () => {
    mocks.userService.inviteDgfyAccountToCompany.mockResolvedValue({
      email_sent: false,
      delivery_error: 'SMTP unavailable'
    });

    render(
      <UserInvitationModal
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Search registered DGFY account'), {
      target: { value: 'ada' }
    });

    fireEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/i }));
    fireEvent.click(await screen.findByLabelText('Main Branch'));
    fireEvent.click(screen.getByRole('button', { name: 'Send DGFY Invitation' }));

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(
      'Invitation is visible in DGFY My Account > Business; email delivery failed or is not configured (SMTP unavailable).'
    ));
  });
});
