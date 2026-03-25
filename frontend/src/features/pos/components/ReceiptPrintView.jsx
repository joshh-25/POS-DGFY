import React from 'react';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

export default function ReceiptPrintView({ transaction }) {
    if (!transaction) return null;

    const printedAt = new Date(transaction.created_at || Date.now()).toLocaleString();
    const lines = Array.isArray(transaction.lines) ? transaction.lines : [];

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 print:border-none print:rounded-none print:p-0">
            <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                <h3 className="font-semibold text-slate-900">Digital Receipt</h3>
                <p className="text-xs text-slate-500">{transaction.invoice_number}</p>
                <p className="text-xs text-slate-500">{printedAt}</p>
            </div>

            <div className="space-y-2 text-sm mb-4">
                {lines.map((line) => (
                    <div key={line.line_id} className="flex items-start justify-between gap-4">
                        <div>
                            <p className="font-medium text-slate-900">{line.item?.name || `Item #${line.item_id}`}</p>
                            <p className="text-xs text-slate-500">
                                {Number(line.quantity).toFixed(2)} {line.unit_of_measure || ''} x {money(line.sale_price)}
                            </p>
                        </div>
                        <p className="font-medium text-slate-900">{money(line.line_subtotal)}</p>
                    </div>
                ))}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3 text-sm space-y-1">
                <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>{money(transaction.subtotal_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>Vatable Sales</span>
                    <span>{money(transaction.vatable_sales)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>VAT Amount</span>
                    <span>{money(transaction.vat_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>VAT Exempt Sales</span>
                    <span>{money(transaction.vat_exempt_sales)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>Zero Rated Sales</span>
                    <span>{money(transaction.zero_rated_sales)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>Discount</span>
                    <span>{money(transaction.discount_amount)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold text-slate-900 pt-1">
                    <span>Total</span>
                    <span>{money(transaction.total_amount)}</span>
                </div>
            </div>
        </div>
    );
}

