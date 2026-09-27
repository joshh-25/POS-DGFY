// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TerminalWorkspaceSidebar from '../components/TerminalWorkspaceSidebar.jsx';

afterEach(() => {
  cleanup();
});

describe('POS global location switch entry', () => {
  it('routes the sidebar switcher through the governed Shift controls flow', () => {
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

    const switcher = screen.getByTestId('pos-location-switcher');
    expect(switcher.textContent).toContain('Switch Location');
    expect(switcher.textContent).toContain('Operating location: Main Branch');

    fireEvent.click(switcher);
    expect(onSelectViewMode).toHaveBeenCalledWith('shift_controls');
  });
});
