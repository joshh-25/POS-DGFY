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

  it('accepts DGFY owner or assigned cashier credentials before terminal unlock', () => {
    render(<TerminalLockDrawer {...buildProps()} />);

    expect(screen.getByText('Terminal Login Required')).toBeTruthy();
    expect(screen.getByLabelText('DGFY or Cashier Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByText(/Assigned cashiers continue directly/i)).toBeTruthy();
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

  it('lets a multi-company cashier select a company directly in POS', () => {
    render(<TerminalLockDrawer {...buildProps({
      dgfyPosState: {
        authenticated: false,
        cashierCompanySelection: true,
        companies: [
          { company_token: 'token-masu', company_name: 'Masu Cafe' },
          { company_token: 'token-second', company_name: 'Second Company' }
        ]
      }
    })} />);

    expect(screen.getByLabelText('Company')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Masu Cafe' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Second Company' })).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByText(/cashier will open a shift/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to POS' }).disabled).toBe(true);
  });

  it('removes standalone cashier-password login and keeps dated legacy access', () => {
    render(<TerminalLockDrawer {...buildProps({
      onLegacySubmit: vi.fn()
    })} />);

    expect(screen.queryByRole('button', { name: 'Login as Cashier' })).toBeNull();
    expect(screen.getByText('Legacy access until June 17, 2027')).toBeTruthy();
  });

  it('offers a clean account switch after DGFY authentication', () => {
    const onUseDifferentAccount = vi.fn();
    render(<TerminalLockDrawer {...buildProps({
      dgfyPosState: { authenticated: true, companies: [] },
      onUseDifferentAccount
    })} />);

    screen.getByRole('button', { name: 'Use different account' }).click();
    expect(onUseDifferentAccount).toHaveBeenCalledOnce();
  });
});
