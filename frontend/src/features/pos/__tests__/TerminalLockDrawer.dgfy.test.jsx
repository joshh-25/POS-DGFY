/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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
    expect(screen.getByLabelText('Email or Cashier Username')).toBeTruthy();
    expect(screen.getByLabelText('DGFY Password')).toBeTruthy();
    expect(screen.queryByLabelText('Company')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByText('Legacy access until June 17, 2027')).toBeTruthy();
  });

  it('shows accessible companies after DGFY auth', () => {
    const setFormData = vi.fn();

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
        onLegacySubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Company').disabled).toBe(false);
    expect(screen.getByRole('option', { name: 'Counter Foods' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to POS' })).toBeTruthy();
  });
});
