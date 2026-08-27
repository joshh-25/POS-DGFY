import React from 'react';
import { Hash, Calendar, CircleDollarSign } from 'lucide-react';

const money = (value) => Number(value || 0).toFixed(2);

export default function OrderPreviewView({ transaction, mobileResponsive = false }) {
  if (!transaction) return null;

  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
  const subtotalAmount = Number.isFinite(Number(transaction.subtotal_amount))
    ? Number(transaction.subtotal_amount)
    : lines.reduce((sum, line) => {
      const lineSubtotal = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? line?.amount);
      if (Number.isFinite(lineSubtotal)) return sum + lineSubtotal;

      const quantity = Number(line?.quantity ?? line?.qty ?? 0);
      const unitPrice = Number(line?.sale_price ?? line?.unit_price ?? line?.price ?? 0);
      return Number.isFinite(quantity) && Number.isFinite(unitPrice) ? sum + quantity * unitPrice : sum;
    }, 0);
  const discountAmount = Number(transaction.discount_amount || 0);
  const deliveryFeeAmount = Number(transaction.delivery_fee || 0);
  const restaurantServiceChargeAmount = Number(transaction.restaurant_service_charge_amount || 0);
  const totalAmount = Number.isFinite(Number(transaction.total_amount))
    ? Number(transaction.total_amount)
    : subtotalAmount - discountAmount + restaurantServiceChargeAmount + deliveryFeeAmount;
  const amountPaid = Number(transaction.amount_paid);
  const balanceDue = Number(transaction.balance_due);
  const paymentStatus = String(transaction.payment_status || '').trim().toLowerCase();
  const isPartialPayment = paymentStatus === 'partially_paid'
    || (Number.isFinite(balanceDue) && balanceDue > 0);
  const totalPaymentAmount = isPartialPayment && Number.isFinite(amountPaid) && amountPaid > 0
    ? amountPaid
    : totalAmount;
  const persistedChangeAmount = Number(transaction.change_amount);
  const showCashChange = String(transaction.payment_type || '').trim().toLowerCase() === 'cash'
    && Number.isFinite(persistedChangeAmount)
    && persistedChangeAmount > 0;

  // Format date to: May 18, 2024 • 10:34 AM
  const printedAt = transaction.created_at
    ? new Date(transaction.created_at)
        .toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        .replace(',', ' •')
    : '-';

  const detailsGridClassName = mobileResponsive
    ? 'grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-[#F8FAFC] p-2.5 sm:grid-cols-2'
    : 'grid grid-cols-2 gap-2 rounded-xl border border-slate-100 bg-[#F8FAFC] p-2.5';
  const orderTotalsClassName = 'flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm';
  const summaryRowClassName = mobileResponsive
    ? 'flex items-start justify-between gap-3 text-base text-slate-600'
    : 'flex items-center justify-between text-base text-slate-600';
  const summaryLabelClassName = mobileResponsive ? 'min-w-0 break-words' : '';
  const summaryValueClassName = mobileResponsive
    ? 'shrink-0 text-base font-semibold tabular-nums text-slate-900'
    : 'text-base font-semibold tabular-nums text-slate-900';
  const discountClassName = discountAmount > 0 ? 'font-bold text-rose-600' : '';
  const changeClassName = showCashChange ? 'font-bold text-blue-600' : '';

  return (
    <div className="w-full space-y-3.5">
      {/* Horizontal details card (Order #, Date) */}
      <div className={detailsGridClassName}>
        {/* Order # */}
        <div className={`flex items-center gap-2 ${mobileResponsive ? 'min-w-0 py-1 sm:py-0' : ''}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Hash className="h-4.5 w-4.5" />
          </div>
          <div className={mobileResponsive ? 'min-w-0' : ''}>
            <p className="text-[11px] font-semibold text-slate-500 leading-none">Order #</p>
            <p className={mobileResponsive ? 'mt-0.5 break-words text-xs font-black text-slate-900' : 'text-xs font-black text-slate-900 mt-0.5'}>{transaction.invoice_number || '-'}</p>
          </div>
        </div>

        {/* Date */}
        <div className={`flex items-center gap-2 ${mobileResponsive ? 'min-w-0 border-t border-slate-200 py-2 sm:border-l sm:border-t-0 sm:py-0 sm:pl-3' : 'border-l border-slate-200 pl-3'}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Calendar className="h-4.5 w-4.5" />
          </div>
          <div className={mobileResponsive ? 'min-w-0' : ''}>
            <p className="text-[11px] font-semibold text-slate-500 leading-none">Date</p>
            <p className={mobileResponsive ? 'mt-0.5 break-words text-xs font-black text-slate-900' : 'text-xs font-black text-slate-900 mt-0.5'}>{printedAt}</p>
          </div>
        </div>

      </div>

      {/* Order totals only; item details remain available through View Receipt. */}
      <div className={orderTotalsClassName}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CircleDollarSign className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-none">Order Totals</h3>
            </div>
          </div>

          <div className="space-y-2">
            <div className={summaryRowClassName}>
              <span className={summaryLabelClassName}>Subtotal</span>
              <span className={summaryValueClassName}>{money(subtotalAmount)}</span>
            </div>
            <div className={summaryRowClassName}>
              <span className={`${summaryLabelClassName} ${discountClassName}`}>Discount</span>
              <span className={`${summaryValueClassName} ${discountClassName}`}>{money(discountAmount)}</span>
            </div>
            {showCashChange && (
              <div className={summaryRowClassName}>
                <span className={`${summaryLabelClassName} ${changeClassName}`}>Change</span>
                <span className={`${summaryValueClassName} ${changeClassName}`}>{money(persistedChangeAmount)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-emerald-50/60 p-2.5">
          <span className={mobileResponsive ? 'min-w-0 text-base font-bold text-[#0F172A]' : 'text-base font-bold text-[#0F172A]'}>Total Payment</span>
          <span className={mobileResponsive ? 'shrink-0 text-base font-black tabular-nums text-emerald-600' : 'text-base font-black tabular-nums text-emerald-600'}>{money(totalPaymentAmount)}</span>
        </div>
      </div>
    </div>
  );
}
