import React, { useState } from 'react';
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosTableActionButton from './PosTableActionButton.jsx';
import PosMobileDataCard from './PosMobileDataCard.jsx';
import PosMobileDataDetails from './PosMobileDataDetails.jsx';
import PosShiftTableScrollHint from './PosShiftTableScrollHint.jsx';
import {
  formatCashierHistoryDuration,
  formatCashierHistoryMoney,
  formatCashierHistoryTableDate,
  getCashierHistoryDateTimeParts
} from '../utils/cashierHistoryFormatters.js';
import { formatDeliveryProviderSummaryLabel, parseDeliveryProviderSummary } from '../utils/posDeliveryProviders.js';
import { POS_SHIFT_SECONDARY_BUTTON_CLASS } from './posShiftButtonStyles.js';

const getShiftStatus = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'open') {
    return { label: 'Open', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  }
  if (normalizedStatus === 'closed') {
    return { label: 'Closed', className: 'border-slate-200 bg-slate-100 text-slate-700' };
  }
  return { label: normalizedStatus || 'Unknown', className: 'border-slate-200 bg-slate-50 text-slate-600' };
};

function DateTimeCell({ value }) {
  const parts = getCashierHistoryDateTimeParts(value);
  return parts ? (
    <div className="whitespace-nowrap">
      <p>{formatCashierHistoryTableDate(value)}</p>
      <p className="mt-0.5 text-xs text-slate-500">{parts.time}</p>
    </div>
  ) : '\u2014';
}

export default function CashierHistoryTable({
  records = [],
  cashierName = '',
  currency = '\u20b1',
  locked = false,
  onViewSummary = () => {}
}) {
  const [expandedShiftKey, setExpandedShiftKey] = useState('');

  return (
    <>
      <div
        className="pos-shift-mobile-view mt-3 min-[768px]:hidden"
        data-testid="pos-cashier-history-mobile-view"
      >
        <ul className="grid min-w-0 gap-2" aria-label="Cashier shift history mobile cards">
          {records.map((record, index) => {
            const shift = record?.shift || {};
            const sales = record?.sales_summary || {};
            const cash = record?.cash_summary || {};
            const shiftId = shift.pos_terminal_shift_id || shift.shift_id || '—';
            const shiftKey = `${shiftId}-${index}`;
            const detailsId = `cashier-history-mobile-details-${index}`;
            const terminalId = shift.terminal_id || shift.business_date || '—';
            const status = getShiftStatus(shift.status);
            const rowCashierName = shift.cashier?.display_name
              || shift.cashier?.cashier_name
              || cashierName
              || '—';
            const branchName = shift.location?.name || shift.location_name || '—';
            const postCloseAdjustments = Array.isArray(sales.post_close_adjustments) ? sales.post_close_adjustments : [];
            const deliveryProviders = parseDeliveryProviderSummary(sales.delivery_provider_breakdown);
            const expanded = expandedShiftKey === shiftKey;
            const rowLabel = `shift #${shiftId}`;

            return (
              <li key={`cashier-history-mobile-${shiftKey}`} className="min-w-0">
                <PosMobileDataCard
                  titleLabel={terminalId}
                  title={(
                    <span className="flex flex-wrap items-center gap-2">
                      <span>#{shiftId}</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold ${status.className}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                        {status.label}
                      </span>
                    </span>
                  )}
                  fields={[
                    {
                      key: 'opened-at',
                      label: 'Opened at',
                      value: <DateTimeCell value={shift.opened_at} />,
                      align: 'right'
                    },
                    {
                      key: 'total-sales',
                      label: 'Total sales',
                      value: formatCashierHistoryMoney(sales.total_amount, currency),
                      valueClassName: 'font-extrabold text-[#0F172A]',
                      align: 'right',
                      numeric: true
                    }
                  ]}
                  action={(
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-9 rounded-lg px-2.5 text-[11px] font-bold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                        onClick={() => onViewSummary(record)}
                        disabled={locked}
                        aria-label={`View summary for shift #${shiftId}`}
                        title="View shift summary"
                      >
                        Summary
                      </Button>
                      <PosTableActionButton
                        icon={Eye}
                        onClick={() => setExpandedShiftKey((current) => current === shiftKey ? '' : shiftKey)}
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        aria-label={`${expanded ? 'Hide' : 'Show'} details for ${rowLabel}`}
                        title={`${expanded ? 'Hide' : 'Show'} shift details`}
                      />
                    </div>
                  )}
                  expanded={expanded}
                  detailsId={detailsId}
                  detailsLabel={`Additional details for ${rowLabel}`}
                  details={(
                    <PosMobileDataDetails
                      fields={[
                        { key: 'branch', label: 'Branch:', value: branchName },
                        { key: 'cashier', label: 'Cashier', value: rowCashierName },
                        { key: 'closed-at', label: 'Closed at', value: <DateTimeCell value={shift.closed_at} /> },
                        { key: 'duration', label: 'Duration', value: formatCashierHistoryDuration(shift.opened_at, shift.closed_at) },
                        { key: 'transactions', label: 'Transactions', value: Number(sales.transaction_count || 0).toLocaleString('en-US'), valueClassName: 'tabular-nums' },
                        { key: 'discounts', label: 'Discounts', value: formatCashierHistoryMoney(sales.discount_amount, currency), valueClassName: 'tabular-nums' },
                        { key: 'voids', label: 'Voids', value: `${Number(sales.void_transaction_count || 0)} · ${formatCashierHistoryMoney(sales.void_amount, currency)}` },
                        { key: 'post-close-voids', label: 'Post-close voids', value: `${Number(sales.post_close_void_transaction_count || 0)} · ${formatCashierHistoryMoney(sales.post_close_void_amount, currency)}` },
                        { key: 'post-close-refunds', label: 'Post-close refunds', value: `${Number(sales.post_close_adjustment_count || postCloseAdjustments.length || 0)} · ${formatCashierHistoryMoney(sales.post_close_refund_amount, currency)}` },
                        { key: 'post-close-completed', label: 'Completed after close', value: formatCashierHistoryMoney(sales.post_close_refund_amount, currency) },
                        { key: 'post-close-pending', label: 'Pending after close', value: formatCashierHistoryMoney(sales.post_close_pending_amount, currency) },
                        { key: 'post-close-review', label: 'Manual review after close', value: formatCashierHistoryMoney(sales.post_close_manual_review_amount, currency) },
                        {
                          key: 'post-close-accountability',
                          label: 'Post-close accountability',
                          value: postCloseAdjustments.length > 0 ? (
                            <ul className="space-y-1 text-left">
                              {postCloseAdjustments.map((adjustment) => (
                                <li key={adjustment.pos_transaction_adjustment_id || adjustment.adjustment_reference}>
                                  <span className="font-bold capitalize">{String(adjustment.adjustment_type || 'adjustment').replace(/_/g, ' ')}</span>
                                  {' · '}{formatCashierHistoryMoney(adjustment.amount, currency)}
                                  {' · '}{String(adjustment.status || 'unknown').replace(/_/g, ' ')}
                                  {' · By '}{adjustment.actor_name || adjustment.actor_user_id || '—'}
                                  {' · Shift '}{adjustment.actor_shift_id || '—'}
                                  {' · '}{adjustment.adjustment_reference || '—'}
                                  {' · '}{formatCashierHistoryTableDate(adjustment.event_at) || '—'}
                                </li>
                              ))}
                            </ul>
                          ) : 'None'
                        },
                        { key: 'opening-cash', label: 'Opening/petty cash', value: formatCashierHistoryMoney(cash.opening_float_amount, currency), valueClassName: 'tabular-nums' },
                        { key: 'cash-sales', label: 'Cash sales', value: formatCashierHistoryMoney(cash.cash_sales_amount, currency), valueClassName: 'tabular-nums' },
                        { key: 'expected-cash', label: 'Expected in drawer', value: formatCashierHistoryMoney(cash.expected_cash_amount, currency), valueClassName: 'tabular-nums' },
                        { key: 'variance', label: 'Variance', value: cash.cash_variance_amount == null ? 'Pending close' : formatCashierHistoryMoney(cash.cash_variance_amount, currency) },
                        {
                          key: 'payment-methods',
                          label: 'Payment methods',
                          value: Array.isArray(sales.payment_breakdown) && sales.payment_breakdown.length > 0
                            ? sales.payment_breakdown.map((entry) => `${String(entry.payment_label || entry.payment_type || 'Other').replace(/_/g, ' ')} (${entry.count || 0}): ${formatCashierHistoryMoney(entry.amount, currency)}`).join(' · ')
                            : 'No payment records'
                        },
                        {
                          key: 'delivery-providers',
                          label: 'Delivery providers',
                          value: deliveryProviders.length > 0
                            ? deliveryProviders.map((entry) => `${formatDeliveryProviderSummaryLabel(entry)} (${entry.transaction_count || 0}): ${formatCashierHistoryMoney(entry.amount, currency)}`).join(' · ')
                            : 'None'
                        }
                      ]}
                    />
                  )}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div
        className="hidden overflow-x-auto rounded-xl border border-blue-100 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] min-[768px]:block"
        role="region"
        aria-label="Cashier shift history table"
        tabIndex={0}
      >
        <PosShiftTableScrollHint />
        <table className="w-full min-w-[1080px] border-collapse text-left text-sm" aria-label="Cashier shift history">
        <caption className="sr-only">
          Shift history for {cashierName || 'the current cashier'}, including cashier identity, timing, sales totals, status, and summary actions.
        </caption>
        <thead className="bg-blue-50/70 text-xs font-bold text-[#1A4E8D]">
          <tr>
            <th scope="col" className="px-4 py-3">Shift #</th>
            <th scope="col" className="px-4 py-3">Cashier</th>
            <th scope="col" className="px-4 py-3">Branch</th>
            <th scope="col" className="px-4 py-3">Opened At</th>
            <th scope="col" className="px-4 py-3">Closed At</th>
            <th scope="col" className="px-4 py-3">Duration</th>
            <th scope="col" className="px-4 py-3 text-right">Transactions</th>
            <th scope="col" className="px-4 py-3 text-right">Total Sales</th>
            <th scope="col" className="px-4 py-3 text-right">Cash Sales</th>
            <th scope="col" className="px-4 py-3">Post-close</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const shift = record?.shift || {};
            const sales = record?.sales_summary || {};
            const cash = record?.cash_summary || {};
            const shiftId = shift.pos_terminal_shift_id || shift.shift_id || '—';
            const status = getShiftStatus(shift.status);
            const rowCashierName = shift.cashier?.display_name
              || shift.cashier?.cashier_name
              || cashierName
              || '\u2014';
            const branchName = shift.location?.name || shift.location_name || '\u2014';
            const postCloseAdjustments = Array.isArray(sales.post_close_adjustments) ? sales.post_close_adjustments : [];
            const postCloseVoidCount = Number(sales.post_close_void_transaction_count || 0);
            const postCloseAdjustmentCount = Number(sales.post_close_adjustment_count || postCloseAdjustments.length || 0);

            return (
              <tr key={String(shiftId)} className="border-t border-blue-50 text-[#0B1647] transition-colors hover:bg-blue-50/30">
                <td className="px-4 py-3.5">
                  <p className="font-extrabold">#{shiftId}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {shift.terminal_id || shift.business_date || '\u2014'}
                  </p>
                </td>
                <td className="px-4 py-3.5 font-medium">{rowCashierName}</td>
                <td className="px-4 py-3.5">{branchName}</td>
                <td className="px-4 py-3.5"><DateTimeCell value={shift.opened_at} /></td>
                <td className="px-4 py-3.5"><DateTimeCell value={shift.closed_at} /></td>
                <td className="px-4 py-3.5 whitespace-nowrap tabular-nums">
                  {formatCashierHistoryDuration(shift.opened_at, shift.closed_at)}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums">
                  {Number(sales.transaction_count || 0).toLocaleString('en-US')}
                </td>
                <td className="px-4 py-3.5 text-right font-extrabold tabular-nums">
                  {formatCashierHistoryMoney(sales.total_amount, currency)}
                </td>
                <td className="px-4 py-3.5 text-right font-bold tabular-nums">
                  {formatCashierHistoryMoney(cash.cash_sales_amount, currency)}
                </td>
                <td className="px-4 py-3.5 text-xs text-slate-600">
                  {postCloseVoidCount > 0 || postCloseAdjustmentCount > 0 ? (
                    <div className="space-y-1">
                      {postCloseVoidCount > 0 ? (
                        <p>{postCloseVoidCount} voids · {formatCashierHistoryMoney(sales.post_close_void_amount, currency)}</p>
                      ) : null}
                      {postCloseAdjustmentCount > 0 ? (
                        <p>{postCloseAdjustmentCount} refunds · {formatCashierHistoryMoney(sales.post_close_refund_amount, currency)}</p>
                      ) : null}
                      {postCloseAdjustments.map((adjustment) => (
                        <p key={adjustment.pos_transaction_adjustment_id || adjustment.adjustment_reference}>
                          {String(adjustment.adjustment_type || 'adjustment').replace(/_/g, ' ')} · {String(adjustment.status || 'unknown').replace(/_/g, ' ')} · {adjustment.actor_name || adjustment.actor_user_id || '—'} · {adjustment.adjustment_reference || '—'}
                        </p>
                      ))}
                    </div>
                  ) : '—'}
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-bold ${status.className}`}>
                    <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <PosTableActionButton
                    icon={Eye}
                    onClick={() => onViewSummary(record)}
                    disabled={locked}
                    aria-label={`View summary for shift #${shiftId}`}
                    title="View shift summary"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
