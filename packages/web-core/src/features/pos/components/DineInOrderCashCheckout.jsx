import React from 'react';
import { ArrowLeft, Banknote, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';

const formatAmount = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

export default function DineInOrderCashCheckout({
  order,
  cashReceived = '',
  error = '',
  saving = false,
  isOnline = true,
  canTransactPos = false,
  hasActiveShift = false,
  operatorLocked = false,
  onCashReceivedChange = () => {},
  onSubmit = () => {},
  onCancel = () => {}
}) {
  const total = Number(order?.total_amount || 0);
  const received = Number(cashReceived);
  const canSubmit = total > 0
    && Number.isFinite(received)
    && received >= total
    && isOnline
    && canTransactPos
    && hasActiveShift
    && !operatorLocked
    && !saving;
  const orderReference = order?.tracking_pin || order?.invoice_number || `Order #${order?.pos_transaction_id || ''}`;

  return (
    <section className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col overflow-y-auto p-4 sm:p-6" data-testid="dine-in-order-cash-checkout">
      <div className="mb-5 flex items-center gap-3">
        <Button type="button" variant="outline" size="icon" onClick={onCancel} aria-label="Back to orders">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Utensils className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-950">Dine-In Checkout</h1>
          <p className="text-sm text-slate-600">Collect payment for this existing order.</p>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Existing Dine-In Order</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{orderReference}</p>
            {order?.customer_name ? <p className="mt-1 text-sm text-slate-600">{order.customer_name}</p> : null}
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Unpaid · Cash</span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm font-semibold text-slate-600">Order total</span>
          <span className="text-2xl font-extrabold text-slate-950">{formatAmount(total)}</span>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onSubmit?.();
          }}
          className="space-y-3"
        >
          <label htmlFor="dine-in-cash-received" className="block text-sm font-bold text-slate-800">
            Cash received
          </label>
          <div className="relative">
            <Banknote className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="dine-in-cash-received"
              type="number"
              min={total}
              step="0.01"
              inputMode="decimal"
              value={cashReceived}
              onChange={(event) => onCashReceivedChange?.(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-lg font-bold text-slate-950 outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100"
              aria-describedby={error ? 'dine-in-cash-checkout-error' : 'dine-in-cash-change'}
              required
            />
          </div>
          <p id="dine-in-cash-change" className="text-sm text-slate-600">
            Change due: <span className="font-bold text-slate-900">{formatAmount(Math.max(0, received - total))}</span>
          </p>
          {error ? <p id="dine-in-cash-checkout-error" role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
          {!isOnline ? <p role="status" className="text-sm text-amber-800">Reconnect before collecting payment.</p> : null}
          {operatorLocked ? <p role="status" className="text-sm text-amber-800">Sign in as the active cashier to collect payment.</p> : null}
          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
            This records payment on the selected order. It will not create a second sale or mark the order as served.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="bg-[#1A4E8D] text-white hover:bg-[#143F73]">
              {saving ? 'Recording payment…' : 'Collect Payment'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
