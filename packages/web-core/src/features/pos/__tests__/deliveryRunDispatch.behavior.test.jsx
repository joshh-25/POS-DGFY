/** @vitest-environment jsdom */

// Phase 228 (#1273/#1271). Covers the Delivery Runs tab's dispatch flow: button gating per
// condition, the unpacked-members pre-flight backstop notice, confirm-then-submit, idempotency-key
// retention/regeneration, the three-bucket dispatch summary panel, the DELIVERY_RUN_UNPACKED_MEMBERS
// 409 naming the offending orders, and the "Re-dispatch run" label on an already-dispatched run.

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingQueueWorkspace } from '../components/TerminalOperationsPanels.jsx';
import {
  dispatchDeliveryRun,
  fetchDeliveryRun,
  fetchDeliveryRuns
} from '../services/deliveryRunService.js';

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

const baseProps = (overrides = {}) => ({
  canViewPos: true,
  canTransactPos: true,
  shiftState: { shift: { shift_id: 1 } },
  incomingOrdersState: { orders: [], accessState: 'allowed', errorMessage: '' },
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
  queueLocationScopeId: null,
  locked: false,
  isOnline: true,
  sectionId: 'incoming-orders',
  workflowMode: 'retail',
  ensureDeliveryPersonnelLoaded: vi.fn(),
  ...overrides
});

const openDeliveryRunsTab = async () => {
  fireEvent.click(screen.getByRole('tab', { name: /Delivery Runs/i }));
  await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
};

const buildMember = (overrides = {}) => ({
  delivery_job_id: overrides.delivery_job_id ?? 1,
  pos_transaction_id: overrides.pos_transaction_id ?? 9001,
  status: 'pending_dispatch',
  provider: 'manual',
  delivery_personnel_id: 21,
  delivery_personnel_name: null,
  order: {
    pos_transaction_id: overrides.pos_transaction_id ?? 9001,
    invoice_number: `INV-${overrides.pos_transaction_id ?? 9001}`,
    customer_name: 'Maria Santos',
    delivery_address: '123 Rizal St',
    fulfillment_status: overrides.fulfillment_status ?? 'packed'
  }
});

const buildRun = (overrides = {}) => ({
  delivery_run_id: 701,
  label: 'Evening Run',
  status: 'scheduled',
  scheduled_date: null,
  notes: '',
  personnel: [{ delivery_run_personnel_id: 1, delivery_personnel_id: 21, delivery_personnel_name: null, is_accountable: true }],
  member_count: 1,
  members: [buildMember()],
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  fetchDeliveryRuns.mockImplementation(async () => ({ items: [], pagination: { total: 0, page: 1, limit: 100 } }));
  fetchDeliveryRun.mockResolvedValue(null);
});

const openRunDetail = async (run) => {
  fetchDeliveryRuns.mockResolvedValue({ items: [run], pagination: { total: 1, page: 1, limit: 100 } });
  fetchDeliveryRun.mockResolvedValue(run);
  render(<IncomingQueueWorkspace {...baseProps()} />);
  await openDeliveryRunsTab();
  fireEvent.click(await screen.findByText(run.label));
  await screen.findByRole('button', { name: /Dispatch run|Re-dispatch run/i });
};

describe('Dispatch button gating', () => {
  it('is enabled for a scheduled run with a packed, assigned member and an active shift', async () => {
    const run = buildRun();
    await openRunDetail(run);
    expect(screen.getByRole('button', { name: /^Dispatch run$/i }).disabled).toBe(false);
  });

  it('is disabled with no active shift', async () => {
    const run = buildRun();
    fetchDeliveryRuns.mockResolvedValue({ items: [run], pagination: { total: 1, page: 1, limit: 100 } });
    fetchDeliveryRun.mockResolvedValue(run);
    render(<IncomingQueueWorkspace {...baseProps({ shiftState: { shift: null } })} />);
    await openDeliveryRunsTab();
    fireEvent.click(await screen.findByText(run.label));
    expect((await screen.findByRole('button', { name: /^Dispatch run$/i })).disabled).toBe(true);
  });

  it('is disabled when the run has no accountable person', async () => {
    const run = buildRun({ personnel: [] });
    await openRunDetail(run);
    expect(screen.getByRole('button', { name: /^Dispatch run$/i }).disabled).toBe(true);
  });

  it('is disabled when the run has zero members', async () => {
    const run = buildRun({ members: [], member_count: 0 });
    await openRunDetail(run);
    expect(screen.getByRole('button', { name: /^Dispatch run$/i }).disabled).toBe(true);
  });

  it('is disabled for a completed or cancelled run', async () => {
    const completedRun = buildRun({ status: 'completed' });
    await openRunDetail(completedRun);
    expect(screen.getByRole('button', { name: /^Dispatch run$/i }).disabled).toBe(true);
  });

  it('is NOT disabled on a dispatched run -- relabels to "Re-dispatch run" instead', async () => {
    const run = buildRun({ status: 'dispatched' });
    await openRunDetail(run);
    const button = screen.getByRole('button', { name: /^Re-dispatch run$/i });
    expect(button.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /^Dispatch run$/i })).toBeNull();
  });
});

describe('Unpacked-members pre-flight notice (backstop)', () => {
  it('disables the button and shows an inline notice naming the unpacked order', async () => {
    const run = buildRun({
      members: [
        buildMember({ pos_transaction_id: 9001, fulfillment_status: 'packed' }),
        buildMember({ pos_transaction_id: 9002, delivery_job_id: 2, fulfillment_status: 'preparing' })
      ]
    });
    await openRunDetail(run);

    expect(screen.getByRole('button', { name: /^Dispatch run$/i }).disabled).toBe(true);
    expect(screen.getByText(/Not yet packed/i)).toBeTruthy();
    expect(screen.getByText(/#9002/)).toBeTruthy();
    expect(dispatchDeliveryRun).not.toHaveBeenCalled();
  });
});

describe('Confirm-then-submit', () => {
  it('does not call dispatchDeliveryRun until the confirm dialog is accepted', async () => {
    const run = buildRun();
    dispatchDeliveryRun.mockResolvedValue({
      run: { ...run, status: 'dispatched' },
      dispatched: [{ pos_transaction_id: 9001 }],
      skipped: [],
      failed: [],
      run_status: { previous: 'scheduled', current: 'dispatched', advanced: true }
    });
    await openRunDetail(run);

    fireEvent.click(screen.getByRole('button', { name: /^Dispatch run$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dispatchDeliveryRun).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Dispatch$/i }));
    await waitFor(() => expect(dispatchDeliveryRun).toHaveBeenCalledTimes(1));
    expect(dispatchDeliveryRun).toHaveBeenCalledWith(
      run.delivery_run_id,
      expect.objectContaining({ idempotency_key: expect.any(String) })
    );
  });
});

describe('Idempotency key retention/regeneration', () => {
  it('reuses the key on retry after a failure, regenerates it after success', async () => {
    const run = buildRun();
    dispatchDeliveryRun.mockRejectedValueOnce(new Error('transient failure'));
    dispatchDeliveryRun.mockResolvedValueOnce({
      run: { ...run, status: 'dispatched' },
      dispatched: [{ pos_transaction_id: 9001 }],
      skipped: [],
      failed: [],
      run_status: { previous: 'scheduled', current: 'dispatched', advanced: true }
    });
    await openRunDetail(run);

    fireEvent.click(screen.getByRole('button', { name: /^Dispatch run$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Dispatch$/i }));
    await waitFor(() => expect(dispatchDeliveryRun).toHaveBeenCalledTimes(1));

    // The dialog stays open on failure (ConfirmActionDialog's own behavior) -- retry is a second
    // confirm click on the same still-open dialog, for the same run/member set.
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: /^Dispatch$/i }));
    await waitFor(() => expect(dispatchDeliveryRun).toHaveBeenCalledTimes(2));

    const firstKey = dispatchDeliveryRun.mock.calls[0][1].idempotency_key;
    const secondKey = dispatchDeliveryRun.mock.calls[1][1].idempotency_key;
    expect(secondKey).toBe(firstKey);
  });
});

describe('Three-bucket dispatch summary panel', () => {
  it('renders dispatched, skipped, and failed groups with per-row badges', async () => {
    const run = buildRun({
      members: [
        buildMember({ pos_transaction_id: 9001 }),
        buildMember({ pos_transaction_id: 9002, delivery_job_id: 2 }),
        buildMember({ pos_transaction_id: 9003, delivery_job_id: 3 })
      ]
    });
    dispatchDeliveryRun.mockResolvedValue({
      run: { ...run, status: 'dispatched' },
      dispatched: [{ pos_transaction_id: 9001 }],
      skipped: [{ pos_transaction_id: 9002, reason_code: 'ALREADY_DISPATCHED', idempotent_no_op: true }],
      failed: [{ pos_transaction_id: 9003, reason_code: 'DELIVERY_ASSIGNMENT_REQUIRED', message: 'Assign a delivery person to this order before dispatching.' }],
      run_status: { previous: 'scheduled', current: 'dispatched', advanced: true }
    });
    fetchDeliveryRuns.mockResolvedValue({ items: [run], pagination: { total: 1, page: 1, limit: 100 } });
    fetchDeliveryRun.mockResolvedValue(run);
    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();
    fireEvent.click(await screen.findByText(run.label));
    await screen.findByRole('button', { name: /^Dispatch run$/i });

    fireEvent.click(screen.getByRole('button', { name: /^Dispatch run$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Dispatch$/i }));

    await screen.findByText('Last dispatch result');
    expect(screen.getByText(/Dispatched \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Already dispatched \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Failed \(1\)/)).toBeTruthy();
    expect(toast.warning).toHaveBeenCalled();
  });
});

describe('DELIVERY_RUN_UNPACKED_MEMBERS 409 naming the offending orders', () => {
  it('shows an error toast naming the unpacked orders from errors.unpacked', async () => {
    const run = buildRun();
    dispatchDeliveryRun.mockRejectedValue({
      response: {
        data: {
          message: 'Every member order must be packed before the run can be dispatched.',
          errors: {
            reason_code: 'DELIVERY_RUN_UNPACKED_MEMBERS',
            unpacked: [{ pos_transaction_id: 9001, fulfillment_status: 'preparing' }]
          }
        }
      }
    });
    await openRunDetail(run);

    fireEvent.click(screen.getByRole('button', { name: /^Dispatch run$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Dispatch$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [message] = toast.error.mock.calls.at(-1);
    expect(message).toContain('#9001');
  });
});
