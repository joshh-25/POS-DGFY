/** @vitest-environment jsdom */

import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosProfileSettingsPane from '../../../../packages/web-core/src/features/pos/settings/PosProfileSettingsPane.jsx';

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn()
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
  posToast: toastMock
}));

const initialProfileForm = {
  username: 'Josh',
  email: 'josh@example.com',
  phoneNumber: '+639171112233'
};

function ProfileHarness({
  onSave = vi.fn().mockResolvedValue(true),
  onRequestEmailOtp = vi.fn().mockResolvedValue(true),
  onChangePassword = vi.fn().mockResolvedValue(true)
}) {
  const [profileForm, setProfileForm] = useState({ ...initialProfileForm });

  return (
    <PosProfileSettingsPane
      terminalUser={{ user_id: 7, username: 'Josh', email: initialProfileForm.email, is_master_admin: true }}
      companyInfo={null}
      profileForm={profileForm}
      setProfileForm={setProfileForm}
      profileEmailBaseline={initialProfileForm.email}
      locked={false}
      loading={false}
      savingTab=""
      onSave={onSave}
      onRequestEmailOtp={onRequestEmailOtp}
      onChangePassword={onChangePassword}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('POS profile email verification behavior', () => {
  it('saves phone-only edits without requesting or requiring an email OTP', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onRequestEmailOtp = vi.fn().mockResolvedValue(true);

    render(<ProfileHarness onSave={onSave} onRequestEmailOtp={onRequestEmailOtp} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '+639171114444' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ emailOtpCode: '' }));
    expect(onRequestEmailOtp).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Email verification code')).toBeNull();
  });

  it('requests a code and sends the entered six-digit OTP when the email changes', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onRequestEmailOtp = vi.fn().mockResolvedValue(true);

    render(<ProfileHarness onSave={onSave} onRequestEmailOtp={onRequestEmailOtp} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new.josh@example.com' } });

    const saveButton = screen.getByRole('button', { name: /save profile/i });
    expect(screen.getByRole('button', { name: /send code/i })).not.toBeNull();
    expect(saveButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    await waitFor(() => expect(onRequestEmailOtp).toHaveBeenCalledWith('new.josh@example.com'));

    fireEvent.change(screen.getByLabelText('Email verification code'), { target: { value: '123456' } });
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ emailOtpCode: '123456' }));
  });

  it('clears an OTP when the verified email target changes', async () => {
    const onRequestEmailOtp = vi.fn().mockResolvedValue(true);

    render(<ProfileHarness onRequestEmailOtp={onRequestEmailOtp} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new.josh@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    await waitFor(() => expect(onRequestEmailOtp).toHaveBeenCalledTimes(1));

    const otpInput = screen.getByLabelText('Email verification code');
    fireEvent.change(otpInput, { target: { value: '123456' } });
    expect(otpInput.value).toBe('123456');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'another.josh@example.com' } });
    expect(screen.getByLabelText('Email verification code').value).toBe('');
    expect(screen.getByRole('button', { name: /save profile/i }).disabled).toBe(true);
  });

  it('changes the password with the current password and matching confirmation', async () => {
    const onChangePassword = vi.fn().mockResolvedValue(true);

    render(<ProfileHarness onChangePassword={onChangePassword} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));

    await waitFor(() => expect(onChangePassword).toHaveBeenCalledWith({
      currentPassword: 'old-password',
      newPassword: 'new-password-123'
    }));
    expect(screen.queryByLabelText('Current password')).toBeNull();
  });

  it('does not submit a password when the confirmation does not match', async () => {
    const onChangePassword = vi.fn().mockResolvedValue(true);

    render(<ProfileHarness onChangePassword={onChangePassword} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('New password and confirmation do not match.'));
    expect(onChangePassword).not.toHaveBeenCalled();
  });
});
