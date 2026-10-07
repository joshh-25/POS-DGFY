import React, { useEffect } from 'react';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import { formatDeliveryProviderSummaryLabel, parseDeliveryProviderSummary } from '../utils/posDeliveryProviders.js';

const money = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyLabel = (value) => String(value || '').toUpperCase() === 'PHP' ? '₱' : String(value || '₱');
const PAPER_OPTIONS = [
    { value: '80mm', label: '80mm (3 1/8 in)' },
    { value: '57mm', label: '57mm (2 1/4 in)' }
];
const reconciliationMoney = (value, currency, pendingLabel) => (
    value == null ? pendingLabel : `${currencyLabel(currency)}${money(value)}`
);
const paymentLabel = (entry) => (
    String(entry?.payment_label || entry?.payment_type || '').replace(/_/g, ' ') || '-'
);

const Row = ({ name, value, strong = false }) => (
    <div className={`flex items-start justify-between gap-3 ${strong ? 'border-t border-slate-300 pt-1 font-bold text-slate-950' : 'text-slate-700'}`}>
        <span>{name}</span>
        <span className="whitespace-nowrap text-right tabular-nums">{value}</span>
    </div>
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
    // Chrome 80-84 iMin POS WebView has no CSS :has() (Chrome 105+), so this can't
    // rely on `body:has(.pos-shift-summary-print-shell)` -- that silently degrades to
    // "rule doesn't match", printing the whole app instead of just the summary. Mirror
    // OnlineOrderReceiptModal.jsx's existing body-class toggle pattern instead. Hook runs
    // unconditionally (rules of hooks), guarded by `report` for the class itself.
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
    const resolvedPaperWidth = paperWidth === '57mm' ? '57mm' : '80mm';
    const browserPrintFallback = !hardwareLoading && (isPrinterAvailable === false || autoPrint);

    return (
        <div className="pos-shift-summary-print-shell fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-4 print:static print:inset-auto print:overflow-visible print:bg-white print:p-0">
            <article
                className="pos-shift-summary-print mx-auto w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 font-mono text-[11px] leading-tight text-slate-900 shadow-2xl print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
                data-paper-width={resolvedPaperWidth}
                style={{ '--pos-shift-summary-paper-width': resolvedPaperWidth }}
            >
                <header className="border-b border-dashed border-slate-300 pb-2 text-center">
                    {businessIcon ? (
                        <img src={resolveAssetUrl(businessIcon)} alt={`${businessName} icon`} className="mx-auto mb-1 h-auto w-16 object-contain" />
                    ) : null}
                    <p className="text-xs font-black uppercase">{businessName}</p>
                    <h2 className="mt-1 text-xs font-black uppercase">{title}</h2>
                    <p className="mt-1 text-[10px] text-slate-600">Business date: {shift.business_date || '-'}</p>
                    <p className="text-[10px] text-slate-600">Terminal: {shift.terminal_id || '-'}</p>
                    <p className="text-[10px] text-slate-600">Shift: {shift.pos_terminal_shift_id || '-'}</p>
                </header>

                <section className="space-y-1 border-b border-dashed border-slate-300 py-2">
                    <p className="font-black uppercase">Payment method breakdown</p>
                    {payments.length === 0 ? <Row name="No payments" value="0" /> : payments.map((entry) => (
                        <Row
                            key={`${entry.payment_type}-${entry.count}`}
                            name={`${paymentLabel(entry)} (${entry.count || 0})`}
                            value={`${currencyLabel(currency)}${money(entry.amount)}`}
                        />
                    ))}
                </section>

                <section className="space-y-1 border-b border-dashed border-slate-300 py-2">
                    <p className="font-black uppercase">Delivery provider breakdown</p>
                    {deliveryProviders.length === 0 ? <Row name="No delivery provider sales" value="0" /> : deliveryProviders.map((entry) => (
                        <Row
                            key={`${entry.provider_type}-${entry.provider_name || ''}`}
                            name={`${formatDeliveryProviderSummaryLabel(entry)} (${Number(entry.transaction_count || 0).toLocaleString('en-US')})`}
                            value={`${currencyLabel(currency)}${money(entry.amount)}`}
                        />
                    ))}
                </section>

                <section className="space-y-1 py-2">
                    <p className="font-black uppercase">Cash reconciliation</p>
                    <Row name="Opening/petty cash" value={`${currencyLabel(currency)}${money(cash.opening_float_amount)}`} />
                    <Row name="Cash sales" value={`${currencyLabel(currency)}${money(cash.cash_sales_amount)}`} />
                    <Row name="Cash in" value={`${currencyLabel(currency)}${money(cash.cash_in_total)}`} />
                    <Row name="Cash out" value={`${currencyLabel(currency)}${money(cash.cash_out_total)}`} />
                    <Row name="Expected cash in drawer" value={`${currencyLabel(currency)}${money(cash.expected_cash_amount)}`} />
                    <Row name="Closing cash" value={reconciliationMoney(cash.closing_cash_amount, currency, 'Not closed')} />
                    <Row name="Variance" value={reconciliationMoney(cash.cash_variance_amount, currency, 'Pending close')} strong />
                </section>

                <p className="border-t border-dashed border-slate-300 pt-2 text-center text-[10px] text-slate-500">
                    {autoPrint ? 'Keep with cashier close evidence.' : 'Current shift totals are read-only until the shift is closed.'}
                </p>
                {!hardwareLoading && isPrinterAvailable === false ? (
                    <p className="mt-2 border-t border-amber-200 pt-2 text-center text-[10px] text-amber-700 print:hidden">
                        No native POS printer detected. Browser print can use a Windows-installed printer.
                    </p>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-2 print:hidden">
                    <label className="col-span-2 flex min-w-0 items-center gap-2 text-xs font-extrabold text-slate-700">
                        <span className="shrink-0">Paper</span>
                        <select
                            aria-label="Shift summary paper width"
                            data-testid="pos-shift-summary-paper-width"
                            value={resolvedPaperWidth}
                            onChange={(event) => onPaperWidthChange(event.target.value)}
                            className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-[#0F172A] focus:border-[#1A4E8D] focus:outline-none focus:ring-2 focus:ring-[#1A4E8D]"
                        >
                            {PAPER_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <button type="button" className="h-9 w-full rounded-md border border-slate-300 px-3 text-xs font-bold" onClick={onClose}>Done</button>
                    <button
                        type="button"
                        disabled={hardwareLoading}
                        title={hardwareLoading
                            ? 'Checking printer availability.'
                            : browserPrintFallback
                                ? 'Opens the browser print dialog.'
                                : undefined}
                        className="h-9 w-full rounded-md bg-[#1A4E8D] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => {
                            if (browserPrintFallback && typeof window !== 'undefined' && typeof window.print === 'function') {
                                window.print();
                                return;
                            }
                            if (onPrint) onPrint();
                            else window.print();
                        }}
                    >
                        {hardwareLoading
                            ? 'Checking printer...'
                            : browserPrintFallback
                                ? 'Print in browser'
                                : autoPrint
                                    ? 'Print again'
                                    : 'Print summary'}
                    </button>
                </div>
            </article>
        </div>
    );
}
