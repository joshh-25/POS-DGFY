// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TerminalWorkspaceSidebar from '../components/TerminalWorkspaceSidebar.jsx';

afterEach(() => {
  cleanup();
});

describe('POS Shift-owned branch directory entry', () => {
  it('removes the standalone switcher and keeps Location ownership inside Shift', () => {
    const onSelectViewMode = vi.fn();

    render(
      <TerminalWorkspaceSidebar
        isOnline
        canViewPos
        canSwitchPosLocation
        terminalUser={{ role: 'manager' }}
        shiftState={{ shift: { pos_terminal_shift_id: 101, location_id: 1 } }}
        locationsState={{ locations: [{ location_id: 1, name: 'Main Branch' }] }}
        operatingLocationId={1}
        onSelectViewMode={onSelectViewMode}
      />
    );

    expect(screen.queryByTestId('pos-location-switcher')).toBeNull();

    const shiftButton = screen.getByRole('button', { name: /^Shift/ });
    expect(shiftButton.textContent).toContain('Shift');

    fireEvent.click(shiftButton);
    expect(onSelectViewMode).toHaveBeenCalledWith('shift_controls');
  });
});
