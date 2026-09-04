/** @vitest-environment jsdom */

// Phase 229 (#1289), extended Phase 257 (#1491). Covers the split ("Queue + Run") view: the
// retail + >=768px viewport gate (lowered from 1024px by #1491, sourced from
// POS_TABLET_MIN_WIDTH_PX -- see TerminalOperationsPanels.jsx's SPLIT_VIEW_MIN_WIDTH_PX comment
// for the full history), the mode-flip reset, drag-to-assign wiring (mocked dnd-kit per the
// plan's own risk table -- "the component test asserts wiring through mocked handlers rather than
// simulating a real drag"), idempotency-key retention/regeneration on the drag path, drag
// disablement, that the checkbox + QueueRunAssignBar path still works unchanged inside the split
// panel, and (#1491 Part 2) that the split view hides already-assigned orders while the
// standalone Active Queue tab does not.

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A lightweight fake of the parts of @dnd-kit/core this feature actually uses. DndContext just
// captures its onDragStart/onDragEnd callbacks so a test can invoke them directly with a
// hand-built event -- constructing a real pointer-drag gesture in jsdom is what the plan's own
// risk table calls out as not worth doing; the multi-drag-vs-single decision itself already has
// its own pure-function coverage in queueRunDropAssignment.test.js. useDraggable/useDroppable are
// stubbed to inert no-ops (real dnd-kit context isn't present without a real DndContext), which is
// fine here -- IncomingQueueOrderList/DeliveryRunDropPanel only need `disabled` to be computed
// correctly, not an actual drag to occur.
let capturedDndHandlers = { onDragStart: null, onDragEnd: null };
const useDraggableCalls = [];
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragStart, onDragEnd }) => {
    capturedDndHandlers = { onDragStart, onDragEnd };
    return children;
  },
  DragOverlay: ({ children }) => children,
  useSensor: () => ({}),
  useSensors: () => [],
  PointerSensor: {},
  TouchSensor: {},
  useDraggable: (config) => {
    useDraggableCalls.push(config);
    return { attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false };
  },
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false })
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => '' } }
}));

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

// jsdom has no matchMedia -- default every test to "wide enough for split" (matches: true) and
// let individual tests override.
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
  useDraggableCalls.length = 0;
  capturedDndHandlers = { onDragStart: null, onDragEnd: null };
});

beforeEach(() => {
  installMatchMedia(true);
  fetchDeliveryRuns.mockResolvedValue(RUNS_WITH_ONE());
  fetchDeliveryRun.mockResolvedValue(buildRun());
});

describe('Split tab visibility gate', () => {
  it('shows the split tab only in retail mode and only at >=768px', async () => {
    installMatchMedia(true);
    const { unmount } = render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'retail' })} />);
    expect(await screen.findByRole('tab', { name: /Queue \+ Run/i })).toBeTruthy();
    unmount();

    render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'fnb' })} />);
    expect(screen.queryByRole('tab', { name: /Queue \+ Run/i })).toBeNull();
  });

  it('does not show the split tab under 768px even in retail mode', async () => {
    installMatchMedia(false);
    render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'retail' })} />);
    expect(await screen.findByRole('tab', { name: /Active Queue/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Queue \+ Run/i })).toBeNull();
  });

  // #1491: regression guard against the threshold drifting again (1280 -> 1024 -> 768) -- asserts
  // the actual media-query string the gate builds, not just the mocked boolean the other tests in
  // this describe block use (installMatchMedia ignores the query argument entirely).
  it('queries matchMedia for exactly (min-width: 768px), not the old 1024px/1280px thresholds', async () => {
    installMatchMedia(true);
    render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'retail' })} />);
    await screen.findByRole('tab', { name: /Queue \+ Run/i });
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 768px)');
  });

  // #1491: a portrait iPad (mini/standard/Air/11"-Pro, ~768-834px CSS width) narrowing further --
  // e.g. entering split-screen multitasking -- must still force the reset effect out of the split
  // view exactly as it already does above the old 1024px threshold.
  it('force-navigates out of the split view when matchMedia flips to non-matching mid-session, at the new 768px threshold', async () => {
    const mql = installMatchMedia(true);
    render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'retail' })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));
    expect(await screen.findByLabelText('Split view target delivery run')).toBeTruthy();

    mql.dispatchChange(false);

    await waitFor(() => expect(screen.queryByLabelText('Split view target delivery run')).toBeNull());
    expect(await screen.findByRole('tab', { name: /Active Queue/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Queue \+ Run/i })).toBeNull();
  });
});

describe('Mode-flip reset', () => {
  it('resets out of the split view when the workflow mode flips out of retail', async () => {
    installMatchMedia(true);
    const { rerender } = render(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'retail' })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));
    expect(await screen.findByLabelText('Split view target delivery run')).toBeTruthy();

    rerender(<IncomingQueueWorkspace {...baseProps({ workflowMode: 'fnb' })} />);
    expect(screen.queryByLabelText('Split view target delivery run')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Queue \+ Run/i })).toBeNull();
  });
});

describe('Drag-to-assign wiring', () => {
  it('onDragEnd with a valid payload calls addDeliveryRunMembers once with the expected ids and an idempotency key', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    addDeliveryRunMembers.mockResolvedValue({ added: [{ pos_transaction_id: 9001 }], skipped: [] });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));
    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());
    await waitFor(() => expect(capturedDndHandlers.onDragEnd).toBeTruthy());

    await capturedDndHandlers.onDragEnd({ active: { id: 9001 }, over: { id: 501 } });

    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(1));
    const [runId, payload] = addDeliveryRunMembers.mock.calls[0];
    expect(runId).toBe(501);
    expect(payload.pos_transaction_ids).toEqual([9001]);
    expect(typeof payload.idempotency_key).toBe('string');
  });

  it('retains the idempotency key across a retry of the identical drop, regenerates for a different target run', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    addDeliveryRunMembers.mockRejectedValueOnce(new Error('transient'));
    addDeliveryRunMembers.mockResolvedValueOnce({ added: [{ pos_transaction_id: 9001 }], skipped: [] });
    addDeliveryRunMembers.mockResolvedValueOnce({ added: [{ pos_transaction_id: 9001 }], skipped: [] });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));
    await waitFor(() => expect(capturedDndHandlers.onDragEnd).toBeTruthy());

    await capturedDndHandlers.onDragEnd({ active: { id: 9001 }, over: { id: 501 } });
    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(1));

    // Retry the identical drop (same order, same target run) -- same idempotency key expected.
    await capturedDndHandlers.onDragEnd({ active: { id: 9001 }, over: { id: 501 } });
    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(2));
    const firstKey = addDeliveryRunMembers.mock.calls[0][1].idempotency_key;
    const secondKey = addDeliveryRunMembers.mock.calls[1][1].idempotency_key;
    expect(secondKey).toBe(firstKey);

    // Drop the same order onto a different run -- a different logical submit, new key expected.
    await capturedDndHandlers.onDragEnd({ active: { id: 9001 }, over: { id: 502 } });
    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(3));
    const thirdKey = addDeliveryRunMembers.mock.calls[2][1].idempotency_key;
    expect(thirdKey).not.toBe(secondKey);
  });

  it('does not call addDeliveryRunMembers when dropped outside a valid target run', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));
    await waitFor(() => expect(capturedDndHandlers.onDragEnd).toBeTruthy());

    await capturedDndHandlers.onDragEnd({ active: { id: 9001 }, over: null });
    expect(addDeliveryRunMembers).not.toHaveBeenCalled();
  });

  it('disables drag when locked, offline, or lacking an active shift -- same predicate as the checkbox', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' },
      locked: true
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));
    await waitFor(() => expect(useDraggableCalls.length).toBeGreaterThan(0));

    const cardDragConfig = useDraggableCalls.find((call) => call.id === 9001);
    expect(cardDragConfig.disabled).toBe(true);
  });
});

describe('Checkbox + assign-bar path inside the split panel', () => {
  it('still submits via QueueRunAssignBar unchanged', async () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    addDeliveryRunMembers.mockResolvedValue({ added: [{ pos_transaction_id: 9001 }], skipped: [] });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [orderA], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));
    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());

    fireEvent.click(await screen.findByLabelText(/Select order 9001/i));
    fireEvent.change(await screen.findByLabelText('Target delivery run'), { target: { value: '501' } });
    fireEvent.click(await screen.findByRole('button', { name: /Add 1 order to run/i }));

    await waitFor(() => expect(addDeliveryRunMembers).toHaveBeenCalledTimes(1));
    const [runId, payload] = addDeliveryRunMembers.mock.calls[0];
    expect(runId).toBe(501);
    expect(payload.pos_transaction_ids).toEqual([9001]);
  });
});

// #1491 Part 2: the split view's own candidate list hides orders already assigned to a run --
// scoped to this one call site (`splitQueueCandidates`), never the standalone Active Queue tab's
// own `runFilter`/`visibleIncomingOrders`. This is the regression guard for that scoping decision
// -- see TerminalOperationsPanels.jsx's `splitQueueCandidates` comment for the full analysis of
// why a shared-default flip would have hidden, by default, every order an operator still needs
// per-order actions (cash collection, balance settlement, status change) for.
describe('Hide already-assigned orders in the split view only (#1491 Part 2)', () => {
  it('omits an already-assigned order from the split view\'s rendered list and QueueRunAssignBar counts', async () => {
    const unassigned = buildOrder({ pos_transaction_id: 9001 });
    const alreadyAssigned = buildOrder({
      pos_transaction_id: 9002,
      deliveryJob: { provider: 'manual', status: 'assigned', delivery_run_id: 501 }
    });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [unassigned, alreadyAssigned], accessState: 'allowed', errorMessage: '' }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Queue \+ Run/i }));
    await waitFor(() => expect(fetchDeliveryRuns).toHaveBeenCalled());

    expect(await screen.findByLabelText(/Select order 9001/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Select order 9002/i)).toBeNull();
    // The informational hint names the one hidden order.
    expect(await screen.findByText(/1 order already assigned to a run is hidden here/i)).toBeTruthy();
  });

  it('leaves the standalone Active Queue tab\'s own list unaffected by the same fixture', async () => {
    const unassigned = buildOrder({ pos_transaction_id: 9001 });
    const alreadyAssigned = buildOrder({
      pos_transaction_id: 9002,
      deliveryJob: { provider: 'manual', status: 'assigned', delivery_run_id: 501 }
    });

    render(<IncomingQueueWorkspace {...baseProps({
      incomingOrdersState: { orders: [unassigned, alreadyAssigned], accessState: 'allowed', errorMessage: '' }
    })} />);

    // Default tab is Active Queue -- never navigate into the split view in this test. The
    // already-assigned order's checkbox is still present, just rendered ineligible (a different
    // aria-label -- QueueOrderSelectCheckbox.jsx's own "not eligible" branch, ALREADY_IN_RUN) --
    // it must still be there at all, unlike the split view above.
    expect(await screen.findByLabelText(/Select order 9001/i)).toBeTruthy();
    expect(await screen.findByLabelText(/order 9002 is not eligible for bulk add to run/i)).toBeTruthy();
  });
});
