import React from 'react';
import { Banknote, ChevronLeft, ChevronRight, Clock3, LogIn, LogOut, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ORDER_METHOD_LABELS = {
  dine_in: 'Dine In',
  takeout: 'Takeout',
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

const money = (value) => Number(value || 0).toFixed(2);

const parseIsoDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
};

export default function TerminalSidebarPanel({
  isCollapsed = false,
  onToggleCollapse,
  terminalUser,
  locked,
  terminalMeta,
  shiftState,
  todayDashboard,
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
  handleLock,
  setDrawerOpen
}) {
  const activeShiftId = shiftState?.shift?.pos_terminal_shift_id || null;
  const paymentBreakdown = todayDashboard?.salesSummary?.payment_breakdown || [];
  const orderMethodBreakdown = todayDashboard?.salesSummary?.order_method_breakdown || [];

  if (isCollapsed) {
    return (
      <aside className="hidden xl:flex flex-col bg-white border border-slate-200 rounded-2xl p-2 gap-2 h-fit sticky top-4 shadow-sm">
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
    <aside className="hidden xl:flex flex-col bg-white border border-slate-200 rounded-2xl p-4 gap-4 h-fit sticky top-4 shadow-sm">
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

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
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
          <span className="text-slate-600">Fee Methods Enabled</span>
          <span className="font-semibold text-slate-900">{terminalMeta.enabledFeeMethods.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Compliance Blocking</span>
          <span className={`font-semibold ${terminalMeta.strictCompliance ? 'text-emerald-700' : 'text-amber-700'}`}>
            {terminalMeta.strictCompliance ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-[11px] text-slate-500">
          Managed by tenant admin in Settings &gt; POS Setup.
        </p>
        {terminalMeta.loading && (
          <p className="text-[11px] text-slate-400">Refreshing setup context...</p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Shift</p>
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

      {shiftState.shift && canAdjustCashDrawer && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash Drawer Event</p>
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
        </div>
      )}

      {shiftState.shift && canCloseDay && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Close Shift</p>
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
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
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
              <span className="text-slate-600">Service Fees</span>
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
