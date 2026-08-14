// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalWorkspaceSidebar from '../components/TerminalWorkspaceSidebar.jsx';
import { isPosOnlineOrderQueueEnabled } from '../utils/posOperationalVisibility.js';

afterEach(() => {
  cleanup();
});

const renderSidebar = ({ showIncomingQueue, showServiceOperations = false } = {}) => render(
  <TerminalWorkspaceSidebar
    locked={false}
    isOnline
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

  it('preserves Orders for an eligible F&B or Counter cashier', () => {
    renderSidebar({ showIncomingQueue: true });

    expect(screen.getByText('Orders (1)')).toBeDefined();
    expect(screen.queryByTestId('pos-nav-services')).toBeNull();
  });
});
