/** @vitest-environment jsdom */

// Phase 229 (#1291). Covers the per-order "Out for Delivery" gate for active delivery-run
// members: disabled + explanatory tooltip once an order is a member of a run that hasn't
// completed or been cancelled, scoped to `out_for_delivery` only (never `packed`, which would
// deadlock Phase 228's DELIVERY_RUN_UNPACKED_MEMBERS dispatch precondition), and re-enabled once
// the run is cancelled (no dead end).
//
// PR #1305 re-review RF-7: this gate lives inside the exact order-card block Phase 230 (#1289)
// extracted into IncomingQueueOrderList.jsx, shared by both the tab view (below) and the new
// split ("Queue + Run") view -- the second describe block confirms the gate survived that
// extraction in the split view too, not just the tab view.

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

// jsdom has no matchMedia -- default to "wide enough for split" (matches: true), same helper
// deliveryRunSplitViewDnd.behavior.test.jsx uses for the split tab's >=768px viewport gate.
const installMatchMedia = (matches) => {
  const listeners = new Set();
  const mql = {
    matches,
    media: '',
    addEventListener: (_type, handler) => listeners.add(handler),
    removeEventListener: (_type, handler) => listeners.delete(handler),
    dispatchChange: (nextMatches) => {
      mql.matches = nextMatches;
      listeners.forEach((handler) => handler({ matches: nextMatches }));
    }
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return mql;
};

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
  installMatchMedia(true);
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

// PR #1305 re-review RF-7: the split ("Queue + Run") view renders the same
// IncomingQueueOrderList/OrderCard extraction as the tab view above -- confirms the gate is
// present there too, not just in the default tab view, after the rebase ported it into the
// extracted file.
//
// #1491 Part 2 (2026-09-03) superseded the first case in this block: an order already assigned to
// a run no longer renders in the split view's queue AT ALL (see TerminalOperationsPanels.jsx's
// `splitQueueCandidates`), so the disabled-with-tooltip gate the sibling describe block above
// still exercises on the standalone Active Queue tab can no longer be reached from the split view
// -- there's no card left to gate. Replaced with a test for the new behavior (hidden entirely)
// rather than deleted outright, so this file keeps covering what the split view actually does with
// a run-assigned order.
describe('Run-member fulfillment gate (split view)', () => {
  it('hides an already-run-assigned order from the split view entirely, rather than rendering it disabled (#1491 Part 2)', async () => {
    const order = withRun(buildOrder({ fulfillment_status: 'packed' }), 'dispatched');
    render(<IncomingQueueWorkspace {...baseProps({
      workflowMode: 'retail',
      incomingOrdersState: { orders: [order], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));
    expect(await screen.findByLabelText('Split view target delivery run')).toBeTruthy();

    expect(screen.queryByRole('button', { name: /Out for Delivery/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delivery run "Morning Run"/i })).toBeNull();
  });

  it('enables "Out for Delivery" for a packed delivery order with no run, in the split view', async () => {
    render(<IncomingQueueWorkspace {...baseProps({
      workflowMode: 'retail',
      incomingOrdersState: { orders: [buildOrder()], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));

    const button = await screen.findByRole('button', { name: /Out for Delivery/i });
    expect(button.disabled).toBe(false);
  });
});
