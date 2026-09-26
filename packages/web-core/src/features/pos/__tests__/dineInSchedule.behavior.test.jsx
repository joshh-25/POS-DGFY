/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingQueueWorkspace } from '../components/TerminalOperationsPanels.jsx';
import { fetchDeliveryRun, fetchDeliveryRuns } from '../services/deliveryRunService.js';

vi.mock('../services/deliveryRunService.js', () => ({
  fetchDeliveryRuns: vi.fn(),
  fetchDeliveryRun: vi.fn(),
  createDeliveryRun: vi.fn(),
  updateDeliveryRun: vi.fn(),
  setDeliveryRunPersonnel: vi.fn(),
  addDeliveryRunMembers: vi.fn(),
  removeDeliveryRunMember: vi.fn(),
  dispatchDeliveryRun: vi.fn(),
  updateDeliveryRunMemberLoading: vi.fn(),
  confirmDeliveryRunLoading: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}));

const buildOrder = (overrides = {}) => ({
  pos_transaction_id: 9101,
  invoice_number: 'INV-9101',
  customer_name: 'Scheduled Guest',
  order_method: 'dine_in',
  location_id: 10,
  fulfillment_status: 'confirmed',
  payment_type: 'gcash',
  payment_status: 'paid',
  scheduled_for: '2099-09-23T12:00:00.000Z',
  created_at: '2026-09-23T08:00:00.000Z',
  lines: [],
  ...overrides
});

const baseProps = (overrides = {}) => ({
  canViewPos: true,
  canTransactPos: true,
  shiftState: { shift: { pos_terminal_shift_id: 1, location_id: 10 } },
  incomingOrdersState: { orders: [buildOrder()], accessState: 'allowed', errorMessage: '' },
  orderHistoryState: { orders: [], pagination: { total: 0 }, accessState: 'idle', errorMessage: '' },
  incomingOrderActionState: {},
  handleIncomingOrderStatusChange: vi.fn(),
  handleDeliveryJobStatusChange: vi.fn(),
  handleAssignDeliveryPersonnel: vi.fn(),
  handleUpdateOnlineOrderDeliveryAddress: vi.fn(),
  deliveryPersonnelState: { loading: false, loaded: true, personnel: [], accessState: 'allowed', errorMessage: '' },
  handleOpenCashCollection: vi.fn(),
  handleOpenBalanceSettlement: vi.fn(),
  handleViewBalancePaymentProof: vi.fn(),
  handleOpenIncomingOrderReceipt: vi.fn(),
  incomingReceiptOpeningId: null,
  refreshIncomingOrders: vi.fn(),
  refreshOrderHistory: vi.fn(),
  locationsState: { locations: [{ location_id: 10, name: 'Masu Cafe' }] },
  queueLocationScopeId: 10,
  locked: false,
  isOnline: true,
  sectionId: 'incoming-orders',
  workflowMode: 'fnb',
  ensureDeliveryPersonnelLoaded: vi.fn(),
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  fetchDeliveryRuns.mockResolvedValue({ items: [], pagination: { total: 0, page: 1, limit: 100 } });
  fetchDeliveryRun.mockResolvedValue(null);
});

describe('Dine-in Schedule tab', () => {
  it('removes every dine-in order from Active Queue and shows scheduled plus immediate service in the schedule', () => {
    const scheduled = buildOrder();
    const immediate = buildOrder({
      pos_transaction_id: 9103,
      customer_name: 'Immediate Guest',
      scheduled_for: null
    });
    const pickup = buildOrder({
      pos_transaction_id: 9102,
      customer_name: 'Pickup Guest',
      order_method: 'pickup',
      scheduled_for: null
    });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [scheduled, immediate, pickup], accessState: 'allowed', errorMessage: '' }
    })} />);

    const activeTab = screen.getByRole('tab', { name: /Active Queue/i });
    expect(activeTab.textContent).toContain('1');
    expect(screen.queryByText('Scheduled Guest')).toBeNull();
    expect(screen.queryByText('Immediate Guest')).toBeNull();
    expect(screen.getAllByText('Pickup Guest').length).toBeGreaterThan(0);

    const scheduleTab = screen.getByRole('tab', { name: /Dine-in Schedule/i });
    expect(scheduleTab.textContent).toContain('2');
    fireEvent.click(scheduleTab);

    expect(screen.getAllByText('Scheduled Guest').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Immediate Guest').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pickup Guest')).toBeNull();
    expect(screen.getByText('Serve By')).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getAllByText('Immediate service').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/In \d{2,}h \d{2}m \d{2}s/).length).toBeGreaterThan(0);
  });

  it('does not render the schedule tab outside F&B mode', () => {
    render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'retail' })} />);

    expect(screen.queryByRole('tab', { name: /Dine-in Schedule/i })).toBeNull();
  });

  it('shows and filters the schedule tab in the read-only admin branch monitor', () => {
    const scheduled = buildOrder();
    const immediate = buildOrder({
      pos_transaction_id: 9103,
      customer_name: 'Immediate Guest',
      scheduled_for: null
    });
    const pickup = buildOrder({
      pos_transaction_id: 9102,
      customer_name: 'Pickup Guest',
      order_method: 'pickup',
      scheduled_for: null
    });

    render(<IncomingQueueWorkspace {...baseProps({
      shiftState: { shift: null },
      canViewAdminLocationMonitor: true,
      viewingLocationId: 10,
      adminLocationMonitorState: {
        loading: false,
        locationId: 10,
        orders: [scheduled, immediate, pickup],
        errorMessage: ''
      }
    })} />);

    const scheduleTab = screen.getByRole('tab', { name: /Dine-in Schedule/i });
    expect(scheduleTab.textContent).toContain('2');
    fireEvent.click(scheduleTab);

    expect(screen.getByText('Dine-in service:')).toBeTruthy();
    expect(screen.getAllByText('Scheduled Guest').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Immediate Guest').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pickup Guest')).toBeNull();
    expect(screen.getByText(/Serve by/)).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getAllByText('Immediate service').length).toBeGreaterThan(0);
    expect(screen.getByText(/Read-only admin view/)).toBeTruthy();
  });
});
