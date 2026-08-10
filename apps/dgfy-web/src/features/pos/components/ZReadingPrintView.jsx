import React from 'react';

const money = (value) => Number(value || 0).toFixed(2);
const label = (value) => String(value || '').replace(/_/g, ' ') || '-';

const Row = ({ name, value, strong = false }) => (
    <div className={`flex items-start justify-between gap-3 ${strong ? 'border-t border-slate-300 pt-1 font-bold text-slate-950' : 'text-slate-700'}`}>
        <span>{name}</span>
        <span className="whitespace-nowrap text-right tabular-nums">{value}</span>
    </div>
);

export default function ZReadingPrintView({
    report,
    currency = 'PHP',
    onClose,
    onPrint,
    autoPrint = false,
    printState = 'idle'
}) {
    if (!report) return null;
    const summary = report.summary || {};
    const counters = report.counters || {};
    const payments = Array.isArray(summary.payment_breakdown) ? summary.payment_breakdown : [];
    const printFailed = printState === 'failed';

    return (
        <div className="pos-z-reading-print-shell fixed inset-0 z-[100] overflow-y-auto bg-slate-950/40 p-4 print:static print:inset-auto print:overflow-visible print:bg-white print:p-0">
            <article className="mx-auto w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 font-mono text-[11px] leading-tight text-slate-900 shadow-2xl print:max-w-[80mm] print:rounded-none print:border-0 print:p-0 print:shadow-none">
                <header className="border-b border-dashed border-slate-300 pb-2 text-center">
                    <p className="text-xs font-black uppercase">DGFY</p>
                    <h2 className="mt-1 text-xs font-black uppercase">Z-Reading / Close Day</h2>
                    <p className="mt-1 text-[10px] text-slate-600">Business date: {report.business_date || '-'}</p>
                    <p className="text-[10px] text-slate-600">Location: {report.location_id || '-'}</p>
                    <p className="text-[10px] text-slate-600">Reading: {report.reading_identifier || '-'}</p>
                </header>

                <section className="space-y-1 border-b border-dashed border-slate-300 py-2">
                    <Row name="Transactions" value={summary.transaction_count || 0} />
                    <Row name="Subtotal" value={`${currency} ${money(summary.subtotal_amount)}`} />
                    <Row name="Discounts" value={`${currency} ${money(summary.discount_amount)}`} />
                    <Row name="VAT" value={`${currency} ${money(summary.vat_amount)}`} />
                    <Row name="Total sales" value={`${currency} ${money(summary.total_amount)}`} strong />
                </section>

                <section className="space-y-1 border-b border-dashed border-slate-300 py-2">
                    <p className="font-black uppercase">Payment breakdown</p>
                    {payments.length === 0 ? <Row name="No payments" value="0" /> : payments.map((entry) => (
                        <Row
                            key={`${entry.payment_type}-${entry.count}`}
                            name={`${label(entry.payment_type)} (${entry.count || 0})`}
                            value={`${currency} ${money(entry.amount)}`}
                        />
                    ))}
                </section>

                <section className="space-y-1 py-2">
                    <p className="font-black uppercase">Fiscal counters</p>
                    <Row name="Z counter" value={counters.z_counter || 0} />
                    <Row name="Reset counter" value={counters.reset_counter || 0} />
                    <Row name="Lifetime total" value={`${currency} ${money(Number(counters.lifetime_grand_total_cents || 0) / 100)}`} strong />
                </section>

                {printFailed ? (
                    <p className="border-t border-rose-200 pt-2 text-center text-[10px] text-rose-700 print:hidden">
                        Physical printer failed. Use Print again or browser print to keep the Z-reading evidence.
                    </p>
                ) : null}
                <p className="border-t border-dashed border-slate-300 pt-2 text-center text-[10px] text-slate-500">
                    {autoPrint ? 'Keep with day-end close evidence.' : 'Branch total includes financially recognized sales from all cashiers.'}
                </p>
                <div className="mt-4 flex justify-end gap-2 print:hidden">
                    <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold" onClick={onClose}>Done</button>
                    <button
                        type="button"
                        className="rounded-md bg-[#1A4E8D] px-3 py-2 text-xs font-bold text-white"
                        onClick={() => (onPrint ? onPrint() : window.print())}
                    >
                        {printState === 'printing' ? 'Printing...' : autoPrint ? 'Print again' : 'Print Z-reading'}
                    </button>
                </div>
            </article>
        </div>
    );
}
