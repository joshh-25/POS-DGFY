// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidIdPanel } from './ValidIdPanel.jsx';

const theme = {
  surface: '#ffffff',
  border: '#e2e8f0',
  infoBg: '#eff6ff',
  primary: '#1a4e8d',
  text: '#0f172a',
  muted: '#64748b'
};

const incompleteProfile = { emailVerified: true, phoneVerified: true, idVerified: false, completed: 2, total: 3, percentage: 67, isFullyVerified: false };

afterEach(() => cleanup());

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((file) => `blob:${file.name}`),
    revokeObjectURL: vi.fn()
  });
});

describe('ValidIdPanel', () => {
  it('renders the compact upload state responsively and transitions to a local pending preview', async () => {
    render(<ValidIdPanel isMobileViewport theme={theme} accountPanel={{ me: {} }} profileVerification={incompleteProfile} />);

    expect(screen.getByRole('region', { name: 'Upload Valid ID' })).toBeTruthy();
    expect(screen.getByLabelText('ID Type')).toBeTruthy();
    expect(screen.getByLabelText('Front of ID')).toBeTruthy();
    expect(screen.getByLabelText('Back of ID (optional)')).toBeTruthy();
    const uploadLabels = [screen.getByText('Front of ID'), screen.getByText('Back of ID (optional)')];
    expect(uploadLabels[0].nextElementSibling.style.height).toBe('124px');
    expect(uploadLabels[1].nextElementSibling.style.height).toBe('124px');
    expect(screen.getByTestId('customer-valid-id-panel').style.height).toBe('auto');
    expect(screen.getByTestId('customer-valid-id-panel').style.alignSelf).toBe('start');
    expect(screen.getByRole('region', { name: 'Upload Valid ID' }).querySelector('form').style.gap).toBe('12px');
    expect(screen.getByRole('button', { name: 'Cancel' }).style.width).toBe('100%');

    fireEvent.change(screen.getByLabelText('ID Type'), { target: { value: "Driver's License" } });
    fireEvent.change(screen.getByLabelText('Front of ID'), { target: { files: [new File(['front'], 'front.png', { type: 'image/png' })] } });
    fireEvent.change(screen.getByLabelText('Back of ID (optional)'), { target: { files: [new File(['back'], 'back.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload ID' }));

    expect(screen.getByTestId('account-action-status-modal').getAttribute('data-status')).toBe('pending');
    expect(screen.getByTestId('account-action-status-icon').style.animation).toContain('dgfyAccountStatusSpin');
    await waitFor(() => expect(screen.getByTestId('account-action-status-modal').getAttribute('data-status')).toBe('success'));
    expect(screen.getByTestId('account-action-status-icon').style.animation).toContain('dgfyAccountStatusCheck');
    fireEvent.click(screen.getByRole('button', { name: 'Close status' }));
    expect(screen.getByRole('region', { name: 'Valid ID details' })).toBeTruthy();
    expect(screen.getByText('Pending verification')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View back of valid ID' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'View back of valid ID' }));
    expect(screen.getByTestId('customer-valid-id-preview').style.transform).toBe('rotateY(180deg)');
    fireEvent.click(screen.getByRole('button', { name: 'View front of valid ID' }));
    expect(screen.getByTestId('customer-valid-id-preview').style.transform).toBe('rotateY(0deg)');
  });

  it('renders backend-approved valid ID details with the expected metadata', () => {
    render(
      <ValidIdPanel
        isMobileViewport={false}
        theme={theme}
        accountPanel={{ me: { valid_id: { status: 'verified', front_url: '/uploads/front.png', back_url: '/uploads/back.png', id_type: "Driver's License", uploaded_at: '2026-08-11T10:24:00Z', expires_at: '2030-01-01T00:00:00Z' } } }}
        profileVerification={{ ...incompleteProfile, idVerified: true, completed: 3, percentage: 100, isFullyVerified: true }}
      />
    );

    expect(screen.getByRole('region', { name: 'Valid ID details' })).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText("Driver's License")).toBeTruthy();
    expect(screen.getByText('Aug 11, 2026')).toBeTruthy();
    expect(screen.getByText('Jan 1, 2030')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View back of valid ID' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove ID' })).toBeTruthy();
  });

  it('keeps both desktop upload zones balanced at the taller height', () => {
    render(<ValidIdPanel isMobileViewport={false} theme={theme} accountPanel={{ me: {} }} profileVerification={incompleteProfile} />);

    const uploadLabels = [screen.getByText('Front of ID'), screen.getByText('Back of ID (optional)')];
    expect(uploadLabels[0].nextElementSibling.style.height).toBe('132px');
    expect(uploadLabels[1].nextElementSibling.style.height).toBe('132px');
    expect(screen.getByTestId('customer-valid-id-panel').style.height).toBe('auto');
    expect(screen.getByTestId('customer-valid-id-panel').style.alignSelf).toBe('start');
    expect(screen.getByRole('region', { name: 'Upload Valid ID' }).querySelector('form').style.gridTemplateColumns).toBe('');
    expect(screen.getByRole('button', { name: 'Cancel' }).style.width).toBe('112px');
    expect(screen.getByRole('button', { name: 'Upload ID' }).style.width).toBe('132px');
  });

  it('keeps upload fields side by side on desktop and stacks them on mobile', () => {
    const { unmount } = render(<ValidIdPanel isMobileViewport={false} theme={theme} accountPanel={{ me: {} }} profileVerification={incompleteProfile} />);
    const desktopUploadGrid = screen.getByText('Front of ID').parentElement.parentElement;
    expect(desktopUploadGrid.style.gridTemplateColumns).toBe('1fr 1fr');
    unmount();

    render(<ValidIdPanel isMobileViewport theme={theme} accountPanel={{ me: {} }} profileVerification={incompleteProfile} />);
    const mobileUploadGrid = screen.getByText('Front of ID').parentElement.parentElement;
    expect(mobileUploadGrid.style.gridTemplateColumns).toBe('1fr');
  });
});
