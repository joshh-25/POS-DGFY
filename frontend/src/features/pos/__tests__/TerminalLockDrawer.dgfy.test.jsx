/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalLockDrawer from '../components/TerminalLockDrawer.jsx';

const baseFormData = {
  email: '',
  password: '',
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
    expect(screen.getByText('DGFY POS unlock')).toBeTruthy();
    expect(screen.getByText(/Company access is checked against accepted DGFY memberships/)).toBeTruthy();
    expect(screen.getByLabelText('DGFY Email')).toBeTruthy();
    expect(screen.getByLabelText('DGFY Password')).toBeTruthy();
    expect(screen.getByLabelText('Company').disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Sign in and Unlock POS' })).toBeTruthy();
    expect(screen.getByText('Legacy access until June 17, 2027')).toBeTruthy();
  });

  it('shows accessible companies and registry-enforced terminal choices after DGFY auth', () => {
    const setFormData = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());

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
        terminalRegistry={[
          { terminal_id: 'COUNTER-01', label: 'Main Counter', is_active: true },
          { terminal_id: 'DISABLED-01', label: 'Disabled', is_active: false }
        ]}
        registryEnforced
        terminalRegistryMode="enforce"
        submitting={false}
        onSubmit={onSubmit}
        onLegacySubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Company').disabled).toBe(false);
    expect(screen.getByRole('option', { name: 'Counter Foods' })).toBeTruthy();
    expect(screen.getByLabelText('Terminal ID (Required)')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Main Counter (COUNTER-01)' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Disabled/ })).toBeNull();
    expect(screen.getByText(/Required in enforce mode/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Unlock POS' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
