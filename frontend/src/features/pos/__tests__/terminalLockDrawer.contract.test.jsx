/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TerminalLockDrawer from '../components/TerminalLockDrawer.jsx';

const buildProps = (overrides = {}) => ({
  drawerOpen: true,
  formData: {
    email: 'cashier@example.com',
    password: '',
    terminalId: ''
  },
  setFormData: vi.fn(),
  dgfyPosState: {
    authenticated: false,
    companies: []
  },
  submitting: false,
  onSubmit: vi.fn(),
  ...overrides
});

afterEach(() => {
  cleanup();
});

describe('TerminalLockDrawer contract', () => {
  it('does not render company token input in terminal lock drawer', () => {
    render(<TerminalLockDrawer {...buildProps()} />);

    expect(screen.queryByText(/Company Token/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/Auto-lookup runs when left blank/i)).toBeNull();
  });

  it('shows DGFY-first terminal login before company and terminal unlock', () => {
    render(<TerminalLockDrawer {...buildProps()} />);

    expect(screen.getByText('Terminal Login Required')).toBeTruthy();
    expect(screen.getByLabelText('Email or Cashier Username')).toBeTruthy();
    expect(screen.getByLabelText('DGFY Password')).toBeTruthy();
    expect(screen.getByText(/Company selection and terminal unlock appear after login succeeds/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText(/Terminal ID/i)).toBeNull();
  });

  it('requires company selection after DGFY authentication returns companies', () => {
    render(<TerminalLockDrawer {...buildProps({
      dgfyPosState: {
        authenticated: true,
        companies: [{ tenant_id: 'tenant-1', company_name: 'Main Company' }]
      }
    })} />);

    expect(screen.getByLabelText('Company')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Select accessible company' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Main Company' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to POS' }).disabled).toBe(true);
  });

  it('keeps cashier and legacy access as secondary DGFY-era paths', () => {
    render(<TerminalLockDrawer {...buildProps({
      onCashierSubmit: vi.fn(),
      onLegacySubmit: vi.fn()
    })} />);

    expect(screen.getByRole('button', { name: 'Login as Cashier' })).toBeTruthy();
    expect(screen.getByText('Legacy access until June 17, 2027')).toBeTruthy();
  });
});
