/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';

vi.mock('../settings/PosSettingsWorkspace.jsx', () => ({
  default: ({ terminalUser }) => (
    <div data-testid="mock-settings-workspace">{terminalUser?.user_id || terminalUser?.id}</div>
  )
}));

const buildProps = (overrides = {}) => ({
  viewMode: 'settings_profile',
  terminalUser: null,
  locked: true,
  sectionIds: { terminalSetup: 'terminal-setup' },
  ...overrides
});

afterEach(cleanup);

describe('TerminalOperationsWorkspace authentication guard', () => {
  it('does not mount protected settings while the POS account is anonymous', () => {
    render(<TerminalOperationsWorkspace {...buildProps()} />);

    expect(screen.getByTestId('pos-settings-auth-required')).toBeTruthy();
    expect(screen.getByText('Sign in to continue')).toBeTruthy();
    expect(screen.queryByTestId('mock-settings-workspace')).toBeNull();
  });

  it('mounts settings after the POS account becomes authenticated', () => {
    const { rerender } = render(<TerminalOperationsWorkspace {...buildProps()} />);

    rerender(<TerminalOperationsWorkspace {...buildProps({
      terminalUser: { user_id: 42 }
    })} />);

    expect(screen.getByTestId('mock-settings-workspace').textContent).toBe('42');
    expect(screen.queryByTestId('pos-settings-auth-required')).toBeNull();
  });
});
