/** @vitest-environment jsdom */

// Phase 230 (#1288). Covers the Active Queue view-mode toggle (card/table): the toggle switches
// render branch, the preference persists across remount via per-terminal localStorage, it defaults
// to 'card' when unset/invalid, selectedOrderIds selection survives a toggle, QueueRunAssignBar's
// bulk-submit still works with table view active, the table renders every mapped column for a
// fixture order (incl. the delivery/downpayment conditional columns), and the two intentionally
// omitted interactive controls (DeliveryAssignmentControl/DeliveryAddressEditControl) are absent
// from table rows without throwing.

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingQueueWorkspace } from '../components/TerminalOperationsPanels.jsx';
import { addDeliveryRunMembers, fetchDeliveryRun, fetchDeliveryRuns } from '../services/deliveryRunService.js';
import { QUEUE_VIEW_MODE_STORAGE_KEY } from '../utils/queueViewModePreference.js';

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
  tracking_pin: '1234',
  cashier: { username: 'cashier1' },
  order_method: 'delivery',
  location_id: 10,
  fulfillment_status: 'preparing',
  payment_type: 'cash',
  payment_status: 'partially_paid',
  amount_paid: 100,
  balance_due: 50,
  delivery_address: '123 Main St',
  delivery_latitude: 14.5995,
  delivery_longitude: 120.9842,
  created_at: '2026-08-31T10:00:00.000Z',
  deliveryJob: {
    provider: 'manual',
    status: 'pending_dispatch',
    delivery_run_id: null
  },
  ...overrides
});

const buildRun = (overrides = {}) => ({
  delivery_run_id: 501,
  label: 'Morning Run',
  status: 'draft',
  location_id: 10,
  scheduled_date: null,
  notes: '',
  personnel: [{ delivery_run_personnel_id: 1, delivery_personnel_id: null, delivery_personnel_name: 'Rider A', is_accountable: true }],
  member_count: 0,
  members: [],
  ...overrides
});

const RUNS_WITH_ONE = (run = buildRun()) => ({ items: [run], pagination: { total: 1, page: 1, limit: 100 } });

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
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.clear();
  fetchDeliveryRuns.mockResolvedValue(RUNS_WITH_ONE());
  fetchDeliveryRun.mockResolvedValue(null);
});

describe('View-mode toggle', () => {
  it('defaults to card view and renders per-order cards', () => {
    render(<IncomingQueueWorkspace {...baseProps()} />);
    expect(screen.getByRole('button', { name: /^Card$/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Table$/i }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('switches to the table render branch on toggle, and back', () => {
    render(<IncomingQueueWorkspace {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Table$/i }));

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Table$/i }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /^Card$/i }));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('persists the preference across a remount', () => {
    const { unmount } = render(<IncomingQueueWorkspace {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Table$/i }));
    expect(window.localStorage.getItem(QUEUE_VIEW_MODE_STORAGE_KEY)).toBe('table');
    unmount();

    render(<IncomingQueueWorkspace {...baseProps()} />);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Table$/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('defaults to card when the stored value is unset or invalid', () => {
    window.localStorage.setItem(QUEUE_VIEW_MODE_STORAGE_KEY, 'not-a-real-mode');
    render(<IncomingQueueWorkspace {...baseProps()} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: /^Card$/i }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Selection survives a toggle', () => {
  it('keeps selectedOrderIds and QueueRunAssignBar submit working across a view-mode flip', async () => {
    addDeliveryRunMembers.mockResolvedValue({ added: [{ pos_transaction_id: 9001 }], skipped: [] });
    render(<IncomingQueueWorkspace {...baseProps()} />);

    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    expect(screen.getByLabelText(/Select order 9001/i).checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^Table$/i }));
    expect(screen.getByLabelText(/Select order 9001/i).checked).toBe(true);

    fireEvent.change(await screen.findByLabelText('Target delivery run'), { target: { value: '501' } });
    fireEvent.click(await screen.findByRole('button', { name: /Add 1 order to run/i }));

    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(1));
    const [runId, payload] = addDeliveryRunMembers.mock.calls[0];
    expect(runId).toBe(501);
    expect(payload.pos_transaction_ids).toEqual([9001]);
  });
});

describe('Table columns', () => {
  it('renders every mapped column for a fixture order, including the conditional ones', () => {
    render(<IncomingQueueWorkspace {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Table$/i }));

    const table = screen.getByRole('table');
    expect(table.textContent).toContain('Maria Santos');
    expect(table.textContent).toContain('1234'); // PIN
    expect(table.textContent).toContain('cashier1'); // Cashier
    expect(table.textContent).toContain('Cash'); // Payment type
    expect(table.textContent).toMatch(/PHP 100\.00 paid.*PHP 50\.00 due/); // Balance column
    expect(table.textContent).toContain('Delivery'); // Mode column label
    expect(table.textContent).toContain('Pending Dispatch'); // Delivery column status
    expect(table.textContent).toContain('123 Main St'); // Address column
    expect(screen.getByLabelText(/Open pin in map for order 9001/i)).toBeTruthy();
  });

  it('omits the interactive DeliveryAssignmentControl/DeliveryAddressEditControl widgets without throwing', () => {
    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: {
        orders: [buildOrder({
          fulfillment_status: 'out_for_delivery',
          deliveryJob: {
            provider: 'manual',
            status: 'assigned',
            delivery_personnel_name: 'Juan Dela Cruz',
            delivery_personnel_id: 5,
            assigned_by: 1,
            assigned_shift_id: 1,
            assigned_at: '2026-08-31T09:00:00.000Z',
            delivery_run_id: null
          }
        })],
        accessState: 'allowed',
        errorMessage: ''
      }
    })} />);

    fireEvent.click(screen.getByRole('button', { name: /^Table$/i }));
    const table = screen.getByRole('table');
    // The current assignee is shown as read-only text...
    expect(table.textContent).toContain('Juan Dela Cruz');
    // ...but not as the interactive assign/reassign control (no combobox for personnel selection
    // and no "Edit address" affordance inside the table).
    expect(screen.queryByRole('combobox', { name: /delivery personnel/i })).toBeNull();
    expect(screen.queryByText(/Edit address/i)).toBeNull();
  });

  it('renders a table with no data-loss crash for a non-delivery order', () => {
    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: {
        orders: [buildOrder({ order_method: 'pickup', delivery_address: '', delivery_latitude: null, delivery_longitude: null, deliveryJob: null })],
        accessState: 'allowed',
        errorMessage: ''
      }
    })} />);

    fireEvent.click(screen.getByRole('button', { name: /^Table$/i }));
    const table = screen.getByRole('table');
    expect(table.textContent).toContain('Pickup');
    expect(table.textContent).toContain('Address not provided');
  });
});
