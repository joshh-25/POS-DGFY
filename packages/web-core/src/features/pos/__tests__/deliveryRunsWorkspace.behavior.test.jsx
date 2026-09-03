/** @vitest-environment jsdom */

// Phase 226 (#1273). Covers the Delivery Runs tab wired into IncomingQueueWorkspace: retail-only
// visibility, the mode-flip fallback (WORKFLOW_MODE_CHANGED_EVENT can flip workflowMode while the
// tab is open), create, the roster-save XOR + single-accountable invariant, members rendering, and
// the DELETE-then-ADD ordering "move to another run" is forced into (plan §6, §7).

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingQueueWorkspace } from '../components/TerminalOperationsPanels.jsx';
import {
  addDeliveryRunMembers,
  createDeliveryRun,
  fetchDeliveryRun,
  fetchDeliveryRuns,
  removeDeliveryRunMember,
  setDeliveryRunPersonnel,
  updateDeliveryRun
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

const EMPTY_RUNS = { items: [], pagination: { total: 0, page: 1, limit: 100 } };

const openDeliveryRunsTab = async () => {
  fireEvent.click(screen.getByRole('tab', { name: /Delivery Runs/i }));
  await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  fetchDeliveryRuns.mockResolvedValue(EMPTY_RUNS);
  fetchDeliveryRun.mockResolvedValue(null);
});

describe('Delivery Runs tab visibility', () => {
  it('renders the tab for workflowMode="retail" and hides it for a non-retail mode', () => {
    const { unmount } = render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'retail' })} />);
    expect(screen.getByRole('tab', { name: /Delivery Runs/i })).toBeTruthy();
    unmount();

    render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'fnb' })} />);
    expect(screen.queryByRole('tab', { name: /Delivery Runs/i })).toBeNull();
  });

  it('falls back to the Active Queue when workflowMode flips off retail while the runs tab is open', async () => {
    const { rerender } = render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'retail' })} />);
    await openDeliveryRunsTab();
    expect(await screen.findByRole('button', { name: /New run/i })).toBeTruthy();

    rerender(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'fnb' })} />);

    await waitFor(() => expect(screen.queryByRole('button', { name: /New run/i })).toBeNull());
    expect(screen.queryByRole('tab', { name: /Delivery Runs/i })).toBeNull();
  });
});

describe('Creating a delivery run', () => {
  it('sends the typed label and scheduled date to createDeliveryRun', async () => {
    createDeliveryRun.mockResolvedValue({ delivery_run_id: 501 });
    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByRole('button', { name: /New run/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByPlaceholderText(/e\.g\. Afternoon Batch 1/i), { target: { value: 'Afternoon Batch 1' } });
    const dateInput = dialog.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-09-05' } });

    fireEvent.click(within(dialog).getByRole('button', { name: /Create run/i }));

    await waitFor(() => expect(createDeliveryRun).toHaveBeenCalledWith({
      label: 'Afternoon Batch 1',
      notes: null,
      scheduled_date: '2026-09-05'
    }));
  });
});

// Phase 260 (#1489): date-range scheduling.
describe('Delivery run date range', () => {
  it('sends both scheduled_date and scheduled_date_end when an end date is set on create', async () => {
    createDeliveryRun.mockResolvedValue({ delivery_run_id: 501 });
    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByRole('button', { name: /New run/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByPlaceholderText(/e\.g\. Afternoon Batch 1/i), { target: { value: 'Range Run' } });
    const [startInput, endInput] = dialog.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: '2026-09-05' } });
    fireEvent.change(endInput, { target: { value: '2026-09-07' } });

    fireEvent.click(within(dialog).getByRole('button', { name: /Create run/i }));

    await waitFor(() => expect(createDeliveryRun).toHaveBeenCalledWith({
      label: 'Range Run',
      notes: null,
      scheduled_date: '2026-09-05',
      scheduled_date_end: '2026-09-07'
    }));
  });

  it('blocks submission client-side when the end date precedes the start date', async () => {
    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByRole('button', { name: /New run/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByPlaceholderText(/e\.g\. Afternoon Batch 1/i), { target: { value: 'Inverted Range' } });
    const [startInput, endInput] = dialog.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: '2026-09-07' } });
    fireEvent.change(endInput, { target: { value: '2026-09-05' } });

    fireEvent.click(within(dialog).getByRole('button', { name: /Create run/i }));

    expect(await within(dialog).findByText(/End date must be on or after the start date/i)).toBeTruthy();
    expect(createDeliveryRun).not.toHaveBeenCalled();
  });

  it('blocks submission client-side when an end date is set without a start date', async () => {
    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByRole('button', { name: /New run/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByPlaceholderText(/e\.g\. Afternoon Batch 1/i), { target: { value: 'End Only' } });
    const [, endInput] = dialog.querySelectorAll('input[type="date"]');
    fireEvent.change(endInput, { target: { value: '2026-09-05' } });

    fireEvent.click(within(dialog).getByRole('button', { name: /Create run/i }));

    expect(await within(dialog).findByText(/An end date requires a start date/i)).toBeTruthy();
    expect(createDeliveryRun).not.toHaveBeenCalled();
  });

  it('hydrates both date fields on edit and sends the updated range on save', async () => {
    const run = {
      delivery_run_id: 801,
      label: 'Weekend Run',
      status: 'draft',
      scheduled_date: '2026-09-05',
      scheduled_date_end: '2026-09-06',
      notes: '',
      personnel: [],
      members: [],
      member_count: 0
    };
    fetchDeliveryRuns.mockResolvedValue({ items: [run], pagination: { total: 1, page: 1, limit: 100 } });
    fetchDeliveryRun.mockResolvedValue(run);
    updateDeliveryRun.mockResolvedValue({ run });

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByText('Weekend Run'));
    fireEvent.click(await screen.findByRole('button', { name: /Edit run/i }));
    const dialog = await screen.findByRole('dialog');

    const [startInput, endInput] = dialog.querySelectorAll('input[type="date"]');
    expect(startInput.value).toBe('2026-09-05');
    expect(endInput.value).toBe('2026-09-06');

    fireEvent.change(endInput, { target: { value: '2026-09-08' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(updateDeliveryRun).toHaveBeenCalledWith(801, expect.objectContaining({
      scheduled_date: '2026-09-05',
      scheduled_date_end: '2026-09-08'
    })));
  });

  it('shows a start→end range in the run list, and a single date when there is no end date', async () => {
    const rangeRun = {
      delivery_run_id: 901,
      label: 'Multi-day Run',
      status: 'draft',
      scheduled_date: '2026-09-05',
      scheduled_date_end: '2026-09-07',
      notes: '',
      personnel: [],
      member_count: 0
    };
    const singleDayRun = {
      delivery_run_id: 902,
      label: 'Single Day Run',
      status: 'draft',
      scheduled_date: '2026-09-10',
      scheduled_date_end: null,
      notes: '',
      personnel: [],
      member_count: 0
    };
    fetchDeliveryRuns.mockResolvedValue({ items: [rangeRun, singleDayRun], pagination: { total: 2, page: 1, limit: 100 } });

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    expect(await screen.findByText((content) => content.startsWith('2026-09-05 → 2026-09-07'))).toBeTruthy();
    expect(await screen.findByText((content) => content.startsWith('2026-09-10'))).toBeTruthy();
  });
});

describe('Run personnel roster save', () => {
  it('sends exactly one is_accountable:true row with delivery_personnel_name (no registry match)', async () => {
    const run = {
      delivery_run_id: 601,
      label: 'Morning Run',
      status: 'draft',
      scheduled_date: null,
      notes: '',
      personnel: [],
      members: [],
      member_count: 0
    };
    fetchDeliveryRuns.mockResolvedValue({ items: [run], pagination: { total: 1, page: 1, limit: 100 } });
    fetchDeliveryRun.mockResolvedValue(run);
    setDeliveryRunPersonnel.mockResolvedValue({ run });

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByText('Morning Run'));
    await screen.findByText('Run personnel');

    const nameInput = screen.getByPlaceholderText('Pick a registered rider or type a name');
    fireEvent.change(nameInput, { target: { value: 'Rider A' } });
    fireEvent.click(screen.getByRole('radio'));

    fireEvent.click(screen.getByRole('button', { name: /Save personnel/i }));

    await waitFor(() => expect(setDeliveryRunPersonnel).toHaveBeenCalledTimes(1));
    const [, payload] = setDeliveryRunPersonnel.mock.calls[0];
    expect(payload.personnel).toEqual([
      { delivery_personnel_name: 'Rider A', is_accountable: true }
    ]);
    expect(typeof payload.idempotency_key).toBe('string');
  });
});

describe('Run members list', () => {
  const buildRunWithMember = () => ({
    delivery_run_id: 701,
    label: 'Evening Run',
    status: 'scheduled',
    scheduled_date: null,
    notes: '',
    personnel: [{ delivery_run_personnel_id: 1, delivery_personnel_id: null, delivery_personnel_name: 'Rider A', is_accountable: true }],
    member_count: 1,
    members: [{
      delivery_job_id: 1,
      pos_transaction_id: 9001,
      status: 'pending_dispatch',
      provider: 'manual',
      delivery_personnel_id: null,
      delivery_personnel_name: null,
      order: {
        pos_transaction_id: 9001,
        invoice_number: 'INV-9001',
        customer_name: 'Maria Santos',
        delivery_address: '123 Rizal St',
        fulfillment_status: 'out_for_delivery'
      }
    }]
  });

  it('renders order.invoice_number and customer_name from the stubbed run detail', async () => {
    const run = buildRunWithMember();
    fetchDeliveryRuns.mockResolvedValue({ items: [run], pagination: { total: 1, page: 1, limit: 100 } });
    fetchDeliveryRun.mockResolvedValue(run);

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByText('Evening Run'));

    expect(await screen.findByText('INV-9001')).toBeTruthy();
    expect(screen.getByText(/Maria Santos/)).toBeTruthy();
  });

  it('remove calls removeDeliveryRunMember; move calls remove then add, in that order', async () => {
    const run = buildRunWithMember();
    const otherRun = {
      delivery_run_id: 702,
      label: 'Other Run',
      status: 'draft',
      scheduled_date: null,
      notes: '',
      personnel: [{ delivery_run_personnel_id: 9, delivery_personnel_id: null, delivery_personnel_name: 'Rider B', is_accountable: true }],
      member_count: 0
    };
    fetchDeliveryRuns.mockResolvedValue({ items: [run, otherRun], pagination: { total: 2, page: 1, limit: 100 } });
    fetchDeliveryRun.mockImplementation(async (id) => (Number(id) === run.delivery_run_id ? run : otherRun));
    removeDeliveryRunMember.mockResolvedValue({});
    addDeliveryRunMembers.mockResolvedValue({});

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByText('Evening Run'));
    await screen.findByText('INV-9001');

    // Remove
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Remove$/i }));
    await waitFor(() => expect(removeDeliveryRunMember).toHaveBeenCalledWith(run.delivery_run_id, 9001));

    removeDeliveryRunMember.mockClear();

    // Move: pick the other run as target, then confirm -- remove must be called before add.
    const targetSelect = screen.getByDisplayValue('Move to...');
    fireEvent.change(targetSelect, { target: { value: String(otherRun.delivery_run_id) } });
    fireEvent.click(screen.getByRole('button', { name: /^Move$/i }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Move order$/i }));

    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalled());
    expect(removeDeliveryRunMember).toHaveBeenCalledWith(run.delivery_run_id, 9001);
    expect(addDeliveryRunMembers.mock.invocationCallOrder[0]).toBeGreaterThan(
      removeDeliveryRunMember.mock.invocationCallOrder[0]
    );
    expect(addDeliveryRunMembers).toHaveBeenCalledWith(
      otherRun.delivery_run_id,
      expect.objectContaining({ pos_transaction_ids: [9001] })
    );
  });

  it('excludes a target run with no accountable person from the move picker and never sends the DELETE', async () => {
    const run = buildRunWithMember();
    const otherRun = { delivery_run_id: 702, label: 'Other Run', status: 'draft', scheduled_date: null, notes: '', personnel: [], member_count: 0 };
    fetchDeliveryRuns.mockResolvedValue({ items: [run, otherRun], pagination: { total: 2, page: 1, limit: 100 } });
    fetchDeliveryRun.mockImplementation(async (id) => (Number(id) === run.delivery_run_id ? run : otherRun));

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByText('Evening Run'));
    await screen.findByText('INV-9001');

    // No accountable-having target exists, so the picker (and its Move button) never renders.
    expect(screen.queryByDisplayValue('Move to...')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Move$/i })).toBeNull();
    expect(removeDeliveryRunMember).not.toHaveBeenCalled();
  });
});

describe('Idempotency key retention on retry (RF-1)', () => {
  it('reuses the identical idempotency key when the same personnel submit is retried', async () => {
    const run = {
      delivery_run_id: 601,
      label: 'Morning Run',
      status: 'draft',
      scheduled_date: null,
      notes: '',
      personnel: [],
      members: [],
      member_count: 0
    };
    fetchDeliveryRuns.mockResolvedValue({ items: [run], pagination: { total: 1, page: 1, limit: 100 } });
    fetchDeliveryRun.mockResolvedValue(run);
    setDeliveryRunPersonnel.mockRejectedValueOnce(new Error('transient failure'));
    setDeliveryRunPersonnel.mockResolvedValueOnce({ run });

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByText('Morning Run'));
    await screen.findByText('Run personnel');

    const nameInput = screen.getByPlaceholderText('Pick a registered rider or type a name');
    fireEvent.change(nameInput, { target: { value: 'Rider A' } });
    fireEvent.click(screen.getByRole('radio'));

    fireEvent.click(screen.getByRole('button', { name: /Save personnel/i }));
    await waitFor(() => expect(setDeliveryRunPersonnel).toHaveBeenCalledTimes(1));

    // Retry the same (unchanged) submit after the failure.
    fireEvent.click(screen.getByRole('button', { name: /Save personnel/i }));
    await waitFor(() => expect(setDeliveryRunPersonnel).toHaveBeenCalledTimes(2));

    const firstKey = setDeliveryRunPersonnel.mock.calls[0][1].idempotency_key;
    const secondKey = setDeliveryRunPersonnel.mock.calls[1][1].idempotency_key;
    expect(typeof firstKey).toBe('string');
    expect(secondKey).toBe(firstKey);
  });

  it('reuses the identical idempotency key when the same move ADD is retried', async () => {
    const run = {
      delivery_run_id: 701,
      label: 'Evening Run',
      status: 'scheduled',
      scheduled_date: null,
      notes: '',
      personnel: [{ delivery_run_personnel_id: 1, delivery_personnel_id: null, delivery_personnel_name: 'Rider A', is_accountable: true }],
      member_count: 1,
      members: [{
        delivery_job_id: 1,
        pos_transaction_id: 9001,
        status: 'pending_dispatch',
        provider: 'manual',
        delivery_personnel_id: null,
        delivery_personnel_name: null,
        order: {
          pos_transaction_id: 9001,
          invoice_number: 'INV-9001',
          customer_name: 'Maria Santos',
          delivery_address: '123 Rizal St',
          fulfillment_status: 'out_for_delivery'
        }
      }]
    };
    const otherRun = {
      delivery_run_id: 702,
      label: 'Other Run',
      status: 'draft',
      scheduled_date: null,
      notes: '',
      personnel: [{ delivery_run_personnel_id: 9, delivery_personnel_id: null, delivery_personnel_name: 'Rider B', is_accountable: true }],
      member_count: 0
    };
    fetchDeliveryRuns.mockResolvedValue({ items: [run, otherRun], pagination: { total: 2, page: 1, limit: 100 } });
    fetchDeliveryRun.mockImplementation(async (id) => (Number(id) === run.delivery_run_id ? run : otherRun));
    removeDeliveryRunMember.mockResolvedValue({});
    addDeliveryRunMembers.mockRejectedValueOnce(new Error('add failed'));
    addDeliveryRunMembers.mockResolvedValueOnce({});

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByText('Evening Run'));
    await screen.findByText('INV-9001');

    const attemptMove = async () => {
      const targetSelect = screen.getByDisplayValue('Move to...');
      fireEvent.change(targetSelect, { target: { value: String(otherRun.delivery_run_id) } });
      fireEvent.click(screen.getByRole('button', { name: /^Move$/i }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /^Move order$/i }));
    };

    await attemptMove();
    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(1));

    // The ADD failed. The workspace's own refreshAll() (triggered from the failure handler)
    // flips the detail panel through its "Loading run..." branch, which remounts
    // DeliveryRunMembersList and closes the confirm dialog -- so a real retry is the operator
    // re-selecting the same target and re-confirming, not clicking a still-open dialog. Wait for
    // the dialog to close and the picker to come back before retrying.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByDisplayValue('Move to...');

    await attemptMove();
    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(2));

    const firstKey = addDeliveryRunMembers.mock.calls[0][1].idempotency_key;
    const secondKey = addDeliveryRunMembers.mock.calls[1][1].idempotency_key;
    expect(typeof firstKey).toBe('string');
    expect(secondKey).toBe(firstKey);
  });
});

describe('Idempotency key scoped to run (RF-4)', () => {
  it('sends a different idempotency key when switching runs with an identical roster payload', async () => {
    const runA = {
      delivery_run_id: 601,
      label: 'Run A',
      status: 'draft',
      scheduled_date: null,
      notes: '',
      personnel: [],
      members: [],
      member_count: 0
    };
    const runB = {
      delivery_run_id: 602,
      label: 'Run B',
      status: 'draft',
      scheduled_date: null,
      notes: '',
      personnel: [],
      members: [],
      member_count: 0
    };
    fetchDeliveryRuns.mockResolvedValue({ items: [runA, runB], pagination: { total: 2, page: 1, limit: 100 } });
    fetchDeliveryRun.mockImplementation(async (id) => (Number(id) === runA.delivery_run_id ? runA : runB));
    // Run A's submit never resolves successfully, so its retained idempotency-key ref is not
    // cleared -- this is the pending/failed-then-switch-run scenario RF-4 describes.
    setDeliveryRunPersonnel.mockRejectedValueOnce(new Error('run A save still pending'));
    setDeliveryRunPersonnel.mockResolvedValueOnce({ run: runB });

    render(<IncomingQueueWorkspace {...baseProps()} />);
    await openDeliveryRunsTab();

    const saveIdenticalRoster = async () => {
      const nameInput = screen.getByPlaceholderText('Pick a registered rider or type a name');
      fireEvent.change(nameInput, { target: { value: 'Rider A' } });
      fireEvent.click(screen.getByRole('radio'));
      fireEvent.click(screen.getByRole('button', { name: /Save personnel/i }));
    };

    // Submit for run A -- fails, leaving the retained submit ref set (not cleared by success).
    fireEvent.click(await screen.findByText('Run A'));
    await screen.findByText('Run personnel');
    await saveIdenticalRoster();
    await waitFor(() => expect(setDeliveryRunPersonnel).toHaveBeenCalledTimes(1));

    // Switch to run B and build the identical roster payload (same name, same accountable flag).
    fireEvent.click(await screen.findByText('Run B'));
    await screen.findByText('Run personnel');
    await saveIdenticalRoster();
    await waitFor(() => expect(setDeliveryRunPersonnel).toHaveBeenCalledTimes(2));

    const [firstRunId, firstPayload] = setDeliveryRunPersonnel.mock.calls[0];
    const [secondRunId, secondPayload] = setDeliveryRunPersonnel.mock.calls[1];
    expect(firstRunId).toBe(runA.delivery_run_id);
    expect(secondRunId).toBe(runB.delivery_run_id);
    expect(secondPayload.personnel).toEqual(firstPayload.personnel);
    expect(secondPayload.idempotency_key).not.toBe(firstPayload.idempotency_key);
  });
});

describe('Location scope switch discards stale data (RF-3)', () => {
  it('discards an older fetchDeliveryRuns response that resolves after a newer one', async () => {
    // Phase 227 (#1273): the Active Queue's own QueueRunAssignBar toolbar also calls
    // fetchDeliveryRuns independently of this panel (it mounts as soon as the workspace does, on
    // the default "active" view) -- so this mock keys off the request's own `location_id` rather
    // than raw call order/count, which no longer maps 1:1 to "this panel's fetch" once a second,
    // independent caller exists. Every call at the pre-switch scope (`location_id: undefined`,
    // i.e. queueLocationScopeId === null) hangs on the same shared stale promise; every call at
    // the post-switch scope (`location_id: 55`) resolves immediately with runB.
    let resolveStaleFetch;
    const staleFetchPromise = new Promise((resolve) => { resolveStaleFetch = resolve; });
    const runA = { delivery_run_id: 1, label: 'Location A Run', status: 'draft', scheduled_date: null, notes: '', personnel: [], member_count: 0 };
    const runB = { delivery_run_id: 2, label: 'Location B Run', status: 'draft', scheduled_date: null, notes: '', personnel: [], member_count: 0 };

    fetchDeliveryRuns.mockImplementation(({ location_id } = {}) => (
      location_id ? Promise.resolve({ items: [runB], pagination: { total: 1, page: 1, limit: 100 } }) : staleFetchPromise
    ));

    const { rerender } = render(<IncomingQueueWorkspace {...baseProps({ queueLocationScopeId: null })} />);
    fireEvent.click(screen.getByRole('tab', { name: /Delivery Runs/i }));
    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());

    // Switch location scope before the first (slow) request resolves.
    rerender(<IncomingQueueWorkspace {...baseProps({ queueLocationScopeId: 55 })} />);
    await screen.findByText('Location B Run');

    // Now let the stale first request(s) resolve -- they must be discarded, not overwrite state,
    // in every component that independently calls fetchDeliveryRuns (the panel AND the toolbar).
    resolveStaleFetch({ items: [runA], pagination: { total: 1, page: 1, limit: 100 } });
    await waitFor(() => expect(screen.getByText('Location B Run')).toBeTruthy());
    expect(screen.queryByText('Location A Run')).toBeNull();
  });

  it('clears the selected run and its detail immediately when the location scope changes', async () => {
    const run = {
      delivery_run_id: 701,
      label: 'Evening Run',
      status: 'scheduled',
      scheduled_date: null,
      notes: '',
      personnel: [],
      member_count: 0,
      members: []
    };
    fetchDeliveryRuns.mockResolvedValue({ items: [run], pagination: { total: 1, page: 1, limit: 100 } });
    fetchDeliveryRun.mockResolvedValue(run);

    const { rerender } = render(<IncomingQueueWorkspace {...baseProps({ queueLocationScopeId: null })} />);
    await openDeliveryRunsTab();

    fireEvent.click(await screen.findByText('Evening Run'));
    await screen.findByText('Run personnel');

    // The next fetchDeliveryRuns (for the new scope) never resolves -- if the selection/detail
    // were only cleared once that fetch resolves, the old run's detail would still be visible.
    fetchDeliveryRuns.mockImplementationOnce(() => new Promise(() => {}));
    rerender(<IncomingQueueWorkspace {...baseProps({ queueLocationScopeId: 77 })} />);

    await waitFor(() => expect(screen.queryByText('Run personnel')).toBeNull());
  });
});
