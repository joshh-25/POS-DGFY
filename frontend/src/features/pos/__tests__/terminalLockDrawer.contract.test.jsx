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
    dgfyTenantId: '',
    terminalId: ''
  },
  setFormData: vi.fn(),
  dgfyPosState: {
    authenticated: false,
    companies: []
  },
  terminalRegistry: [{ terminal_id: 'COUNTER-01', label: 'Front Counter', is_active: true, is_default: true }],
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

  it('shows terminal ID as required for shift and checkout in warn mode', () => {
    render(<TerminalLockDrawer {...buildProps()} />);

    expect(screen.getByLabelText('Email or Cashier Username')).toBeTruthy();
    expect(screen.getByLabelText('DGFY Password')).toBeTruthy();
    expect(screen.queryByText('Terminal ID')).toBeNull();
    expect(screen.getByText(/Sign in with your DGFY admin account first/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('shows company selection after DGFY authentication succeeds', () => {
    render(<TerminalLockDrawer {...buildProps({
      formData: {
        email: 'cashier@example.com',
        password: 'password123',
        dgfyTenantId: '',
        terminalId: ''
      },
      dgfyPosState: {
        authenticated: true,
        companies: [{ tenant_id: 'tenant-1', company_name: 'Front Counter Foods' }]
      }
    })} />);

    expect(screen.getByLabelText('Company')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Front Counter Foods' })).toBeTruthy();
    expect(screen.getByText(/Choose the company to continue/i)).toBeTruthy();
    expect(screen.getByText(/POS will continue to onboarding or terminal unlock based on company setup/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to POS' })).toBeTruthy();
  });

  it('keeps company selection disabled while companies are still loading', () => {
    render(<TerminalLockDrawer {...buildProps({
      formData: {
        email: 'cashier@example.com',
        password: 'password123',
        dgfyTenantId: '',
        terminalId: ''
      },
      dgfyPosState: {
        authenticated: true,
        companies: [],
        loadingCompanies: true
      }
    })} />);

    expect(screen.getByLabelText('Company').disabled).toBe(true);
    expect(screen.getByRole('option', { name: /Loading companies/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to POS' }).disabled).toBe(false);
  });
});
