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

const Row = ({ name, value, strong = false }) => (
    <div className={`flex items-start justify-between gap-3 ${strong ? 'border-t border-slate-300 pt-1 font-bold text-slate-950' : 'text-slate-700'}`}>
        <span>{name}</span>
        <span className="whitespace-nowrap text-right tabular-nums">{value}</span>
    </div>
);

export default function ShiftCloseSummaryPrintView({
    report,
    currency = '\u20b1',
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
    const deliveryProviders = parseDeliveryProviderSummary(sales.delivery_provider_breakdown);
    const adjustments = Array.isArray(sales.post_close_adjustments) ? sales.post_close_adjustments : [];
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

    return (
        <div
            className="pos-shift-summary-print-shell fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/70 p-4 print:static print:inset-auto print:overflow-visible print:bg-white print:p-0"
            style={{ '--pos-shift-summary-paper-width': resolvedPaperWidth }}
        >
            <article
                role="dialog"
                aria-modal="true"
                aria-label={`${title} for shift ${shift.pos_terminal_shift_id || shift.shift_id || ''}`}
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
                            <h2 className="mt-1 text-sm font-black uppercase">{title}</h2>
                            <p className="mt-2 text-[11px] text-slate-700">Business date: {shift.business_date || '\u2014'}</p>
                            <p className="text-[11px] text-slate-700">Terminal: {shift.terminal_id || '\u2014'}</p>
                            <p className="text-[11px] text-slate-700">Shift #: {shift.pos_terminal_shift_id || shift.shift_id || '\u2014'}</p>
                        </header>

                        <section className="space-y-1 border-b border-dashed border-slate-300 py-3">
                            <p className="mb-1 font-black uppercase">Payment method breakdown</p>
                            {payments.length === 0 ? <Row name="No payments" value={formatCashierHistoryMoney(0, currency)} /> : payments.map((entry, index) => (
                                <Row
                                    key={`${entry.payment_type || entry.payment_label || 'payment'}-${index}`}
                                    name={`${formatCashierHistoryPaymentLabel(entry, '-')} (${entry.count || 0})`}
                                    value={formatCashierHistoryMoney(entry.amount, currency)}
                                />
                            ))}
                        </section>

                        <section className="space-y-1 border-b border-dashed border-slate-300 py-3">
                            <p className="mb-1 font-black uppercase">Delivery provider breakdown</p>
                            {deliveryProviders.length === 0 ? <Row name="No delivery provider sales" value="0" /> : deliveryProviders.map((entry, index) => (
                                <Row
                                    key={`${entry.provider_type || 'provider'}-${entry.provider_name || index}`}
                                    name={`${formatDeliveryProviderSummaryLabel(entry)} (${Number(entry.transaction_count || 0).toLocaleString('en-US')})`}
                                    value={formatCashierHistoryMoney(entry.amount, currency)}
                                />
                            ))}
                        </section>

                        <section className="space-y-1 py-3">
                            <p className="mb-1 font-black uppercase">Cash reconciliation</p>
                            <Row name="Opening/petty cash" value={formatCashierHistoryMoney(cash.opening_float_amount, currency)} />
                            <Row name="Cash sales" value={formatCashierHistoryMoney(cash.cash_sales_amount, currency)} />
                            <Row name="Cash in" value={formatCashierHistoryMoney(cash.cash_in_total, currency)} />
                            <Row name="Cash out" value={formatCashierHistoryMoney(cash.cash_out_total, currency)} />
                            <Row name="Expected cash in drawer" value={formatCashierHistoryMoney(cash.expected_cash_amount, currency)} />
                            <Row name="Closing cash" value={reconciliationMoney(cash.closing_cash_amount, currency, 'Not closed')} />
                            <Row name="Variance" value={reconciliationMoney(cash.cash_variance_amount, currency, 'Pending close')} strong />
                        </section>

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
                            {autoPrint
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
