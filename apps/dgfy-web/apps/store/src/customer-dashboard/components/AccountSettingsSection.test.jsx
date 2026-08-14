// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeDgfyPassword } from '../../../../../../../packages/web-core/src/services/dgfyAuthService.js';
import { AccountSettingsSection } from './AccountSettingsSection.jsx';

vi.mock('../../../../../../../packages/web-core/src/services/dgfyAuthService.js', () => ({
  changeDgfyPassword: vi.fn()
}));

const theme = {
  surface: '#ffffff',
  border: '#e2e8f0',
  infoBg: '#eff6ff',
  primary: '#1a4e8d',
  success: '#16a34a',
  text: '#0f172a',
  muted: '#64748b',
  info: '#1d4ed8'
};

const profileVerification = { emailVerified: true, phoneVerified: true, idVerified: false, completed: 2, total: 3, percentage: 67, isFullyVerified: false };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AccountSettingsSection responsive composition', () => {
  it('uses the compact two-column desktop composition', () => {
    render(<AccountSettingsSection isMobileViewport={false} theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: { is_email_verified: true } }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    const columns = screen.getByTestId('customer-profile-verification-score').parentElement.parentElement;
    expect(columns.style.gridTemplateColumns).toBe('minmax(0, 1.6fr) minmax(290px, 0.9fr)');
    expect(screen.getByRole('region', { name: 'Upload Valid ID' })).toBeTruthy();
  });

  it('stacks account details and the ID panel on mobile', () => {
    render(<AccountSettingsSection isMobileViewport theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: {} }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    const columns = screen.getByTestId('customer-profile-verification-score').parentElement.parentElement;
    expect(columns.style.gridTemplateColumns).toBe('1fr');
    expect(screen.getByTestId('customer-account-details')).toBeTruthy();
  });

  it('uses the shared customer-dashboard typography scale across desktop and mobile', () => {
    render(<AccountSettingsSection isMobileViewport={false} theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: { is_email_verified: true } }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    expect(screen.getByRole('heading', { name: 'Account Settings' }).style.fontSize).toBe('26px');
    expect(screen.getByText('Manage your profile, security and account preferences.').style.fontSize).toBe('14px');
    expect(screen.queryByRole('heading', { name: 'Profile Overview' })).toBeNull();
    expect(screen.getByText('Henndry Sy').style.fontSize).toBe('24px');
    expect(screen.getByRole('heading', { name: 'Account Details' }).style.fontSize).toBe('16px');

    cleanup();
    render(<AccountSettingsSection isMobileViewport theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: { is_email_verified: true } }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    expect(screen.getByRole('heading', { name: 'Account Settings' }).style.fontSize).toBe('22px');
    expect(screen.queryByRole('heading', { name: 'Profile Overview' })).toBeNull();
    expect(screen.getByText('Henndry Sy').style.fontSize).toBe('16px');
    expect(screen.getByRole('heading', { name: 'Account Details' }).style.fontSize).toBe('15px');
  });

  it('opens the correct non-dismissable modal for each account change action', () => {
    const renderSection = () => render(<AccountSettingsSection isMobileViewport={false} theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: { is_email_verified: true, email: 'customer@example.com', phone: '+639123456789' } }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    for (const [actionName, modalTitle, mode] of [
      ['Change Email Address', 'Change Email', 'email'],
      ['Change Phone Number', 'Change Phone Number', 'phone'],
      ['Change Password Password', 'Change Password', 'password']
    ]) {
      renderSection();
      fireEvent.click(screen.getByRole('button', { name: actionName }));

      const modal = screen.getByTestId('account-settings-change-modal');
      expect(modal.getAttribute('data-modal-mode')).toBe(mode);
      expect(screen.getByRole('dialog', { name: modalTitle })).toBeTruthy();

      fireEvent.click(modal.querySelector('[aria-hidden="true"]'));
      expect(screen.getByTestId('account-settings-change-modal')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: `Close ${modalTitle}` }));
      expect(screen.queryByTestId('account-settings-change-modal')).toBeNull();
      cleanup();
    }
  });

  it('centers account change modals on mobile', () => {
    render(<AccountSettingsSection isMobileViewport theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: { is_email_verified: true, email: 'customer@example.com', phone: '+639123456789' } }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change Password Password' }));

    const modal = screen.getByTestId('account-settings-change-modal');
    expect(modal.style.alignItems).toBe('center');
    expect(screen.getByRole('dialog', { name: 'Change Password' })).toBeTruthy();
  });

  it('gives the longer mobile submit actions more room than Cancel', () => {
    render(<AccountSettingsSection isMobileViewport theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: { is_email_verified: true, email: 'customer@example.com', phone: '+639123456789' } }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change Phone Number' }));

    const modal = screen.getByTestId('account-settings-change-modal');
    const submitButton = screen.getByRole('button', { name: 'Verify & Update Phone' });
    const footer = submitButton.parentElement;
    expect(footer.style.gridTemplateColumns).toBe('minmax(0, 0.68fr) minmax(0, 1.32fr)');
    expect(submitButton.style.padding).toBe('0px 16px');
    expect(footer.querySelector('button[type="button"]').style.padding).toBe('0px 10px');
    expect(modal.style.alignItems).toBe('center');
  });

  it('uses the authenticated password-change endpoint for the password modal', async () => {
    changeDgfyPassword.mockResolvedValue({ success: true });
    render(<AccountSettingsSection isMobileViewport={false} theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: { is_email_verified: true, email: 'customer@example.com', phone: '+639123456789' } }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change Password Password' }));
    const modal = screen.getByTestId('account-settings-change-modal');
    fireEvent.change(modal.querySelector('input[placeholder="Enter your current password"]'), { target: { value: 'CurrentPass1!' } });
    fireEvent.change(modal.querySelector('input[placeholder="Enter new password"]'), { target: { value: 'NewPass2!' } });
    fireEvent.change(modal.querySelector('input[placeholder="Confirm new password"]'), { target: { value: 'NewPass2!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    await waitFor(() => expect(changeDgfyPassword).toHaveBeenCalledWith({
      current_password: 'CurrentPass1!',
      new_password: 'NewPass2!',
      confirm_password: 'NewPass2!'
    }));
    expect(screen.getByRole('status').textContent).toContain('Password updated successfully.');
  });

  it('opens the frontend-only Edit Profile modal with the requested fields and subtitle', () => {
    render(<AccountSettingsSection isMobileViewport={false} theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: {} }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));

    expect(screen.getByRole('dialog', { name: 'Edit Profile' })).toBeTruthy();
    expect(screen.getByText('Update your personal information and how businesses see you')).toBeTruthy();
    expect(screen.getByLabelText('Last Name').value).toBe('Sy');
    expect(screen.getByLabelText('Complete First Name').value).toBe('Henndry');
    expect(screen.getByLabelText('Middle Name (optional)').value).toBe('');
    expect(screen.getByLabelText('About You (optional)')).toBeTruthy();
  });

  it('does not close Edit Profile when the user clicks outside and supports session-only profile updates', async () => {
    render(<AccountSettingsSection isMobileViewport={false} theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: {} }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    const modal = screen.getByTestId('customer-profile-edit-modal');
    fireEvent.click(modal.querySelector('[aria-hidden="true"]'));
    expect(screen.getByRole('dialog', { name: 'Edit Profile' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Dela Cruz' } });
    fireEvent.change(screen.getByLabelText('Complete First Name'), { target: { value: 'New First' } });
    fireEvent.change(screen.getByLabelText('Middle Name (optional)'), { target: { value: 'Middle' } });
    fireEvent.change(screen.getByLabelText('About You (optional)'), { target: { value: 'A short customer profile.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.queryByTestId('customer-profile-edit-modal')).toBeNull());
    expect(screen.getByText('New First Middle Dela Cruz')).toBeTruthy();
  });

  it('accepts a profile photo without cropping it in the preview', async () => {
    render(<AccountSettingsSection isMobileViewport theme={theme} accountIdentityInitials="HS" accountIdentityName="Henndry Sy" accountPanel={{ me: {} }} overviewPhone="+639123456789" overviewEmail="customer@example.com" profileVerification={profileVerification} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    const file = new File(['profile-image'], 'profile.png', { type: 'image/png' });
    fireEvent.change(document.getElementById('customer-profile-photo'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByAltText('Profile preview')).toBeTruthy());
    expect(screen.getByTestId('customer-profile-edit-avatar').querySelector('img').style.objectFit).toBe('contain');
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByTestId('customer-account-profile-avatar').querySelector('img').style.objectFit).toBe('contain'));
  });
});
