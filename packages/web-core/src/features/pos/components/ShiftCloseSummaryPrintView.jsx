import React, { useEffect } from 'react';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import PosDropdownSelect from './PosDropdownSelect.jsx';
import {
    formatCashierHistoryDateTime,
    formatCashierHistoryMoney,
    formatCashierHistoryPaymentLabel
} from '../utils/cashierHistoryFormatters.js';
import { formatDeliveryProviderSummaryLabel, parseDeliveryProviderSummary } from '../utils/posDeliveryProviders.js';

const reconciliationMoney = (value, currency, pendingLabel) => (
    value == null ? pendingLabel : formatCashierHistoryMoney(value, currency)
);
const resolvePaperWidth = (value) => (value === '57mm' ? '57mm' : '80mm');
const PAPER_WIDTH_OPTIONS = [
    { value: '80mm', label: '80mm (3 1/8 in)' },
    { value: '57mm', label: '57mm (2 1/4 in)' }
];
const paymentLabel = (entry) => (
    String(entry?.payment_label || entry?.payment_type || '').replace(/_/g, ' ') || '-'
);
const orderMethodLabel = (value) => ({
    dine_in: 'Dine In',
    takeout: 'Takeout',
    pickup: 'Pickup',
    delivery: 'Delivery',
    online: 'Online'
}[String(value || '').trim().toLowerCase()] || String(value || '').replace(/[_-]/g, ' ') || '-');
const formatCount = (value) => Number(value || 0).toLocaleString('en-US');
const entryCount = (entry) => Number(entry?.count ?? entry?.total_transactions ?? entry?.transaction_count ?? 0);
const entryAmount = (entry) => Number(entry?.amount ?? entry?.net_sales ?? 0);
const hasBreakdownValue = (entry) => entryCount(entry) > 0 || entryAmount(entry) > 0;

const Row = ({ name, value, strong = false }) => (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 ${strong ? 'border-t border-slate-300 pt-2 font-bold text-slate-950' : 'text-slate-700'}`}>
        <span className="min-w-0 break-words">{name}</span>
        <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums">{value}</span>
    </div>
);

const BreakdownRow = ({ name, count, value }) => (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
            <p className="break-words font-semibold text-slate-900">{name}</p>
            <p className="text-[10px] leading-4 text-slate-500">
                {formatCount(count)} transaction{Number(count || 0) === 1 ? '' : 's'}
            </p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-right font-mono font-bold tabular-nums text-slate-950">{value}</span>
    </div>
);

const SummarySection = ({ title, children, emphasis = false }) => (
    <section className={`border-t border-slate-200 py-3 first:border-t-0 ${emphasis ? 'pt-2' : ''}`}>
        <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{title}</h3>
        {children}
    </section>
);

export default function ShiftCloseSummaryPrintView({
    report,
    currency = '₱',
    onClose,
    onPrint,
    autoPrint = false,
    title = 'Cashier Shift Sales Summary',
    businessSettings = {},
    paperWidth = '80mm',
    onPaperWidthChange = () => {},
    hardwareLoading = false,
    isPrinterAvailable
}) {
    useEffect(() => {
        if (typeof document === 'undefined' || !report) return undefined;
        document.body.classList.add('pos-shift-summary-printing');
        return () => document.body.classList.remove('pos-shift-summary-printing');
    }, [report]);

    if (!report) return null;

    const shift = report.shift || {};
    const cash = report.cash_summary || {};
    const sales = report.sales_summary || {};
    const payments = Array.isArray(sales.payment_breakdown) ? sales.payment_breakdown : [];
    const orderMethods = Array.isArray(sales.order_method_breakdown) ? sales.order_method_breakdown : [];
    const orderSources = Array.isArray(sales.order_source_breakdown) ? sales.order_source_breakdown : [];
    const deliveryProviders = parseDeliveryProviderSummary(sales.delivery_provider_breakdown);
    const adjustments = Array.isArray(sales.post_close_adjustments) ? sales.post_close_adjustments : [];
    const isXReading = report.report_type === 'x_reading';
    const visiblePayments = payments.filter(hasBreakdownValue);
    const visibleOrderMethods = orderMethods.filter(hasBreakdownValue);
    const visibleOrderSources = orderSources.filter(hasBreakdownValue);
    const visibleDeliveryProviders = deliveryProviders.filter(hasBreakdownValue);
    const transactionCount = Number(sales.transaction_count ?? sales.total_transactions ?? 0);
    const totalAmount = Number(sales.total_amount ?? sales.net_sales ?? 0);
    const reportBusiness = report.business || {};
    const businessName = String(
        businessSettings.pos_business_name || reportBusiness.name || 'DGFY'
    ).trim() || 'DGFY';
    const businessIcon = String(
        businessSettings.storefront_profile_image_url
        || businessSettings.profile_image_url
        || reportBusiness.profile_image_url
        || ''
    ).trim();
    const resolvedPaperWidth = resolvePaperWidth(paperWidth);
    const browserPrintFallback = !hardwareLoading && (isPrinterAvailable === false || autoPrint);
    const displayTitle = isXReading ? 'X-Reading / Current Shift' : title;

    return (
        <div
            className="pos-shift-summary-print-shell fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/70 p-4 print:static print:inset-auto print:overflow-visible print:bg-white print:p-0"
            style={{ '--pos-shift-summary-paper-width': resolvedPaperWidth }}
        >
            <article
                role="dialog"
                aria-modal="true"
                aria-label={`${displayTitle} for shift ${shift.pos_terminal_shift_id || shift.shift_id || ''}`}
                className="pos-shift-summary-print-dialog relative flex max-h-[92vh] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-2xl print:max-h-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
            >
                <div className="pos-shift-summary-print-scroll min-h-0 overflow-y-auto pr-1">
                    <div
                        className="pos-shift-summary-print-content mx-auto w-full max-w-lg bg-white px-1 py-1 font-mono text-[11px] leading-tight text-slate-900 sm:px-2"
                        data-paper-width={resolvedPaperWidth}
                    >
                        <header className="border-b border-dashed border-slate-300 pb-3 text-center">
                            {businessIcon ? (
                                <img src={resolveAssetUrl(businessIcon)} alt={`${businessName} icon`} className="mx-auto mb-1 h-auto w-16 object-contain" />
                            ) : null}
                            <p className="text-xs font-black uppercase">{businessName}</p>
                            <h2 className="mt-1 text-sm font-black uppercase">{displayTitle}</h2>
                            <p className="mt-2 text-[11px] text-slate-700">Business date: {shift.business_date || '\u2014'}</p>
                            <p className="text-[11px] text-slate-700">Terminal: {shift.terminal_id || '\u2014'}</p>
                            <p className="text-[11px] text-slate-700">Shift #: {shift.pos_terminal_shift_id || shift.shift_id || '\u2014'}</p>
                            {report.generated_at ? <p className="text-[11px] text-slate-700">Generated: {formatCashierHistoryDateTime(report.generated_at)}</p> : null}
                        </header>

                        <SummarySection title="Sales summary" emphasis>
                            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 print:bg-white">
                                <div className="flex items-end justify-between gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-wide text-[#1A4E8D]">{isXReading ? 'Net sales' : 'Overall sales'}</span>
                                    <span className="shrink-0 font-mono text-lg font-black leading-none tabular-nums text-[#1A4E8D]">{formatCashierHistoryMoney(totalAmount, currency)}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between border-t border-blue-200 pt-2 text-[11px] print:border-slate-200">
                                    <span className="text-slate-600">Transactions</span>
                                    <span className="font-mono font-bold tabular-nums text-slate-950">{formatCount(transactionCount)}</span>
                                </div>
                            </div>
                        </SummarySection>

                        <SummarySection title="Sales and tax details">
                            <Row name="Items sold" value={formatCount(sales.item_count)} />
                            <Row name="Subtotal" value={formatCashierHistoryMoney(sales.subtotal_amount, currency)} />
                            <Row name="Discounts" value={formatCashierHistoryMoney(sales.discount_amount, currency)} />
                            <Row name="VATable sales" value={formatCashierHistoryMoney(sales.vatable_sales, currency)} />
                            <Row name="VAT" value={formatCashierHistoryMoney(sales.vat_amount, currency)} />
                            <Row name="VAT-exempt sales" value={formatCashierHistoryMoney(sales.vat_exempt_sales, currency)} />
                            <Row name="Zero-rated sales" value={formatCashierHistoryMoney(sales.zero_rated_sales, currency)} />
                            <Row name={`POS voids (${formatCount(sales.void_transaction_count)})`} value={formatCashierHistoryMoney(sales.transaction_void_amount ?? sales.void_amount, currency)} />
                            <Row name={`Item voids (${formatCount(sales.item_voided_item_count)})`} value={formatCashierHistoryMoney(sales.item_void_amount, currency)} />
                            <Row name="Total voids" value={formatCashierHistoryMoney(sales.void_amount, currency)} />
                            <Row name="Refunds" value={formatCashierHistoryMoney(sales.refund_amount, currency)} />
                        </SummarySection>

                        <SummarySection title="Payment methods">
                            {visiblePayments.length === 0 ? (
                                <p className="text-slate-500">No payments recorded.</p>
                            ) : visiblePayments.map((entry, index) => (
                                <BreakdownRow
                                    key={`${entry.payment_type || entry.payment_label || 'payment'}-${index}`}
                                    name={paymentLabel(entry) || formatCashierHistoryPaymentLabel(entry, '-')}
                                    count={entryCount(entry)}
                                    value={formatCashierHistoryMoney(entryAmount(entry), currency)}
                                />
                            ))}
                        </SummarySection>

                        {visibleOrderSources.length > 0 ? (
                            <SummarySection title="Sales sources">
                                {visibleOrderSources.map((entry, index) => (
                                    <BreakdownRow
                                        key={`${entry.order_source || 'source'}-${index}`}
                                        name={entry.order_source === 'online_store' ? 'Online Sales' : 'Walk-in Sales'}
                                        count={entryCount(entry)}
                                        value={formatCashierHistoryMoney(entryAmount(entry), currency)}
                                    />
                                ))}
                            </SummarySection>
                        ) : null}

                        {visibleOrderMethods.length > 0 ? (
                            <SummarySection title="Order methods">
                                {visibleOrderMethods.map((entry, index) => (
                                    <BreakdownRow
                                        key={`${entry.order_method || 'method'}-${index}`}
                                        name={orderMethodLabel(entry.order_method)}
                                        count={entryCount(entry)}
                                        value={formatCashierHistoryMoney(entryAmount(entry), currency)}
                                    />
                                ))}
                            </SummarySection>
                        ) : null}

                        <SummarySection title="Delivery providers">
                            {visibleDeliveryProviders.length === 0 ? (
                                <Row name="No delivery provider sales" value="0" />
                            ) : visibleDeliveryProviders.map((entry, index) => (
                                <BreakdownRow
                                    key={`${entry.provider_type || 'provider'}-${entry.provider_name || index}`}
                                    name={formatDeliveryProviderSummaryLabel(entry)}
                                    count={entryCount(entry)}
                                    value={formatCashierHistoryMoney(entryAmount(entry), currency)}
                                />
                            ))}
                        </SummarySection>

                        <SummarySection title="Cash reconciliation">
                            <Row name="Opening/petty cash" value={formatCashierHistoryMoney(cash.opening_float_amount, currency)} />
                            <Row name="Cash sales" value={formatCashierHistoryMoney(cash.cash_sales_amount, currency)} />
                            <Row name="Cash in" value={formatCashierHistoryMoney(cash.cash_in_total, currency)} />
                            <Row name="Cash out" value={formatCashierHistoryMoney(cash.cash_out_total, currency)} />
                            <Row name="Expected cash in drawer" value={formatCashierHistoryMoney(cash.expected_cash_amount, currency)} />
                            <Row name="Closing cash" value={reconciliationMoney(cash.closing_cash_amount, currency, 'Not closed')} />
                            <Row name="Variance" value={reconciliationMoney(cash.cash_variance_amount, currency, 'Pending close')} strong />
                        </SummarySection>

                        {adjustments.length > 0 ? (
                            <section className="space-y-2 border-t border-dashed border-slate-300 py-3">
                                <p className="font-black uppercase">Post-close adjustment accountability</p>
                                {adjustments.map((adjustment, index) => (
                                    <div key={adjustment.pos_transaction_adjustment_id || adjustment.adjustment_reference || index} className="border-b border-slate-200 pb-2 last:border-0">
                                        <Row
                                            name={`${String(adjustment.adjustment_type || 'adjustment').replace(/_/g, ' ')} · ${formatCashierHistoryMoney(adjustment.amount, currency)}`}
                                            value={String(adjustment.status || 'unknown').replace(/_/g, ' ')}
                                        />
                                        <p className="mt-1 text-[10px] text-slate-600">
                                            Actioned by {adjustment.actor_name || adjustment.actor_user_id || '\u2014'} · Acting shift {adjustment.actor_shift_id || 'none'}
                                        </p>
                                        <p className="text-[10px] text-slate-600">
                                            {adjustment.adjustment_reference || 'No reference'} · {formatCashierHistoryDateTime(adjustment.event_at)}
                                        </p>
                                    </div>
                                ))}
                            </section>
                        ) : null}

                        <p className="border-t border-dashed border-slate-300 pt-2 text-center text-[10px] text-slate-500">
                            {isXReading
                                ? 'X-reading is read-only and does not close the shift or reset Z-reading counters.'
                                : autoPrint
                                ? 'Keep with cashier close evidence.'
                                : shift.closed_at
                                    ? 'Read-only shift summary.'
                                    : 'Current shift totals are read-only until the shift is closed.'}
                        </p>
                    </div>
                </div>

                {!hardwareLoading && isPrinterAvailable === false ? (
                    <p className="mt-3 border-t border-amber-200 pt-3 text-center text-[10px] text-amber-700 print:hidden">
                        No native POS printer detected. Browser print can use a Windows-installed printer.
                    </p>
                ) : null}

                <div className="mt-3 border-t border-slate-200 pt-3 print:hidden">
                    <div className="mb-3 flex items-center gap-3">
                        <label id="shift-summary-paper-width-label" htmlFor="shift-summary-paper-width" className="shrink-0 text-sm font-semibold text-slate-700">Paper</label>
                        <PosDropdownSelect
                            id="shift-summary-paper-width"
                            triggerTestId="pos-shift-summary-paper-width"
                            ariaLabel="Paper"
                            ariaDescribedBy="shift-summary-paper-width-help"
                            listboxLabel="Paper size options"
                            className="min-w-0 flex-1"
                            triggerClassName="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-[#0F172A] transition-colors hover:border-[#8AA8CD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/25"
                            menuClassName="absolute bottom-[calc(100%+0.375rem)] left-0 z-50 max-h-72 min-w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
                            value={resolvedPaperWidth}
                            onChange={(nextWidth) => onPaperWidthChange(resolvePaperWidth(nextWidth))}
                            options={PAPER_WIDTH_OPTIONS}
                        />
                    </div>
                    <p id="shift-summary-paper-width-help" className="mb-3 text-center text-xs text-slate-600">
                        Browser print uses the selected width. Match it in your printer settings.
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="min-h-11 min-w-0 flex-1 rounded-lg border border-blue-300 bg-white px-2 text-xs font-bold text-[#1458CE] hover:bg-blue-50 sm:px-4 sm:text-sm"
                            onClick={onClose}
                        >
                            Done
                        </button>
                        <button
                            type="button"
                            disabled={hardwareLoading}
                            title={hardwareLoading
                                ? 'Checking printer availability.'
                                : browserPrintFallback
                                    ? 'Opens the browser print dialog.'
                                    : undefined}
                            className="min-h-11 min-w-0 flex-1 rounded-lg bg-[#1A4E8D] px-2 text-xs font-bold text-white hover:bg-[#153f73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
                            onClick={() => {
                                if (browserPrintFallback && typeof window !== 'undefined' && typeof window.print === 'function') {
                                    window.print();
                                    return;
                                }
                                if (onPrint) onPrint(resolvedPaperWidth);
                                else if (typeof window !== 'undefined') window.print();
                            }}
                        >
                            {hardwareLoading ? 'Checking printer...' : 'Print'}
                        </button>
                    </div>
                </div>
            </article>
        </div>
    );
}
