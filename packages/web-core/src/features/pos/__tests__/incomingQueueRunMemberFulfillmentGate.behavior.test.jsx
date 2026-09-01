/** @vitest-environment jsdom */

// Phase 229 (#1291). Covers the per-order "Out for Delivery" gate for active delivery-run
// members: disabled + explanatory tooltip once an order is a member of a run that hasn't
// completed or been cancelled, scoped to `out_for_delivery` only (never `packed`, which would
// deadlock Phase 228's DELIVERY_RUN_UNPACKED_MEMBERS dispatch precondition), and re-enabled once
// the run is cancelled (no dead end).

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingQueueWorkspace } from '../components/TerminalOperationsPanels.jsx';
import { addDeliveryRunMembers, fetchDeliveryRun, fetchDeliveryRuns } from '../services/deliveryRunService.js';

vi.mock('../services/deliveryRunService.js', () => ({
  fetchDeliveryRuns: vi.fn(),
  fetchDeliveryRun: vi.fn(),
  createDeliveryRun: vi.fn(),
  updateDeliveryRun: vi.fn(),
  setDeliveryRunPersonnel: vi.fn(),
  addDeliveryRunMembers: vi.fn(),
  removeDeliveryRunMember: vi.fn(),
  dispatchDeliveryRun: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}));

const buildOrder = (overrides = {}) => ({
  pos_transaction_id: 9001,
  invoice_number: 'INV-9001',
  customer_name: 'Maria Santos',
  order_method: 'delivery',
  location_id: 10,
  fulfillment_status: 'packed',
  payment_type: 'cash',
  payment_status: 'unpaid',
  created_at: '2026-08-31T10:00:00.000Z',
  deliveryJob: {
    delivery_job_id: 1,
    provider: 'manual',
    status: 'pending_dispatch',
    delivery_run_id: null,
    deliveryRun: null
  },
  ...overrides
});

const withRun = (order, runStatus, label = 'Morning Run') => ({
  ...order,
  deliveryJob: {
    ...order.deliveryJob,
    delivery_run_id: 501,
    deliveryRun: { delivery_run_id: 501, label, status: runStatus }
  }
});

const baseProps = (overrides = {}) => ({
  canViewPos: true,
  canTransactPos: true,
  shiftState: { shift: { shift_id: 1, location_id: 10 } },
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
  locationsState: { locations: [] },
  queueLocationScopeId: 10,
  locked: false,
  isOnline: true,
  sectionId: 'incoming-orders',
  workflowMode: 'retail',
  ensureDeliveryPersonnelLoaded: vi.fn(),
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  fetchDeliveryRuns.mockResolvedValue({ items: [], pagination: { total: 0, page: 1, limit: 100 } });
  fetchDeliveryRun.mockResolvedValue(null);
  addDeliveryRunMembers.mockResolvedValue({ added: [], skipped: [] });
});

describe('Run-member fulfillment gate', () => {
  it('enables "Out for Delivery" for a packed delivery order with no run', async () => {
    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [buildOrder()], accessState: 'allowed', errorMessage: '' }
    })} />);

    const button = await screen.findByRole('button', { name: /Out for Delivery/i });
    expect(button.disabled).toBe(false);
    expect(button.title).toBe('');
  });

  it('disables "Out for Delivery" with an explanatory tooltip for a packed order in a dispatched run', async () => {
    const order = withRun(buildOrder({ fulfillment_status: 'packed' }), 'dispatched');
    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [order], accessState: 'allowed', errorMessage: '' }
    })} />);

    // A gated button's aria-label carries the tooltip reason, which becomes its accessible name
    // (overriding the visible "Out for Delivery" label) -- so it's queried by that name here,
    // same as QueueOrderSelectCheckbox.jsx's own disabled-with-reason pattern.
    const button = await screen.findByRole(
      'button',
      { name: /delivery run "Morning Run".*Dispatch it from the Delivery Runs tab/i }
    );
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/delivery run "Morning Run".*Dispatch it from the Delivery Runs tab/i);
  });

  it('#1272 deadlock guard: "Mark Packed" stays enabled while "Out for Delivery" is gated at preparing/retail', async () => {
    const order = withRun(buildOrder({ fulfillment_status: 'preparing' }), 'scheduled');
    render(<IncomingQueueWorkspace {...baseProps({
      workflowMode: 'retail',
      incomingOrdersState: { orders: [order], accessState: 'allowed', errorMessage: '' }
    })} />);

    const packButton = await screen.findByRole('button', { name: /Mark Packed/i });
    const outForDeliveryButton = await screen.findByRole(
      'button',
      { name: /delivery run "Morning Run".*Dispatch it from the Delivery Runs tab/i }
    );
    expect(packButton.disabled).toBe(false);
    expect(outForDeliveryButton.disabled).toBe(true);
  });

  it('re-enables "Out for Delivery" once the run is cancelled (no dead end)', async () => {
    const order = withRun(buildOrder({ fulfillment_status: 'packed' }), 'cancelled');
    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [order], accessState: 'allowed', errorMessage: '' }
    })} />);

    const button = await screen.findByRole('button', { name: /Out for Delivery/i });
    expect(button.disabled).toBe(false);
  });

  it('does not affect a pickup order\'s "Ready for Pickup" action', async () => {
    const order = buildOrder({
      order_method: 'pickup',
      fulfillment_status: 'packed',
      deliveryJob: null
    });
    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [order], accessState: 'allowed', errorMessage: '' }
    })} />);

    const button = await screen.findByRole('button', { name: /Ready for Pickup/i });
    expect(button.disabled).toBe(false);
  });

  it('composes with (never overrides) the existing permission/lock/online/shift gating', async () => {
    const order = withRun(buildOrder({ fulfillment_status: 'packed' }), 'dispatched');
    render(<IncomingQueueWorkspace {...baseProps({
      canTransactPos: false,
      incomingOrdersState: { orders: [order], accessState: 'allowed', errorMessage: '' }
    })} />);

    const button = await screen.findByRole(
      'button',
      { name: /delivery run "Morning Run".*Dispatch it from the Delivery Runs tab/i }
    );
    expect(button.disabled).toBe(true);
  });
});
