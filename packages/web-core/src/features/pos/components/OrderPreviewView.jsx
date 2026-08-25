import React from 'react';
import { Hash, Calendar, CheckCircle2, ClipboardList, CircleDollarSign } from 'lucide-react';

const money = (value) => Number(value || 0).toFixed(2);

const resolveLineQuantity = (line) => {
  const quantity = Number(line?.quantity ?? line?.qty ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
};

const resolveLineUnitPrice = (line) => {
  const explicitPrice = Number(line?.sale_price ?? line?.unit_price ?? line?.price);
  if (Number.isFinite(explicitPrice)) return explicitPrice;

  const quantity = resolveLineQuantity(line);
  const lineSubtotal = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? line?.amount);
  if (!Number.isFinite(lineSubtotal)) return 0;

  return quantity > 0 ? lineSubtotal / quantity : lineSubtotal;
};

const resolveLineSubtotal = (line) => {
  const explicitSubtotal = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? line?.amount);
  if (Number.isFinite(explicitSubtotal)) return explicitSubtotal;

  return resolveLineQuantity(line) * resolveLineUnitPrice(line);
};

const resolveLineName = (line) => (
  String(
    line?.item?.name
    || line?.item_name_snapshot
    || line?.name
    || `Item #${line?.item_id || line?.line_id || 'Unknown'}`
  ).trim()
);

const formatQuantity = (value) => {
  const quantity = Number(value || 0);
  if (!Number.isFinite(quantity)) return '0';
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
};

export default function OrderPreviewView({ transaction, mobileResponsive = false }) {
  if (!transaction) return null;

  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
  const subtotalAmount = Number.isFinite(Number(transaction.subtotal_amount))
    ? Number(transaction.subtotal_amount)
    : lines.reduce((sum, line) => sum + resolveLineSubtotal(line), 0);
  const discountAmount = Number(transaction.discount_amount || 0);
  const deliveryFeeAmount = Number(transaction.delivery_fee || 0);
  const restaurantServiceChargeAmount = Number(transaction.restaurant_service_charge_amount || 0);
  const totalAmount = Number.isFinite(Number(transaction.total_amount))
    ? Number(transaction.total_amount)
    : (subtotalAmount - discountAmount + restaurantServiceChargeAmount + deliveryFeeAmount);
  const persistedChangeAmount = Number(transaction.change_amount);
  const showCashChange = String(transaction.payment_type || '').trim().toLowerCase() === 'cash'
    && Number.isFinite(persistedChangeAmount)
    && persistedChangeAmount > 0;
  const governedDiscount = transaction.discount && typeof transaction.discount === 'object' ? transaction.discount : null;

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

  const isOfflinePending = transaction.offline_sync_state === 'pending_sync';
  const isVoided = transaction.status === 'voided';
  const detailsGridClassName = mobileResponsive
    ? 'grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-[#F8FAFC] p-2.5 sm:grid-cols-3'
    : 'grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-[#F8FAFC] p-2.5';
  const mainGridClassName = mobileResponsive
    ? 'grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-5 sm:gap-4'
    : 'grid grid-cols-5 gap-4';
  const orderSummaryClassName = mobileResponsive
    ? 'flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:col-span-3'
    : 'flex flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm col-span-3';
  const orderTotalsClassName = mobileResponsive
    ? 'flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:col-span-2 sm:justify-between'
    : 'flex flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm col-span-2 justify-between';
  const summaryRowClassName = mobileResponsive
    ? 'flex items-start justify-between gap-3 text-slate-600'
    : 'flex items-center justify-between text-slate-600';
  const summaryLabelClassName = mobileResponsive ? 'min-w-0 break-words' : '';
  const summaryValueClassName = mobileResponsive
    ? 'shrink-0 font-semibold tabular-nums text-slate-900'
    : 'font-semibold tabular-nums text-slate-900';

  return (
    <div className="w-full space-y-3.5">
      {/* Horizontal details card (Order #, Date, Status) */}
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

        {/* Status */}
        <div className={`flex items-center gap-2 ${mobileResponsive ? 'min-w-0 border-t border-slate-200 py-2 sm:border-l sm:border-t-0 sm:py-0 sm:pl-3' : 'border-l border-slate-200 pl-3'}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4.5 w-4.5" />
          </div>
          <div className={mobileResponsive ? 'min-w-0' : ''}>
            <p className="text-[11px] font-semibold text-slate-500 leading-none">Status</p>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold mt-0.5 ${
                isOfflinePending
                  ? 'bg-amber-50 text-amber-700'
                  : isVoided
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-[#ECFDF5] text-[#059669]'
              }`}
            >
              {isOfflinePending ? 'Pending Sync' : isVoided ? 'Voided' : 'Completed'}
            </span>
          </div>
        </div>
      </div>

      {/* Main split-column layout */}
      <div className={mainGridClassName}>
        {/* Left Column: Order Summary (Item List) */}
        <div className={orderSummaryClassName}>
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ClipboardList className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-none">Order Summary</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Review the items and quantities for this transaction.
              </p>
            </div>
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs sm:text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className={mobileResponsive ? 'whitespace-nowrap rounded-l-lg px-2 py-2' : 'py-2 px-2 rounded-l-lg'}>Item</th>
                  <th className={mobileResponsive ? 'whitespace-nowrap px-2 py-2 text-right' : 'py-2 px-2 text-right'}>Qty</th>
                  <th className={mobileResponsive ? 'whitespace-nowrap px-2 py-2 text-right' : 'py-2 px-2 text-right'}>Unit Price</th>
                  <th className={mobileResponsive ? 'whitespace-nowrap rounded-r-lg px-2 py-2 text-right' : 'py-2 px-2 text-right rounded-r-lg'}>Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, index) => (
                  <tr key={line?.line_id || line?.id || `${line?.item_id || 'item'}-${index}`}>
                    <td className="py-1.5 px-2 align-top font-medium text-slate-900">
                      {resolveLineName(line)}
                      {Number((line?.item_discount || line?.item_discount_snapshot)?.discount_amount || 0) > 0 && (
                        <span className="block text-[10px] font-semibold text-rose-700">
                          Item discount: -PHP {(Number((line.item_discount || line.item_discount_snapshot).discount_amount) || 0).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right align-top tabular-nums text-slate-700">
                      {formatQuantity(resolveLineQuantity(line))}
                    </td>
                    <td className="py-1.5 px-2 text-right align-top tabular-nums text-slate-700">
                      {money(resolveLineUnitPrice(line))}
                    </td>
                    <td className="py-1.5 px-2 text-right align-top tabular-nums font-black text-slate-900">
                      {money(resolveLineSubtotal(line))}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-xs text-slate-400">
                      No order items available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Order Totals Summary */}
        <div className={orderTotalsClassName}>
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <CircleDollarSign className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 leading-none">Order Totals</h3>
              </div>
            </div>

            <div className="space-y-2 text-xs sm:text-[13px]">
              <div className={summaryRowClassName}>
                <span className={summaryLabelClassName}>Subtotal</span>
                <span className={summaryValueClassName}>{money(subtotalAmount)}</span>
              </div>
              <div className={summaryRowClassName}>
                <span className={summaryLabelClassName}>{governedDiscount?.promo_code ? `Promo (${governedDiscount.promo_code})` : 'Discount'}</span>
                <span className={summaryValueClassName}>{money(discountAmount)}</span>
              </div>
              {restaurantServiceChargeAmount > 0 && <div className={summaryRowClassName}><span className={summaryLabelClassName}>Restaurant Service Charge</span><span className={summaryValueClassName}>{money(restaurantServiceChargeAmount)}</span></div>}
              {deliveryFeeAmount > 0 && <div className={summaryRowClassName}><span className={summaryLabelClassName}>Delivery Fee</span><span className={summaryValueClassName}>{money(deliveryFeeAmount)}</span></div>}
              {showCashChange && <div className={summaryRowClassName}><span className={summaryLabelClassName}>Change</span><span className={summaryValueClassName}>{money(persistedChangeAmount)}</span></div>}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-emerald-50/60 p-2.5">
            <span className={mobileResponsive ? 'min-w-0 text-xs font-bold text-[#0F172A]' : 'text-xs font-bold text-[#0F172A]'}>Total Amount</span>
            <span className={mobileResponsive ? 'shrink-0 text-[17px] font-black tabular-nums text-emerald-600' : 'text-[17px] font-black tabular-nums text-emerald-600'}>{money(totalAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
