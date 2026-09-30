import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination, POS_PAGINATION_FOOTER_CLASS } from '@/components/ui/pagination';
import PosTableActionButton from './PosTableActionButton.jsx';
import PosTableDetailsDialog from './PosTableDetailsDialog.jsx';
import PosTableSurface, {
  POS_TABLE_CELL_CLASS,
  POS_TABLE_HEADER_CELL_CLASS,
  POS_TABLE_HEADER_CLASS,
  POS_TABLE_ROW_CLASS
} from './PosTableSurface.jsx';

const formatMoney = (value, currencySymbol) => value === null || value === undefined || value === ''
  ? '—'
  : `${currencySymbol}${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatBusinessDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || '—';
  const date = new Date(`${value}T12:00:00+08:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
};

const DetailField = ({ label, value, ...field }) => ({ label, value: value ?? '—', ...field });

const formatCount = (value) => value === null || value === undefined || value === ''
  ? 'Not recorded'
  : Number(value).toLocaleString('en-US');

const formatCapturedMoney = (value, currencySymbol) => value === null || value === undefined || value === ''
  ? 'Not recorded'
  : formatMoney(value, currencySymbol);

const formatInvoiceRange = (range) => {
  if (!range || typeof range !== 'object') return 'Not captured';
  const first = String(range?.beginning_invoice_number || '').trim();
  const last = String(range?.ending_invoice_number || '').trim();
  if (!first && !last) return 'No invoice numbers captured';
  if (!last || first === last) return first || last;
  return `${first || '—'} – ${last}`;
};

const formatBusinessPeriod = (period) => {
  const start = period?.starts_at ? new Date(period.starts_at) : null;
  const endExclusive = period?.ends_at_exclusive ? new Date(period.ends_at_exclusive) : null;
  if (!start || Number.isNaN(start.getTime()) || !endExclusive || Number.isNaN(endExclusive.getTime())) return 'Not recorded';
  const end = new Date(endExclusive.getTime() - 1);
  return `${formatDateTime(start.toISOString())} – ${formatDateTime(end.toISOString())}`;
};

const AuditDataList = ({ items }) => (
  <dl className="grid min-w-0 gap-x-6 gap-y-3 sm:grid-cols-2">
    {items.map(([label, value]) => (
      <div key={label} className="min-w-0">
        <dt className="text-xs font-semibold text-[#64748B] min-[768px]:text-[clamp(0.75rem,0.8vw,0.8125rem)] min-[768px]:text-[#334155]">{label}</dt>
        <dd className="mt-1 break-words text-sm font-semibold text-[#475569] min-[768px]:text-[clamp(0.8125rem,0.9vw,0.9375rem)] min-[768px]:leading-5">{value ?? '—'}</dd>
      </div>
    ))}
  </dl>
);

export default function PosZReadingHistoryTable({
  rows = [],
  loading = false,
  error = '',
  page = 1,
  limit = 20,
  total = 0,
  onPageChange,
  onPageSizeChange,
  onRetry,
  onPreview,
  preview = null,
  currencySymbol = '₱'
}) {
  const pageCount = Math.max(1, Math.ceil(Number(total || 0) / Number(limit || 20)));
  const selectedRow = preview?.row || null;
  const previewData = preview?.data || {};
  const detailSummary = preview?.data?.summary || {};
  const detailSnapshot = previewData.details || {};
  const paymentBreakdown = Array.isArray(detailSummary.payment_breakdown) ? detailSummary.payment_breakdown : [];
  const capturedRefunds = detailSnapshot.refunds || {};
  const capturedReceipts = detailSnapshot.receipt_ranges || {};
  const capturedShifts = detailSnapshot.captured && Array.isArray(detailSnapshot.shifts)
    ? detailSnapshot.shifts
    : [];
  const previewSections = preview?.loading
    ? [{ key: 'loading', title: 'Loading saved reading', fields: [DetailField({ label: 'Status', value: 'Loading the saved details…' })] }]
    : preview?.error
      ? [{ key: 'error', title: 'Details unavailable', fields: [DetailField({ label: 'Could not load details', value: preview.error })] }]
      : [
          {
            key: 'reading-identity',
            title: 'Reading summary',
            fields: [
              DetailField({ label: 'Business date', value: formatBusinessDate(previewData.business_date || selectedRow?.business_date) }),
              DetailField({ label: 'Branch', value: detailSnapshot.branch_name || (previewData.location_id ? `Location #${previewData.location_id}` : 'Not recorded') }),
              DetailField({ label: 'Terminal', value: previewData.closed_from_terminal_id || selectedRow?.closed_from_terminal_id }),
              DetailField({ label: 'Generated', value: formatDateTime(previewData.generated_at || selectedRow?.generated_at) }),
              DetailField({ label: 'Generated by', value: detailSnapshot.generated_by?.display_name || 'Not captured' })
            ]
          },
          {
            key: 'sales-tax',
            title: 'Sales summary',
            fields: [
              DetailField({ label: 'Transactions', value: formatCount(detailSummary.transaction_count) }),
              DetailField({ label: 'Z-reading total', value: formatMoney(detailSummary.total_amount, currencySymbol) }),
              DetailField({ label: 'Subtotal', value: formatMoney(detailSummary.subtotal_amount, currencySymbol) }),
              DetailField({ label: 'Discounts', value: formatMoney(detailSummary.discount_amount, currencySymbol) }),
              DetailField({
                label: 'Service fees and charges',
                value: (
                  <div className="grid gap-1 text-sm font-semibold text-[#475569] min-[768px]:text-[clamp(0.8125rem,0.9vw,0.9375rem)]">
                    <span>Service fees: {formatMoney(detailSummary.service_fee_total, currencySymbol)}</span>
                    <span>Restaurant charge: {formatMoney(detailSummary.restaurant_service_charge_total, currencySymbol)}</span>
                  </div>
                )
              }),
              DetailField({
                label: 'Tax breakdown',
                value: (
                  <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm font-semibold text-[#475569] sm:grid-cols-2 min-[768px]:text-[clamp(0.8125rem,0.9vw,0.9375rem)]">
                    <span>VATable: {formatMoney(detailSummary.vatable_sales, currencySymbol)}</span>
                    <span>VAT: {formatMoney(detailSummary.vat_amount, currencySymbol)}</span>
                    <span>VAT-exempt: {formatMoney(detailSummary.vat_exempt_sales, currencySymbol)}</span>
                    <span>Zero-rated: {formatMoney(detailSummary.zero_rated_sales, currencySymbol)}</span>
                  </div>
                )
              })
            ]
          },
          {
            key: 'payment-breakdown',
            title: 'Payment breakdown',
            fields: paymentBreakdown.some((entry) => Number(entry?.amount || 0) > 0 || Number(entry?.count || 0) > 0)
              ? paymentBreakdown
                  .filter((entry) => Number(entry?.amount || 0) > 0 || Number(entry?.count || 0) > 0)
                  .map((entry) => DetailField({
                    label: entry.payment_label || entry.payment_type || 'Other payment',
                    value: entry.count == null
                      ? formatMoney(entry.amount, currencySymbol)
                      : `${formatMoney(entry.amount, currencySymbol)} · ${formatCount(entry.count)} payments`
                  }))
              : [DetailField({ label: 'Payments', value: 'No payment entries recorded' })]
          },
          {
            key: 'adjustments',
            title: 'Adjustments',
            fields: [
              DetailField({
                label: 'Voids (count · amount)',
                value: `${formatCount(detailSummary.void_transaction_count)} · ${formatMoney(detailSummary.void_amount, currencySymbol)}`
              }),
              DetailField({
                label: 'Completed refunds (count · amount)',
                value: detailSnapshot.captured
                  ? `${formatCount(capturedRefunds.succeeded_count)} · ${formatCapturedMoney(capturedRefunds.succeeded_amount, currencySymbol)}`
                  : 'Not captured'
              })
            ]
          },
          ...(capturedShifts.length > 0
            ? capturedShifts.map((shift) => ({
                key: `shift-${shift.shift_id}`,
                title: `Cashier and shift · ${shift.terminal_id || 'Terminal not recorded'}`,
                fields: [
                  DetailField({ label: 'Shift opened by', value: shift.opening_cashier?.display_name || 'Not recorded' }),
                  DetailField({
                    label: 'Shift time',
                    value: `${formatDateTime(shift.opened_at)} – ${formatDateTime(shift.closed_at)}`
                  }),
                  DetailField({ label: 'Transactions', value: formatCount(shift.transaction_count) }),
                  DetailField({ label: 'Shift sales', value: formatMoney(shift.sales_amount, currencySymbol) }),
                  DetailField({ label: 'Expected cash', value: formatCapturedMoney(shift.cash?.expected_cash_amount, currencySymbol) }),
                  DetailField({ label: 'Cash counted at close', value: formatCapturedMoney(shift.cash?.counted_cash_amount, currencySymbol) }),
                  DetailField({ label: 'Over / short for this shift', value: formatCapturedMoney(shift.cash?.variance_amount, currencySymbol) }),
                  DetailField({
                    label: 'Cashier sales',
                    className: 'sm:col-span-2',
                    value: Array.isArray(shift.cashier_sales) && shift.cashier_sales.length > 0 ? (
                      <ul className="space-y-2">
                        {shift.cashier_sales.map((cashier, index) => (
                          <li key={`${cashier.operator_session_id || cashier.cashier_id || 'unattributed'}-${index}`} className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                            <span className="min-w-0 break-words">{cashier.display_name || 'Unattributed'}</span>
                            <span className="shrink-0 tabular-nums text-slate-600">
                              {formatCount(cashier.transaction_count)} transactions · {formatMoney(cashier.sales_amount, currencySymbol)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : 'No cashier sales were recorded for this shift.'
                  })
                ]
              }))
            : [
                {
                  key: 'shift-details-unavailable',
                  title: 'Cashier and shift details',
                  fields: [DetailField({
                    label: 'Shift records',
                    value: detailSnapshot.captured
                      ? 'No register shifts were captured for this branch business date.'
                      : 'Cashier and shift details were not captured for this older reading.',
                    className: 'sm:col-span-2'
                  })]
                }
              ]),
          {
            key: 'additional-audit-details',
            content: (
              <details className="group min-w-0">
                <summary className="cursor-pointer rounded-lg text-sm font-bold text-[#1A4E8D] outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] min-[768px]:text-[clamp(0.8125rem,0.9vw,0.9375rem)]">
                  Show additional audit details
                </summary>
                <div className="mt-4 space-y-5 border-t border-slate-100 pt-4">
                  <section className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-800 min-[768px]:text-[clamp(0.8125rem,0.9vw,1rem)]">Reading counters and period</h4>
                    <AuditDataList items={[
                      ['Reading reference', previewData.reading_identifier || selectedRow?.reading_identifier || 'Not recorded'],
                      ['Report period (Asia/Manila)', formatBusinessPeriod(detailSnapshot.report_period)],
                      ['Z counter', formatCount(previewData.counters?.z_counter)],
                      ['Reset counter', formatCount(previewData.counters?.reset_counter)],
                      ['Accumulated total', formatCapturedMoney(previewData.counters?.lifetime_grand_total, currencySymbol)]
                    ]} />
                  </section>

                  <section className="space-y-3 border-t border-slate-100 pt-4">
                    <h4 className="text-sm font-bold text-slate-800 min-[768px]:text-[clamp(0.8125rem,0.9vw,1rem)]">Other adjustment details</h4>
                    <AuditDataList items={[
                      ['Pending refunds', detailSnapshot.captured ? `${formatCount(capturedRefunds.pending_count)} · ${formatCapturedMoney(capturedRefunds.pending_amount, currencySymbol)}` : 'Not captured'],
                      ['Refunds needing review', detailSnapshot.captured ? `${formatCount(capturedRefunds.review_count)} · ${formatCapturedMoney(capturedRefunds.review_amount, currencySymbol)}` : 'Not captured'],
                      ['Refund reporting period', 'Refunds are grouped by the date they were recorded; later activity does not change this saved reading.'],
                      ['Returns', capturedReceipts.returns?.tracked === false ? 'Not separately tracked' : 'Not captured']
                    ]} />
                  </section>

                  <section className="space-y-3 border-t border-slate-100 pt-4">
                    <h4 className="text-sm font-bold text-slate-800 min-[768px]:text-[clamp(0.8125rem,0.9vw,1rem)]">Receipt ranges</h4>
                    <AuditDataList items={[
                      ['Sales invoices', formatInvoiceRange(capturedReceipts.sales)],
                      ['Voided invoices', formatInvoiceRange(capturedReceipts.voids)],
                      ['Return receipts', capturedReceipts.returns?.tracked === false ? capturedReceipts.returns.reason : 'Not captured']
                    ]} />
                  </section>

                  {capturedShifts.map((shift) => (
                    <section key={`audit-${shift.shift_id}`} className="space-y-3 border-t border-slate-100 pt-4">
                      <h4 className="break-words text-sm font-bold text-slate-800 min-[768px]:text-[clamp(0.8125rem,0.9vw,1rem)]">More for {shift.terminal_id || 'this shift'}</h4>
                      <AuditDataList items={[
                        ['Shift reference', shift.shift_id ? `#${shift.shift_id}` : 'Not recorded'],
                        ['Opening float', formatCapturedMoney(shift.cash?.opening_float_amount, currencySymbol)],
                        ['Shift voids', `${formatCount(shift.adjustments?.void_transaction_count)} · ${formatMoney(shift.adjustments?.void_amount, currencySymbol)}`],
                        ['Completed shift refunds', `${formatCount(shift.adjustments?.refunds?.succeeded_count)} · ${formatCapturedMoney(shift.adjustments?.refunds?.succeeded_amount, currencySymbol)}`],
                        ['Sales invoices', formatInvoiceRange(shift.receipt_ranges?.sales)],
                        ['Voided invoices', formatInvoiceRange(shift.receipt_ranges?.voids)],
                        ['Drawer variance scope', 'This amount belongs to the whole register shift and is not split across cashiers.']
                      ]} />
                    </section>
                  ))}

                  <p className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
                    {detailSnapshot.captured
                      ? 'These additional fields were saved with this reading.'
                      : detailSnapshot.unavailable_reason || 'Additional shift and audit fields were not captured with this older reading.'}
                  </p>
                </div>
              </details>
            )
          }
        ];

  return (
    <section className="min-w-0 space-y-3" aria-labelledby="pos-z-reading-history-title">
      <div className="min-w-0">
        <h2 id="pos-z-reading-history-title" className="text-base font-black text-slate-900">Saved Z-readings</h2>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          This history contains completed, saved branch readings only. Unclosed dates and X-readings are not included.
        </p>
      </div>

      {loading ? (
        <div role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-600">
          Loading saved Z-readings…
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-800">
          <span className="min-w-0">{error}</span>
          {onRetry ? <Button type="button" variant="outline" onClick={onRetry}>Try again</Button> : null}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <p className="text-sm font-bold text-slate-700">No saved Z-readings in this date range</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">A reading appears here after a branch day is successfully closed.</p>
        </div>
      ) : (
        <>
          <div className="min-[768px]:hidden">
            <ul className="grid min-w-0 gap-2" aria-label="Saved Z-readings">
              {rows.map((row) => (
                <li key={row.reading_identifier} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-black text-slate-900">{row.reading_identifier || 'Z-reading'}</p>
                      <p className="mt-1 text-xs text-slate-600">{formatBusinessDate(row.business_date)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-[#1A4E8D]">
                      {formatMoney(row.summary?.total_amount, currencySymbol)}
                    </p>
                  </div>
                  <p className="mt-2 break-words text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">{row.closed_by_display_name || (row.closed_by_user_id ? `User #${row.closed_by_user_id}` : 'Cashier not recorded')}</span>
                    <span aria-hidden="true"> · </span>
                    {row.closed_from_terminal_id || 'Terminal not recorded'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                    <span>{row.summary?.transaction_count == null ? '—' : Number(row.summary.transaction_count)} transactions</span>
                    <span>{formatDateTime(row.generated_at)}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => onPreview?.(row)}>
                      <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" /> Preview
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <PosTableSurface className="hidden min-[768px]:block">
            <div className="min-w-0 max-w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1A4E8D]" role="region" aria-label="Saved Z-readings table" tabIndex={0}>
              <table className="w-full min-w-[900px] table-fixed text-[13px]">
                <caption className="sr-only">Persisted Z-readings for the selected branch and date range</caption>
                <thead className={POS_TABLE_HEADER_CLASS}>
                  <tr>
                    <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} h-12 w-[15%]`}>Business date</th>
                    <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} h-12 w-[19%]`}>Reading</th>
                    <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} h-12 w-[17%]`}>Terminal / Closed by</th>
                    <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} h-12 w-[14%] text-right`}>Z-reading total</th>
                    <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} h-12 w-[10%] text-right`}>Transactions</th>
                    <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} h-12 w-[17%]`}>Generated</th>
                    <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} h-12 w-[8%] text-center`}>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.reading_identifier} className={POS_TABLE_ROW_CLASS}>
                      <td className={`${POS_TABLE_CELL_CLASS} font-medium`}>{formatBusinessDate(row.business_date)}</td>
                      <td className={`${POS_TABLE_CELL_CLASS} break-all font-semibold`}>{row.reading_identifier || '—'}</td>
                      <td className={`${POS_TABLE_CELL_CLASS} break-words text-slate-600`}>
                        <span className="block font-semibold text-slate-800">{row.closed_from_terminal_id || 'Terminal not recorded'}</span>
                        <span className="mt-0.5 block text-xs">{row.closed_by_display_name || (row.closed_by_user_id ? `User #${row.closed_by_user_id}` : 'Cashier not recorded')}</span>
                      </td>
                      <td className={`${POS_TABLE_CELL_CLASS} text-right font-bold tabular-nums text-[#1A4E8D]`}>{formatMoney(row.summary?.total_amount, currencySymbol)}</td>
                      <td className={`${POS_TABLE_CELL_CLASS} text-right tabular-nums`}>{row.summary?.transaction_count == null ? '—' : Number(row.summary.transaction_count)}</td>
                      <td className={`${POS_TABLE_CELL_CLASS} text-slate-600`}>{formatDateTime(row.generated_at)}</td>
                      <td className={`${POS_TABLE_CELL_CLASS} text-center`}>
                        <PosTableActionButton
                          icon={Eye}
                          className="mx-auto"
                          onClick={() => onPreview?.(row)}
                          aria-label={`Preview Z-reading ${row.reading_identifier || formatBusinessDate(row.business_date)}`}
                          title="Preview Z-reading"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PosTableSurface>

          <GlobalPagination
            testId="pos-z-reading-history-pagination"
            controlTestIdPrefix="pos-z-reading-history"
            ariaLabel="Z-reading history pagination"
            currentPage={page}
            totalPages={pageCount}
            totalItems={total}
            pageSize={limit}
            itemLabel="Z-readings"
            pageSizeOptions={[10, 20, 50, 100]}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            pageSizeLabel="Z-readings per page"
            pageInputLabel="Go to Z-reading history page"
            previousLabel="Previous Z-reading history page"
            nextLabel="Next Z-reading history page"
            className={POS_PAGINATION_FOOTER_CLASS}
          />
        </>
      )}

      <PosTableDetailsDialog
        open={Boolean(preview?.open)}
        onOpenChange={(open) => !open && preview?.onClose?.()}
        title="Z-reading details"
        subtitle={selectedRow?.reading_identifier || formatBusinessDate(selectedRow?.business_date)}
        sections={previewSections}
        testId="pos-z-reading-history-preview"
        variant="reports"
      />
    </section>
  );
}
