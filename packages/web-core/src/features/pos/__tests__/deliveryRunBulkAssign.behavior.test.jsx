/** @vitest-environment jsdom */

// Phase 227 (#1273). Covers the Active Queue's bulk "add to run" selection: the retail gate,
// select-all-eligible skipping ineligible orders, selection surviving a re-ordered/errored poll,
// the ineligible-drift hint, the target-run picker's exclusion rules, submitting one batched
// addDeliveryRunMembers call, idempotency-key retention/regeneration, the 409 recovery loop
// (F-3's reason_code fix), and reading `{ added, skipped }` on success.

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import { toast } from 'sonner';

const buildOrder = (overrides = {}) => ({
  pos_transaction_id: 9001,
  invoice_number: 'INV-9001',
  customer_name: 'Maria Santos',
  order_method: 'delivery',
  location_id: 10,
  fulfillment_status: 'preparing',
  payment_type: 'cash',
  payment_status: 'unpaid',
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
});

beforeEach(() => {
  fetchDeliveryRuns.mockResolvedValue(RUNS_WITH_ONE());
  fetchDeliveryRun.mockResolvedValue(null);
});

describe('Retail gate', () => {
  it('renders the toolbar and per-card checkbox only in retail mode', async () => {
    const { unmount } = render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'retail' })} />);
    expect(await screen.findByLabelText(/Select order 9001/i)).toBeTruthy();
    unmount();

    render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'fnb' })} />);
    expect(screen.queryByLabelText(/Select order 9001/i)).toBeNull();
    expect(screen.queryByText(/Select delivery orders below/i)).toBeNull();
  });
});

describe('Select all eligible', () => {
  it('selects only eligible orders once a target run is chosen', async () => {
    const eligible = buildOrder({ pos_transaction_id: 9001 });
    const ineligibleWrongLocation = buildOrder({ pos_transaction_id: 9002, location_id: 99 });
    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [eligible, ineligibleWrongLocation], accessState: 'allowed', errorMessage: '' }
    })} />);

    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
    const runSelect = await screen.findByLabelText('Target delivery run');
    fireEvent.change(runSelect, { target: { value: '501' } });

    fireEvent.click(await screen.findByRole('button', { name: /Select all eligible/i }));

    expect(screen.getByLabelText(/Select order 9001/i).checked).toBe(true);
    expect(screen.getByLabelText(/Select order 9002/i).checked).toBe(false);
    expect(await screen.findByText(/1 order selected/i)).toBeTruthy();
  });
});

describe('Selection persistence across polls', () => {
  it('survives a re-ordered poll result', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001, created_at: '2026-08-31T10:00:00.000Z' });
    const orderB = buildOrder({ pos_transaction_id: 9002, created_at: '2026-08-31T11:00:00.000Z' });
    const { rerender } = render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA, orderB], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    expect(screen.getByLabelText(/Select order 9001/i).checked).toBe(true);

    // Re-order the poll result (newest-first flip, or the server just returning a different order).
    rerender(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderB, orderA], accessState: 'allowed', errorMessage: '' }
    })} />);

    expect(screen.getByLabelText(/Select order 9001/i).checked).toBe(true);
    expect(screen.getByLabelText(/Select order 9002/i).checked).toBe(false);
  });

  it('survives a transient orders: [] error-path poll instead of being wiped', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    const { rerender } = render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    expect(screen.getByLabelText(/Select order 9001/i).checked).toBe(true);

    // A transient poll error clears the list entirely.
    rerender(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [], accessState: 'error', errorMessage: 'Failed to load incoming online orders. Try refreshing.' }
    })} />);

    // The list is empty now (no card to check), but the selection Set itself was not pruned --
    // confirmed by the order coming back on the next successful poll still being selected.
    rerender(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' }
    })} />);
    expect(screen.getByLabelText(/Select order 9001/i).checked).toBe(true);
  });
});

describe('Ineligible-drift hint', () => {
  it('shows a hint when a selected order stops being eligible', async () => {
    const order = buildOrder({ pos_transaction_id: 9001 });
    const { rerender } = render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [order], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    expect(screen.queryByText(/no longer eligible/i)).toBeNull();

    const driftedOrder = buildOrder({
      pos_transaction_id: 9001,
      deliveryJob: { provider: 'manual', status: 'out_for_delivery', delivery_run_id: null }
    });
    rerender(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [driftedOrder], accessState: 'allowed', errorMessage: '' }
    })} />);

    expect(await screen.findByText(/1 selected order is no longer eligible and will be skipped/i)).toBeTruthy();
  });
});

describe('Target-run picker exclusions', () => {
  it('excludes a dispatched run, a run without exactly one accountable person, and a wrong-location run', async () => {
    const dispatchedRun = buildRun({ delivery_run_id: 1, label: 'Dispatched Run', status: 'dispatched' });
    const noAccountableRun = buildRun({ delivery_run_id: 2, label: 'No Accountable Run', personnel: [] });
    const twoAccountableRun = buildRun({
      delivery_run_id: 3,
      label: 'Two Accountable Run',
      personnel: [{ is_accountable: true }, { is_accountable: true }]
    });
    const wrongLocationRun = buildRun({ delivery_run_id: 4, label: 'Wrong Location Run', location_id: 99 });
    const eligibleRun = buildRun({ delivery_run_id: 5, label: 'Eligible Run' });

    fetchDeliveryRuns.mockResolvedValue({
      items: [dispatchedRun, noAccountableRun, twoAccountableRun, wrongLocationRun, eligibleRun],
      pagination: { total: 5, page: 1, limit: 100 }
    });

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());

    const runSelect = await screen.findByLabelText('Target delivery run');
    expect(within(runSelect).queryByText('Dispatched Run')).toBeNull();
    expect(within(runSelect).queryByText('No Accountable Run')).toBeNull();
    expect(within(runSelect).queryByText('Two Accountable Run')).toBeNull();
    expect(within(runSelect).queryByText('Wrong Location Run')).toBeNull();
    expect(within(runSelect).getByText('Eligible Run')).toBeTruthy();
  });

  it('shows an explicit reason when the filtered set is empty', async () => {
    fetchDeliveryRuns.mockResolvedValue({
      items: [buildRun({ status: 'dispatched' })],
      pagination: { total: 1, page: 1, limit: 100 }
    });
    render(<IncomingQueueWorkspace {...baseProps()} />);
    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
    expect(await screen.findByText(/No eligible runs for this location/i)).toBeTruthy();
  });
});

describe('Submitting the batch', () => {
  it('sends one addDeliveryRunMembers call carrying all selected ids', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    const orderB = buildOrder({ pos_transaction_id: 9002 });
    addDeliveryRunMembers.mockResolvedValue({ added: [{ pos_transaction_id: 9001 }, { pos_transaction_id: 9002 }], skipped: [] });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA, orderB], accessState: 'allowed', errorMessage: '' }
    })} />);

    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    fireEvent.click(await screen.findByLabelText(/Select order 9002/i));
    fireEvent.change(await screen.findByLabelText('Target delivery run'), { target: { value: '501' } });

    fireEvent.click(await screen.findByRole('button', { name: /Add 2 orders to run/i }));

    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(1));
    const [runId, payload] = addDeliveryRunMembers.mock.calls[0];
    expect(runId).toBe(501);
    expect(payload.pos_transaction_ids.sort()).toEqual([9001, 9002]);
    expect(typeof payload.idempotency_key).toBe('string');
  });

  it('reads { added, skipped } and reports both counts on success', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    addDeliveryRunMembers.mockResolvedValue({ added: [{ pos_transaction_id: 9001 }], skipped: [{ pos_transaction_id: 9002, reason_code: 'DELIVERY_JOB_ALREADY_IN_RUN' }] });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' }
    })} />);

    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    fireEvent.change(await screen.findByLabelText('Target delivery run'), { target: { value: '501' } });
    fireEvent.click(await screen.findByRole('button', { name: /Add 1 order to run/i }));

    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/1 order added.*1 already there/i)));
  });

  it('retains the idempotency key across a retry of the identical batch, regenerates on selection change', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    addDeliveryRunMembers.mockRejectedValueOnce(new Error('transient'));
    addDeliveryRunMembers.mockResolvedValueOnce({ added: [{ pos_transaction_id: 9001 }], skipped: [] });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' }
    })} />);

    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    fireEvent.change(await screen.findByLabelText('Target delivery run'), { target: { value: '501' } });

    fireEvent.click(await screen.findByRole('button', { name: /Add 1 order to run/i }));
    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(1));

    // Retry the identical batch.
    fireEvent.click(await screen.findByRole('button', { name: /Add 1 order to run/i }));
    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(2));

    const firstKey = addDeliveryRunMembers.mock.calls[0][1].idempotency_key;
    const secondKey = addDeliveryRunMembers.mock.calls[1][1].idempotency_key;
    expect(secondKey).toBe(firstKey);
  });

  it('regenerates the idempotency key when the target run changes', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    const otherRun = buildRun({ delivery_run_id: 502, label: 'Other Run' });
    fetchDeliveryRuns.mockResolvedValue({ items: [buildRun(), otherRun], pagination: { total: 2, page: 1, limit: 100 } });
    addDeliveryRunMembers.mockRejectedValueOnce(new Error('transient'));
    addDeliveryRunMembers.mockResolvedValueOnce({ added: [{ pos_transaction_id: 9001 }], skipped: [] });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' }
    })} />);

    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    fireEvent.change(await screen.findByLabelText('Target delivery run'), { target: { value: '501' } });
    fireEvent.click(await screen.findByRole('button', { name: /Add 1 order to run/i }));
    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(1));

    // Switch target run and retry -- this is a different logical submit, new key expected.
    fireEvent.change(await screen.findByLabelText('Target delivery run'), { target: { value: '502' } });
    fireEvent.click(await screen.findByRole('button', { name: /Add 1 order to run/i }));
    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(2));

    const firstKey = addDeliveryRunMembers.mock.calls[0][1].idempotency_key;
    const secondKey = addDeliveryRunMembers.mock.calls[1][1].idempotency_key;
    expect(secondKey).not.toBe(firstKey);
  });
});

describe('409 recovery loop (F-3)', () => {
  it('deselects the named order, shows a persistent toast, and offers a retry', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    const orderB = buildOrder({ pos_transaction_id: 9002 });
    const conflict = Object.assign(new Error('conflict'), {
      response: {
        data: {
          error_code: 'CONFLICT',
          errors: { reason_code: 'DELIVERY_JOB_ASSIGNMENT_LOCKED', pos_transaction_id: 9002 }
        }
      }
    });
    addDeliveryRunMembers.mockRejectedValueOnce(conflict);

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA, orderB], accessState: 'allowed', errorMessage: '' }
    })} />);

    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    fireEvent.click(await screen.findByLabelText(/Select order 9002/i));
    fireEvent.change(await screen.findByLabelText('Target delivery run'), { target: { value: '501' } });
    fireEvent.click(await screen.findByRole('button', { name: /Add 2 orders to run/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/Order #9002.*could not be added.*Nothing was added.*Retry with the remaining 1 order/i),
      { duration: Infinity }
    ));

    // The offending order is auto-deselected; the survivor stays selected.
    expect(screen.getByLabelText(/Select order 9001/i).checked).toBe(true);
    expect(screen.getByLabelText(/Select order 9002/i).checked).toBe(false);
    expect(await screen.findByRole('button', { name: /Add 1 order to run/i })).toBeTruthy();
  });
});
