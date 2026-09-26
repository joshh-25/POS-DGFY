// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalWorkspaceSidebar from '../components/TerminalWorkspaceSidebar.jsx';
import { isPosOnlineOrderQueueEnabled } from '../utils/posOperationalVisibility.js';

afterEach(() => {
  cleanup();
});

const renderSidebar = ({ showIncomingQueue, showServiceOperations = false, isMsmeMode = false } = {}) => render(
  <TerminalWorkspaceSidebar
    locked={false}
    isOnline
    isMsmeMode={isMsmeMode}
    terminalUser={{ role: 'cashier' }}
    currentViewMode="checkout"
    canViewPos
    showServiceOperations={showServiceOperations}
    showIncomingQueue={showIncomingQueue}
    canAccessServiceOperations
    shiftState={{ shift: { pos_terminal_shift_id: 12, location_id: 3 } }}
    incomingOrdersState={{ orders: [{ pos_transaction_id: 91 }] }}
    onSelectViewMode={vi.fn()}
  />
);

describe('Services online Orders queue isolation', () => {
  it('disables the retail/F&B online queue for Services even with a stale true profile default', () => {
    expect(isPosOnlineOrderQueueEnabled({
      workflowMode: 'services',
      posDefaults: { show_online_queue: true }
    })).toBe(false);
  });

  it('keeps the queue available for eligible non-Services modes unless their profile disables it', () => {
    expect(isPosOnlineOrderQueueEnabled({
      workflowMode: 'fnb',
      posDefaults: { show_online_queue: true }
    })).toBe(true);
    expect(isPosOnlineOrderQueueEnabled({
      workflowMode: 'retail',
      posDefaults: { show_online_queue: false }
    })).toBe(false);
  });

  it('renders Services without Orders in the cashier sidebar', () => {
    renderSidebar({ showIncomingQueue: false, showServiceOperations: true });

    expect(screen.getByTestId('pos-nav-services')).toBeDefined();
    expect(screen.queryByText('Orders (1)')).toBeNull();
  });

  it('preserves Orders for an eligible F&B, Counter, or MSME cashier', () => {
    renderSidebar({ showIncomingQueue: true });

    expect(screen.getByText('Orders (1)')).toBeDefined();
    expect(screen.queryByTestId('pos-nav-services')).toBeNull();
  });

  it('renders Orders for an MSME cashier when the queue capability is enabled', () => {
    renderSidebar({ showIncomingQueue: true, isMsmeMode: true });

    expect(screen.getByText('Orders (1)')).toBeDefined();
  });

  it('enables read-only branch Orders for an authorized admin without a shift', () => {
    const onSelectViewMode = vi.fn();
    render(
      <TerminalWorkspaceSidebar
        locked={false}
        isOnline
        terminalUser={{ role: 'admin', company: { id: 'tenant-a' } }}
        currentViewMode="checkout"
        canViewPos
        allowAdminNavigationWithoutShift
        canViewAdminLocationMonitor
        shiftState={{ shift: null }}
        incomingOrdersState={{ orders: [] }}
        adminLocationMonitorState={{ locationId: 2, orders: [{ pos_transaction_id: 92 }] }}
        locationsState={{ locations: [{ location_id: 1, name: 'Main Branch' }, { location_id: 2, name: 'East Branch' }] }}
        operatingLocationId={1}
        viewingLocationId={2}
        onSelectViewMode={onSelectViewMode}
      />
    );

    const ordersButton = screen.getByRole('button', { name: /Orders \(1\)/ });
    expect(ordersButton.disabled).toBe(false);
    expect(screen.getByText('Viewing branch: East Branch')).toBeDefined();
    expect(screen.getByText('Register branch: Main Branch')).toBeDefined();
    ordersButton.click();
    expect(onSelectViewMode).toHaveBeenCalledWith('incoming_queue');
  });

  it('keeps Orders shift-gated for a cashier even when no-shift admin navigation is enabled', () => {
    render(
      <TerminalWorkspaceSidebar
        locked={false}
        isOnline
        terminalUser={{ role: 'cashier' }}
        currentViewMode="checkout"
        canViewPos
        allowAdminNavigationWithoutShift
        canViewAdminLocationMonitor={false}
        shiftState={{ shift: null }}
        incomingOrdersState={{ orders: [] }}
        onSelectViewMode={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Orders \(0\)/ }).disabled).toBe(true);
  });
});
