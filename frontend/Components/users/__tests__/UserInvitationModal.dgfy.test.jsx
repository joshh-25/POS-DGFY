/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserInvitationModal from '../UserInvitationModal.jsx';

const mocks = vi.hoisted(() => ({
  userService: {
    searchDgfyBusinessAccounts: vi.fn(),
    inviteDgfyAccountToCompany: vi.fn()
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
});
