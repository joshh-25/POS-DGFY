/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalLockDrawer from '../components/TerminalLockDrawer.jsx';

const baseFormData = {
  email: '',
  password: '',
  rememberDevice: false,
  dgfyTenantId: '',
  terminalId: ''
};

describe('TerminalLockDrawer DGFY access UI', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders DGFY-first unlock with disabled company selection until DGFY auth', () => {
    const setFormData = vi.fn();

    render(
      <TerminalLockDrawer
        drawerOpen
        formData={baseFormData}
        setFormData={setFormData}
        dgfyPosState={{ authenticated: false, companies: [] }}
        submitting={false}
        onSubmit={vi.fn()}
        onLegacySubmit={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Terminal Login Required' })).toBeTruthy();
    expect(screen.getByLabelText('DGFY or Cashier Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy();
    expect(screen.getByLabelText(/Remember this device for 30 days/i)).toBeTruthy();
    expect(screen.queryByLabelText('Company')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByText('Legacy access until June 17, 2027')).toBeTruthy();
  });

  it('toggles password visibility and opts in to a remembered device', () => {
    const setFormData = vi.fn();

    render(
      <TerminalLockDrawer
        drawerOpen
        formData={{ ...baseFormData, password: 'password123' }}
        setFormData={setFormData}
        dgfyPosState={{ authenticated: false, companies: [] }}
        submitting={false}
        onSubmit={vi.fn()}
        onLegacySubmit={vi.fn()}
      />
    );

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Remember this device for 30 days/i));
    const updateFormData = setFormData.mock.calls.at(-1)?.[0];
    expect(updateFormData(baseFormData)).toEqual({
      ...baseFormData,
      rememberDevice: true
    });
  });

  it('shows accessible companies after DGFY auth', () => {
    const setFormData = vi.fn();
    const onDayCloseSubmit = vi.fn();

    render(
      <TerminalLockDrawer
        drawerOpen
        formData={{
          ...baseFormData,
          email: 'cashier@example.test',
          password: 'password123',
          dgfyTenantId: 'tenant-1',
          terminalId: 'COUNTER-01'
        }}
        setFormData={setFormData}
        dgfyPosState={{
          authenticated: true,
          companies: [{ tenant_id: 'tenant-1', company_name: 'Counter Foods' }]
        }}
        submitting={false}
        onSubmit={vi.fn()}
        onDayCloseSubmit={onDayCloseSubmit}
        onLegacySubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Company').disabled).toBe(false);
    expect(screen.getByRole('option', { name: 'Counter Foods' })).toBeTruthy();
    expect(screen.getByText(/Choose the company to continue/i)).toBeTruthy();
    expect(screen.getByText(/onboarding or terminal unlock based on company setup/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to POS' })).toBeTruthy();
    expect(screen.getByText(/will not open a cashier shift or unlock selling/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Day Close / Z-reading' }));
    expect(onDayCloseSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not render a duplicate inline sign-in failure block', () => {
    render(
      <TerminalLockDrawer
        drawerOpen
        formData={{ ...baseFormData, email: 'admin@test.com', password: 'wrong-password' }}
        setFormData={vi.fn()}
        dgfyPosState={{ authenticated: false, companies: [] }}
        unlockFailure={{ message: 'Invalid email or password.', status: 401, ref: 'POS-TEST-401' }}
        submitting={false}
        onSubmit={vi.fn()}
        onLegacySubmit={vi.fn()}
      />
    );

    expect(screen.queryByTestId('pos-terminal-login-error')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'DGFY or Cashier Email' })).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
});
