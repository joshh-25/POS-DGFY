/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeliveryRunMembersList from '../components/DeliveryRunMembersList.jsx';
import DeliveryRunDispatchSummary from '../components/DeliveryRunDispatchSummary.jsx';
import DeliveryRunsWorkspacePanel from '../components/DeliveryRunsWorkspacePanel.jsx';
import {
  confirmDeliveryRunLoading,
  fetchDeliveryRun,
  fetchDeliveryRuns,
  updateDeliveryRunMemberLoading
} from '../services/deliveryRunService.js';

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
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}));

const member = (overrides = {}) => ({
  pos_transaction_id: overrides.pos_transaction_id ?? 9001,
  delivery_job_id: overrides.delivery_job_id ?? 1,
  status: 'pending_dispatch',
  loading_state: overrides.loading_state ?? 'pending',
  loading_exception_reason: overrides.loading_exception_reason ?? null,
  order: {
    invoice_number: 'INV-9001',
    customer_name: 'Maria Santos',
    delivery_address: '123 Rizal St',
    fulfillment_status: 'packed'
  },
  ...overrides
});

const run = (overrides = {}) => ({
  delivery_run_id: 701,
  label: 'Evening Run',
  status: 'scheduled',
  personnel: [{ delivery_personnel_id: 21, is_accountable: true }],
  members: [member()],
  member_count: 1,
  ...overrides
});

const panelProps = (overrides = {}) => ({
  canViewPos: true,
  canTransactPos: true,
  isOnline: true,
  hasActiveShift: true,
  deliveryPersonnelState: { loading: false, personnel: [], accessState: 'allowed' },
  ensureDeliveryPersonnelLoaded: vi.fn(),
  ...overrides
});

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  fetchDeliveryRuns.mockResolvedValue({ items: [], pagination: { total: 0, page: 1, limit: 100 } });
  fetchDeliveryRun.mockResolvedValue(null);
});

describe('delivery run loading member controls', () => {
  it('requires an exception reason and sends the per-member loading update', async () => {
    const onMarkLoading = vi.fn().mockResolvedValue(true);
    render(<DeliveryRunMembersList run={run()} onMarkLoading={onMarkLoading} />);

    fireEvent.change(screen.getByRole('combobox', { name: /Loading state for order #9001/i }), {
      target: { value: 'exception' }
    });
    const markButton = screen.getByRole('button', { name: /Mark/i });
    expect(markButton.disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: /Loading exception reason for order #9001/i }), {
      target: { value: 'Damaged carton' }
    });
    fireEvent.click(markButton);

    await waitFor(() => expect(onMarkLoading).toHaveBeenCalledWith(9001, {
      loading_state: 'exception',
      exception_reason: 'Damaged carton'
    }));
  });
});

describe('loading confirmation and dispatch warning', () => {
  it.each(['completed', 'cancelled'])('disables member loading controls on %s runs', async (status) => {
    const selectedRun = run({ status });
    fetchDeliveryRuns.mockResolvedValue({ items: [selectedRun], pagination: { total: 1, page: 1, limit: 100 } });
    fetchDeliveryRun.mockResolvedValue(selectedRun);

    render(<DeliveryRunsWorkspacePanel {...panelProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Evening Run/i }));

    expect((await screen.findByRole('combobox', { name: /Loading state for order #9001/i })).disabled).toBe(true);
  });

  it('retains the confirmation idempotency key across a retry after failure', async () => {
    const selectedRun = run({ loading_summary: { pending_count: 1, loaded_count: 0, not_loaded_count: 0, exception_count: 0, total_count: 1 } });
    fetchDeliveryRuns.mockResolvedValue({ items: [selectedRun], pagination: { total: 1, page: 1, limit: 100 } });
    fetchDeliveryRun.mockResolvedValue(selectedRun);
    confirmDeliveryRunLoading.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(selectedRun);

    render(<DeliveryRunsWorkspacePanel {...panelProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Evening Run/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirm loading/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: /^Confirm loading$/i }));
    await waitFor(() => expect(confirmDeliveryRunLoading).toHaveBeenCalledTimes(1));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Confirm loading$/i }));
    await waitFor(() => expect(confirmDeliveryRunLoading).toHaveBeenCalledTimes(2));

    expect(confirmDeliveryRunLoading.mock.calls[1][1].idempotency_key)
      .toBe(confirmDeliveryRunLoading.mock.calls[0][1].idempotency_key);
  });

  it('shows loading warning details without blocking the dispatch result', () => {
    render(<DeliveryRunDispatchSummary result={{
      dispatched: [{ pos_transaction_id: 9001 }],
      skipped: [],
      failed: [],
      loading_warning: {
        unloaded_pos_transaction_ids: [9001],
        exception_pos_transaction_ids: [9002]
      }
    }} />);

    expect(screen.getByText(/Loading verification warning/i)).toBeTruthy();
    expect(screen.getByText(/dispatch was not blocked/i)).toBeTruthy();
    expect(screen.getByText(/#9001, #9002/)).toBeTruthy();
  });

  // Phase 337 (#1927): the canonical `warnings` array renders per-member states and reasons.
  it('prefers canonical warnings with exact per-member states and exception reasons', () => {
    render(<DeliveryRunDispatchSummary result={{
      dispatched: [{ pos_transaction_id: 9001 }, { pos_transaction_id: 9002 }, { pos_transaction_id: 9003 }],
      skipped: [],
      failed: [],
      loading_warning: {
        unloaded_pos_transaction_ids: [9001, 9002],
        exception_pos_transaction_ids: [9003]
      },
      warnings: [
        { pos_transaction_id: 9001, loading_state: 'pending' },
        { pos_transaction_id: 9002, loading_state: 'not_loaded' },
        { pos_transaction_id: 9003, loading_state: 'exception', exception_reason: 'Damaged package' }
      ]
    }} />);

    expect(screen.getByText(/Loading verification warning/i)).toBeTruthy();
    expect(screen.getByText(/3 outstanding/)).toBeTruthy();
    expect(screen.getByText(/dispatch was not blocked/i)).toBeTruthy();
    // Exact per-member states stay distinct -- pending is not collapsed into not loaded.
    expect(screen.getByText(/Order #9001 — loading pending/)).toBeTruthy();
    expect(screen.getByText(/Order #9002 — not loaded/)).toBeTruthy();
    expect(screen.getByText(/Order #9003 — loading exception: Damaged package/)).toBeTruthy();
  });

  it('shows no warning banner when canonical warnings are empty', () => {
    render(<DeliveryRunDispatchSummary result={{
      dispatched: [{ pos_transaction_id: 9001 }],
      skipped: [],
      failed: [],
      loading_warning: {
        unloaded_pos_transaction_ids: [],
        exception_pos_transaction_ids: []
      },
      warnings: []
    }} />);

    expect(screen.queryByText(/Loading verification warning/i)).toBeNull();
    expect(screen.getByText(/Dispatched \(1\)/)).toBeTruthy();
  });
});
