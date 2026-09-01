import React, { useEffect } from 'react';
import resolveAssetUrl from '@/src/utils/assetUrl.js';

const money = (value) => Number(value || 0).toFixed(2);
const reconciliationMoney = (value, currency, pendingLabel) => (
    value == null ? pendingLabel : `${currency} ${money(value)}`
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
    currency = 'PHP',
    onClose,
    onPrint,
    autoPrint = false,
    title = 'Cashier Shift Sales Summary',
    businessSettings = {}
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

    return (
        <div className="pos-shift-summary-print-shell fixed inset-0 z-[100] overflow-y-auto bg-slate-950/40 p-4 print:static print:inset-auto print:overflow-visible print:bg-white print:p-0">
            <article className="mx-auto w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 font-mono text-[11px] leading-tight text-slate-900 shadow-2xl print:max-w-[80mm] print:rounded-none print:border-0 print:p-0 print:shadow-none">
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
                            value={`${currency} ${money(entry.amount)}`}
                        />
                    ))}
                </section>

                <section className="space-y-1 py-2">
                    <p className="font-black uppercase">Cash reconciliation</p>
                    <Row name="Opening/petty cash" value={`${currency} ${money(cash.opening_float_amount)}`} />
                    <Row name="Cash sales" value={`${currency} ${money(cash.cash_sales_amount)}`} />
                    <Row name="Cash in" value={`${currency} ${money(cash.cash_in_total)}`} />
                    <Row name="Cash out" value={`${currency} ${money(cash.cash_out_total)}`} />
                    <Row name="Expected cash in drawer" value={`${currency} ${money(cash.expected_cash_amount)}`} />
                    <Row name="Closing cash" value={reconciliationMoney(cash.closing_cash_amount, currency, 'Not closed')} />
                    <Row name="Variance" value={reconciliationMoney(cash.cash_variance_amount, currency, 'Pending close')} strong />
                </section>

                <p className="border-t border-dashed border-slate-300 pt-2 text-center text-[10px] text-slate-500">
                    {autoPrint ? 'Keep with cashier close evidence.' : 'Current shift totals are read-only until the shift is closed.'}
                </p>
                <div className="mt-4 flex justify-end gap-2 print:hidden">
                    <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold" onClick={onClose}>Done</button>
                    <button
                        type="button"
                        className="rounded-md bg-[#1A4E8D] px-3 py-2 text-xs font-bold text-white"
                        onClick={() => (onPrint ? onPrint() : window.print())}
                    >
                        {autoPrint ? 'Print again' : 'Print summary'}
                    </button>
                </div>
            </article>
        </div>
    );
}
