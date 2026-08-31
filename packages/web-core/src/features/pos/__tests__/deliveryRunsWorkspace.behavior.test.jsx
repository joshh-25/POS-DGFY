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
  setDeliveryRunPersonnel
} from '../services/deliveryRunService.js';

vi.mock('../services/deliveryRunService.js', () => ({
  fetchDeliveryRuns: vi.fn(),
  fetchDeliveryRun: vi.fn(),
  createDeliveryRun: vi.fn(),
  updateDeliveryRun: vi.fn(),
  setDeliveryRunPersonnel: vi.fn(),
  addDeliveryRunMembers: vi.fn(),
  removeDeliveryRunMember: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
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
    const otherRun = { delivery_run_id: 702, label: 'Other Run', status: 'draft', scheduled_date: null, notes: '', personnel: [], member_count: 0 };
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
});
