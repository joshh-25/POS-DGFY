import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Pencil,
  Info,
  MapPinned,
  RefreshCcw,
  Receipt,
  ShieldCheck,
  Store,
  Trash2,
  TrendingUp,
  Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeleteItem, useUpdateItem } from '@/hooks/useItems.js';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  getNextStatusActions
} from './orderFulfillmentUi.js';
import { fetchPosCatalog, fetchPosTransactions, fetchTerminalTodayDashboard } from '../services/posService.js';

const MODE_META = {
  incoming_queue: {
    icon: Truck,
    title: 'Incoming Online Queue',
    subtitle: 'Accept, reject, and progress online orders from this focused queue view.'
  },
  location_scope: {
    icon: MapPinned,
    title: 'Location Scope',
    subtitle: 'Choose which fulfillment location the queue and status actions should target.'
  },
  shift_controls: {
    icon: Store,
    title: 'Shift Controls',
    subtitle: 'Open and monitor cashier shift state before transactions proceed.'
  },
  cash_drawer: {
    icon: Banknote,
    title: 'Cash Drawer Event',
    subtitle: 'Record and audit cash in/out events with operator reasons.'
  },
  close_shift: {
    icon: ShieldCheck,
    title: 'Close Shift',
    subtitle: 'Finalize closing cash and end-of-shift notes with permission checks.'
  },
  sales_today: {
    icon: Receipt,
    title: 'Sales Today',
    subtitle: 'Review live totals, payment mix, and order-method performance.'
  },
  reports: {
    icon: BarChart3,
    title: 'Report',
    subtitle: 'Move between daily totals, popular items, and transaction reporting.'
  },
  items: {
    icon: ClipboardList,
    title: 'Items',
    subtitle: 'Review SKUpervisor items and update the item name, price, and cost from POS.'
  },
  terminal_setup: {
    icon: CheckCircle2,
    title: 'Terminal Setup Context',
    subtitle: 'Inspect setup and compliance context used by the active POS terminal.'
  },
  sync_queue: {
    icon: RefreshCcw,
    title: 'Sync Queue Console',
    subtitle: 'Review offline intents, retry blocked entries, and mark resolved outcomes.'
  }
};

const money = (value) => Number(value || 0).toFixed(2);

const isValidOpeningCashAmount = (value) => {
  const rawValue = String(value ?? '').trim();
  const numericValue = Number(rawValue);
  return rawValue !== '' && Number.isFinite(numericValue) && numericValue >= 0;
};

const parseIsoDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
};
const parseDeliveryCoords = (order = {}) => {
  if (
    order?.delivery_latitude === null
    || order?.delivery_latitude === undefined
    || order?.delivery_latitude === ''
    || order?.delivery_longitude === null
    || order?.delivery_longitude === undefined
    || order?.delivery_longitude === ''
  ) {
    return null;
  }
  const lat = Number(order?.delivery_latitude);
  const lng = Number(order?.delivery_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng
  };
};

const QUEUE_STATUS_LABELS = {
  queued: 'Queued',
  replaying: 'Replaying',
  replayed: 'Replayed',
  failed_manual_resolution_required: 'Manual Resolution Required'
};

const QUEUE_STATUS_CLASSES = {
  queued: 'border-sky-200 bg-sky-50 text-sky-800',
  replaying: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  replayed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  failed_manual_resolution_required: 'border-rose-200 bg-rose-50 text-rose-800'
};

const QUEUE_OPERATION_LABELS = {
  checkout: 'Checkout',
  shift_open: 'Shift Open',
  shift_close: 'Shift Close',
  cash_event: 'Cash Drawer Event',
  order_status_update: 'Order Status Update'
};

function WorkspaceShell({ title, children, locked, className = 'p-5' }) {
  const isIncomingQueue = title === MODE_META.incoming_queue.title;

  if (isIncomingQueue) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/80">
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
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 ${className}`}>
      {children}
    </section>
  );
}

function IncomingQueueWorkspace({
  canViewPos,
  canTransactPos,
  shiftState = { shift: null },
  incomingOrdersState,
  incomingOrderActionState,
  handleIncomingOrderStatusChange,
  handleOpenIncomingOrderReceipt,
  incomingReceiptOpeningId,
  handleOpenIncomingOrderHistory,
  incomingHistoryOpeningId,
  refreshIncomingOrders,
  locationsState,
  queueLocationScopeId,
  locked,
  sectionId
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const incomingOrdersAccessState = String(incomingOrdersState?.accessState || '').trim() || 'idle';
  const incomingOrdersErrorMessage = String(incomingOrdersState?.errorMessage || '').trim();
  const selectedLocationName = !queueLocationScopeId
    ? 'Not selected'
    : (locations.find((location) => Number(location.location_id) === Number(queueLocationScopeId))?.name || 'Selected Location');

  return (
    <div id={sectionId} className="space-y-4">
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
        <Button
          type="button"
          onClick={() => refreshIncomingOrders?.()}
          disabled={incomingOrdersState?.loading || locked}
          className="h-10 rounded-lg !bg-[#2563EB] px-5 text-sm font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          {incomingOrdersState?.loading ? 'Refreshing...' : 'Refresh Queue'}
        </Button>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-3 text-sm leading-5 text-[#334155]">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-500 text-white">
          <Info className="h-4 w-4" />
        </span>
        <p>
          Completed or cancelled online orders move to History/Receipt Preview.
          <br />
          Incoming Queue shows active fulfillment statuses only.
        </p>
      </div>

      {!canViewPos || incomingOrdersAccessState === 'forbidden' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {incomingOrdersErrorMessage || 'You need POS view permission to access incoming online orders.'}
        </p>
      ) : incomingOrdersAccessState === 'error' ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {incomingOrdersErrorMessage || 'Failed to load incoming online orders. Try refreshing.'}
        </p>
      ) : incomingOrdersState?.loading && incomingOrders.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Loading incoming orders...</p>
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
            <p className="mt-2 text-sm leading-5 text-[#475569]">New online orders will appear here once they are received.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {incomingOrders.map((order) => {
            const actionLoading = incomingOrderActionState?.[order.pos_transaction_id] || '';
            const nextActions = getNextStatusActions(order);
            const deliveryCoords = parseDeliveryCoords(order);
            const mapLink = deliveryCoords
              ? `https://maps.google.com/?q=${deliveryCoords.latitude},${deliveryCoords.longitude}`
              : '';
            return (
              <div key={`incoming-workspace-${order.pos_transaction_id}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-[#0F172A]">{order.customer_name || 'Guest Buyer'}</p>
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-[#1A4E8D]">
                    {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status || 'Unknown'}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <p>PIN: <span className="font-semibold text-slate-900">{order.tracking_pin || '-'}</span></p>
                  <p>{ORDER_METHOD_LABELS[order.order_method] || order.order_method} / {PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type}</p>
                  {order.delivery_address ? <p>{order.delivery_address}</p> : null}
                  {deliveryCoords ? <p>Coords: {deliveryCoords.latitude.toFixed(6)}, {deliveryCoords.longitude.toFixed(6)}</p> : null}
                  {deliveryCoords ? (
                    <a
                      href={mapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    className="font-semibold text-[#1A4E8D] underline"
                    >
                      Open pin in map
                    </a>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {nextActions.map((status) => (
                    <Button
                      key={`incoming-workspace-action-${order.pos_transaction_id}-${status}`}
                      type="button"
                      size="sm"
                      variant={status === 'rejected' ? 'destructive' : 'outline'}
                      disabled={Boolean(actionLoading) || !canTransactPos || locked || !shiftState.shift}
                      onClick={() => handleIncomingOrderStatusChange?.(order.pos_transaction_id, status)}
                    >
                      {actionLoading === status ? 'Saving...' : (FULFILLMENT_STATUS_LABELS[status] || status)}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={locked || !canViewPos || incomingReceiptOpeningId !== null}
                    onClick={() => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id)}
                  >
                    {incomingReceiptOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'Open Receipt'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={locked || !canViewPos || incomingHistoryOpeningId !== null}
                    onClick={() => handleOpenIncomingOrderHistory?.(order)}
                  >
                    {incomingHistoryOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'Open in History'}
                  </Button>
                </div>
                {!canTransactPos && (
                  <p className="mt-2 text-[11px] text-slate-500">You need POS transact permission to update order statuses.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LocationScopeWorkspace({
  canViewPos,
  locationsState,
  queueLocationScopeId,
  setQueueLocationScopeId,
  incomingOrdersState,
  refreshIncomingOrders,
  locked,
  sectionId
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];

  return (
    <div id={sectionId} className="space-y-3">
      {!canViewPos ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You need POS view permission to manage location scope for online orders.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Label className="text-xs">Queue Location Scope</Label>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
              value={queueLocationScopeId || ''}
              onChange={(event) => {
                const nextValue = event.target.value ? Number(event.target.value) : null;
                setQueueLocationScopeId(nextValue);
              }}
            >
              <option value="" disabled>Select queue location</option>
              {locations.map((location) => (
                <option key={`workspace-location-${location.location_id}`} value={location.location_id}>
                  {location.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-600">
              This filters incoming queue results and status actions to the selected fulfillment location.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-900">Live Queue Snapshot</p>
            <p className="mt-1 text-xs text-slate-600">Current visible queue count: {incomingOrders.length}</p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => refreshIncomingOrders?.()} disabled={incomingOrdersState?.loading || locked}>
              {incomingOrdersState?.loading ? 'Refreshing Queue...' : 'Refresh Incoming Queue'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SyncQueueWorkspace({
  queuedTerminalOperations = [],
  queueStatusFilter = 'all',
  setQueueStatusFilter = () => {},
  queueSummary = {},
  replayingQueuedTerminalOperations = false,
  handleReplayQueuedTerminalOperations = () => {},
  handleRetryQueuedOperation = () => {},
  handleResolveQueuedOperation = () => {},
  isOnline = true,
  locked = false,
  sectionId
}) {
  const entries = Array.isArray(queuedTerminalOperations) ? queuedTerminalOperations : [];
  const pendingCount = Number(queueSummary?.pending || 0);
  const blockedCount = Number(queueSummary?.blocked || 0);
  const totalCount = Number(queueSummary?.total || entries.length);

  return (
    <div id={sectionId} className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Total</p>
            <p className="text-sm font-semibold text-slate-900">{totalCount}</p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5">
            <p className="text-[11px] uppercase tracking-wide text-sky-700">Pending</p>
            <p className="text-sm font-semibold text-sky-900">{pendingCount}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5">
            <p className="text-[11px] uppercase tracking-wide text-rose-700">Blocked</p>
            <p className="text-sm font-semibold text-rose-900">{blockedCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
            <p className="text-[11px] uppercase tracking-wide text-emerald-700">Replayed</p>
            <p className="text-sm font-semibold text-emerald-900">{Number(queueSummary?.replayed || 0)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Filter</Label>
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
              value={queueStatusFilter}
              onChange={(event) => setQueueStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="queued">Queued</option>
              <option value="replaying">Replaying</option>
              <option value="replayed">Replayed</option>
              <option value="failed_manual_resolution_required">Manual resolution</option>
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleReplayQueuedTerminalOperations({ toastIfEmpty: true })}
            disabled={!isOnline || replayingQueuedTerminalOperations || locked}
          >
            {replayingQueuedTerminalOperations ? 'Replaying...' : 'Replay queued'}
          </Button>
        </div>
        {!isOnline && (
          <p className="mt-2 text-xs text-amber-700">
            Offline mode detected. Replays will resume automatically once connectivity returns.
          </p>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          No queue entries for this filter.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const statusKey = String(entry?.status || '').trim() || 'queued';
            const lastError = entry?.last_error && typeof entry.last_error === 'object' ? entry.last_error : null;
            const canRetry = statusKey === 'failed_manual_resolution_required' || statusKey === 'queued';
            const canResolve = statusKey === 'failed_manual_resolution_required';
            const operationLabel = QUEUE_OPERATION_LABELS[entry?.operation] || entry?.operation || 'Unknown operation';
            return (
              <div key={entry.intent_id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{operationLabel}</p>
                    <p className="text-xs text-slate-500">Intent: {entry.intent_id}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${QUEUE_STATUS_CLASSES[statusKey] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                    {QUEUE_STATUS_LABELS[statusKey] || statusKey}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 md:grid-cols-2">
                  <p>Queued: <span className="font-semibold text-slate-900">{parseIsoDateTime(entry?.queued_at)}</span></p>
                  <p>Updated: <span className="font-semibold text-slate-900">{parseIsoDateTime(entry?.updated_at)}</span></p>
                  <p>Attempts: <span className="font-semibold text-slate-900">{Number(entry?.attempt_count || 0)}</span></p>
                  <p>Next retry: <span className="font-semibold text-slate-900">{entry?.next_retry_at ? parseIsoDateTime(entry.next_retry_at) : '-'}</span></p>
                </div>
                {lastError?.message ? (
                  <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800">
                    <div className="flex items-center gap-1 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Last error
                    </div>
                    <p className="mt-1">{lastError.message}</p>
                    {(lastError.code || lastError.status) && (
                      <p className="mt-1 text-[11px]">
                        {lastError.code ? `Code: ${lastError.code}` : ''}{lastError.code && lastError.status ? ' | ' : ''}{lastError.status ? `HTTP: ${lastError.status}` : ''}
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {canRetry && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() => handleRetryQueuedOperation(entry.intent_id)}
                    >
                      Retry now
                    </Button>
                  )}
                  {canResolve && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={locked}
                      onClick={() => handleResolveQueuedOperation(entry.intent_id)}
                    >
                      Mark resolved
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShiftControlsWorkspace({
  shiftState,
  terminalMeta,
  locationsState,
  operatingLocationId,
  setOperatingLocationId,
  canSwitchPosLocation,
  handleSwitchShiftLocation,
  openShiftForm,
  setOpenShiftForm,
  handleOpenShift,
  shiftActionLoading,
  canTransactPos,
  locked,
  refreshOperationalContext,
  sectionId
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const [switchReason, setSwitchReason] = useState('');
  const shiftLocationId = Number(shiftState?.shift?.location_id || 0) || null;
  const activeShift = shiftState?.shift || null;
  const canSubmitOpenShift = isValidOpeningCashAmount(openShiftForm.openingFloatAmount);
  const shiftLocationLabel = activeShift?.location?.name || activeShift?.location_name || activeShift?.location_id || 'Unassigned';
  const summaryRows = activeShift ? [
    {
      icon: ClipboardList,
      label: 'Shift ID:',
      value: `#${activeShift.pos_terminal_shift_id}`,
      valueClassName: 'text-[18px] font-black text-[#2563EB]'
    },
    {
      icon: CalendarDays,
      label: 'Business Date:',
      value: activeShift.business_date || '-',
      valueClassName: 'text-[18px] font-black text-[#2563EB]'
    },
    {
      icon: AlertCircle,
      label: 'Opened At:',
      value: parseIsoDateTime(activeShift.opened_at),
      valueClassName: 'text-[13px] font-extrabold text-[#0F172A]'
    },
    {
      icon: CircleDollarSign,
      label: 'Opening Float:',
      value: `${terminalMeta.pettyCashSymbol} ${money(activeShift.opening_float_amount)}`,
      valueClassName: 'text-[13px] font-extrabold text-[#0F172A]'
    },
    {
      icon: Banknote,
      label: 'Expected Cash:',
      value: `${terminalMeta.pettyCashSymbol} ${money(shiftState.cashSummary?.expected_cash_amount)}`,
      valueClassName: 'text-[13px] font-extrabold text-emerald-700'
    },
    {
      icon: Banknote,
      label: 'Cash Sales:',
      value: `${terminalMeta.pettyCashSymbol} ${money(shiftState.cashSummary?.cash_sales_amount)}`,
      valueClassName: 'text-[13px] font-extrabold text-emerald-700'
    },
    {
      icon: MapPinned,
      label: 'Shift location:',
      value: shiftLocationLabel,
      valueClassName: 'text-[13px] font-extrabold text-[#0F172A]'
    }
  ] : [];

  return (
    <div id={sectionId} className="space-y-4">
      <h2 className="sr-only">Shift Controls</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[#2563EB]">
            <MapPinned className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-black text-[#0F172A]">Operating Location</p>
            <select
              className="mt-2 h-11 w-full rounded-lg border border-blue-300 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              value={operatingLocationId || ''}
              onChange={(event) => {
                const nextValue = event.target.value ? Number(event.target.value) : null;
                setOperatingLocationId(nextValue);
              }}
            >
              {locations.map((location) => (
                <option key={`shift-operating-location-${location.location_id}`} value={location.location_id}>
                  {location.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[12px] leading-5 text-[#475569]">
              Catalog, checkout, and dashboard use this location scope.
            </p>
          </div>
        </div>
      </div>

      {shiftState.loading ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Loading shift context...</p>
      ) : activeShift ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <div className="grid gap-0 md:grid-cols-2">
              <div className="space-y-0 md:border-r md:border-slate-200 md:pr-4">
                {summaryRows.slice(0, 4).map((row, index) => {
                  const RowIcon = row.icon;
                  return (
                    <div key={`shift-summary-left-${row.label}`} className={`flex items-center gap-3 py-3 ${index < 3 ? 'border-b border-slate-100' : ''}`}>
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-[#2563EB]">
                        <RowIcon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-[#5B6B86]">{row.label}</p>
                        <p className={`${row.valueClassName} mt-0.5 break-words leading-6`}>{row.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-0 md:pl-4">
                {summaryRows.slice(4).map((row, index) => {
                  const RowIcon = row.icon;
                  return (
                    <div key={`shift-summary-right-${row.label}`} className={`flex items-center gap-3 py-3 ${index < 2 ? 'border-b border-slate-100' : ''}`}>
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-[#2563EB]">
                        <RowIcon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-[#5B6B86]">{row.label}</p>
                        <p className={`${row.valueClassName} mt-0.5 break-words leading-6`}>{row.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {canSwitchPosLocation && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/55 p-4 shadow-sm shadow-slate-200/50">
              <p className="text-[13px] font-black text-[#0F172A]">Switch Shift Location</p>
              <select
                className="mt-3 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                value={operatingLocationId || ''}
                onChange={(event) => {
                  const nextValue = event.target.value ? Number(event.target.value) : null;
                  setOperatingLocationId(nextValue);
                }}
              >
                {locations.map((location) => (
                  <option key={`switch-location-${location.location_id}`} value={location.location_id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <Input
                className="mt-3 h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                value={switchReason}
                onChange={(event) => setSwitchReason(event.target.value)}
                placeholder="Reason for location switch"
              />
              <Button
                type="button"
                variant="outline"
                className="mt-3 h-10 rounded-lg border-slate-300 bg-white px-4 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
                disabled={shiftActionLoading.switchLocation || !operatingLocationId || Number(operatingLocationId) === Number(shiftLocationId)}
                onClick={() => handleSwitchShiftLocation?.({
                  targetLocationId: operatingLocationId,
                  reason: switchReason
                })}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {shiftActionLoading.switchLocation ? 'Switching...' : 'Switch Shift Location'}
              </Button>
            </div>
          )}
          {!canSwitchPosLocation && (
            <p className="text-[11px] text-slate-500">
              You do not have permission to switch shift location.
            </p>
          )}
          <div>
            <Button
              type="button"
              onClick={refreshOperationalContext}
              className="h-10 rounded-lg !bg-[#2563EB] px-5 text-[13px] font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Shift Data
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            Shift Closed. Please open your shift before using the POS.
          </p>
          <div className="mt-4 space-y-3">
            <Label className="text-[12px] font-black text-[#0F172A]">Opening Float ({terminalMeta.pettyCashSymbol})</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              type="number"
              min="0"
              step="0.01"
              required
              value={openShiftForm.openingFloatAmount}
              onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
              placeholder="0.00"
            />
            <Label className="text-[12px] font-black text-[#0F172A]">Opening Note (Optional)</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              value={openShiftForm.openingNote}
              onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingNote: event.target.value }))}
              placeholder="Opening shift cash note"
            />
            <Button
              type="button"
              className="h-10 rounded-lg !bg-[#2563EB] px-5 text-[13px] font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
              onClick={handleOpenShift}
              disabled={shiftActionLoading.open || locked || !canTransactPos || !canSubmitOpenShift}
            >
              {shiftActionLoading.open ? 'Opening Shift...' : 'Open Shift'}
            </Button>
            {!canTransactPos && <p className="text-[11px] text-slate-500">You need POS transact permission to open shifts.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function CashDrawerWorkspace({
  shiftState,
  canAdjustCashDrawer,
  cashEventForm,
  setCashEventForm,
  terminalMeta,
  handleRecordCashEvent,
  shiftActionLoading,
  locked,
  sectionId
}) {
  return (
    <div id={sectionId} className="space-y-3">
      {!shiftState.shift || !canAdjustCashDrawer ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {!shiftState.shift
            ? 'Open a shift first before recording cash drawer events.'
            : 'You need cash drawer adjustment permission to use this section.'}
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <Label className="text-xs">Event Type</Label>
          <select
            className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
            value={cashEventForm.eventType}
            onChange={(event) => setCashEventForm((prev) => ({ ...prev, eventType: event.target.value }))}
          >
            <option value="cash_in">Cash In</option>
            <option value="cash_out">Cash Out</option>
            <option value="opening_adjustment">Opening Adjustment</option>
            <option value="closing_adjustment">Closing Adjustment</option>
          </select>
          <Label className="text-xs">Amount ({terminalMeta.pettyCashSymbol})</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={cashEventForm.amount}
            onChange={(event) => setCashEventForm((prev) => ({ ...prev, amount: event.target.value }))}
            placeholder="0.00"
          />
          <Label className="text-xs">Reason</Label>
          <Input
            value={cashEventForm.reason}
            onChange={(event) => setCashEventForm((prev) => ({ ...prev, reason: event.target.value }))}
            placeholder="Reason for adjustment"
          />
          <Button type="button" onClick={handleRecordCashEvent} disabled={shiftActionLoading.cashEvent || locked}>
            {shiftActionLoading.cashEvent ? 'Saving Event...' : 'Record Cash Event'}
          </Button>
        </div>
      )}
    </div>
  );
}

function CloseShiftWorkspace({
  shiftState,
  canCloseDay,
  closeShiftForm,
  setCloseShiftForm,
  terminalMeta,
  handleCloseShift,
  shiftActionLoading,
  locked,
  sectionId
}) {
  return (
    <div id={sectionId} className="space-y-3">
      {!shiftState.shift || !canCloseDay ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {!shiftState.shift ? 'No active shift to close.' : 'You need close-day permission to close shifts.'}
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <p className="text-xs text-slate-600">
            Expected Cash: <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(shiftState.cashSummary?.expected_cash_amount)}</span>
          </p>
          <Label className="text-xs">Closing Cash ({terminalMeta.pettyCashSymbol})</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={closeShiftForm.closingCashAmount}
            onChange={(event) => setCloseShiftForm((prev) => ({ ...prev, closingCashAmount: event.target.value }))}
            placeholder={money(shiftState.cashSummary?.expected_cash_amount || 0)}
          />
          <Label className="text-xs">Closing Note (Optional)</Label>
          <Input
            value={closeShiftForm.closingNote}
            onChange={(event) => setCloseShiftForm((prev) => ({ ...prev, closingNote: event.target.value }))}
            placeholder="End-of-shift note"
          />
          <Button type="button" onClick={handleCloseShift} disabled={shiftActionLoading.close || locked}>
            {shiftActionLoading.close ? 'Closing Shift...' : 'Close Shift'}
          </Button>
        </div>
      )}
    </div>
  );
}

function SalesTodayWorkspace({ todayDashboard, terminalMeta, sectionId }) {
  const paymentBreakdown = todayDashboard?.salesSummary?.payment_breakdown || [];
  const orderMethodBreakdown = todayDashboard?.salesSummary?.order_method_breakdown || [];

  return (
    <div id={sectionId} className="space-y-3">
      {todayDashboard.loading ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Refreshing today summary...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Business Date</p>
              <p className="text-sm font-semibold text-slate-900">{todayDashboard.businessDate || '-'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Transactions</p>
              <p className="text-sm font-semibold text-slate-900">{todayDashboard.salesSummary?.transaction_count || 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Net Total</p>
              <p className="text-sm font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(todayDashboard.salesSummary?.total_amount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Gross Sales</p>
              <p className="text-sm font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(todayDashboard.salesSummary?.subtotal_amount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Discounts</p>
              <p className="text-sm font-semibold text-rose-600">- {terminalMeta.pettyCashSymbol} {money(todayDashboard.salesSummary?.discount_amount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">DGFY Convenience Fees</p>
              <p className="text-sm font-semibold text-slate-900">+ {terminalMeta.pettyCashSymbol} {money(todayDashboard.salesSummary?.service_fee_total)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">Payment Types</p>
              <div className="mt-2 space-y-1">
                {paymentBreakdown.length > 0 ? paymentBreakdown.map((entry) => (
                  <div key={`workspace-payment-${entry.payment_type}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{PAYMENT_TYPE_LABELS[entry.payment_type] || entry.payment_type}</span>
                    <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(entry.amount)} ({entry.count || 0})</span>
                  </div>
                )) : <p className="text-xs text-slate-500">No payment activity yet.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">Order Methods</p>
              <div className="mt-2 space-y-1">
                {orderMethodBreakdown.length > 0 ? orderMethodBreakdown.map((entry) => (
                  <div key={`workspace-order-${entry.order_method}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{ORDER_METHOD_LABELS[entry.order_method] || entry.order_method}</span>
                    <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(entry.amount)} ({entry.count || 0})</span>
                  </div>
                )) : <p className="text-xs text-slate-500">No order-method activity yet.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const REPORT_TABS = [
  { id: 'daily_total', label: 'Daily Total Reports' },
  { id: 'popular_item', label: 'Popular Item' },
  { id: 'transaction', label: 'Transaction' }
];

const POPULAR_ITEM_CHART_COLORS = ['#2F8CA3', '#C37A65', '#6FA586', '#C78150', '#1F7F85'];

const getReportMetricNumber = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatShortReportDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const parseBusinessDateLocal = (value) => {
  const normalized = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month, day] = normalized.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatBusinessDateLocal = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatReportDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatReportTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const downloadCsvFile = (filename, rows = []) => {
  if (typeof window === 'undefined') return;
  const csv = rows.map((row) => (
    row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
  )).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const buildDailyReportBars = (dailyTotals = [], reportEndBusinessDate = '', selectedBusinessDate = '') => {
  const rows = Array.isArray(dailyTotals) ? dailyTotals : [];
  const totalsByDate = new Map(rows.map((row) => [
    String(row?.business_date || '').slice(0, 10),
    row
  ]));
  const endDateValue = String(reportEndBusinessDate || '').slice(0, 10);
  const selectedDateValue = String(selectedBusinessDate || endDateValue || '').slice(0, 10);
  const endDate = parseBusinessDateLocal(endDateValue) || new Date();
  const normalizedRows = Array.from({ length: 11 }, (_, index) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - (10 - index));
    const businessDate = formatBusinessDateLocal(date);
    const row = totalsByDate.get(businessDate) || {
      business_date: businessDate,
      total_amount: 0,
      transaction_count: 0,
      discount_amount: 0,
      item_count: 0,
      discount_item_count: 0,
      total_cost: 0,
      refund_amount: 0,
      refunded_item_count: 0,
      net_profit: 0
    };
    return row;
  });
  const maxAmount = Math.max(...normalizedRows.map((row) => getReportMetricNumber(row?.total_amount)), 0);
  return normalizedRows.map((row, index) => {
    const businessDate = String(row?.business_date || '').slice(0, 10);
    const date = parseBusinessDateLocal(businessDate);
    const amount = getReportMetricNumber(row?.total_amount);
    const height = amount > 0 && maxAmount > 0 ? Math.min(100, Math.max(12, (amount / maxAmount) * 100)) : 2;
    return {
      key: `${businessDate || 'report-date'}-${index}`,
      businessDate,
      label: formatShortReportDate(date),
      amount,
      transactionCount: Number.parseInt(row?.transaction_count || 0, 10),
      discountAmount: getReportMetricNumber(row?.discount_amount),
      itemCount: getReportMetricNumber(row?.item_count || row?.total_item_count),
      discountItemCount: getReportMetricNumber(row?.discount_item_count),
      totalCost: getReportMetricNumber(row?.total_cost || row?.cost_amount),
      refundAmount: getReportMetricNumber(row?.refund_amount),
      refundedItemCount: getReportMetricNumber(row?.refunded_item_count),
      netProfit: getReportMetricNumber(row?.net_profit),
      height,
      isActive: businessDate === selectedDateValue
    };
  });
};

function ReportMetricCard({ value, label, emphasize = false }) {
  return (
    <div className="grid min-h-[7rem] place-items-center rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center shadow-sm shadow-slate-200/60">
      <div>
        <p className={`text-[18px] font-black tracking-tight ${emphasize ? 'text-[#1A4E8D]' : 'text-[#0F172A]'}`}>{value}</p>
        <p className="mt-2 text-[11px] font-semibold leading-4 text-[#64748B]">{label}</p>
      </div>
    </div>
  );
}

const buildPopularItemChart = (items = []) => {
  const topItems = (Array.isArray(items) ? items : [])
    .slice(0, 5)
    .map((item, index) => ({
      key: `popular-chart-${item?.item_id || index}`,
      label: String(item?.item_name || `Item #${item?.item_id || index + 1}`).trim(),
      amount: getReportMetricNumber(item?.amount),
      quantity: getReportMetricNumber(item?.quantity),
      color: POPULAR_ITEM_CHART_COLORS[index % POPULAR_ITEM_CHART_COLORS.length]
    }));
  const totalAmount = topItems.reduce((sum, item) => sum + item.amount, 0);
  const totalQuantity = topItems.reduce((sum, item) => sum + item.quantity, 0);
  const basis = totalAmount > 0 ? 'amount' : 'quantity';
  const totalBasis = basis === 'amount' ? totalAmount : totalQuantity;
  let current = 0;
  const gradientStops = totalBasis > 0
    ? topItems.map((item) => {
      const size = ((basis === 'amount' ? item.amount : item.quantity) / totalBasis) * 100;
      const start = current;
      const end = current + size;
      current = end;
      return `${item.color} ${start}% ${end}%`;
    })
    : ['#CBD5E1 0% 100%'];

  return {
    topItems,
    totalAmount,
    totalQuantity,
    gradient: `conic-gradient(${gradientStops.join(', ')})`
  };
};

function ReportWorkspace({ todayDashboard, terminalMeta, activeTerminalId = '', operatingLocationId = null, reportRefreshKey = 0, sectionId }) {
  const [activeTab, setActiveTab] = useState('daily_total');
  const [slideDirection, setSlideDirection] = useState('forward');
  const [selectedDailyDate, setSelectedDailyDate] = useState('');
  const [selectedDateSummary, setSelectedDateSummary] = useState(null);
  const [selectedDateSummaryLoading, setSelectedDateSummaryLoading] = useState(false);
  const [transactionDateFrom, setTransactionDateFrom] = useState('');
  const [transactionDateTo, setTransactionDateTo] = useState('');
  const [reportTransactions, setReportTransactions] = useState([]);
  const [reportTransactionsLoading, setReportTransactionsLoading] = useState(false);
  const activeTabIndex = Math.max(0, REPORT_TABS.findIndex((tab) => tab.id === activeTab));
  const salesSummary = todayDashboard?.salesSummary || {};
  const selectedDailyBusinessDate = selectedDailyDate || String(todayDashboard.businessDate || '').slice(0, 10);
  const todayBusinessDate = String(todayDashboard.businessDate || '').slice(0, 10);
  const selectedDateSalesSummary = selectedDateSummary?.sales_summary || null;
  const popularItemsSource = selectedDailyBusinessDate && selectedDailyBusinessDate !== todayBusinessDate
    ? (selectedDateSalesSummary || {})
    : salesSummary;
  const popularItems = Array.isArray(popularItemsSource.popular_items) ? popularItemsSource.popular_items : [];
  const popularItemChart = buildPopularItemChart(popularItems);
  const transactionDefaultDate = selectedDailyBusinessDate || String(todayDashboard.businessDate || '').slice(0, 10);
  const dailyBars = buildDailyReportBars(salesSummary.daily_totals, todayDashboard.businessDate, selectedDailyBusinessDate);
  const selectedDailyBar = dailyBars.find((bar) => bar.businessDate === selectedDailyBusinessDate) || dailyBars[dailyBars.length - 1] || null;
  const amountCharged = getReportMetricNumber(selectedDailyBar?.amount ?? salesSummary.total_amount);
  const discountAmount = getReportMetricNumber(selectedDailyBar?.discountAmount ?? salesSummary.discount_amount);
  const transactionCount = getReportMetricNumber(selectedDailyBar?.transactionCount ?? salesSummary.transaction_count);
  const itemCount = getReportMetricNumber(selectedDailyBar?.itemCount ?? salesSummary.item_count ?? salesSummary.total_item_count);
  const totalCost = getReportMetricNumber(selectedDailyBar?.totalCost ?? salesSummary.total_cost ?? salesSummary.cost_amount);
  const refundAmount = getReportMetricNumber(selectedDailyBar?.refundAmount ?? salesSummary.refund_amount);
  const netProfit = getReportMetricNumber(selectedDailyBar?.netProfit ?? salesSummary.net_profit);
  const discountItemCount = getReportMetricNumber(selectedDailyBar?.discountItemCount ?? salesSummary.discount_item_count);
  const refundedItemCount = getReportMetricNumber(selectedDailyBar?.refundedItemCount ?? salesSummary.refunded_item_count);
  const handleReportTabSelect = (nextTabId) => {
    const nextTabIndex = Math.max(0, REPORT_TABS.findIndex((tab) => tab.id === nextTabId));
    if (nextTabIndex === activeTabIndex) return;
    setSlideDirection(nextTabIndex > activeTabIndex ? 'forward' : 'backward');
    setActiveTab(nextTabId);
  };

  const handleTransactionDateFromChange = (event) => {
    const nextDate = event.target.value;
    setTransactionDateFrom(nextDate);
    setTransactionDateTo((previousDate) => (
      previousDate && nextDate && previousDate < nextDate ? nextDate : previousDate
    ));
  };

  const handleTransactionDateToChange = (event) => {
    const nextDate = event.target.value;
    setTransactionDateTo(nextDate);
    setTransactionDateFrom((previousDate) => (
      previousDate && nextDate && previousDate > nextDate ? nextDate : previousDate
    ));
  };

  useEffect(() => {
    if (!todayBusinessDate) return;
    setSelectedDailyDate((previous) => (
      previous && previous !== todayBusinessDate ? todayBusinessDate : previous
    ));
  }, [reportRefreshKey, todayBusinessDate]);

  useEffect(() => {
    if (!transactionDefaultDate) return;
    setTransactionDateFrom(transactionDefaultDate);
    setTransactionDateTo(transactionDefaultDate);
  }, [transactionDefaultDate]);

  const transactionRows = useMemo(() => reportTransactions.map((row) => {
    const totalAmount = getReportMetricNumber(row?.total_amount);
    const serviceAmount = getReportMetricNumber(row?.service_fee_amount) + getReportMetricNumber(row?.restaurant_service_charge_amount);
    const costAmount = getReportMetricNumber(row?.total_cost ?? row?.cost_amount);
    return {
      id: row?.pos_transaction_id || row?.invoice_number || row?.created_at,
      createdAt: row?.created_at,
      totalAmount,
      serviceAmount,
      costAmount,
      profitAmount: totalAmount - serviceAmount - costAmount
    };
  }), [reportTransactions]);
  const transactionReportTotals = useMemo(() => transactionRows.reduce((totals, row) => ({
    totalAmount: totals.totalAmount + row.totalAmount,
    serviceAmount: totals.serviceAmount + row.serviceAmount,
    costAmount: totals.costAmount + row.costAmount,
    profitAmount: totals.profitAmount + row.profitAmount
  }), {
    totalAmount: 0,
    serviceAmount: 0,
    costAmount: 0,
    profitAmount: 0
  }), [transactionRows]);
  const downloadTransactionReport = () => {
    const rows = [
      ['Date', 'Time', 'Total', 'Service Amount', 'Cost', 'Profit'],
      ...transactionRows.map((row) => [
        formatReportDate(row.createdAt),
        formatReportTime(row.createdAt),
        money(row.totalAmount),
        money(row.serviceAmount),
        money(row.costAmount),
        money(row.profitAmount)
      ])
    ];
    const reportRangeName = transactionDateFrom && transactionDateTo
      ? `${transactionDateFrom}-to-${transactionDateTo}`
      : 'report';
    downloadCsvFile(`dgfy-transactions-${reportRangeName}.csv`, rows);
  };

  useEffect(() => {
    let cancelled = false;
    const terminalId = String(activeTerminalId || '').trim();

    if (activeTab !== 'popular_item' || !selectedDailyBusinessDate || !terminalId) {
      setSelectedDateSummary(null);
      setSelectedDateSummaryLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (selectedDailyBusinessDate === todayBusinessDate) {
      setSelectedDateSummary(null);
      setSelectedDateSummaryLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadSelectedDateSummary = async () => {
      setSelectedDateSummaryLoading(true);
      try {
        const result = await fetchTerminalTodayDashboard({
          business_date: selectedDailyBusinessDate,
          terminal_id: terminalId,
          location_id: operatingLocationId || undefined
        }, { skipGlobalErrorToast: true });
        if (!cancelled) {
          setSelectedDateSummary(result || null);
        }
      } catch {
        if (!cancelled) {
          setSelectedDateSummary(null);
        }
      } finally {
        if (!cancelled) {
          setSelectedDateSummaryLoading(false);
        }
      }
    };

    loadSelectedDateSummary();
    return () => {
      cancelled = true;
    };
  }, [activeTab, activeTerminalId, operatingLocationId, reportRefreshKey, selectedDailyBusinessDate, todayDashboard.businessDate]);

  useEffect(() => {
    let cancelled = false;
    const loadReportTransactions = async () => {
      if (activeTab !== 'transaction' || !transactionDateFrom || !transactionDateTo) {
        setReportTransactions([]);
        setReportTransactionsLoading(false);
        return;
      }
      setReportTransactionsLoading(true);
      try {
        const result = await fetchPosTransactions({
          date_from: transactionDateFrom,
          date_to: transactionDateTo,
          location_id: operatingLocationId || undefined,
          status: 'completed',
          limit: 100
        });
        if (!cancelled) {
          setReportTransactions(Array.isArray(result?.transactions) ? result.transactions : []);
        }
      } catch {
        if (!cancelled) {
          setReportTransactions([]);
        }
      } finally {
        if (!cancelled) {
          setReportTransactionsLoading(false);
        }
      }
    };
    loadReportTransactions();
    return () => {
      cancelled = true;
    };
  }, [activeTab, operatingLocationId, reportRefreshKey, transactionDateFrom, transactionDateTo]);

  return (
    <div id={sectionId} className="space-y-4 overflow-hidden">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
        <div className="relative grid grid-cols-3">
          <span
            className="absolute inset-y-1 left-0 rounded-lg bg-[#1A4E8D] shadow-sm shadow-blue-900/20 transition-transform duration-300 ease-out"
            style={{ width: '33.333333%', transform: `translateX(${activeTabIndex * 100}%)` }}
            aria-hidden="true"
          />
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleReportTabSelect(tab.id)}
              className={`relative z-10 min-h-11 rounded-lg px-2 py-2 text-center text-[12px] font-extrabold leading-4 transition-colors duration-200 ${
                activeTab === tab.id ? 'text-white' : 'text-[#334155] hover:text-[#1A4E8D]'
              }`}
              aria-pressed={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {todayDashboard.loading ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Refreshing reports...</p>
      ) : (
        <div
          className="flex transition-transform duration-300 ease-out"
          data-slide-direction={slideDirection}
          style={{ width: '300%', transform: `translateX(-${activeTabIndex * 33.333333}%)` }}
        >
          <section className="w-1/3 shrink-0 pr-3">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
                <div className="relative mb-3 flex min-h-8 items-center justify-between gap-3">
                  <h3 className="text-[15px] font-black text-[#0F172A]">Daily Totals</h3>
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-cyan-600 px-4 py-2 text-center text-sm font-black text-white shadow-lg shadow-cyan-900/20">
                    {selectedDailyBar?.label || formatShortReportDate(todayDashboard.businessDate ? new Date(`${todayDashboard.businessDate}T00:00:00`) : new Date())}
                  </span>
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-extrabold text-[#1A4E8D]">
                    {selectedDailyBar?.businessDate || todayDashboard.businessDate || 'Today'}
                  </span>
                </div>
                <div className="relative min-h-[10rem] rounded-xl bg-slate-50 px-3 pb-3 pt-4">
                  <div className="absolute left-3 right-3 top-1/2 border-t border-slate-200" />
                  <div className="relative flex min-h-[8.5rem] items-end justify-between gap-2">
                    {dailyBars.map((bar) => (
                      <button
                        key={bar.key}
                        type="button"
                        onClick={() => setSelectedDailyDate(bar.businessDate)}
                        className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-md outline-none transition focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30"
                        aria-pressed={bar.isActive}
                        aria-label={`Show daily total details for ${bar.label}`}
                      >
                        <div className="flex h-24 w-full items-end justify-center">
                          <div
                            className={`w-full max-w-[2.5rem] transition-all duration-300 ${bar.amount > 0 ? 'rounded-t-md' : 'rounded-sm'} ${bar.isActive ? 'bg-[#1A4E8D]' : (bar.amount > 0 ? 'bg-cyan-600/75' : 'bg-slate-300')}`}
                            style={{ height: `${bar.height}%` }}
                            title={`${bar.label}: ${terminalMeta.pettyCashSymbol}${money(bar.amount)}`}
                          />
                        </div>
                        <span className={`text-[10px] font-semibold leading-3 ${bar.isActive ? 'text-[#1A4E8D]' : 'text-[#475569]'}`}>
                          {bar.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <ReportMetricCard value={`${terminalMeta.pettyCashSymbol}${money(amountCharged)}`} label="Amount Charged" emphasize />
                <ReportMetricCard value={`${terminalMeta.pettyCashSymbol}${money(discountAmount)}`} label="Discount Amount" />
                <ReportMetricCard value={transactionCount} label="No. of Transactions" />
                <ReportMetricCard value={discountItemCount} label="No. of Discount Items" />
                <ReportMetricCard value={itemCount} label="No. of Items" />
                <ReportMetricCard value={`${terminalMeta.pettyCashSymbol}${money(totalCost)}`} label="Total Cost" />
                <ReportMetricCard value={`${terminalMeta.pettyCashSymbol}${money(refundAmount)}`} label="Refund Amount" />
                <ReportMetricCard value={`${terminalMeta.pettyCashSymbol}${money(netProfit)}`} label="Net Profit" emphasize />
                <ReportMetricCard value={refundedItemCount} label="No. of Items Refunded" />
              </div>
            </div>
          </section>

          <section className="w-1/3 shrink-0 px-3">
            <div className="min-h-[24rem] rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-4 grid grid-cols-3 items-center gap-3">
                <p className="text-sm font-black text-[#0F172A]">Popular Item</p>
                <div className="justify-self-center rounded-full border border-cyan-100 bg-cyan-50 px-4 py-1 text-center text-[11px] font-black text-cyan-700">
                  {selectedDailyBusinessDate || todayDashboard.businessDate || 'Today'} - Top 5
                </div>
                <TrendingUp className="h-5 w-5 justify-self-end text-[#1A4E8D]" />
              </div>
              {selectedDateSummaryLoading ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-12 text-center text-xs font-semibold text-[#64748B]">
                  Loading popular items...
                </p>
              ) : popularItemChart.topItems.length > 0 ? (
                <div className="grid min-h-[18rem] items-center gap-6 lg:grid-cols-[minmax(16rem,1fr)_minmax(12rem,0.8fr)]">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <div
                      className="relative h-56 w-56 rounded-full shadow-inner shadow-slate-300"
                      style={{ background: popularItemChart.gradient }}
                      aria-label="Top 5 popular items donut chart"
                    >
                      <div className="absolute inset-[4.2rem] grid place-items-center rounded-full bg-white shadow-sm shadow-slate-200">
                        <div className="text-center">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Total</p>
                          <p className="text-sm font-black text-[#0F172A]">{terminalMeta.pettyCashSymbol}{money(popularItemChart.totalAmount)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black text-[#0F172A]">Most Popular Items</p>
                      <p className="mt-1 text-xs font-semibold text-[#64748B]">
                        Qty {money(popularItemChart.totalQuantity)} / {terminalMeta.pettyCashSymbol}{money(popularItemChart.totalAmount)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {popularItemChart.topItems.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="truncate text-xs font-black uppercase text-[#334155]">{item.label}</span>
                        </div>
                        <span className="shrink-0 text-xs font-black text-[#0F172A]">{terminalMeta.pettyCashSymbol}{money(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-12 text-center text-xs font-semibold text-[#64748B]">
                  No item sales data for this date yet.
                </p>
              )}
            </div>
          </section>

          <section className="w-1/3 shrink-0 pl-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-4 grid grid-cols-[minmax(18rem,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#0F172A]">Transactions</p>
                  <div className="mt-1 grid max-w-[22rem] grid-cols-2 gap-2">
                    <Label className="space-y-0.5">
                      <span className="block text-[9px] font-bold uppercase tracking-wide text-[#94A3B8]">From</span>
                      <Input
                        type="date"
                        value={transactionDateFrom}
                        max={transactionDateTo || undefined}
                        onChange={handleTransactionDateFromChange}
                        className="h-8 rounded-lg text-xs font-black text-[#0F172A]"
                      />
                    </Label>
                    <Label className="space-y-0.5">
                      <span className="block text-[9px] font-bold uppercase tracking-wide text-[#94A3B8]">To</span>
                      <Input
                        type="date"
                        value={transactionDateTo}
                        min={transactionDateFrom || undefined}
                        onChange={handleTransactionDateToChange}
                        className="h-8 rounded-lg text-xs font-black text-[#0F172A]"
                      />
                    </Label>
                  </div>
                </div>
                <Button
                  type="button"
                  className="justify-self-end bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={downloadTransactionReport}
                  disabled={reportTransactionsLoading || transactionRows.length === 0}
                >
                  Download Report
                </Button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50 text-[12px] font-black uppercase tracking-wide text-[#64748B]">
                    <tr>
                      <th className="px-4 py-3 text-left">Date and Time</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Service Amount</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportTransactionsLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-[#64748B]">Loading transactions...</td>
                      </tr>
                    ) : transactionRows.length > 0 ? transactionRows.map((row) => (
                      <tr key={row.id} className="text-[#334155]">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#0F172A]">{formatReportDate(row.createdAt)}</div>
                          <div className="mt-0.5 text-xs text-[#64748B]">{formatReportTime(row.createdAt)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{terminalMeta.pettyCashSymbol}{money(row.totalAmount)}</td>
                        <td className="px-4 py-3 text-right">{terminalMeta.pettyCashSymbol}{money(row.serviceAmount)}</td>
                        <td className="px-4 py-3 text-right">{terminalMeta.pettyCashSymbol}{money(row.costAmount)}</td>
                        <td className="px-4 py-3 text-right font-black text-[#1A4E8D]">{terminalMeta.pettyCashSymbol}{money(row.profitAmount)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-[#64748B]">No transactions found.</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-black text-[#0F172A]">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">{terminalMeta.pettyCashSymbol}{money(transactionReportTotals.totalAmount)}</td>
                      <td className="px-4 py-3 text-right">{terminalMeta.pettyCashSymbol}{money(transactionReportTotals.serviceAmount)}</td>
                      <td className="px-4 py-3 text-right">{terminalMeta.pettyCashSymbol}{money(transactionReportTotals.costAmount)}</td>
                      <td className="px-4 py-3 text-right text-[#1A4E8D]">{terminalMeta.pettyCashSymbol}{money(transactionReportTotals.profitAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ItemsWorkspace({ canViewPos, locked, sectionId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { updateItem, loading: savingItem } = useUpdateItem();
  const { deleteItem, loading: deletingItem } = useDeleteItem();
  const [editingItemId, setEditingItemId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', default_sale_price: '', cost_per_unit: '' });
  const [savedItemName, setSavedItemName] = useState('');
  const [deletedItemName, setDeletedItemName] = useState('');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);

  const loadItems = useCallback(async () => {
    if (!canViewPos) {
      setItems([]);
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchPosCatalog({ limit: 200 });
      setItems(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setItems([]);
      setError(loadError?.response?.data?.message || 'Failed to load POS-visible items.');
    } finally {
      setLoading(false);
    }
  }, [canViewPos]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const sortedItems = useMemo(
    () => [...(Array.isArray(items) ? items : [])].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''))),
    [items]
  );

  const activeEditItem = useMemo(
    () => sortedItems.find((item) => Number(item?.item_id) === Number(editingItemId)) || null,
    [editingItemId, sortedItems]
  );

  const openEdit = (item) => {
    setEditingItemId(item?.item_id || null);
    setEditForm({
      name: String(item?.name || ''),
      default_sale_price: String(item?.default_sale_price ?? ''),
      cost_per_unit: String(item?.cost_per_unit ?? '')
    });
  };

  const closeEdit = () => {
    if (savingItem) return;
    setEditingItemId(null);
    setEditForm({ name: '', default_sale_price: '', cost_per_unit: '' });
  };

  const handleSave = async () => {
    if (!activeEditItem) return;
    const name = String(editForm.name || '').trim();
    if (!name) {
      toast.error('Item name is required.');
      return;
    }
    try {
      await updateItem(activeEditItem.item_id, {
        name,
        default_sale_price: Number(editForm.default_sale_price || 0),
        cost_per_unit: Number(editForm.cost_per_unit || 0)
      });
      const savedName = name;
      closeEdit();
      await loadItems();
      setSavedItemName(savedName);
    } catch (updateError) {
      toast.error(updateError?.response?.data?.message || 'Failed to update item.');
    }
  };

  const closeDeleteConfirm = () => {
    if (deletingItem) return;
    setDeleteConfirmItem(null);
  };

  const handleDelete = async (item = deleteConfirmItem) => {
    if (!item?.item_id) return;
    const itemName = String(item?.name || 'this item').trim();
    try {
      await deleteItem(item.item_id);
      const removedName = itemName;
      closeDeleteConfirm();
      if (Number(editingItemId) === Number(item.item_id)) {
        closeEdit();
      }
      await loadItems();
      setDeletedItemName(removedName);
    } catch (deleteError) {
      toast.error(deleteError?.response?.data?.message || 'Failed to delete item.');
    }
  };

  if (!canViewPos) {
    return (
      <p id={sectionId} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You need POS view permission to access SKUpervisor items.
      </p>
    );
  }

  return (
    <div id={sectionId} className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {loading && sortedItems.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">Loading POS-visible items...</p>
      ) : sortedItems.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">No items found yet.</p>
      ) : (
        <div className="space-y-2">
          {sortedItems.map((item) => (
            <div
              key={item.item_id}
              className="grid grid-cols-[auto_auto_minmax(0,1fr)_minmax(6rem,auto)_minmax(6rem,auto)] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/60"
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => openEdit(item)}
                disabled={locked || savingItem || deletingItem}
                className="h-10 w-10 rounded-lg border-slate-200 text-[#1A4E8D]"
                title={`Edit ${item.name || 'item'}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setDeleteConfirmItem(item)}
                  disabled={locked || savingItem || deletingItem}
                  className="h-10 w-10 rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50"
                  title={`Delete ${item.name || 'item'}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#0F172A]">{item.name || 'Unnamed item'}</p>
                <p className="mt-1 text-xs text-[#64748B]">SKU: {item.sku_code || 'Not set'}</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Price</p>
                <p className="text-sm font-black text-[#1A4E8D]">PHP {money(item.default_sale_price)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Cost</p>
                <p className="text-sm font-black text-[#0F172A]">PHP {money(item.cost_per_unit)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeEditItem && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-edit-modal-title"
          onClick={closeEdit}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="pos-items-edit-modal-title" className="text-lg font-black text-[#0F172A]">Edit Item</p>
                <p className="mt-1 text-sm text-[#64748B]">Update the SKUpervisor item name, price, and cost from POS.</p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingItem}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#334155] hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="text-[13px] font-semibold text-[#334155]">Item Name</span>
                <Input
                  value={editForm.name}
                  onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                  className="mt-2 h-11"
                  disabled={savingItem}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[13px] font-semibold text-[#334155]">Price</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.default_sale_price}
                    onChange={(event) => setEditForm((current) => ({ ...current, default_sale_price: event.target.value }))}
                    className="mt-2 h-11"
                    disabled={savingItem}
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-semibold text-[#334155]">Cost</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.cost_per_unit}
                    onChange={(event) => setEditForm((current) => ({ ...current, cost_per_unit: event.target.value }))}
                    className="mt-2 h-11"
                    disabled={savingItem}
                  />
                </label>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeEdit} disabled={savingItem} className="h-11 rounded-lg">
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={savingItem} className="h-11 rounded-lg bg-[#1A4E8D] text-white hover:bg-[#143F73]">
                {savingItem ? 'Saving...' : 'Save Item'}
              </Button>
            </div>
          </div>
          </div>
        </div>
      ), document.body)}

      {savedItemName && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-saved-modal-title"
          onClick={() => setSavedItemName('')}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p id="pos-items-saved-modal-title" className="text-lg font-black text-[#0F172A]">Item saved</p>
                <p className="mt-1 text-sm text-[#64748B]">
                  <span className="font-bold text-[#0F172A]">{savedItemName}</span> was updated in POS and SKUpervisor.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                type="button"
                onClick={() => setSavedItemName('')}
                className="h-11 rounded-lg bg-[#1A4E8D] px-5 text-white hover:bg-[#143F73]"
              >
                OK
              </Button>
            </div>
          </div>
          </div>
        </div>
      ), document.body)}

      {deleteConfirmItem && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-delete-confirm-modal-title"
          onClick={closeDeleteConfirm}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-rose-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p id="pos-items-delete-confirm-modal-title" className="text-lg font-black text-[#0F172A]">Delete item?</p>
                  <p className="mt-1 text-sm text-[#64748B]">
                    <span className="font-bold text-[#0F172A]">{deleteConfirmItem.name || 'This item'}</span> will be removed from POS and SKUpervisor.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDeleteConfirm}
                  disabled={deletingItem}
                  className="h-11 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => handleDelete(deleteConfirmItem)}
                  disabled={deletingItem}
                  className="h-11 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
                >
                  {deletingItem ? 'Deleting...' : 'Delete Item'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {deletedItemName && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-deleted-modal-title"
          onClick={() => setDeletedItemName('')}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-rose-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p id="pos-items-deleted-modal-title" className="text-lg font-black text-[#0F172A]">Item deleted</p>
                <p className="mt-1 text-sm text-[#64748B]">
                  <span className="font-bold text-[#0F172A]">{deletedItemName}</span> was removed from POS and SKUpervisor.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                type="button"
                onClick={() => setDeletedItemName('')}
                className="h-11 rounded-lg bg-[#1A4E8D] px-5 text-white hover:bg-[#143F73]"
              >
                OK
              </Button>
            </div>
          </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

function TerminalSetupWorkspace({ terminalMeta, sectionId }) {
  const readiness = terminalMeta?.locationBindingReadiness || null;
  const unresolvedCount = Number(readiness?.unresolved_count || 0);
  const lowConfidenceCount = Number(readiness?.low_confidence_count || 0);
  const strictReady = readiness?.ready_for_strict_mode === true;
  const readinessStatusLabel = strictReady ? 'Ready' : 'Needs remediation';
  const readinessStatusClass = strictReady
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : 'text-amber-700 bg-amber-50 border-amber-200';

  return (
    <div id={sectionId} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Petty Cash</p>
          <p className="text-sm font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(terminalMeta.pettyCashAmount)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Active Discounts</p>
          <p className="text-sm font-semibold text-slate-900">{terminalMeta.activeDiscountCount}</p>
        </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">DGFY Global Fee Policy</p>
              <p className="text-sm font-semibold text-slate-900">
                {(Array.isArray(terminalMeta.enabledFeeMethods) && terminalMeta.enabledFeeMethods.length > 0)
                  ? 'Active'
                  : 'Inactive'}
              </p>
            </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Compliance</p>
          <p className="text-sm font-semibold text-emerald-700">Dual-mode policy</p>
        </div>
      </div>
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Terminal setup values are managed in Settings &gt; POS Setup and applied here as runtime context.
      </p>
      {readiness && (
        <div className={`rounded-lg border px-3 py-3 text-xs ${readinessStatusClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Location Binding Readiness: {readinessStatusLabel}</p>
            {readiness?.migration_tag && (
              <p className="text-[11px] opacity-80">Audit tag: {readiness.migration_tag}</p>
            )}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-3">
            <p>Total shifts: <span className="font-semibold">{Number(readiness?.total_shifts || 0)}</span></p>
            <p>Unresolved: <span className="font-semibold">{unresolvedCount}</span></p>
            <p>Low confidence: <span className="font-semibold">{lowConfidenceCount}</span></p>
          </div>
        </div>
      )}
      {terminalMeta.loading && (
        <p className="text-xs text-slate-500">Refreshing terminal setup context...</p>
      )}
    </div>
  );
}

export default function TerminalOperationsWorkspace({
  viewMode,
  isMsmeMode = false,
  terminalUser,
  locked,
  terminalMeta,
  shiftState,
  todayDashboard,
  reportRefreshKey = 0,
  activeTerminalId = '',
  canViewPos,
  canTransactPos,
  canSwitchPosLocation = false,
  canAdjustCashDrawer,
  canCloseDay,
  openShiftForm,
  setOpenShiftForm,
  cashEventForm,
  setCashEventForm,
  closeShiftForm,
  setCloseShiftForm,
  shiftActionLoading,
  handleOpenShift,
  handleSwitchShiftLocation = () => {},
  handleRecordCashEvent,
  handleCloseShift,
  refreshOperationalContext,
  locationsState = { loading: false, locations: [] },
  operatingLocationId = null,
  setOperatingLocationId = () => {},
  queueLocationScopeId = null,
  setQueueLocationScopeId = () => {},
  incomingOrdersState = { loading: false, orders: [] },
  incomingOrderActionState = {},
  handleIncomingOrderStatusChange = () => {},
  handleOpenIncomingOrderReceipt = () => {},
  incomingReceiptOpeningId = null,
  handleOpenIncomingOrderHistory = () => {},
  incomingHistoryOpeningId = null,
  refreshIncomingOrders = () => {},
  queuedTerminalOperations = [],
  queueStatusFilter = 'all',
  setQueueStatusFilter = () => {},
  queueSummary = {},
  replayingQueuedTerminalOperations = false,
  handleReplayQueuedTerminalOperations = () => {},
  handleRetryQueuedOperation = () => {},
  handleResolveQueuedOperation = () => {},
  isOnline = true,
  sectionIds = {}
}) {
  const restrictedMsmeModes = new Set(['incoming_queue', 'location_scope', 'cash_drawer', 'reports', 'sales_today', 'terminal_setup']);
  const effectiveViewMode = (isMsmeMode && restrictedMsmeModes.has(viewMode))
    ? 'shift_controls'
    : viewMode;
  const modeMeta = MODE_META[effectiveViewMode] || MODE_META.shift_controls;
  const isIncomingQueueView = effectiveViewMode === 'incoming_queue';

  const content = useMemo(() => {
    switch (effectiveViewMode) {
    case 'incoming_queue':
      return (
        <IncomingQueueWorkspace
          canViewPos={canViewPos}
          canTransactPos={canTransactPos}
          shiftState={shiftState}
          incomingOrdersState={incomingOrdersState}
          incomingOrderActionState={incomingOrderActionState}
          handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
          handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
          incomingReceiptOpeningId={incomingReceiptOpeningId}
          handleOpenIncomingOrderHistory={handleOpenIncomingOrderHistory}
          incomingHistoryOpeningId={incomingHistoryOpeningId}
          refreshIncomingOrders={refreshIncomingOrders}
          locationsState={locationsState}
          queueLocationScopeId={queueLocationScopeId}
          locked={locked}
          sectionId={sectionIds.incomingOrders}
        />
      );
    case 'location_scope':
      return (
        <LocationScopeWorkspace
          canViewPos={canViewPos}
          locationsState={locationsState}
          queueLocationScopeId={queueLocationScopeId}
          setQueueLocationScopeId={setQueueLocationScopeId}
          incomingOrdersState={incomingOrdersState}
          refreshIncomingOrders={refreshIncomingOrders}
          locked={locked}
          sectionId={sectionIds.locationScope}
        />
      );
    case 'shift_controls':
      return (
        <ShiftControlsWorkspace
          shiftState={shiftState}
          terminalMeta={terminalMeta}
          locationsState={locationsState}
          operatingLocationId={operatingLocationId}
          setOperatingLocationId={setOperatingLocationId}
          canSwitchPosLocation={canSwitchPosLocation}
          handleSwitchShiftLocation={handleSwitchShiftLocation}
          openShiftForm={openShiftForm}
          setOpenShiftForm={setOpenShiftForm}
          handleOpenShift={handleOpenShift}
          shiftActionLoading={shiftActionLoading}
          canTransactPos={canTransactPos}
          locked={locked}
          refreshOperationalContext={refreshOperationalContext}
          sectionId={sectionIds.activeShift}
        />
      );
    case 'cash_drawer':
      return (
        <CashDrawerWorkspace
          shiftState={shiftState}
          canAdjustCashDrawer={canAdjustCashDrawer}
          cashEventForm={cashEventForm}
          setCashEventForm={setCashEventForm}
          terminalMeta={terminalMeta}
          handleRecordCashEvent={handleRecordCashEvent}
          shiftActionLoading={shiftActionLoading}
          locked={locked}
          sectionId={sectionIds.cashDrawer}
        />
      );
    case 'close_shift':
      return (
        <CloseShiftWorkspace
          shiftState={shiftState}
          canCloseDay={canCloseDay}
          closeShiftForm={closeShiftForm}
          setCloseShiftForm={setCloseShiftForm}
          terminalMeta={terminalMeta}
          handleCloseShift={handleCloseShift}
          shiftActionLoading={shiftActionLoading}
          locked={locked}
          sectionId={sectionIds.closeShift}
        />
      );
    case 'sales_today':
      return (
        <SalesTodayWorkspace
          todayDashboard={todayDashboard}
          terminalMeta={terminalMeta}
          sectionId={sectionIds.salesToday}
        />
      );
    case 'reports':
      return (
        <ReportWorkspace
          todayDashboard={todayDashboard}
          terminalMeta={terminalMeta}
          activeTerminalId={activeTerminalId}
          operatingLocationId={operatingLocationId}
          reportRefreshKey={reportRefreshKey}
          sectionId={sectionIds.reports}
        />
      );
    case 'items':
      return (
        <ItemsWorkspace
          canViewPos={canViewPos}
          locked={locked}
          sectionId={sectionIds.items}
        />
      );
    case 'terminal_setup':
      return (
        <TerminalSetupWorkspace
          terminalMeta={terminalMeta}
          sectionId={sectionIds.terminalSetup}
        />
      );
    case 'sync_queue':
      return (
        <SyncQueueWorkspace
          queuedTerminalOperations={queuedTerminalOperations}
          queueStatusFilter={queueStatusFilter}
          setQueueStatusFilter={setQueueStatusFilter}
          queueSummary={queueSummary}
          replayingQueuedTerminalOperations={replayingQueuedTerminalOperations}
          handleReplayQueuedTerminalOperations={handleReplayQueuedTerminalOperations}
          handleRetryQueuedOperation={handleRetryQueuedOperation}
          handleResolveQueuedOperation={handleResolveQueuedOperation}
          isOnline={isOnline}
          locked={locked}
          sectionId={sectionIds.syncQueue}
        />
      );
    default:
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Unknown operations view selected.
        </p>
      );
    }
  }, [
    canAdjustCashDrawer,
    canCloseDay,
    canSwitchPosLocation,
    canTransactPos,
    canViewPos,
    cashEventForm,
    closeShiftForm,
    handleCloseShift,
    handleIncomingOrderStatusChange,
    handleOpenIncomingOrderReceipt,
    incomingReceiptOpeningId,
    handleOpenIncomingOrderHistory,
    incomingHistoryOpeningId,
    handleOpenShift,
    handleSwitchShiftLocation,
    handleRecordCashEvent,
    incomingOrderActionState,
    incomingOrdersState,
    isOnline,
    locationsState,
    locked,
    queuedTerminalOperations,
    queueStatusFilter,
    queueSummary,
    replayingQueuedTerminalOperations,
    handleReplayQueuedTerminalOperations,
    handleRetryQueuedOperation,
    handleResolveQueuedOperation,
    setQueueStatusFilter,
    operatingLocationId,
    openShiftForm,
    queueLocationScopeId,
    refreshIncomingOrders,
    refreshOperationalContext,
    reportRefreshKey,
    sectionIds.activeShift,
    sectionIds.cashDrawer,
    sectionIds.closeShift,
    sectionIds.incomingOrders,
    sectionIds.items,
    sectionIds.locationScope,
    sectionIds.reports,
    sectionIds.salesToday,
    sectionIds.syncQueue,
    sectionIds.terminalSetup,
    activeTerminalId,
    setOperatingLocationId,
    setQueueLocationScopeId,
    setCashEventForm,
    setCloseShiftForm,
    setOpenShiftForm,
    shiftActionLoading,
    shiftState,
    terminalMeta,
    todayDashboard,
    effectiveViewMode
  ]);

  return (
    <WorkspaceShell
      icon={modeMeta.icon}
      title={modeMeta.title}
      subtitle={modeMeta.subtitle}
      terminalUser={terminalUser}
      locked={locked}
      className={effectiveViewMode === 'items' ? 'px-5 pb-5 pt-2' : 'p-5'}
    >
      {content}
      {locked && !isIncomingQueueView && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Terminal is locked. Unlock to run protected operational actions.
        </div>
      )}
    </WorkspaceShell>
  );
}
