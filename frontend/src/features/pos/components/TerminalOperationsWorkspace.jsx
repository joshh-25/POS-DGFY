import React, { useMemo } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  MapPinned,
  Receipt,
  ShieldCheck,
  Store,
  Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  terminal_setup: {
    icon: CheckCircle2,
    title: 'Terminal Setup Context',
    subtitle: 'Inspect setup and compliance context used by the active POS terminal.'
  }
};

const ORDER_METHOD_LABELS = {
  dine_in: 'Dine In',
  takeout: 'Takeout',
  pickup: 'Pickup',
  delivery: 'Delivery',
  online: 'Online'
};

const PAYMENT_TYPE_LABELS = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  card: 'Card',
  bank_transfer: 'Bank Transfer'
};

const FULFILLMENT_STATUS_LABELS = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready',
  out_for_delivery: 'Out for Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected'
};

const getNextStatusActions = (order = {}) => {
  const current = String(order.fulfillment_status || '').trim();
  const method = String(order.order_method || '').trim();
  switch (current) {
  case 'placed':
    return ['confirmed', 'rejected'];
  case 'confirmed':
    return ['preparing'];
  case 'preparing':
    return method === 'delivery' ? ['out_for_delivery'] : ['ready_for_pickup'];
  case 'ready_for_pickup':
  case 'out_for_delivery':
    return ['completed'];
  default:
    return [];
  }
};

const money = (value) => Number(value || 0).toFixed(2);

const parseIsoDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
};
const parseDeliveryCoords = (order = {}) => {
  const lat = Number(order?.delivery_latitude);
  const lng = Number(order?.delivery_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng
  };
};

function WorkspaceShell({ icon: Icon, title, subtitle, children, terminalUser, locked }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-2 text-teal-700">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-600">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Operator</p>
          <p className="text-sm font-semibold text-slate-900">{terminalUser?.username || 'Terminal Locked'}</p>
          <p className={`text-[11px] ${locked ? 'text-amber-700' : 'text-emerald-700'}`}>
            {locked ? 'Locked' : 'Active'}
          </p>
        </div>
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function IncomingQueueWorkspace({
  canViewPos,
  canTransactPos,
  incomingOrdersState,
  incomingOrderActionState,
  handleIncomingOrderStatusChange,
  handleOpenIncomingOrderReceipt,
  incomingReceiptOpeningId,
  handleOpenIncomingOrderHistory,
  incomingHistoryOpeningId,
  refreshIncomingOrders,
  locationsState,
  selectedLocationId,
  locked,
  sectionId
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const incomingOrdersAccessState = String(incomingOrdersState?.accessState || '').trim() || 'idle';
  const incomingOrdersErrorMessage = String(incomingOrdersState?.errorMessage || '').trim();
  const selectedLocationName = !selectedLocationId
    ? 'All Locations'
    : (locations.find((location) => Number(location.location_id) === Number(selectedLocationId))?.name || 'Selected Location');

  return (
    <div id={sectionId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-sm text-slate-700">
          Location scope: <span className="font-semibold text-slate-900">{selectedLocationName}</span>
        </p>
        <Button type="button" variant="outline" onClick={() => refreshIncomingOrders?.()} disabled={incomingOrdersState?.loading || locked}>
          {incomingOrdersState?.loading ? 'Refreshing...' : 'Refresh Queue'}
        </Button>
      </div>
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Completed or cancelled online orders move to History/Receipt Preview. Incoming Queue shows active fulfillment statuses only.
      </p>

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
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">No online orders in active queue.</p>
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
              <div key={`incoming-workspace-${order.pos_transaction_id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{order.customer_name || 'Guest Buyer'}</p>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
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
                      className="font-semibold text-teal-700 underline"
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
                      disabled={Boolean(actionLoading) || !canTransactPos || locked}
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
  selectedLocationId,
  setSelectedLocationId,
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
              value={selectedLocationId || ''}
              onChange={(event) => {
                const nextValue = event.target.value ? Number(event.target.value) : null;
                setSelectedLocationId(nextValue);
              }}
            >
              <option value="">All Locations</option>
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

function ShiftControlsWorkspace({
  shiftState,
  terminalMeta,
  openShiftForm,
  setOpenShiftForm,
  handleOpenShift,
  shiftActionLoading,
  canTransactPos,
  locked,
  refreshOperationalContext,
  sectionId
}) {
  return (
    <div id={sectionId} className="space-y-3">
      {shiftState.loading ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Loading shift context...</p>
      ) : shiftState.shift ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <p className="text-slate-600">Shift ID: <span className="font-semibold text-slate-900">#{shiftState.shift.pos_terminal_shift_id}</span></p>
            <p className="text-slate-600">Business Date: <span className="font-semibold text-slate-900">{shiftState.shift.business_date || '-'}</span></p>
            <p className="text-slate-600">Opened At: <span className="font-semibold text-slate-900">{parseIsoDateTime(shiftState.shift.opened_at)}</span></p>
            <p className="text-slate-600">Opening Float: <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(shiftState.shift.opening_float_amount)}</span></p>
            <p className="text-slate-600">Expected Cash: <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(shiftState.cashSummary?.expected_cash_amount)}</span></p>
            <p className="text-slate-600">Cash Sales: <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(shiftState.cashSummary?.cash_sales_amount)}</span></p>
          </div>
          <Button type="button" variant="outline" className="mt-3" onClick={refreshOperationalContext}>
            Refresh Shift Data
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
            No open shift. Open a shift to enable checkout.
          </p>
          <div className="mt-3 space-y-2">
            <Label className="text-xs">Opening Float ({terminalMeta.pettyCashSymbol})</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={openShiftForm.openingFloatAmount}
              onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
              placeholder={money(terminalMeta.pettyCashAmount)}
            />
            <Label className="text-xs">Opening Note (Optional)</Label>
            <Input
              value={openShiftForm.openingNote}
              onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingNote: event.target.value }))}
              placeholder="Opening shift cash note"
            />
            <Button type="button" onClick={handleOpenShift} disabled={shiftActionLoading.open || locked || !canTransactPos}>
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
              <p className="text-xs text-slate-500">Service Fees</p>
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

function TerminalSetupWorkspace({ terminalMeta, sectionId }) {
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
          <p className="text-xs text-slate-500">Fee Methods Enabled</p>
          <p className="text-sm font-semibold text-slate-900">{terminalMeta.enabledFeeMethods.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Compliance</p>
          <p className="text-sm font-semibold text-emerald-700">Dual-mode policy</p>
        </div>
      </div>
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Terminal setup values are managed in Settings &gt; POS Setup and applied here as runtime context.
      </p>
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
  canViewPos,
  canTransactPos,
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
  handleRecordCashEvent,
  handleCloseShift,
  refreshOperationalContext,
  locationsState = { loading: false, locations: [] },
  selectedLocationId = null,
  setSelectedLocationId = () => {},
  incomingOrdersState = { loading: false, orders: [] },
  incomingOrderActionState = {},
  handleIncomingOrderStatusChange = () => {},
  handleOpenIncomingOrderReceipt = () => {},
  incomingReceiptOpeningId = null,
  handleOpenIncomingOrderHistory = () => {},
  incomingHistoryOpeningId = null,
  refreshIncomingOrders = () => {},
  sectionIds = {}
}) {
  const restrictedMsmeModes = new Set(['incoming_queue', 'location_scope', 'cash_drawer', 'sales_today', 'terminal_setup']);
  const effectiveViewMode = (isMsmeMode && restrictedMsmeModes.has(viewMode))
    ? 'shift_controls'
    : viewMode;
  const modeMeta = MODE_META[effectiveViewMode] || MODE_META.shift_controls;

  const content = useMemo(() => {
    switch (effectiveViewMode) {
    case 'incoming_queue':
      return (
        <IncomingQueueWorkspace
          canViewPos={canViewPos}
          canTransactPos={canTransactPos}
          incomingOrdersState={incomingOrdersState}
          incomingOrderActionState={incomingOrderActionState}
          handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
          handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
          incomingReceiptOpeningId={incomingReceiptOpeningId}
          handleOpenIncomingOrderHistory={handleOpenIncomingOrderHistory}
          incomingHistoryOpeningId={incomingHistoryOpeningId}
          refreshIncomingOrders={refreshIncomingOrders}
          locationsState={locationsState}
          selectedLocationId={selectedLocationId}
          locked={locked}
          sectionId={sectionIds.incomingOrders}
        />
      );
    case 'location_scope':
      return (
        <LocationScopeWorkspace
          canViewPos={canViewPos}
          locationsState={locationsState}
          selectedLocationId={selectedLocationId}
          setSelectedLocationId={setSelectedLocationId}
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
    case 'terminal_setup':
      return (
        <TerminalSetupWorkspace
          terminalMeta={terminalMeta}
          sectionId={sectionIds.terminalSetup}
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
    handleRecordCashEvent,
    incomingOrderActionState,
    incomingOrdersState,
    locationsState,
    locked,
    openShiftForm,
    refreshIncomingOrders,
    refreshOperationalContext,
    sectionIds.activeShift,
    sectionIds.cashDrawer,
    sectionIds.closeShift,
    sectionIds.incomingOrders,
    sectionIds.locationScope,
    sectionIds.salesToday,
    sectionIds.terminalSetup,
    selectedLocationId,
    setCashEventForm,
    setCloseShiftForm,
    setOpenShiftForm,
    setSelectedLocationId,
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
    >
      {content}
      {locked && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Terminal is locked. Unlock to run protected operational actions.
        </div>
      )}
      {!locked && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <AlertCircle className="h-4 w-4 text-slate-500" />
          Right-side panel remains available for secondary context while this workspace is your primary active mode.
        </div>
      )}
    </WorkspaceShell>
  );
}
