import React from 'react';
import { Banknote, ChevronLeft, ChevronRight, Clock3, LogIn, LogOut, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  getNextStatusActions
} from './orderFulfillmentUi.js';

const WORKSPACE_VIEW_CONFIG = {
  incoming_queue: {
    title: 'Incoming Online Queue',
    description: 'Review new online orders and progress fulfillment statuses.'
  },
  location_scope: {
    title: 'Location Scope',
    description: 'Select the location scope used for incoming queue and lifecycle actions.'
  },
  shift_controls: {
    title: 'Shift Controls',
    description: 'Open shifts, inspect cash expectations, and keep cashier operations active.'
  },
  cash_drawer: {
    title: 'Cash Drawer Event',
    description: 'Record cash in/out adjustments with clear reasons and amounts.'
  },
  close_shift: {
    title: 'Close Shift',
    description: 'Finalize active shift balances and record closing notes.'
  },
  sales_today: {
    title: 'Sales Today',
    description: 'Track net totals, payment types, and order-method performance.'
  },
  terminal_setup: {
    title: 'Terminal Setup Context',
    description: 'View compliance, petty cash, and active setup baseline for this terminal.'
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

export default function TerminalSidebarPanel({
  className = 'hidden xl:flex',
  isCollapsed = false,
  onToggleCollapse,
  workspaceView = null,
  isMsmeMode = false,
  terminalUser,
  locked,
  terminalMeta,
  shiftState,
  todayDashboard,
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
  handleLock,
  setDrawerOpen,
  sectionIds = {}
}) {
  const isWorkspaceMode = Boolean(workspaceView);
  const workspaceConfig = WORKSPACE_VIEW_CONFIG[workspaceView] || null;
  const paymentBreakdown = todayDashboard?.salesSummary?.payment_breakdown || [];
  const orderMethodBreakdown = todayDashboard?.salesSummary?.order_method_breakdown || [];
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const incomingOrdersAccessState = String(incomingOrdersState?.accessState || '').trim() || 'idle';
  const incomingOrdersErrorMessage = String(incomingOrdersState?.errorMessage || '').trim();
  const hiddenSectionsInMsme = new Set(['incoming_queue', 'location_scope', 'cash_drawer', 'sales_today', 'terminal_setup']);
  const [switchReason, setSwitchReason] = React.useState('');

  const showSection = (key) => {
    if (isMsmeMode && hiddenSectionsInMsme.has(key)) return false;
    return !isWorkspaceMode || workspaceView === key;
  };
  const showCashDrawerCard = showSection('cash_drawer') && (isWorkspaceMode || (shiftState.shift && canAdjustCashDrawer));
  const showCloseShiftCard = showSection('close_shift') && (isWorkspaceMode || (shiftState.shift && canCloseDay));

  if (isCollapsed && !isWorkspaceMode) {
    return (
      <aside
        className={`${className} flex-col bg-white border border-slate-200 rounded-2xl p-2 gap-2 h-fit xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain shadow-sm`}
      >
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full px-2"
          onClick={onToggleCollapse}
          title="Expand admin panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center">
          <p className="text-[10px] font-semibold text-slate-500 uppercase">User</p>
          <p className="text-xs font-semibold text-slate-900 truncate" title={terminalUser?.username || 'Locked'}>
            {terminalUser?.username || 'Locked'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-center">
          <p className="text-[10px] font-semibold text-slate-500 uppercase">Shift</p>
          <p className="text-xs font-semibold text-slate-900">{shiftState?.shift ? 'Open' : 'Closed'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-center">
          <p className="text-[10px] font-semibold text-slate-500 uppercase">Sales</p>
          <p className="text-xs font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(todayDashboard?.salesSummary?.total_amount)}</p>
        </div>
        {locked ? (
          <Button type="button" variant="outline" className="h-9 w-full px-2" onClick={() => setDrawerOpen(true)} title="Unlock terminal">
            <LogIn className="w-4 h-4" />
          </Button>
        ) : (
          <Button type="button" variant="outline" className="h-9 w-full px-2" onClick={handleLock} title="Lock terminal">
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </aside>
    );
  }

  return (
    <aside
      className={`${className} flex-col bg-white border border-slate-200 rounded-2xl p-4 gap-4 ${isWorkspaceMode ? 'w-full' : 'h-fit xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain'} shadow-sm`}
    >
      {!isWorkspaceMode && (
        <>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-slate-600"
              onClick={onToggleCollapse}
              title="Collapse admin panel"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-start gap-2">
            <UserCircle2 className="w-5 h-5 text-slate-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {terminalUser?.username || 'Terminal Locked'}
              </p>
              <p className="text-xs text-slate-500">
                {terminalUser?.email || 'Sign in required'}
              </p>
              {terminalUser?.role && (
                <p className="text-xs text-teal-600 uppercase tracking-wide mt-1">{terminalUser.role}</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Cashier accountability and transaction timestamps are recorded on every POS checkout.
          </div>
        </>
      )}

      {isWorkspaceMode && workspaceConfig && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Operational View</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{workspaceConfig.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{workspaceConfig.description}</p>
        </div>
      )}

      {showSection('terminal_setup') && (
        <div id={sectionIds.terminalSetup} className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terminal Setup Context</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Petty Cash</span>
            <span className="font-semibold text-slate-900">
              {terminalMeta.pettyCashSymbol} {money(terminalMeta.pettyCashAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Active Discounts</span>
            <span className="font-semibold text-slate-900">{terminalMeta.activeDiscountCount}</span>
          </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">DGFY Global Fee Policy</span>
                <span className="font-semibold text-slate-900">
                  {(Array.isArray(terminalMeta.enabledFeeMethods) && terminalMeta.enabledFeeMethods.length > 0)
                    ? 'Active'
                    : 'Inactive'}
                </span>
              </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Compliance Policy</span>
            <span className="font-semibold text-emerald-700">Dual-mode</span>
          </div>
          {terminalMeta?.locationBindingReadiness && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Binding Readiness</span>
              <span className={`font-semibold ${terminalMeta.locationBindingReadiness.ready_for_strict_mode === true ? 'text-emerald-700' : 'text-amber-700'}`}>
                {terminalMeta.locationBindingReadiness.ready_for_strict_mode === true ? 'Ready' : 'Needs remediation'}
              </span>
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            Managed by tenant compliance mode and verification controls.
          </p>
          {terminalMeta.loading && (
            <p className="text-[11px] text-slate-400">Refreshing setup context...</p>
          )}
        </div>
      )}

      {showSection('shift_controls') && (
        <div id={sectionIds.activeShift} className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Shift</p>
          <Label className="text-xs">Operating Location</Label>
          <select
            className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
            value={operatingLocationId || ''}
            onChange={(event) => {
              const nextValue = event.target.value ? Number(event.target.value) : null;
              setOperatingLocationId(nextValue);
            }}
          >
            {locations.map((location) => (
              <option key={`sidebar-operating-location-${location.location_id}`} value={location.location_id}>
                {location.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500">
            Catalog and checkout follow this location scope.
          </p>
          {shiftState.loading ? (
            <p className="text-xs text-slate-500">Loading shift context...</p>
          ) : shiftState.shift ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Shift ID</span>
                <span className="font-semibold text-slate-900">#{shiftState.shift.pos_terminal_shift_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Business Date</span>
                <span className="font-semibold text-slate-900">{shiftState.shift.business_date || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Opened At</span>
                <span className="font-semibold text-slate-900">{parseIsoDateTime(shiftState.shift.opened_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Opening Float</span>
                <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(shiftState.shift.opening_float_amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Expected Cash</span>
                <span className="font-semibold text-slate-900">
                  {terminalMeta.pettyCashSymbol} {money(shiftState.cashSummary?.expected_cash_amount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Cash Sales</span>
                <span className="font-semibold text-slate-900">
                  {terminalMeta.pettyCashSymbol} {money(shiftState.cashSummary?.cash_sales_amount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Shift Location</span>
                <span className="font-semibold text-slate-900">
                  {shiftState?.shift?.location?.name || shiftState?.shift?.location_name || shiftState?.shift?.location_id || 'Unassigned'}
                </span>
              </div>
              {canSwitchPosLocation && (
                <div className="mt-2 space-y-1.5">
                  <Input
                    value={switchReason}
                    onChange={(event) => setSwitchReason(event.target.value)}
                    placeholder="Reason for location switch"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={
                      shiftActionLoading.switchLocation
                      || !operatingLocationId
                      || Number(operatingLocationId) === Number(shiftState?.shift?.location_id)
                      || String(switchReason || '').trim().length < 8
                    }
                    onClick={() => {
                      handleSwitchShiftLocation({
                        targetLocationId: operatingLocationId,
                        reason: switchReason
                      });
                    }}
                  >
                    {shiftActionLoading.switchLocation ? 'Switching...' : 'Switch Shift Location'}
                  </Button>
                </div>
              )}
              {!canSwitchPosLocation && (
                <p className="mt-2 text-[11px] text-slate-500">
                  You do not have permission to switch shift location.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                No open shift. Open a shift to enable checkout.
              </p>
              <Label className="text-xs">Opening Float ({terminalMeta.pettyCashSymbol})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openShiftForm.openingFloatAmount}
                onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
                placeholder={money(terminalMeta.pettyCashAmount)}
              />
              <p className="text-[11px] text-slate-500">
                Opening float is the starting cash in the drawer before the first sale.
              </p>
              <Label className="text-xs">Opening Note (Optional)</Label>
              <Input
                value={openShiftForm.openingNote}
                onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingNote: event.target.value }))}
                placeholder="Opening shift cash note"
              />
              <Button type="button" onClick={handleOpenShift} disabled={shiftActionLoading.open || locked || !canTransactPos}>
                {shiftActionLoading.open ? 'Opening Shift...' : 'Open Shift'}
              </Button>
              {!canTransactPos && (
                <p className="text-[11px] text-slate-500">You need POS transact permission to open shifts.</p>
              )}
            </div>
          )}
        </div>
      )}

      {showCashDrawerCard && (
        <div id={sectionIds.cashDrawer} className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash Drawer Event</p>
          {(!shiftState.shift || !canAdjustCashDrawer) ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              {!shiftState.shift
                ? 'Open a shift first before recording cash drawer events.'
                : 'You need cash drawer adjustment permission to use this section.'}
            </p>
          ) : (
            <>
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
              <Button type="button" variant="outline" onClick={handleRecordCashEvent} disabled={shiftActionLoading.cashEvent || locked}>
                {shiftActionLoading.cashEvent ? 'Saving Event...' : 'Record Cash Event'}
              </Button>
            </>
          )}
        </div>
      )}

      {showCloseShiftCard && (
        <div id={sectionIds.closeShift} className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Close Shift</p>
          {(!shiftState.shift || !canCloseDay) ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              {!shiftState.shift
                ? 'No active shift to close.'
                : 'You need close-day permission to close shifts.'}
            </p>
          ) : (
            <>
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
              <Button type="button" variant="outline" onClick={handleCloseShift} disabled={shiftActionLoading.close || locked}>
                {shiftActionLoading.close ? 'Closing Shift...' : 'Close Shift'}
              </Button>
            </>
          )}
        </div>
      )}

      {showSection('location_scope') && (
        <div id={sectionIds.locationScope} className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location Scope</p>
          {!canViewPos ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              You need POS view permission to manage location scope for online orders.
            </p>
          ) : locationsState?.loading ? (
            <p className="text-xs text-slate-500">Loading locations...</p>
          ) : (
            <>
              <select
                className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                value={queueLocationScopeId || ''}
                onChange={(event) => {
                  const nextValue = event.target.value ? Number(event.target.value) : null;
                  setQueueLocationScopeId(nextValue);
                }}
              >
                <option value="" disabled>Select queue location</option>
                {locations.map((location) => (
                  <option key={`location-${location.location_id}`} value={location.location_id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Incoming online queue and status actions are filtered by selected location.
              </p>
              <Button type="button" variant="outline" onClick={() => refreshIncomingOrders?.()} disabled={incomingOrdersState?.loading || locked}>
                {incomingOrdersState?.loading ? 'Refreshing Queue...' : 'Refresh Incoming Queue'}
              </Button>
            </>
          )}
        </div>
      )}

      {showSection('incoming_queue') && (
        <div id={sectionIds.incomingOrders} className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming Online Orders</p>
          {!canViewPos || incomingOrdersAccessState === 'forbidden' ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              {incomingOrdersErrorMessage || 'You need POS view permission to access incoming online orders.'}
            </p>
          ) : incomingOrdersAccessState === 'error' ? (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5">
              {incomingOrdersErrorMessage || 'Failed to load incoming online orders. Try refreshing.'}
            </p>
          ) : incomingOrdersState?.loading && incomingOrders.length === 0 ? (
            <p className="text-xs text-slate-500">Loading incoming orders...</p>
          ) : incomingOrders.length === 0 ? (
            <p className="text-xs text-slate-500">No online orders in active queue.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              <p className="text-[11px] text-slate-500">
                Completed or cancelled online orders move to History/Receipt Preview.
              </p>
              {incomingOrders.map((order) => {
                const actionLoading = incomingOrderActionState?.[order.pos_transaction_id] || '';
                const nextActions = getNextStatusActions(order);
                const deliveryCoords = parseDeliveryCoords(order);
                const mapLink = deliveryCoords
                  ? `https://maps.google.com/?q=${deliveryCoords.latitude},${deliveryCoords.longitude}`
                  : '';
                return (
                  <div key={`incoming-${order.pos_transaction_id}`} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900">
                        {order.customer_name || 'Guest Buyer'}
                      </p>
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                        {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status || 'Unknown'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      PIN: <span className="font-semibold text-slate-900">{order.tracking_pin || '-'}</span>
                    </p>
                    <p className="text-[11px] text-slate-600">
                      {ORDER_METHOD_LABELS[order.order_method] || order.order_method} / {PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type}
                    </p>
                    {order.delivery_address && (
                      <p className="text-[11px] text-slate-600">
                        {order.delivery_address}
                      </p>
                    )}
                    {deliveryCoords && (
                      <>
                        <p className="text-[11px] text-slate-600">
                          Coords: {deliveryCoords.latitude.toFixed(6)}, {deliveryCoords.longitude.toFixed(6)}
                        </p>
                        <a
                          href={mapLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-teal-700 underline"
                        >
                          Open pin in map
                        </a>
                      </>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {nextActions.map((status) => (
                        <Button
                          key={`action-${order.pos_transaction_id}-${status}`}
                          type="button"
                          size="sm"
                          variant={status === 'rejected' ? 'destructive' : 'outline'}
                          className="h-7 text-[11px]"
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
                        className="h-7 text-[11px]"
                        disabled={locked || !canViewPos || incomingReceiptOpeningId !== null}
                        onClick={() => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id)}
                      >
                        {incomingReceiptOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'Receipt'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={locked || !canViewPos || incomingHistoryOpeningId !== null}
                        onClick={() => handleOpenIncomingOrderHistory?.(order)}
                      >
                        {incomingHistoryOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'History'}
                      </Button>
                    </div>
                    {!canTransactPos && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        You need POS transact permission to update order statuses.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showSection('sales_today') && (
        <div id={sectionIds.salesToday} className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales For Today</p>
          </div>
          {todayDashboard.loading ? (
            <p className="text-xs text-slate-500">Refreshing today summary...</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Business Date</span>
                <span className="font-semibold text-slate-900">{todayDashboard.businessDate || '-'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Transactions</span>
                <span className="font-semibold text-slate-900">{todayDashboard.salesSummary?.transaction_count || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Gross Sales</span>
                <span className="font-semibold text-slate-900">
                  {terminalMeta.pettyCashSymbol} {money(todayDashboard.salesSummary?.subtotal_amount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Discounts</span>
                <span className="font-semibold text-rose-600">
                  - {terminalMeta.pettyCashSymbol} {money(todayDashboard.salesSummary?.discount_amount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">DGFY Convenience Fees</span>
                <span className="font-semibold text-slate-900">
                  + {terminalMeta.pettyCashSymbol} {money(todayDashboard.salesSummary?.service_fee_total)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-dashed border-slate-200 pt-2">
                <span className="text-slate-600">Net Total</span>
                <span className="font-semibold text-slate-900">
                  {terminalMeta.pettyCashSymbol} {money(todayDashboard.salesSummary?.total_amount)}
                </span>
              </div>
              <div className="pt-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Payment Types</p>
                <div className="space-y-1">
                  {paymentBreakdown.length > 0 ? paymentBreakdown.map((entry) => (
                    <div key={`payment-${entry.payment_type}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{PAYMENT_TYPE_LABELS[entry.payment_type] || entry.payment_type}</span>
                      <span className="font-semibold text-slate-900">
                        {terminalMeta.pettyCashSymbol} {money(entry.amount)} ({entry.count || 0})
                      </span>
                    </div>
                  )) : (
                    <p className="text-xs text-slate-500">No payment activity yet.</p>
                  )}
                </div>
              </div>
              <div className="pt-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Order Methods</p>
                <div className="space-y-1">
                  {orderMethodBreakdown.length > 0 ? orderMethodBreakdown.map((entry) => (
                    <div key={`order-${entry.order_method}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{ORDER_METHOD_LABELS[entry.order_method] || entry.order_method}</span>
                      <span className="font-semibold text-slate-900">
                        {terminalMeta.pettyCashSymbol} {money(entry.amount)} ({entry.count || 0})
                      </span>
                    </div>
                  )) : (
                    <p className="text-xs text-slate-500">No order-method activity yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {locked ? (
        <Button type="button" onClick={() => setDrawerOpen(true)}>
          <LogIn className="w-4 h-4 mr-2" />
          Unlock Terminal
        </Button>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          <Button type="button" variant="outline" onClick={refreshOperationalContext}>
            <Banknote className="w-4 h-4 mr-2" />
            Refresh Terminal Data
          </Button>
          <Button type="button" variant="outline" onClick={handleLock}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout / Lock
          </Button>
        </div>
      )}
    </aside>
  );
}
