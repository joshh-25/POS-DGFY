import React, { useState } from 'react';
import { Banknote, ChevronLeft, ChevronRight, LogIn, LogOut, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  getFulfillmentActionLabel,
  getIncomingOrderUtilityActions,
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
    description: 'Open shifts, inspect cash expectations, manage shift location, and keep cashier operations active.'
  },
  cash_drawer: {
    title: 'Cash Drawer Event',
    description: 'Record cash in/out adjustments with clear reasons and amounts.'
  },
  close_shift: {
    title: 'Shift Controls',
    description: 'Open shifts, inspect cash expectations, manage shift location, and keep cashier operations active.'
  },
  terminal_setup: {
    title: 'Terminal Setup Context',
    description: 'View compliance, petty cash, and active setup baseline for this terminal.'
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

const DELIVERY_JOB_STATUS_LABELS = {
  pending_dispatch: 'Pending Dispatch',
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled'
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
  canAdminBypassShiftPrompt = false,
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
  incomingOrdersState = { loading: false, orders: [] },
  incomingOrderActionState = {},
  handleIncomingOrderStatusChange = () => {},
  handleOpenIncomingOrderReceipt = () => {},
  incomingReceiptOpeningId = null,
  refreshIncomingOrders = () => {},
  handleLock,
  setDrawerOpen,
  sectionIds = {}
}) {
  const isWorkspaceMode = Boolean(workspaceView);
  const workspaceConfig = WORKSPACE_VIEW_CONFIG[workspaceView] || null;
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const incomingOrdersAccessState = String(incomingOrdersState?.accessState || '').trim() || 'idle';
  const incomingOrdersErrorMessage = String(incomingOrdersState?.errorMessage || '').trim();
  const hiddenSectionsInMsme = new Set(['incoming_queue', 'location_scope', 'cash_drawer', 'terminal_setup']);
  const [switchReason, setSwitchReason] = useState('');
  const canSubmitOpenShift = isValidOpeningCashAmount(openShiftForm.openingFloatAmount);
  const activeShift = shiftState?.shift || null;
  const activeShiftLocationLabel = activeShift?.location?.name
    || activeShift?.location_name
    || activeShift?.location_id
    || 'Unassigned';

  const showSection = (key) => {
    if (isMsmeMode && hiddenSectionsInMsme.has(key)) return false;
    return !isWorkspaceMode || workspaceView === key;
  };
  const showCashDrawerCard = showSection('cash_drawer') && (isWorkspaceMode || (shiftState.shift && canAdjustCashDrawer));

  if (isCollapsed && !isWorkspaceMode) {
    return (
      <aside
        className={`${className} flex-col rounded-xl border border-slate-200 bg-white p-2 gap-2 h-fit shadow-sm shadow-slate-200/70 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain`}
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
          <p className="text-[10px] font-extrabold uppercase text-[#334155]">User</p>
          <p className="truncate text-xs font-black text-[#0F172A]" title={terminalUser?.username || 'Locked'}>
            {terminalUser?.username || 'Locked'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-center">
          <p className="text-[10px] font-extrabold uppercase text-[#334155]">Shift</p>
          <p className="text-xs font-black text-[#0F172A]">{shiftState?.shift ? 'Open' : 'Closed'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-center">
          <p className="text-[10px] font-extrabold uppercase text-[#334155]">Sales</p>
          <p className="text-xs font-black text-[#0F172A]">{terminalMeta.pettyCashSymbol} {money(todayDashboard?.salesSummary?.total_amount)}</p>
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
      className={`${className} flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 ${isWorkspaceMode ? 'w-full' : 'h-fit xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain'}`}
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
            <UserCircle2 className="mt-0.5 h-5 w-5 text-[#1A4E8D]" />
            <div>
              <p className="text-sm font-black text-[#0F172A]">
                {terminalUser?.username || 'Terminal Locked'}
              </p>
              <p className="text-xs text-[#64748B]">
                {terminalUser?.email || 'Sign in required'}
              </p>
              {terminalUser?.role && (
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-[#1A4E8D]">{terminalUser.role}</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-[#64748B]">
            Cashier accountability and transaction timestamps are recorded on every POS checkout.
          </div>
        </>
      )}

      {isWorkspaceMode && workspaceConfig && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#1A4E8D]">Operational View</p>
          <h2 className="mt-1 text-lg font-black text-[#0F172A]">{workspaceConfig.title}</h2>
          <p className="mt-1 text-sm leading-5 text-[#334155]">{workspaceConfig.description}</p>
        </div>
      )}

      {showSection('terminal_setup') && (
        <div id={sectionIds.terminalSetup} className="space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/70">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#334155]">Terminal Setup Context</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#334155]">Petty Cash</span>
            <span className="font-extrabold text-[#0F172A]">
              {terminalMeta.pettyCashSymbol} {money(terminalMeta.pettyCashAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#334155]">Active Discounts</span>
            <span className="font-extrabold text-[#0F172A]">{terminalMeta.activeDiscountCount}</span>
          </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#334155]">DGFY Global Fee Policy</span>
                <span className="font-extrabold text-[#0F172A]">
                  {(Array.isArray(terminalMeta.enabledFeeMethods) && terminalMeta.enabledFeeMethods.length > 0)
                    ? 'Active'
                    : 'Inactive'}
                </span>
              </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#334155]">Compliance Policy</span>
            <span className="font-extrabold text-emerald-700">Dual-mode</span>
          </div>
          {terminalMeta?.locationBindingReadiness && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#334155]">Binding Readiness</span>
              <span className={`font-extrabold ${terminalMeta.locationBindingReadiness.ready_for_strict_mode === true ? 'text-emerald-700' : 'text-amber-700'}`}>
                {terminalMeta.locationBindingReadiness.ready_for_strict_mode === true ? 'Ready' : 'Needs remediation'}
              </span>
            </div>
          )}
          <p className="text-[11px] text-[#64748B]">
            Managed by tenant compliance mode and verification controls.
          </p>
          {terminalMeta.loading && (
            <p className="text-[11px] text-slate-400">Refreshing setup context...</p>
          )}
        </div>
      )}

      {showSection('shift_controls') && (
        <div id={sectionIds.activeShift} className="space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/70">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#334155]">
            {activeShift ? 'Shift Open' : 'Shift Closed'}
          </p>
          {activeShift ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Shift Location</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{activeShiftLocationLabel}</p>
            </div>
          ) : canAdminBypassShiftPrompt ? (
            <>
              <Label htmlFor="sidebar-admin-operating-location" className="text-xs">Operating Location</Label>
              <select
                id="sidebar-admin-operating-location"
                className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                value={operatingLocationId || ''}
                onChange={(event) => {
                  const nextValue = event.target.value ? Number(event.target.value) : null;
                  setOperatingLocationId(nextValue);
                }}
              >
                {locations.map((location) => (
                  <option key={`sidebar-admin-operating-location-${location.location_id}`} value={location.location_id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Admin navigation can change scope before a shift opens. The terminal assignment controls shift opening.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-500">
              Your terminal location is fixed until an authorized shift is opened.
            </p>
          )}
          {shiftState.loading ? (
            <p className="text-xs text-slate-500">Loading shift context...</p>
          ) : activeShift ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Cashier</span>
                <span className="font-semibold text-slate-900">
                  {activeShift?.cashier?.username || activeShift?.cashier?.email || terminalUser?.username || terminalUser?.email || 'Current cashier'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Business Date</span>
                <span className="font-semibold text-slate-900">{activeShift.business_date || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Opened At</span>
                <span className="font-semibold text-slate-900">{parseIsoDateTime(activeShift.opened_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Opening Float</span>
                <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(activeShift.opening_float_amount)}</span>
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
                  {activeShiftLocationLabel}
                </span>
              </div>
              {canSwitchPosLocation && (
                <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#334155]">Change Active Shift Location</p>
                  <p className="text-[11px] text-slate-500">
                    Reassign the active shift to another location with a reason.
                  </p>
                  <Label className="text-xs">New Shift Location</Label>
                  <select
                    className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                    value={operatingLocationId || ''}
                    onChange={(event) => {
                      const nextValue = event.target.value ? Number(event.target.value) : null;
                      setOperatingLocationId(nextValue);
                    }}
                  >
                    {locations.map((location) => (
                      <option key={`sidebar-switch-location-${location.location_id}`} value={location.location_id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={switchReason}
                    onChange={(event) => setSwitchReason(event.target.value)}
                    placeholder="Reason for shift location change"
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
                    {shiftActionLoading.switchLocation ? 'Switching...' : 'Change Shift Location'}
                  </Button>
                </div>
              )}
              {!canSwitchPosLocation && (
                <p className="mt-2 text-[11px] text-slate-500">
                  You do not have permission to change the active shift location.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                Shift Closed. Please open your shift before using the POS.
              </p>
              <Label className="text-xs">Opening Float ({terminalMeta.pettyCashSymbol})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                required
                value={openShiftForm.openingFloatAmount}
                onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
                placeholder="0.00"
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

      {showSection('shift_controls') && shiftState?.shift && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/70">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#334155]">Close Shift</p>
          {!canCloseDay ? (
            <p className="text-[11px] text-slate-500">
              You need close-day permission to close shifts.
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

      {showCashDrawerCard && (
        <div id={sectionIds.cashDrawer} className="space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/70">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#334155]">Cash Drawer Event</p>
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

      {showSection('location_scope') && (
        <div id={sectionIds.locationScope} className="space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/70">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#334155]">Location Scope</p>
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
                disabled
              >
                <option value="" disabled>Open a shift to select the branch</option>
                {locations.map((location) => (
                  <option key={`location-${location.location_id}`} value={location.location_id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Incoming orders are locked to the active shift location.
              </p>
              <Button type="button" variant="outline" onClick={() => refreshIncomingOrders?.()} disabled={incomingOrdersState?.loading || locked || !activeShift}>
                {incomingOrdersState?.loading ? 'Refreshing Queue...' : 'Refresh Incoming Queue'}
              </Button>
            </>
          )}
        </div>
      )}

      {showSection('incoming_queue') && (
        <div id={sectionIds.incomingOrders} className="space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/70">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#334155]">Incoming Online Orders</p>
          {!canViewPos || incomingOrdersAccessState === 'forbidden' ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              {incomingOrdersErrorMessage || 'You need POS view permission to access incoming online orders.'}
            </p>
          ) : incomingOrdersAccessState === 'error' ? (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5">
              {incomingOrdersErrorMessage || 'Failed to load incoming online orders. Try refreshing.'}
            </p>
          ) : incomingOrdersAccessState === 'shift_required' ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              {incomingOrdersErrorMessage || 'Open a shift to view orders for this branch.'}
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
                const utilityActions = getIncomingOrderUtilityActions(order);
                const deliveryCoords = parseDeliveryCoords(order);
                const deliveryJob = order.deliveryJob || null;
                const cashierName = order.cashier?.username || order.acceptedByUser?.username || '-';
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
                      Cashier: <span className="font-semibold text-slate-900">{cashierName}</span>
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Payment: <span className="font-semibold text-slate-900">{PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type || '-'}</span>
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Mode: <span className="font-semibold text-slate-900">{ORDER_METHOD_LABELS[order.order_method] || order.order_method || '-'}</span>
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Order Time: <span className="font-semibold text-slate-900">{parseIsoDateTime(order.created_at)}</span>
                    </p>
                    {order.order_method === 'delivery' && (
                      <p className="text-[11px] text-slate-600">
                        Delivery: <span className="font-semibold text-slate-900">{deliveryJob?.provider || 'Manual'} · {DELIVERY_JOB_STATUS_LABELS[deliveryJob?.status] || deliveryJob?.status || 'Pending Dispatch'}</span>
                      </p>
                    )}
                    {order.delivery_address && (
                      <p className="text-[11px] text-slate-600">
                        Address: <span className="font-semibold text-slate-900">{order.delivery_address}</span>
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
                          className="text-[11px] font-semibold text-[#1A4E8D] underline"
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
                          {actionLoading === status ? 'Saving...' : getFulfillmentActionLabel(status, order)}
                        </Button>
                      ))}
                      {utilityActions.includes('open_order') && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[11px]"
                          disabled={locked || !canViewPos || incomingReceiptOpeningId !== null}
                          onClick={() => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id, { printMode: false })}
                        >
                          {incomingReceiptOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'Open Order'}
                        </Button>
                      )}
                      {utilityActions.includes('print_order') && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={locked || !canViewPos || incomingReceiptOpeningId !== null}
                          onClick={() => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id, { printMode: true })}
                        >
                          {incomingReceiptOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'Print Order'}
                        </Button>
                      )}
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
