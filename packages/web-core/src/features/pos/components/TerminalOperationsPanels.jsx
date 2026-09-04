import React from 'react';
import { toast } from 'sonner';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { Info, MapPinned, RefreshCcw, Tag, User, Wallet, Receipt, ShoppingBag, Calendar, MapPin, Truck, Search, Table2, LayoutGrid, Columns } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  DELIVERY_JOB_STATUS_LABELS,
  isManualDeliveryJob
} from './orderFulfillmentUi.js';
import DeliveryAssignmentControl from './DeliveryAssignmentControl.jsx';
import DeliveryAddressEditControl from './DeliveryAddressEditControl.jsx';
import QueueOrderSelectCheckbox from './QueueOrderSelectCheckbox.jsx';
import DeliveryRunsWorkspacePanel from './DeliveryRunsWorkspacePanel.jsx';
import DeliveryRunDropPanel from './DeliveryRunDropPanel.jsx';
import QueueRunAssignBar from './QueueRunAssignBar.jsx';
import QueueRunFilterControl from './QueueRunFilterControl.jsx';
import IncomingQueueOrderList from './IncomingQueueOrderList.jsx';
import { addDeliveryRunMembers } from '../services/deliveryRunService.js';
import { getRunAssignEligibility, getActiveRunMembership } from '../utils/deliveryRunEligibility.js';
import { resolveRunDropAssignment } from '../utils/queueRunDropAssignment.js';
import { QUEUE_RUN_FILTER_ALL, QUEUE_RUN_FILTER_UNASSIGNED, filterOrdersByRun, getQueueRunFilterOptions } from '../utils/deliveryRunQueueFilter.js';
import useDeliveryRunOptions from '../hooks/useDeliveryRunOptions.js';
import {
  formatOrderDateTime,
  formatOrderAmount,
  humanizeOrderStatus,
  resolveOrderDownpaymentSplit,
  resolveBalanceCollectionLabel,
  parseDeliveryCoords
} from '../utils/incomingQueueOrderFormatting.js';
import { buildIncomingQueueOrderActions } from '../utils/incomingQueueOrderActions.js';
import { readQueueViewModePreference, writeQueueViewModePreference, QUEUE_VIEW_MODES } from '../utils/queueViewModePreference.js';
import QueueOrderTableView from './QueueOrderTableView.jsx';
import { deriveQueueSelectionCounts } from '../utils/deriveQueueSelectionCounts.js';
import { POS_TABLET_MIN_WIDTH_PX } from '../utils/posTabletViewport.js';
// Phase 211 (#1180)'s own precedent for this gate: orderFulfillmentUi.js:56 reuses this exact
// normalizeWorkflowMode(...) === 'retail' pattern rather than the WORKFLOW_PAGE_CAPABILITIES nav
// gate -- the delivery-runs tab is an in-page view over a mode-agnostic API (ADR 0034), not a
// route-level capability.
import { normalizeWorkflowMode } from '../../settings/workflowMode.js';

const createIdempotencyKey = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;

// Fixed 2026-09-02 (#1289 follow-up, reported live): this gate originally reused
// IMIN_TABLET_MAX_WIDTH_PX (1280) as its *minimum* width -- but that constant is the Falcon 1 POS
// tablet's own MAX landscape width (posTabletViewport.js's tablet-detection upper bound), so
// requiring the split view's viewport to be >= the real hardware's own max width made it
// structurally unable to render on that hardware at 100% zoom (confirmed live: it only appeared
// after zooming out below 100%, which inflates the effective CSS viewport width past 1280).
// SPLIT_VIEW_MIN_WIDTH_PX is a deliberately separate constant answering the actual question this
// gate needs answered -- is there *physically enough width* for two panels side by side --
// decoupled from tablet detection.
//
// Corrected again 2026-09-03 (#1491): 1024px excluded every iPad in PORTRAIT (mini/standard/Air/
// 11"-Pro all sit at ~768-834px there; only the 12.9" Pro's 1024px portrait width cleared the old
// gate) even though this gate was never actually gating the two-column grid -- the grid's own
// `xl:` breakpoint (Tailwind's default, 1280px) is a separate, higher threshold
// (TerminalOperationsPanels.jsx's split grid, still untouched by this fix) that already stacks the
// two panels into a single column below it. So a working single-column layout already exists and
// already renders for every iPad below 1280px; this gate only ever controlled whether that
// existing layout was reachable at all, not which layout rendered. Lowered to
// `POS_TABLET_MIN_WIDTH_PX` (768) -- this codebase's own established "tablet-sized viewport" floor
// (posTabletViewport.js, also consumed by TerminalPage.jsx/usePosCatalogWorkflow.js/
// POSTransactionHistoryPanel.jsx) -- imported directly rather than re-declared as a second literal,
// so the two constants can't drift apart again the way this one already drifted twice (1280 -> 1024
// -> this fix). Primary interaction stays button-based (QueueRunAssignBar, unconditionally
// visible above the grid) at every eligible width; drag-to-assign is a secondary, opportunistic
// path here, not something this fix had to redesign for touch.
const SPLIT_VIEW_MIN_WIDTH_PX = POS_TABLET_MIN_WIDTH_PX;
const SPLIT_VIEW_MEDIA_QUERY = `(min-width: ${SPLIT_VIEW_MIN_WIDTH_PX}px)`;

function useSplitViewportEligible() {
  const [isEligible, setIsEligible] = React.useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(SPLIT_VIEW_MEDIA_QUERY).matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQueryList = window.matchMedia(SPLIT_VIEW_MEDIA_QUERY);
    const handleChange = (event) => setIsEligible(event.matches);
    setIsEligible(mediaQueryList.matches);
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange);
      return () => mediaQueryList.removeEventListener('change', handleChange);
    }
    // Legacy Safari fallback -- addListener/removeListener predate addEventListener on MediaQueryList.
    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  }, []);

  return isEligible;
}

function WorkspaceShell({ title, children, locked, className = 'p-5' }) {
  const isIncomingQueue = title === 'Incoming Online Queue';

  if (isIncomingQueue) {
    return (
      <section className="min-w-0 max-w-full space-y-4">
        <div className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/80">
          {children}
          {locked && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Terminal is locked. Unlock to run protected operational actions.
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={`min-w-0 max-w-full rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 ${className}`}>
      {children}
    </section>
  );
}

function OrderWorkspaceTabs({ activeView, onChange, activeCount, historyCount, showDeliveryRuns = false, runCount = null, showSplitView = false }) {
  const tabs = [
    {
      key: 'active',
      label: 'Active Queue',
      count: activeCount,
      icon: ShoppingBag
    },
    {
      key: 'history',
      label: 'Order History',
      count: historyCount,
      icon: Receipt
    }
  ];
  // Phase 226 (#1273): retail-only third tab -- the caller decides visibility via
  // normalizeWorkflowMode(...) === 'retail', this component just renders what it's told.
  if (showDeliveryRuns) {
    tabs.push({
      key: 'runs',
      label: 'Delivery Runs',
      count: runCount,
      icon: Truck
    });
  }
  // Phase 229 (#1289), §2.4: a 4th view, not a replacement of the tabbed arrangement -- gated by
  // the caller on retail mode AND viewport width (§2.6), same "caller decides, this just renders"
  // contract as showDeliveryRuns above.
  if (showSplitView) {
    tabs.push({
      key: 'split',
      label: 'Queue + Run',
      count: null,
      icon: Columns
    });
  }

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" role="tablist" aria-label="Online order views">
      {tabs.map(({ key, label, count, icon: Icon }) => {
        const selected = activeView === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange?.(key)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-extrabold transition ${selected
              ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm'
              : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-[#1A4E8D]'}`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {Number.isFinite(Number(count)) ? (
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function OnlineOrderHistoryPanel({
  canViewPos,
  orderHistoryState,
  refreshOrderHistory,
  handleOpenIncomingOrderReceipt,
  incomingReceiptOpeningId,
  locked,
  isOnline = true
}) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [fulfillmentStatus, setFulfillmentStatus] = React.useState('');
  const [paymentStatus, setPaymentStatus] = React.useState('');
  const [page, setPage] = React.useState(1);
  const historyOrders = Array.isArray(orderHistoryState?.orders) ? orderHistoryState.orders : [];
  const accessState = String(orderHistoryState?.accessState || '').trim() || 'idle';
  const errorMessage = String(orderHistoryState?.errorMessage || '').trim();
  const historyTotal = Number(orderHistoryState?.pagination?.total);
  const currentPage = Number(orderHistoryState?.pagination?.page) > 0
    ? Number(orderHistoryState.pagination.page)
    : page;
  const totalPages = Math.max(1, Number(orderHistoryState?.pagination?.totalPages) || 1);

  const loadPage = (nextPage) => {
    const normalizedPage = Math.min(totalPages, Math.max(1, Number(nextPage) || 1));
    setPage(normalizedPage);
    refreshOrderHistory?.({
      search: searchTerm,
      fulfillmentStatus,
      paymentStatus,
      page: normalizedPage
    });
  };

  const applyFilters = (event) => {
    event?.preventDefault();
    loadPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-lg font-black leading-6 text-[#0F172A]">Order History</p>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">
            Rejected, cancelled, and unpaid online orders stay here so Sales History contains financially recognized sales only.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => loadPage(currentPage)}
          disabled={orderHistoryState?.loading || locked || !isOnline}
          className="h-10 rounded-lg !bg-[#2563EB] px-5 text-sm font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          {orderHistoryState?.loading ? 'Refreshing...' : 'Refresh History'}
        </Button>
      </div>

      <form onSubmit={applyFilters} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className="min-w-0 text-xs font-bold text-slate-600">
          Search invoice
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Invoice number"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              aria-label="Search order history invoice"
            />
          </span>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Fulfillment
          <select
            value={fulfillmentStatus}
            onChange={(event) => setFulfillmentStatus(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            aria-label="Filter order history fulfillment status"
          >
            <option value="">All exception orders</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed but unpaid</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Payment
          <select
            value={paymentStatus}
            onChange={(event) => setPaymentStatus(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            aria-label="Filter order history payment status"
          >
            <option value="">All payment statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="payment_pending">Payment pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </label>
        <Button type="submit" variant="outline" className="h-10 rounded-lg border-slate-300 bg-white px-5 text-sm font-extrabold text-slate-800 hover:bg-slate-100">
          Apply Filters
        </Button>
      </form>

      {!isOnline ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Order history is read-only while offline. Reconnect before refreshing the list.
        </p>
      ) : null}

      {!canViewPos || accessState === 'forbidden' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {errorMessage || 'You need POS view permission to access online order history.'}
        </p>
      ) : accessState === 'error' ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage || 'Failed to load online order history. Try refreshing.'}
        </p>
      ) : orderHistoryState?.loading && historyOrders.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Loading order history...</p>
      ) : historyOrders.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <Receipt className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-base font-black text-slate-800">No exception orders found.</p>
          <p className="mt-1 text-sm text-slate-600">Rejected, cancelled, or unpaid online orders will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Fulfillment</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyOrders.map((order) => {
                const orderId = Number(order?.pos_transaction_id);
                const opening = incomingReceiptOpeningId === orderId;
                return (
                  <tr key={orderId || order?.invoice_number} className="align-middle hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-slate-900">{order?.invoice_number || order?.tracking_pin || '-'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{order?.customer_name || 'Guest Buyer'}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatOrderDateTime(order?.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${order?.fulfillment_status === 'rejected'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : order?.fulfillment_status === 'cancelled'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                        {FULFILLMENT_STATUS_LABELS[order?.fulfillment_status] || humanizeOrderStatus(order?.fulfillment_status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{humanizeOrderStatus(order?.payment_status)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{PAYMENT_TYPE_LABELS[order?.payment_type] || humanizeOrderStatus(order?.payment_type)}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-black tabular-nums text-slate-900">{formatOrderAmount(order?.total_amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={locked || !canViewPos || !isOnline || opening}
                        onClick={() => handleOpenIncomingOrderReceipt?.(orderId, { printMode: false })}
                        aria-label={`View order ${order?.invoice_number || orderId}`}
                      >
                        {opening ? 'Opening...' : 'View Order'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {Number.isFinite(historyTotal) ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-500">
                Showing {historyOrders.length} of {historyTotal} exception order{historyTotal === 1 ? '' : 's'}.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={orderHistoryState?.loading || currentPage <= 1}
                  onClick={() => loadPage(currentPage - 1)}
                  aria-label="Previous order history page"
                >
                  Previous
                </Button>
                <span className="min-w-24 text-center text-xs font-bold tabular-nums text-slate-600" aria-live="polite">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={orderHistoryState?.loading || currentPage >= totalPages}
                  onClick={() => loadPage(currentPage + 1)}
                  aria-label="Next order history page"
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function IncomingQueueWorkspace({
  canViewPos,
  canTransactPos,
  shiftState = { shift: null },
  incomingOrdersState,
  orderHistoryState,
  incomingOrderActionState,
  handleIncomingOrderStatusChange,
  handleDeliveryJobStatusChange,
  handleAssignDeliveryPersonnel,
  handleUpdateOnlineOrderDeliveryAddress,
  deliveryPersonnelState,
  handleOpenCashCollection,
  handleOpenBalanceSettlement,
  handleViewBalancePaymentProof,
  handleOpenIncomingOrderReceipt,
  incomingReceiptOpeningId,
  refreshIncomingOrders,
  refreshOrderHistory,
  locationsState,
  queueLocationScopeId,
  locked,
  isOnline = true,
  sectionId,
  workflowMode = '',
  ensureDeliveryPersonnelLoaded = () => {}
}) {
  const [orderSort, setOrderSort] = React.useState('newest');
  const [activeView, setActiveView] = React.useState('active');
  // Phase 230 (#1288): Active Queue view-mode toggle (card/table). Initialized lazily from
  // per-terminal localStorage (React.useState's function form runs the read exactly once, on
  // mount) so a returning operator's last choice sticks; card view stays the default whenever no
  // stored preference exists or the stored value fails normalization.
  const [viewMode, setViewMode] = React.useState(() => readQueueViewModePreference());
  const handleViewModeChange = (nextMode) => {
    setViewMode(writeQueueViewModePreference(nextMode));
  };
  const [deliveryRunCount, setDeliveryRunCount] = React.useState(null);
  const isRetailMode = normalizeWorkflowMode(workflowMode) === 'retail';
  const [pendingRejectionOrderId, setPendingRejectionOrderId] = React.useState(null);
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const sortedIncomingOrders = [...incomingOrders].sort((left, right) => {
    const leftTime = new Date(left?.created_at || left?.order_time || 0).getTime() || 0;
    const rightTime = new Date(right?.created_at || right?.order_time || 0).getTime() || 0;
    const difference = leftTime - rightTime;
    if (difference !== 0) return orderSort === 'oldest' ? difference : -difference;

    return Number(left?.pos_transaction_id || 0) - Number(right?.pos_transaction_id || 0);
  });

  // Phase 231 (#1290): the Active Queue's client-side delivery-run view filter. Purely a view
  // concern over the already-fetched list -- see deliveryRunQueueFilter.js for why this is NOT
  // built on getEligibleRunTargets. Shares one fetch of GET /pos/delivery-runs with
  // QueueRunAssignBar's target picker via useDeliveryRunOptions, so the two can never disagree
  // about which runs exist.
  const [runFilter, setRunFilter] = React.useState(QUEUE_RUN_FILTER_ALL);
  const { runs: deliveryRuns, loading: deliveryRunsLoading, errorMessage: deliveryRunsError } = useDeliveryRunOptions(queueLocationScopeId, { enabled: isRetailMode });
  const runFilterOptions = React.useMemo(
    () => getQueueRunFilterOptions(deliveryRuns, { locationId: queueLocationScopeId }).map((run) => ({
      ...run,
      queueCount: filterOrdersByRun(sortedIncomingOrders, run.delivery_run_id).length
    })),
    [deliveryRuns, queueLocationScopeId, sortedIncomingOrders]
  );
  const visibleIncomingOrders = filterOrdersByRun(sortedIncomingOrders, runFilter);
  // Phase 257 (#1491) Part 2: the split ("Queue + Run") view's own candidate list -- always
  // unassigned-only, independent of `runFilter` (which the split view doesn't even render a
  // control for). Deliberately NOT a flip of `runFilter`'s own default: an order stays "assigned"
  // to its run for its entire remaining lifecycle, and the standalone Active Queue tab is the only
  // screen with the per-order cash-collection/balance-settlement/status-change/personnel-assignment
  // buttons an operator still needs for an assigned order -- see the compliance impact
  // declaration for the full regression analysis. Scoped to this one call site instead.
  const splitQueueCandidates = filterOrdersByRun(sortedIncomingOrders, QUEUE_RUN_FILTER_UNASSIGNED);
  // Maps id -> label from the same already-loaded runs list the filter itself uses (F-3, the
  // Phase 227 declaration's own pattern) -- deliberately the unfiltered deliveryRuns list, not
  // runFilterOptions, so a card still shows a real label for a run outside the filter's own scope
  // (a different location, or completed) rather than always falling back to "Run #<id>".
  const runLabelById = React.useMemo(() => {
    const map = new Map();
    (Array.isArray(deliveryRuns) ? deliveryRuns : []).forEach((run) => {
      if (run?.delivery_run_id !== undefined && run?.delivery_run_id !== null) {
        map.set(String(run.delivery_run_id), run.label);
      }
    });
    return map;
  }, [deliveryRuns]);

  // A previously chosen filter run can drop out of runFilterOptions between fetches (it got
  // dispatched-elsewhere-then-completed, or the location scope changed) -- never leave the
  // filter pointed at a run that's no longer offered. Mirrors QueueRunAssignBar's own
  // targetRunId reset effect.
  React.useEffect(() => {
    if (runFilter === QUEUE_RUN_FILTER_ALL || runFilter === QUEUE_RUN_FILTER_UNASSIGNED) return;
    if (runFilterOptions.some((run) => String(run.delivery_run_id) === String(runFilter))) return;
    setRunFilter(QUEUE_RUN_FILTER_ALL);
  }, [runFilterOptions, runFilter]);

  // Reset the filter whenever the location scope changes -- a run id chosen at one location has
  // no meaning at another.
  React.useEffect(() => {
    setRunFilter(QUEUE_RUN_FILTER_ALL);
  }, [queueLocationScopeId]);

  // Phase 227 (#1273): bulk "add to run" selection for the Active Queue. A Set<Number> of
  // pos_transaction_id, NEVER an index -- sortedIncomingOrders is re-sorted every render (the
  // sort direction is itself a piece of UI state), so an index-based selection would silently
  // point at the wrong order the moment the sort or the underlying poll result reorders the
  // list. State lives here (not in the toolbar) so it survives a tab switch away from and back
  // to Active Queue -- IncomingQueueWorkspace stays mounted across the OrderWorkspaceTabs
  // switch, only the render branch changes.
  const [selectedOrderIds, setSelectedOrderIds] = React.useState(() => new Set());
  const [bulkAssignSubmitting, setBulkAssignSubmitting] = React.useState(false);
  const activeShiftLocationId = shiftState?.shift?.location_id ?? null;

  // Phase 229 (#1289), §2.4/§2.6: the split view's own viewport gate + drag state. Sensors are
  // built once per mount, ItemsPage.jsx precedent (§2.3) -- PointerSensor with an activation
  // distance so a plain click still fires onClick instead of starting a drag, TouchSensor for
  // tablets.
  const isSplitViewportEligible = useSplitViewportEligible();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );
  const [activeDragOrderId, setActiveDragOrderId] = React.useState(null);
  // §2.9: bumped after every successful handleBulkAssignSubmit (drag- or checkbox-driven) so
  // DeliveryRunDropPanel's own picked-run detail refetches when its shown run may have just
  // gained members.
  const [runDropRefreshTick, setRunDropRefreshTick] = React.useState(0);

  // Phase 231 (#1290) correctness crux: re-derived against visibleIncomingOrders (the FILTERED
  // list), not sortedIncomingOrders. Without this, an order selected before the run filter was
  // applied would still be eligible-and-submitted by handleBulkAssignSubmit while invisible on
  // screen -- a filter-hidden selection would get silently submitted.
  //
  // Deliberately NOT pruned against the order list on every poll tick or filter change -- a
  // transient poll error can return `orders: []`, and clearing the filter must restore the
  // selection rather than have silently destroyed it. Eligibility/visibility is instead
  // re-derived live here so a genuinely stale or filtered-out id just stops counting toward the
  // selection rather than being dropped from the Set. (handleSelectAllEligible below is a narrow
  // exception -- "Select all eligible" replaces the whole Set, so it does discard any
  // filter-hidden selection; that has always been select-all's behavior, not new here.)
  const {
    selectedEligibleOrders,
    visibleSelectedCount,
    selectedDriftCount,
    selectedHiddenCount
  } = deriveQueueSelectionCounts(sortedIncomingOrders, visibleIncomingOrders, selectedOrderIds);
  // Phase 257 (#1491) Part 2: the same math, re-derived against the split view's own
  // unassigned-only candidate list instead -- used only by the split branch below (its
  // QueueRunAssignBar display counts and its checkbox-submit path), never the standalone tab.
  const splitSelectionCounts = deriveQueueSelectionCounts(sortedIncomingOrders, splitQueueCandidates, selectedOrderIds);

  const toggleOrderSelection = (orderId, checked) => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (checked) next.add(Number(orderId));
      else next.delete(Number(orderId));
      return next;
    });
  };

  const handleSelectAllEligible = (eligibleOrderIds) => {
    setSelectedOrderIds(new Set((Array.isArray(eligibleOrderIds) ? eligibleOrderIds : []).map(Number)));
  };

  const handleClearSelection = () => setSelectedOrderIds(new Set());

  // RF-1/RF-4 pattern from Phase 226 (PR #1277 review): retain the idempotency key for a retry
  // of the identical submit, keyed on a signature that includes the target run id (never reuse
  // a key across two different runs' membership writes) and the sorted selected ids (a genuinely
  // different selection is a new logical submit and gets a fresh key).
  const bulkAssignSubmitRef = React.useRef({ key: null, signature: null });

  // Phase 229 (#1289), §2.9: `explicitOrderIds` lets a drag (single unselected card, or the whole
  // checkbox selection when the dragged card is part of it) supply its own id set instead of the
  // closure's `selectedEligibleOrders` -- everything else (idempotency signature, the 409 recovery
  // loop, refreshIncomingOrders()) is reused verbatim. The standalone tab's QueueRunAssignBar call
  // site passes just one argument, so `explicitOrderIds` defaults to null there and resolves
  // against the closure's own `selectedEligibleOrders` (which is derived from the standalone tab's
  // own `visibleIncomingOrders`). Phase 257 (#1491): the split view's QueueRunAssignBar call site
  // passes its own `splitSelectionCounts.selectedEligibleOrders` ids explicitly instead, so its
  // checkbox-submit path can never disagree with what its own bar displays -- the closure's
  // `selectedEligibleOrders` is the standalone tab's list only, and must never silently double as
  // the split view's too.
  const handleBulkAssignSubmit = async (targetRunId, explicitOrderIds = null) => {
    if (!isOnline) {
      toast.error('Reconnect before adding orders to a run.');
      return false;
    }
    if (!hasActiveShift) {
      toast.error('Open a shift before adding orders to a run.');
      return false;
    }
    const sortedSelectedIds = Array.isArray(explicitOrderIds)
      ? explicitOrderIds
        .map((id) => Number(id))
        .filter((id) => {
          const order = sortedIncomingOrders.find((candidate) => Number(candidate?.pos_transaction_id) === id);
          return Boolean(order) && getRunAssignEligibility(order, {}).eligible;
        })
        .sort((left, right) => left - right)
      : selectedEligibleOrders
        .map((order) => Number(order.pos_transaction_id))
        .sort((left, right) => left - right);
    if (sortedSelectedIds.length === 0) {
      toast.error('Select at least one eligible order first.');
      return false;
    }

    const signature = `${targetRunId}:${sortedSelectedIds.join(',')}`;
    if (bulkAssignSubmitRef.current.signature !== signature) {
      bulkAssignSubmitRef.current = { key: createIdempotencyKey('run-bulk-add'), signature };
    }

    setBulkAssignSubmitting(true);
    try {
      const result = await addDeliveryRunMembers(targetRunId, {
        idempotency_key: bulkAssignSubmitRef.current.key,
        pos_transaction_ids: sortedSelectedIds
      });
      const addedCount = Array.isArray(result?.added) ? result.added.length : 0;
      const skippedCount = Array.isArray(result?.skipped) ? result.skipped.length : 0;
      toast.success(
        skippedCount > 0
          ? `${addedCount} order${addedCount === 1 ? '' : 's'} added to the run (${skippedCount} already there).`
          : `${addedCount} order${addedCount === 1 ? '' : 's'} added to the run.`
      );
      bulkAssignSubmitRef.current = { key: null, signature: null };
      setSelectedOrderIds((current) => {
        const next = new Set(current);
        sortedSelectedIds.forEach((id) => next.delete(id));
        return next;
      });
      setRunDropRefreshTick((tick) => tick + 1);
      await refreshIncomingOrders?.();
      return true;
    } catch (error) {
      // F-3 pattern (Phase 227, #1273): `error_code` is the DomainErrorCode ('CONFLICT'), the
      // actual per-order reason lives under `errors.reason_code`/`errors.pos_transaction_id`.
      // The whole batch was rejected together -- nothing was added -- so name the offending
      // order, auto-deselect it, and let the operator retry with the rest via the same button.
      const errorDetails = error?.response?.data?.errors || {};
      const reasonCode = errorDetails.reason_code;
      const offendingOrderId = Number(errorDetails.pos_transaction_id) || null;
      const remainingCount = offendingOrderId ? sortedSelectedIds.length - 1 : sortedSelectedIds.length;
      const reasonText = reasonCode ? String(reasonCode).replace(/_/g, ' ').toLowerCase() : 'a conflict';
      const message = offendingOrderId
        ? `Order #${offendingOrderId} could not be added (${reasonText}). Nothing was added -- the whole batch was rejected together. Retry with the remaining ${remainingCount} order${remainingCount === 1 ? '' : 's'}.`
        : `Could not add the selected orders (${reasonText}). Nothing was added -- the whole batch was rejected together.`;
      toast.error(message, { duration: Infinity });
      if (offendingOrderId) {
        setSelectedOrderIds((current) => {
          const next = new Set(current);
          next.delete(offendingOrderId);
          return next;
        });
      }
      await refreshIncomingOrders?.();
      return false;
    } finally {
      setBulkAssignSubmitting(false);
    }
  };

  // Phase 229 (#1289), §2.8-2.10: the split view's DndContext handlers. The multi-drag-vs-single
  // decision itself lives in the pure `resolveRunDropAssignment` util (testable without a real
  // pointer drag); these handlers just wire dnd-kit's events to it and to the existing
  // handleBulkAssignSubmit. `active.id`/`over.id` are always the numeric pos_transaction_id /
  // delivery_run_id -- never an index (§2.10).
  const handleQueueDragStart = (event) => {
    setActiveDragOrderId(Number(event?.active?.id));
  };

  const handleQueueDragEnd = async (event) => {
    setActiveDragOrderId(null);
    // Phase 231 (#1290): resolved against a run-filtered/candidate list, not sortedIncomingOrders
    // -- the split view only ever renders/drags visible cards (below), and a stale drag id from
    // before a filter change must not resolve against a now-hidden order. Phase 257 (#1491): this
    // handler is only ever wired to the split view's own DndContext, so the candidate list here is
    // `splitQueueCandidates` (unassigned-only), not `visibleIncomingOrders` -- an active.id can
    // only be an id the split view actually rendered, and it must resolve against that same list
    // rather than the standalone tab's possibly-stale `runFilter`.
    const assignment = resolveRunDropAssignment({
      activeOrderId: event?.active?.id,
      overRunId: event?.over?.id,
      selectedOrderIds,
      orders: splitQueueCandidates
    });
    if (!assignment) return;
    await handleBulkAssignSubmit(assignment.targetRunId, assignment.orderIds);
  };

  // Phase 144 (#824): the reject dialog renders outside the per-order .map, so it only ever held
  // an id. Resolving the order back out of the list lets the copy state the ACTUAL amount at
  // stake instead of the old unconditional "DGFY will request a full refund", which on a
  // downpayment order reads as if the customer's whole order total is coming back.
  const pendingRejectionOrder = pendingRejectionOrderId === null
    ? null
    : sortedIncomingOrders.find((order) => Number(order?.pos_transaction_id) === pendingRejectionOrderId) || null;
  const pendingRejectionSplit = resolveOrderDownpaymentSplit(pendingRejectionOrder);
  const incomingOrdersAccessState = String(incomingOrdersState?.accessState || '').trim() || 'idle';
  const incomingOrdersErrorMessage = String(incomingOrdersState?.errorMessage || '').trim();
  const hasActiveShift = Boolean(shiftState?.shift);

  // Phase 232 review RF-2 (#1305): the access/error/shift_required/loading ladder used to live only
  // inline in the default (tab) branch below, so the split branch skipped it entirely and rendered
  // a failed poll as an indistinguishable "no orders" empty state with no recovery. Extracted so
  // both branches share the exact same ladder and can never drift apart again.
  const queueAccessNotice = (() => {
    if (!canViewPos || incomingOrdersAccessState === 'forbidden') {
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {incomingOrdersErrorMessage || 'You need POS view permission to access incoming online orders.'}
        </p>
      );
    }
    if (incomingOrdersAccessState === 'error') {
      return (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {incomingOrdersErrorMessage || 'Failed to load incoming online orders. Try refreshing.'}
        </p>
      );
    }
    if (incomingOrdersAccessState === 'shift_required') {
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {incomingOrdersErrorMessage || 'Open a shift to view orders for this branch.'}
        </p>
      );
    }
    if (incomingOrdersState?.loading && incomingOrders.length === 0) {
      return (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Loading incoming orders...</p>
      );
    }
    return null;
  })();
  const selectedLocationName = !queueLocationScopeId
    ? 'Not selected'
    : (locations.find((location) => Number(location.location_id) === Number(queueLocationScopeId))?.name || 'Selected Location');

  React.useEffect(() => {
    if (activeView !== 'history') return;
    refreshOrderHistory?.();
  }, [activeView, refreshOrderHistory]);

  // Phase 226 (#1273): WORKFLOW_MODE_CHANGED_EVENT can flip the mode while this tab is open --
  // a stale activeView === 'runs' must never render the panel once retail mode is off. Belt +
  // braces alongside the isRetailMode guard on the render branch itself below.
  // Phase 227: a bulk-add selection is a retail-only concept -- clear it here too so it never
  // survives a flip into F&B mode.
  // Phase 229 (#1289), §2.4/§2.6: 'split' is gated the same way as 'runs' (retail-only), plus its
  // own viewport gate -- a stale activeView === 'split' must never render the panel once the
  // window narrows below the split threshold either (e.g. a POS window resize).
  // Phase 231 (#1290): the run filter is retail-only too (D-3) -- clear it on the same mode-flip
  // so it never survives into F&B mode either.
  React.useEffect(() => {
    if ((activeView === 'runs' || activeView === 'split') && !isRetailMode) setActiveView('active');
    if (activeView === 'split' && !isSplitViewportEligible) setActiveView('active');
    if (!isRetailMode) {
      setSelectedOrderIds(new Set());
      setRunFilter(QUEUE_RUN_FILTER_ALL);
    }
  }, [activeView, isRetailMode, isSplitViewportEligible]);

  if (activeView === 'history') {
    return (
      <div id={sectionId} className="space-y-4">
        <OrderWorkspaceTabs
          activeView={activeView}
          onChange={setActiveView}
          activeCount={incomingOrders.length}
          historyCount={Number.isFinite(Number(orderHistoryState?.pagination?.total)) ? Number(orderHistoryState.pagination.total) : null}
          showDeliveryRuns={isRetailMode}
          runCount={deliveryRunCount}
          showSplitView={isRetailMode && isSplitViewportEligible}
        />
        <OnlineOrderHistoryPanel
          canViewPos={canViewPos}
          orderHistoryState={orderHistoryState}
          refreshOrderHistory={refreshOrderHistory}
          handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
          incomingReceiptOpeningId={incomingReceiptOpeningId}
          locked={locked}
          isOnline={isOnline}
        />
      </div>
    );
  }

  if (activeView === 'runs' && isRetailMode) {
    return (
      <div id={sectionId} className="space-y-4">
        <OrderWorkspaceTabs
          activeView={activeView}
          onChange={setActiveView}
          activeCount={incomingOrders.length}
          historyCount={Number.isFinite(Number(orderHistoryState?.pagination?.total)) ? Number(orderHistoryState.pagination.total) : null}
          showDeliveryRuns={isRetailMode}
          runCount={deliveryRunCount}
          showSplitView={isRetailMode && isSplitViewportEligible}
        />
        <DeliveryRunsWorkspacePanel
          canViewPos={canViewPos}
          canTransactPos={canTransactPos}
          locked={locked}
          isOnline={isOnline}
          hasActiveShift={hasActiveShift}
          queueLocationScopeId={queueLocationScopeId}
          deliveryPersonnelState={deliveryPersonnelState}
          ensureDeliveryPersonnelLoaded={ensureDeliveryPersonnelLoaded}
          onRunCountChange={setDeliveryRunCount}
        />
      </div>
    );
  }

  // Phase 229 (#1289), §2.4-2.9: the 4th "Queue + Run" view -- gated on both retail mode and the
  // >=SPLIT_VIEW_MIN_WIDTH_PX viewport (the reset effect above already guards against a stale
  // activeView here, this is belt + braces on the render branch itself, matching the 'runs'
  // branch's own pattern).
  if (activeView === 'split' && isRetailMode && isSplitViewportEligible) {
    const dragDisabled = !canTransactPos || locked || !isOnline || !hasActiveShift || bulkAssignSubmitting;
    const activeDragOrder = activeDragOrderId !== null
      ? splitQueueCandidates.find((order) => Number(order?.pos_transaction_id) === activeDragOrderId)
      : null;
    const activeDragIsMultiDrag = activeDragOrderId !== null
      && selectedOrderIds.has(activeDragOrderId)
      && selectedOrderIds.size > 1;
    // Phase 257 (#1491) Part 2: how many orders this split-view queue is hiding because they're
    // already assigned to a run -- purely informational, so the shorter list here doesn't read as
    // a bug against the Active Queue tab's own unfiltered count.
    const splitHiddenAssignedCount = sortedIncomingOrders.length - splitQueueCandidates.length;

    return (
      <div id={sectionId} className="space-y-4">
        <OrderWorkspaceTabs
          activeView={activeView}
          onChange={setActiveView}
          activeCount={incomingOrders.length}
          historyCount={Number.isFinite(Number(orderHistoryState?.pagination?.total)) ? Number(orderHistoryState.pagination.total) : null}
          showDeliveryRuns={isRetailMode}
          runCount={deliveryRunCount}
          showSplitView={isRetailMode && isSplitViewportEligible}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            onClick={() => refreshIncomingOrders?.()}
            disabled={incomingOrdersState?.loading || locked || !isOnline || !hasActiveShift}
            className="h-10 rounded-lg !bg-[#2563EB] px-5 text-sm font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {incomingOrdersState?.loading ? 'Refreshing...' : 'Refresh Queue'}
          </Button>
        </div>
        <DndContext sensors={sensors} onDragStart={handleQueueDragStart} onDragEnd={handleQueueDragEnd}>
          <QueueRunAssignBar
            orders={splitQueueCandidates}
            selectedCount={splitSelectionCounts.visibleSelectedCount}
            selectedEligibleCount={splitSelectionCounts.selectedEligibleOrders.length}
            driftCount={splitSelectionCounts.selectedDriftCount}
            hiddenCount={splitSelectionCounts.selectedHiddenCount}
            activeShiftLocationId={activeShiftLocationId}
            runs={deliveryRuns}
            runsLoading={deliveryRunsLoading}
            runsError={deliveryRunsError}
            disabled={dragDisabled}
            submitting={bulkAssignSubmitting}
            onSelectAllEligible={handleSelectAllEligible}
            onClearSelection={handleClearSelection}
            onSubmit={(targetRunId) => handleBulkAssignSubmit(
              targetRunId,
              splitSelectionCounts.selectedEligibleOrders.map((order) => Number(order?.pos_transaction_id))
            )}
          />
          {!isOnline ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Incoming orders are read-only while offline. Reconnect before refreshing, collecting payment, printing, or changing fulfillment status.
            </p>
          ) : null}
          {splitHiddenAssignedCount > 0 ? (
            <p className="text-xs font-semibold text-slate-500">
              {splitHiddenAssignedCount} order{splitHiddenAssignedCount === 1 ? '' : 's'} already assigned to a run
              {splitHiddenAssignedCount === 1 ? ' is' : ' are'} hidden here -- see the Active Queue tab.
            </p>
          ) : null}
          {queueAccessNotice ? (
            queueAccessNotice
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
              <div className="min-w-0 max-h-[70vh] overflow-y-auto pr-1">
                <IncomingQueueOrderList
                  orders={splitQueueCandidates}
                  isRetailMode={isRetailMode}
                  selectedOrderIds={selectedOrderIds}
                  onToggleSelection={toggleOrderSelection}
                  incomingOrderActionState={incomingOrderActionState}
                  workflowMode={workflowMode}
                  canTransactPos={canTransactPos}
                  canViewPos={canViewPos}
                  locked={locked}
                  isOnline={isOnline}
                  hasActiveShift={hasActiveShift}
                  bulkAssignSubmitting={bulkAssignSubmitting}
                  handleOpenCashCollection={handleOpenCashCollection}
                  handleOpenBalanceSettlement={handleOpenBalanceSettlement}
                  handleViewBalancePaymentProof={handleViewBalancePaymentProof}
                  handleDeliveryJobStatusChange={handleDeliveryJobStatusChange}
                  handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
                  onRequestReject={setPendingRejectionOrderId}
                  handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
                  incomingReceiptOpeningId={incomingReceiptOpeningId}
                  deliveryPersonnelState={deliveryPersonnelState}
                  handleAssignDeliveryPersonnel={handleAssignDeliveryPersonnel}
                  handleUpdateOnlineOrderDeliveryAddress={handleUpdateOnlineOrderDeliveryAddress}
                  columns={1}
                  draggable
                />
              </div>
              <DeliveryRunDropPanel
                activeShiftLocationId={activeShiftLocationId}
                queueLocationScopeId={queueLocationScopeId}
                disabled={dragDisabled}
                refreshSignal={runDropRefreshTick}
              />
            </div>
          )}
          <DragOverlay>
            {activeDragOrderId !== null ? (
              <div className="rounded-lg border border-[#1A4E8D] bg-white px-3 py-2 text-xs font-bold text-[#1A4E8D] shadow-lg">
                {activeDragIsMultiDrag
                  ? `${splitSelectionCounts.selectedEligibleOrders.length} order${splitSelectionCounts.selectedEligibleOrders.length === 1 ? '' : 's'}`
                  : (activeDragOrder?.invoice_number || `Order #${activeDragOrderId}`)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <ConfirmActionDialog
          open={pendingRejectionOrderId !== null}
          onOpenChange={(open) => {
            if (!open) setPendingRejectionOrderId(null);
          }}
          title="Reject and refund this order?"
          description={pendingRejectionSplit
            ? `The order will be rejected. DGFY will request a refund of the ${formatOrderAmount(pendingRejectionSplit.amountPaid)} downpayment collected online, and keep the transaction out of tenant settlement. The ${formatOrderAmount(pendingRejectionSplit.balanceDue)} balance was never charged.`
            : 'The order will be rejected. If PayMongo already collected payment, DGFY will request a full refund and keep the transaction out of tenant settlement.'}
          confirmLabel="Reject and request refund"
          cancelLabel="Keep order"
          variant="destructive"
          reasonLabel="Rejection reason"
          reasonPlaceholder="Explain why this paid order is being rejected."
          reasonRequired
          reasonMinLength={3}
          onConfirm={async (reason) => {
            const succeeded = await handleIncomingOrderStatusChange?.(
              pendingRejectionOrderId,
              'rejected',
              reason
            );
            if (succeeded !== false) setPendingRejectionOrderId(null);
            return succeeded;
          }}
        />
      </div>
    );
  }

  return (
    <div id={sectionId} className="space-y-4">
      <OrderWorkspaceTabs
        activeView={activeView}
        onChange={setActiveView}
        activeCount={incomingOrders.length}
        historyCount={Number.isFinite(Number(orderHistoryState?.pagination?.total)) ? Number(orderHistoryState.pagination.total) : null}
        showDeliveryRuns={isRetailMode}
        runCount={deliveryRunCount}
        showSplitView={isRetailMode && isSplitViewportEligible}
      />
      {isRetailMode ? (
        <QueueRunAssignBar
          orders={visibleIncomingOrders}
          selectedCount={visibleSelectedCount}
          selectedEligibleCount={selectedEligibleOrders.length}
          driftCount={selectedDriftCount}
          hiddenCount={selectedHiddenCount}
          activeShiftLocationId={activeShiftLocationId}
          runs={deliveryRuns}
          runsLoading={deliveryRunsLoading}
          runsError={deliveryRunsError}
          disabled={!canTransactPos || locked || !isOnline || !hasActiveShift}
          submitting={bulkAssignSubmitting}
          onSelectAllEligible={handleSelectAllEligible}
          onClearSelection={handleClearSelection}
          onSubmit={handleBulkAssignSubmit}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-[#1A4E8D]">
            <MapPinned className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm leading-5 text-[#475569]">Location scope:</p>
            <p className="text-lg font-black leading-6 text-[#0F172A]">{selectedLocationName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isRetailMode ? (
            <QueueRunFilterControl
              value={runFilter}
              onChange={setRunFilter}
              options={runFilterOptions}
              loading={deliveryRunsLoading}
              errorMessage={deliveryRunsError}
              visibleCount={visibleIncomingOrders.length}
              totalCount={sortedIncomingOrders.length}
              disabled={locked}
            />
          ) : null}
          <div
            role="group"
            aria-label="Active Queue view mode"
            className="flex h-10 items-center rounded-lg border border-slate-200 bg-white p-0.5"
          >
            <button
              type="button"
              aria-pressed={viewMode === QUEUE_VIEW_MODES.CARD}
              onClick={() => handleViewModeChange(QUEUE_VIEW_MODES.CARD)}
              className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition ${viewMode === QUEUE_VIEW_MODES.CARD
                ? 'bg-[#1A4E8D] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <LayoutGrid className="h-4 w-4" />
              Card
            </button>
            <button
              type="button"
              aria-pressed={viewMode === QUEUE_VIEW_MODES.TABLE}
              onClick={() => handleViewModeChange(QUEUE_VIEW_MODES.TABLE)}
              className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition ${viewMode === QUEUE_VIEW_MODES.TABLE
                ? 'bg-[#1A4E8D] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Table2 className="h-4 w-4" />
              Table
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            Sort
            <select
              value={orderSort}
              onChange={(event) => setOrderSort(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-100"
              aria-label="Sort incoming orders"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <Button
            type="button"
            onClick={() => refreshIncomingOrders?.()}
            disabled={incomingOrdersState?.loading || locked || !isOnline || !hasActiveShift}
            className="h-10 rounded-lg !bg-[#2563EB] px-5 text-sm font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {incomingOrdersState?.loading ? 'Refreshing...' : 'Refresh Queue'}
          </Button>
        </div>
      </div>

      {!isOnline ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Incoming orders are read-only while offline. Reconnect before refreshing, collecting payment, printing, or changing fulfillment status.
        </p>
      ) : null}

      {queueAccessNotice ? (
        queueAccessNotice
      ) : incomingOrders.length === 0 ? (
        <div className="grid min-h-[11rem] grid-cols-1 items-center gap-5 rounded-lg border border-slate-200 bg-white px-5 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="flex justify-center md:border-r md:border-slate-200">
            <div className="relative grid h-32 w-40 place-items-end">
              <div className="absolute inset-x-4 bottom-1 h-3 rounded-full bg-blue-100/70 blur-sm" />
              <div className="relative h-16 w-28 rounded-b-lg rounded-t-xl border-2 border-blue-300 bg-blue-50 shadow-inner">
                <div className="absolute -top-4 left-8 h-5 w-12 rounded-b-lg border-x-2 border-b-2 border-blue-300 bg-white" />
                <div className="absolute -top-12 left-11 h-10 w-8 rounded-md border border-blue-200 bg-white shadow-sm">
                  <span className="mx-auto mt-2 block h-1 w-4 rounded bg-blue-200" />
                  <span className="mx-auto mt-2 block h-1 w-5 rounded bg-blue-100" />
                  <span className="mx-auto mt-2 block h-1 w-3 rounded bg-blue-100" />
                </div>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xl font-black tracking-tight text-[#0F172A]">No online orders in active queue.</p>
            <div className="mt-3 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-3 text-sm leading-5 text-[#334155]">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-500 text-white">
                <Info className="h-4 w-4" />
              </span>
              <p>
                Completed paid sales move to Sales History. Rejected, cancelled, or unpaid online orders move to Order History.
                <br />
                Incoming Queue shows active fulfillment statuses only.
              </p>
            </div>
          </div>
        </div>
      ) : visibleIncomingOrders.length === 0 ? (
        // Phase 231 (#1290): a distinct filtered-empty state -- never the illustrated "no online
        // orders" branch above, which would misleadingly read as a data outage rather than "your
        // filter matched nothing." Applies regardless of view mode (card or table).
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-6 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {runFilter === QUEUE_RUN_FILTER_UNASSIGNED
              ? 'No unassigned orders are in the active queue.'
              : 'No orders in this run are in the active queue.'}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRunFilter(QUEUE_RUN_FILTER_ALL)}>
            Show all orders
          </Button>
        </div>
      ) : viewMode === QUEUE_VIEW_MODES.TABLE ? (
        // Phase 231 (#1290): orders={visibleIncomingOrders}, not sortedIncomingOrders -- the
        // table view must respect the run filter exactly like the card view below, or switching
        // to Table would silently bypass it.
        <QueueOrderTableView
          orders={visibleIncomingOrders}
          isRetailMode={isRetailMode}
          selectedOrderIds={selectedOrderIds}
          toggleOrderSelection={toggleOrderSelection}
          bulkAssignSubmitting={bulkAssignSubmitting}
          canTransactPos={canTransactPos}
          canViewPos={canViewPos}
          locked={locked}
          isOnline={isOnline}
          hasActiveShift={hasActiveShift}
          incomingOrderActionState={incomingOrderActionState}
          incomingReceiptOpeningId={incomingReceiptOpeningId}
          workflowMode={workflowMode}
          handleOpenCashCollection={handleOpenCashCollection}
          handleOpenBalanceSettlement={handleOpenBalanceSettlement}
          handleViewBalancePaymentProof={handleViewBalancePaymentProof}
          handleDeliveryJobStatusChange={handleDeliveryJobStatusChange}
          handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
          handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
          onRequestRejection={setPendingRejectionOrderId}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visibleIncomingOrders.map((order) => {
            const actionLoading = incomingOrderActionState?.[order.pos_transaction_id] || '';
            const deliveryCoords = parseDeliveryCoords(order);
            const deliveryJob = order.deliveryJob || null;
            const manualDeliveryJob = Boolean(deliveryJob) && isManualDeliveryJob(deliveryJob);
            const cashierName = order.cashier?.username || order.acceptedByUser?.username || '-';
            const mapLink = deliveryCoords
              ? `https://maps.google.com/?q=${deliveryCoords.latitude},${deliveryCoords.longitude}`
              : '';

            // Phase 230 (#1288): the ~150-line per-order button-eligibility construction that used
            // to live inline here now lives in incomingQueueOrderActions.js, shared verbatim with
            // QueueOrderTableView.jsx's Actions column so the two view modes can never drift on
            // which actions an order gets.
            const buttons = buildIncomingQueueOrderActions(order, {
              actionLoading,
              workflowMode,
              canTransactPos,
              canViewPos,
              locked,
              isOnline,
              hasActiveShift,
              incomingReceiptOpeningId,
              handleOpenCashCollection,
              handleOpenBalanceSettlement,
              handleViewBalancePaymentProof,
              handleDeliveryJobStatusChange,
              handleIncomingOrderStatusChange,
              handleOpenIncomingOrderReceipt,
              onRequestRejection: setPendingRejectionOrderId
            });

            const bulkAssignEligibility = getRunAssignEligibility(order, {});
            const orderId = Number(order.pos_transaction_id);

            return (
              <div key={`incoming-workspace-${order.pos_transaction_id}`} className="rounded-xl border border-slate-200 bg-white p-4 xl:p-5 shadow-sm shadow-slate-200/70 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      {isRetailMode ? (
                        <QueueOrderSelectCheckbox
                          orderId={orderId}
                          checked={selectedOrderIds.has(orderId)}
                          eligible={bulkAssignEligibility.eligible}
                          reason={bulkAssignEligibility.reason}
                          disabled={!canTransactPos || locked || !isOnline || !hasActiveShift || bulkAssignSubmitting}
                          onToggle={toggleOrderSelection}
                        />
                      ) : null}
                      <p className="text-sm font-extrabold text-[#0F172A]">{order.customer_name || 'Guest Buyer'}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isRetailMode && deliveryJob?.delivery_run_id ? (
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-extrabold text-slate-600">
                          Run: {runLabelById.get(String(deliveryJob.delivery_run_id)) || `#${deliveryJob.delivery_run_id}`}
                        </span>
                      ) : null}
                      <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-[#1A4E8D]">
                        {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5">
                    {/* Left Column */}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                          <Tag className="h-4 w-4" />
                        </div>
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">PIN</span>
                          <span className="text-xs font-semibold text-slate-900 break-all flex-1">{order.tracking_pin || '-'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Cashier</span>
                          <span className="text-xs font-semibold text-slate-900 break-words flex-1">{cashierName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Customer</span>
                          <span className="text-xs font-semibold text-slate-900 break-words flex-1">{order.customer_name || 'Guest Buyer'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                          <Wallet className="h-4 w-4" />
                        </div>
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Payment</span>
                          <span className="text-xs font-semibold text-slate-900 break-words flex-1">{PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type || '-'}</span>
                        </div>
                      </div>

                      <div className={`flex items-center gap-3 py-1.5 ${order.payment_collected_at ? 'border-b border-slate-100' : ''}`}>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                          <Receipt className="h-4 w-4" />
                        </div>
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Payment Status</span>
                          <span className="text-xs font-semibold text-slate-900 break-words flex-1">{String(order.payment_status || 'unpaid').replace(/_/g, ' ')}</span>
                        </div>
                      </div>

                      {(() => {
                        const split = resolveOrderDownpaymentSplit(order);
                        if (!split) return null;
                        return (
                          <>
                            <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100/80">
                                <Wallet className="h-4 w-4" />
                              </div>
                              <div className="flex items-center flex-1 min-w-0">
                                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Downpayment</span>
                                <span className="text-xs font-semibold text-emerald-700 break-words flex-1 tabular-nums">
                                  {formatOrderAmount(split.amountPaid)} <span className="font-medium text-slate-500">paid online</span>
                                </span>
                              </div>
                            </div>
                            <div className={`flex items-center gap-3 py-1.5 ${order.payment_collected_at ? 'border-b border-slate-100' : ''}`}>
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100/80">
                                <Receipt className="h-4 w-4" />
                              </div>
                              <div className="flex items-center flex-1 min-w-0">
                                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Balance due</span>
                                <span className="text-xs font-black text-amber-700 break-words flex-1 tabular-nums">
                                  {formatOrderAmount(split.balanceDue)} <span className="font-medium text-slate-500">{resolveBalanceCollectionLabel(order.order_method)}</span>
                                </span>
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      {order.payment_collected_at && (
                        <div className="flex items-center gap-3 py-1.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                            <User className="h-4 w-4" />
                          </div>
                          <div className="flex items-center flex-1 min-w-0">
                            <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Collected by</span>
                            <span className="text-xs font-semibold text-slate-900 break-words flex-1">{order.paymentCollectedByUser?.username || 'Cashier'} · {formatOrderDateTime(order.payment_collected_at)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column */}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                          <ShoppingBag className="h-4 w-4" />
                        </div>
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Mode</span>
                          <span className="text-xs font-semibold text-slate-900 break-words flex-1">{ORDER_METHOD_LABELS[order.order_method] || order.order_method || '-'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Order Time</span>
                          <span className="text-xs font-semibold text-slate-900 break-words flex-1">{formatOrderDateTime(order.created_at)}</span>
                        </div>
                      </div>

                      {order.order_method === 'delivery' && (
                        <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                            <Truck className="h-4 w-4" />
                          </div>
                          <div className="flex items-center flex-1 min-w-0">
                            <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Delivery</span>
                            <span className="text-xs font-semibold text-slate-900 break-words flex-1">{deliveryJob?.provider || 'Manual'} · {DELIVERY_JOB_STATUS_LABELS[deliveryJob?.status] || deliveryJob?.status || 'Pending Dispatch'}</span>
                          </div>
                        </div>
                      )}

                      {order.order_method === 'delivery' && manualDeliveryJob && (
                        <DeliveryAssignmentControl
                          orderId={order.pos_transaction_id}
                          deliveryJob={deliveryJob}
                          canAssignOrder={order.fulfillment_status === 'out_for_delivery'}
                          deliveryPersonnelState={deliveryPersonnelState}
                          actionLoading={actionLoading}
                          canTransactPos={canTransactPos}
                          locked={locked}
                          isOnline={isOnline}
                          hasActiveShift={hasActiveShift}
                          onAssign={handleAssignDeliveryPersonnel}
                        />
                      )}

                      <div className="flex items-center gap-3 py-1.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Address</span>
                          <span className="text-xs font-semibold text-slate-900 break-words flex-1">{String(order.delivery_address || '').trim() || 'Address not provided'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {deliveryCoords && (
                    <div className="mt-3">
                      <a
                        href={mapLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-[#1A4E8D] underline hover:text-blue-800"
                      >
                        Open pin in map
                      </a>
                    </div>
                  )}

                  <DeliveryAddressEditControl
                    orderId={order.pos_transaction_id}
                    order={order}
                    addressChanges={order.addressChanges}
                    actionLoading={actionLoading}
                    canTransactPos={canTransactPos}
                    locked={locked}
                    isOnline={isOnline}
                    hasActiveShift={hasActiveShift}
                    onSave={handleUpdateOnlineOrderDeliveryAddress}
                  />
                </div>

                <div>
                  <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-2">
                    {buttons.map((button, index) => {
                      const isLast = index === buttons.length - 1;
                      const isOdd = buttons.length % 2 !== 0;
                      return React.cloneElement(button, {
                        key: button.key || `btn-${index}`,
                        className: `w-full ${button.props.className || ''} ${isLast && isOdd ? 'col-span-2' : ''}`
                      });
                    })}
                  </div>
                  {!canTransactPos && (
                    <p className="mt-2 text-[11px] text-slate-500">You need POS transact permission to update order statuses.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmActionDialog
        open={pendingRejectionOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRejectionOrderId(null);
        }}
        title="Reject and refund this order?"
        description={pendingRejectionSplit
          // A store-side reject ALWAYS refunds, even at a store whose downpayment is configured
          // non-refundable -- the store's inability to fulfil is not the customer's forfeiture
          // (Phase 144 / #824, ADR 0069 clause 8). So there is deliberately no forfeiture wording
          // here: this dialog only ever describes a refund.
          ? `The order will be rejected. DGFY will request a refund of the ${formatOrderAmount(pendingRejectionSplit.amountPaid)} downpayment collected online, and keep the transaction out of tenant settlement. The ${formatOrderAmount(pendingRejectionSplit.balanceDue)} balance was never charged.`
          : 'The order will be rejected. If PayMongo already collected payment, DGFY will request a full refund and keep the transaction out of tenant settlement.'}
        confirmLabel="Reject and request refund"
        cancelLabel="Keep order"
        variant="destructive"
        reasonLabel="Rejection reason"
        reasonPlaceholder="Explain why this paid order is being rejected."
        reasonRequired
        reasonMinLength={3}
        onConfirm={async (reason) => {
          const succeeded = await handleIncomingOrderStatusChange?.(
            pendingRejectionOrderId,
            'rejected',
            reason
          );
          if (succeeded !== false) setPendingRejectionOrderId(null);
          return succeeded;
        }}
      />
    </div>
  );
}

export {
  IncomingQueueWorkspace,
  WorkspaceShell
};
