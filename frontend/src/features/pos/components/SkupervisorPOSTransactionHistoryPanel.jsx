import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const money = (value) => Number(value || 0).toFixed(2);
const toDateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const formatDiscountDisplay = (value) => {
    const amount = Number(value || 0);
    return amount > 0 ? `PHP ${money(amount)}` : '-';
};
const ORDER_SOURCE_LABELS = {
    in_store: 'In-Store',
    online_store: 'Online Store'
};

export default function POSTransactionHistoryPanel({
    historySearch,
    setHistorySearch,
    historyStatus,
    setHistoryStatus,
    historyPaymentType,
    setHistoryPaymentType,
    historyOrderMethod,
    setHistoryOrderMethod,
    historyOrderSource,
    setHistoryOrderSource,
    historyCashierId,
    setHistoryCashierId,
    historyDateFrom,
    setHistoryDateFrom,
    historyDateTo,
    setHistoryDateTo,
    historyLoading,
    historyRows,
    historyDetailLoading,
    openHistoryDetail,
    printHistoryReceipt,
    loadHistory,
    historyPage,
    historyPagination
}) {
    return (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">POS Sales History</h2>
                    <p className="text-sm text-slate-600">Track invoice times, cashier accountability, and receipt totals.</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Input
                        value={historySearch}
                        onChange={(event) => setHistorySearch(event.target.value)}
                        placeholder="Search by invoice number..."
                        className="sm:max-w-xs"
                    />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
                <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm">
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="voided">Voided</option>
                </select>
                <select value={historyPaymentType} onChange={(event) => setHistoryPaymentType(event.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm">
                    <option value="all">All Payments</option>
                    <option value="cash">Cash</option>
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                </select>
                <select value={historyOrderMethod} onChange={(event) => setHistoryOrderMethod(event.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm">
                    <option value="all">All Order Methods</option>
                    <option value="dine_in">Dine In</option>
                    <option value="takeout">Takeout</option>
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Delivery</option>
                    <option value="appointment">Appointment</option>
                </select>
                <select value={historyOrderSource} onChange={(event) => setHistoryOrderSource(event.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm">
                    <option value="all">All Sources</option>
                    <option value="in_store">In-Store</option>
                    <option value="online_store">Online Store</option>
                </select>
                <Input type="number" min="1" value={historyCashierId} onChange={(event) => setHistoryCashierId(event.target.value)} placeholder="Cashier ID" />
                <Input type="date" value={historyDateFrom} max={historyDateTo || undefined} onChange={(event) => setHistoryDateFrom(event.target.value)} placeholder="Date from" />
                <Input type="date" value={historyDateTo} min={historyDateFrom || undefined} max={toDateInput(new Date())} onChange={(event) => setHistoryDateTo(event.target.value)} placeholder="Date to" />
            </div>
            <div className="overflow-auto" aria-busy={historyLoading}>
                <table className="w-full min-w-[760px] text-sm" aria-label="POS transaction history table">
                    <caption className="sr-only">POS transaction history with receipt and sales-report actions</caption>
                    <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                            <th scope="col" className="text-left py-2">Invoice</th>
                            <th scope="col" className="text-left py-2">Datetime</th>
                            <th scope="col" className="text-left py-2">Source</th>
                            <th scope="col" className="text-left py-2">Cashier</th>
                            <th scope="col" className="text-left py-2">Payment</th>
                            <th scope="col" className="text-left py-2">Discount</th>
                            <th scope="col" className="text-right py-2">Fee</th>
                            <th scope="col" className="text-right py-2">Restaurant Charge</th>
                            <th scope="col" className="text-right py-2">Vatable</th>
                            <th scope="col" className="text-right py-2">VAT</th>
                            <th scope="col" className="text-right py-2">Total</th>
                            <th scope="col" className="w-[5.75rem] py-2 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historyLoading ? (
                            <tr>
                                <td colSpan={12} className="py-4 text-center text-slate-500" aria-live="polite">Loading transactions...</td>
                            </tr>
                        ) : (
                            <>
                                {historyRows.map((row) => (
                                    <tr key={row.pos_transaction_id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2 font-medium text-slate-900">{row.invoice_number}</td>
                                        <td className="py-2 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                                        <td className="py-2 text-slate-600">
                                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.order_source === 'online_store' ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'}`}>
                                                {ORDER_SOURCE_LABELS[row.order_source] || ORDER_SOURCE_LABELS.in_store}
                                            </span>
                                        </td>
                                        <td className="py-2 text-slate-600">{row.cashier?.username || row.acceptedByUser?.username || '-'}</td>
                                        <td className="py-2 text-slate-600 capitalize">{row.payment_type}</td>
                                        <td className="py-2 text-slate-600">
                                            {formatDiscountDisplay(row.discount_amount)}
                                        </td>
                                        <td className="py-2 text-right text-slate-600">PHP {money(row.service_fee_amount)}</td>
                                        <td className="py-2 text-right text-slate-600">PHP {money(row.restaurant_service_charge_amount)}</td>
                                        <td className="py-2 text-right text-slate-600">PHP {money(row.vatable_sales)}</td>
                                        <td className="py-2 text-right text-slate-600">PHP {money(row.vat_amount)}</td>
                                        <td className="py-2 text-right font-semibold text-slate-900">PHP {money(row.total_amount)}</td>
                                        <td className="w-[5.75rem] py-2 text-center">
                                            <div className="flex justify-center gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="flex h-12 w-[4.75rem] flex-col items-center justify-center gap-0.5 px-2 text-center text-[11px] font-extrabold leading-none"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        if (typeof printHistoryReceipt === 'function') {
                                                            printHistoryReceipt(row.pos_transaction_id);
                                                        } else {
                                                            openHistoryDetail(row.pos_transaction_id);
                                                        }
                                                    }}
                                                    disabled={historyDetailLoading}
                                                    aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}
                                                >
                                                    <span>View</span>
                                                    <span>Receipt</span>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {historyRows.length === 0 && (
                                    <tr>
                                        <td colSpan={12} className="py-6 text-center text-slate-500">No transactions found.</td>
                                    </tr>
                                )}
                            </>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => loadHistory(Math.max(1, historyPage - 1))} disabled={historyLoading || historyPage <= 1}>
                    Previous
                </Button>
                <Button type="button" variant="outline" onClick={() => loadHistory(historyPage + 1)} disabled={historyLoading || !historyPagination || historyPage >= (historyPagination.totalPages || 1)}>
                    Next
                </Button>
            </div>
        </section>
    );
}
