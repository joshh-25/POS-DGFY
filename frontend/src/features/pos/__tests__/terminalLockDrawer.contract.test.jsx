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
  terminalIdOptions: ['COUNTER-01'],
  terminalRegistry: [{ terminal_id: 'COUNTER-01', label: 'Front Counter', is_active: true, is_default: true }],
  terminalRegistryMode: 'warn',
  registryEnforced: false,
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

  it('shows terminal ID as optional in warn mode', () => {
    render(<TerminalLockDrawer {...buildProps({ registryEnforced: false, terminalRegistryMode: 'warn' })} />);

    expect(screen.getByText('Terminal ID (Optional)')).toBeTruthy();
    expect(screen.getByText(/Warn mode: terminal ID is optional at unlock/i)).toBeTruthy();
  });

  it('shows terminal ID as required select in enforce mode', () => {
    render(<TerminalLockDrawer {...buildProps({ registryEnforced: true, terminalRegistryMode: 'enforce' })} />);

    expect(screen.getByText('Terminal ID (Required)')).toBeTruthy();
    expect(screen.getByRole('option', { name: /Select configured terminal/i })).toBeTruthy();
    expect(screen.getByText(/Required in enforce mode/i)).toBeTruthy();
  });
});

