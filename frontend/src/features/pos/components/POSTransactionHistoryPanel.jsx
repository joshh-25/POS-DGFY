import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, Globe, ListFilter, RefreshCcw, RotateCcw, Search, Store, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const money = (value) => Number(value || 0).toFixed(2);
const toDateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const ORDER_SOURCE_LABELS = {
    in_store: 'In-Store',
    online_store: 'Online Store'
};

const SOURCE_BADGE_CLASSNAMES = {
    in_store: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    online_store: 'border-sky-200 bg-sky-50 text-sky-700'
};

const formatDateTime = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return {
        date: parsed.toLocaleDateString(),
        time: parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    };
};

const baseSelectClassName = 'w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-[13px] font-medium text-[#334155] shadow-sm shadow-slate-100 outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100';
const fieldLabelClassName = 'text-[13px] font-semibold text-[#334155]';

function SelectField({ label, value, onChange, children }) {
    return (
        <label className="block">
            <span className={fieldLabelClassName}>{label}</span>
            <div className="relative mt-2">
                <select value={value} onChange={onChange} className={baseSelectClassName}>
                    {children}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
        </label>
    );
}

function IconInput({ icon: Icon, children, mobileIconAlign = 'left' }) {
    const iconPositionClassName = mobileIconAlign === 'right'
        ? 'right-4 sm:right-auto sm:left-4'
        : 'left-4';
    return (
        <div className="relative mt-2">
            <Icon className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 ${iconPositionClassName}`} />
            {children}
        </div>
    );
}

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
    loadHistory,
    historyPage,
    historyPagination,
    pendingSyncCount = 0,
    pendingSyncBlockedCount = 0,
    syncPendingTransactions = () => {},
    syncingPendingTransactions = false,
    syncDisabled = false
}) {
    const [expandedRowId, setExpandedRowId] = useState(null);
    const [isTabletViewport, setIsTabletViewport] = useState(false);
    const totalEntries = Number(historyPagination?.total || historyRows.length || 0);
    const pageSize = Number(historyPagination?.limit || historyRows.length || 10);
    const pageStart = totalEntries === 0 ? 0 : ((Math.max(1, historyPage) - 1) * pageSize) + 1;
    const pageEnd = Math.min(totalEntries || historyRows.length, pageStart + Math.max(0, historyRows.length - 1));
    const totalPages = Math.max(1, Number(historyPagination?.totalPages || 1));

    const resetFilters = () => {
        setHistorySearch('');
        setHistoryStatus('all');
        setHistoryPaymentType('all');
        setHistoryOrderMethod('all');
        setHistoryOrderSource('all');
        setHistoryCashierId('');
        setHistoryDateFrom('');
        setHistoryDateTo('');
        loadHistory(1);
    };

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const media = window.matchMedia('(min-width: 768px) and (max-width: 1279px)');
        const sync = (event) => setIsTabletViewport(Boolean(event.matches));
        sync(media);
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', sync);
            return () => media.removeEventListener('change', sync);
        }
        media.addListener(sync);
        return () => media.removeListener(sync);
    }, []);

    return (
        <section className="space-y-4 rounded-xl bg-white p-1 lg:p-0">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-3 pb-4 pt-2 xl:flex-row xl:items-start xl:justify-between lg:px-4">
                    <div className="flex w-full flex-col gap-3 lg:flex-row xl:w-auto">
                        <IconInput icon={Search}>
                            <Input
                                value={historySearch}
                                onChange={(event) => setHistorySearch(event.target.value)}
                                placeholder="Search by invoice number..."
                                className="h-11 rounded-xl border-slate-200 bg-white pl-12 pr-4 text-[13px] text-[#334155] shadow-sm shadow-slate-100 focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-100 lg:min-w-[24rem]"
                            />
                        </IconInput>
                    </div>
                    <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[18rem] xl:items-end">
                        <Button
                            type="button"
                            onClick={syncPendingTransactions}
                            disabled={syncDisabled || syncingPendingTransactions || pendingSyncCount <= 0}
                            className="h-11 rounded-xl bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            {syncingPendingTransactions ? 'Syncing...' : 'Sync Pending Transactions'}
                        </Button>
                        <p className="text-right text-[12px] font-medium text-[#64748B]">
                            {pendingSyncCount > 0
                                ? `${pendingSyncCount} offline transaction${pendingSyncCount === 1 ? '' : 's'} waiting to sync`
                                : 'All offline transactions are synced'}
                            {pendingSyncBlockedCount > 0 ? ` • ${pendingSyncBlockedCount} need retry` : ''}
                        </p>
                    </div>
                </div>

                <div className="px-3 lg:px-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <SelectField label="Status" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}>
                            <option value="all">All Status</option>
                            <option value="completed">Completed</option>
                            <option value="pending_sync">Pending Sync</option>
                            <option value="voided">Voided</option>
                        </SelectField>

                        <SelectField label="Payments" value={historyPaymentType} onChange={(event) => setHistoryPaymentType(event.target.value)}>
                            <option value="all">All Payments</option>
                            <option value="cash">Cash</option>
                            <option value="gcash">GCash</option>
                            <option value="maya">Maya</option>
                            <option value="card">Card</option>
                            <option value="bank_transfer">Bank Transfer</option>
                        </SelectField>

                        <SelectField label="Order Methods" value={historyOrderMethod} onChange={(event) => setHistoryOrderMethod(event.target.value)}>
                            <option value="all">All Order Methods</option>
                            <option value="dine_in">Dine In</option>
                            <option value="takeout">Takeout</option>
                            <option value="pickup">Pickup</option>
                            <option value="delivery">Delivery</option>
                            <option value="appointment">Appointment</option>
                        </SelectField>

                        <SelectField label="Sources" value={historyOrderSource} onChange={(event) => setHistoryOrderSource(event.target.value)}>
                            <option value="all">All Sources</option>
                            <option value="in_store">In-Store</option>
                            <option value="online_store">Online Store</option>
                        </SelectField>

                        <label className="block">
                            <span className={fieldLabelClassName}>Cashier ID</span>
                            <IconInput icon={UserRound}>
                                <Input
                                    type="number"
                                    min="1"
                                    value={historyCashierId}
                                    onChange={(event) => setHistoryCashierId(event.target.value)}
                                    placeholder="Search cashier ID..."
                                    className="h-11 rounded-xl border-slate-200 bg-white pl-12 pr-4 text-[13px] text-[#334155] shadow-sm shadow-slate-100 focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-100"
                                />
                            </IconInput>
                        </label>

                        <div className="grid grid-cols-2 gap-3 sm:contents">
                        <label className="block">
                            <span className={fieldLabelClassName}>Date From</span>
                            <IconInput icon={CalendarDays} mobileIconAlign="right">
                                <Input
                                    type="date"
                                    value={historyDateFrom}
                                    max={historyDateTo || undefined}
                                    onChange={(event) => setHistoryDateFrom(event.target.value)}
                                    placeholder="Date from"
                                    className="pos-report-date-input h-11 w-full rounded-xl border-slate-200 bg-white pl-4 pr-12 text-[13px] text-[#334155] shadow-sm shadow-slate-100 focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-100 sm:pl-12 sm:pr-4"
                                />
                            </IconInput>
                        </label>

                        <label className="block">
                            <span className={fieldLabelClassName}>Date To</span>
                            <IconInput icon={CalendarDays} mobileIconAlign="right">
                                <Input
                                    type="date"
                                    value={historyDateTo}
                                    min={historyDateFrom || undefined}
                                    max={toDateInput(new Date())}
                                    onChange={(event) => setHistoryDateTo(event.target.value)}
                                    placeholder="Date to"
                                    className="pos-report-date-input h-11 w-full rounded-xl border-slate-200 bg-white pl-4 pr-12 text-[13px] text-[#334155] shadow-sm shadow-slate-100 focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-100 sm:pl-12 sm:pr-4"
                                />
                            </IconInput>
                        </label>
                        </div>

                        <div className="flex items-end gap-3 sm:col-span-2 xl:col-span-1 xl:col-start-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={resetFilters}
                                className="h-11 flex-1 rounded-xl border-slate-200 bg-white text-[13px] font-extrabold text-[#334155] hover:bg-slate-50"
                            >
                                <RotateCcw className="mr-2 h-5 w-5" />
                                Reset
                            </Button>
                            <Button
                                type="button"
                                onClick={() => loadHistory(1)}
                                className="h-11 flex-[1.15] rounded-xl bg-[#1A4E8D] text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73]"
                            >
                                <ListFilter className="mr-2 h-5 w-5" />
                                Apply Filters
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="overflow-hidden border-t border-slate-200">
                    <div className="dgfy-pos-scrollbar-hidden overflow-x-auto" aria-busy={historyLoading}>
                        <table className={`w-full text-[13px] ${isTabletViewport ? 'min-w-[820px]' : 'min-w-[1220px]'}`} aria-label="POS transaction history table">
                            <caption className="sr-only">POS transaction history with receipt and sales report actions</caption>
                            <thead>
                                <tr className="border-b border-slate-200 bg-white text-[#0F172A]">
                                    <th scope="col" className="px-6 py-4 text-left text-[13px] font-black">Invoice</th>
                                    <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Datetime</th>
                                    <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Source</th>
                                    <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Payment</th>
                                    {!isTabletViewport && <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Cashier</th>}
                                    {!isTabletViewport && <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Discount</th>}
                                    {!isTabletViewport && <th scope="col" className="w-[1px] px-2 py-4 text-right text-[13px] font-black whitespace-nowrap">Fee</th>}
                                    {!isTabletViewport && <th scope="col" className="px-4 py-4 text-right text-[13px] font-black">Restaurant Charge</th>}
                                    {!isTabletViewport && <th scope="col" className="px-4 py-4 text-right text-[13px] font-black">Vatable</th>}
                                    {!isTabletViewport && <th scope="col" className="px-4 py-4 text-right text-[13px] font-black">VAT</th>}
                                    <th scope="col" className="px-4 py-4 text-right text-[13px] font-black text-[#1A4E8D]">Total</th>
                                    <th scope="col" className="w-[5.75rem] px-3 py-4 text-center text-[13px] font-black">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historyLoading ? (
                                    <tr>
                                        <td colSpan={isTabletViewport ? 6 : 12} className="px-6 py-10 text-center text-slate-500" aria-live="polite">
                                            Loading transactions...
                                        </td>
                                    </tr>
                                ) : historyRows.length > 0 ? historyRows.map((row) => {
                                    const dateTime = formatDateTime(row.created_at);
                                    const sourceKey = row.order_source === 'online_store' ? 'online_store' : 'in_store';
                                    const isOfflinePending = row.offline_sync_state === 'pending_sync';
                                    const expanded = expandedRowId === row.pos_transaction_id;
                                    return (
                                        <React.Fragment key={row.pos_transaction_id}>
                                            <tr className="border-b border-slate-100 text-slate-700 transition hover:bg-slate-50/70">
                                                <td className="px-6 py-4 text-[13px] font-black text-[#0F172A]">
                                                    <div>{row.invoice_number}</div>
                                                    {isOfflinePending && (
                                                        <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                                                            Pending Sync
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 text-[#334155]">
                                                    <div>{dateTime.date}</div>
                                                    <div className="mt-0.5">{dateTime.time}</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${SOURCE_BADGE_CLASSNAMES[sourceKey]}`}>
                                                        {sourceKey === 'online_store' ? <Globe className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                                                        {ORDER_SOURCE_LABELS[sourceKey]}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-[#334155] capitalize">{row.payment_type}</td>
                                                {!isTabletViewport && <td className="px-4 py-4 text-[#334155]">{row.cashier?.username || row.acceptedByUser?.username || '-'}</td>}
                                                {!isTabletViewport && (
                                                    <td className="px-4 py-4 text-[#334155]">
                                                        {row.discount_label_snapshot
                                                            ? `${row.discount_label_snapshot}${row.discount_rate_snapshot != null ? ` (${money(row.discount_rate_snapshot)}%)` : ''}`
                                                            : '–'}
                                                    </td>
                                                )}
                                                {!isTabletViewport && <td className="w-[1px] px-2 py-4 text-right text-[#334155] whitespace-nowrap">PHP {money(row.service_fee_amount)}</td>}
                                                {!isTabletViewport && <td className="px-4 py-4 text-right text-[#334155]">PHP {money(row.restaurant_service_charge_amount)}</td>}
                                                {!isTabletViewport && <td className="px-4 py-4 text-right text-[#334155]">PHP {money(row.vatable_sales)}</td>}
                                                {!isTabletViewport && <td className="px-4 py-4 text-right text-[#334155]">PHP {money(row.vat_amount)}</td>}
                                                <td className="px-4 py-4 text-right font-black text-[#1A4E8D]">PHP {money(row.total_amount)}</td>
                                                <td className="w-[5.75rem] px-2 py-3 text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="flex h-12 w-[4.75rem] flex-col items-center justify-center gap-0.5 px-2 text-center text-[11px] font-extrabold leading-none"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                openHistoryDetail(row);
                                                            }}
                                                            disabled={historyDetailLoading}
                                                            aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}
                                                        >
                                                            <>
                                                                <span>View</span>
                                                                <span>Receipt</span>
                                                            </>
                                                        </Button>
                                                        {isTabletViewport && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setExpandedRowId((current) => current === row.pos_transaction_id ? null : row.pos_transaction_id);
                                                                }}
                                                            >
                                                                Row
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {isTabletViewport && expanded && (
                                                <tr className="border-b border-slate-100 bg-slate-50/70">
                                                    <td colSpan={6} className="px-6 py-4">
                                                        <div className="grid grid-cols-2 gap-3 text-[12px] text-[#334155]">
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">Cashier</span>
                                                                <p className="mt-1">{row.cashier?.username || row.acceptedByUser?.username || '-'}</p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">Discount</span>
                                                                <p className="mt-1">
                                                                    {row.discount_label_snapshot
                                                                        ? `${row.discount_label_snapshot}${row.discount_rate_snapshot != null ? ` (${money(row.discount_rate_snapshot)}%)` : ''}`
                                                                        : '–'}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">Fee</span>
                                                                <p className="mt-1">PHP {money(row.service_fee_amount)}</p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">Restaurant Charge</span>
                                                                <p className="mt-1">PHP {money(row.restaurant_service_charge_amount)}</p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">Vatable</span>
                                                                <p className="mt-1">PHP {money(row.vatable_sales)}</p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">VAT</span>
                                                                <p className="mt-1">PHP {money(row.vat_amount)}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={isTabletViewport ? 6 : 12} className="px-6 py-12 text-center text-slate-500">No transactions found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-4 text-[13px] text-[#334155] lg:flex-row lg:items-center lg:justify-between">
                        <p>
                            Showing {pageStart} to {pageEnd || 0} of {totalEntries || historyRows.length} entries
                        </p>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <div className="flex items-center gap-2">
                                <span>Rows per page</span>
                                <div className="relative">
                                    <select
                                        value={pageSize}
                                        disabled
                                    className="h-10 appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-9 text-[13px] font-medium text-[#334155] shadow-sm shadow-slate-100"
                                    >
                                        <option value={pageSize}>{pageSize}</option>
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                </div>
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 w-10 rounded-xl border-slate-200 bg-white px-0 text-base font-bold text-slate-600 hover:bg-slate-50"
                                onClick={() => loadHistory(1)}
                                disabled={historyLoading || historyPage <= 1}
                            >
                                «
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 w-10 rounded-xl border-slate-200 bg-white px-0 text-base font-bold text-slate-600 hover:bg-slate-50"
                                onClick={() => loadHistory(Math.max(1, historyPage - 1))}
                                disabled={historyLoading || historyPage <= 1}
                            >
                                ‹
                            </Button>
                            <div className="grid h-10 min-w-[2.75rem] place-items-center rounded-xl bg-[#1A4E8D] px-4 text-[13px] font-bold text-white shadow-lg shadow-blue-900/20">
                                {historyPage}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 w-10 rounded-xl border-slate-200 bg-white px-0 text-base font-bold text-slate-600 hover:bg-slate-50"
                                onClick={() => loadHistory(Math.min(totalPages, historyPage + 1))}
                                disabled={historyLoading || historyPage >= totalPages}
                            >
                                ›
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 w-10 rounded-xl border-slate-200 bg-white px-0 text-base font-bold text-slate-600 hover:bg-slate-50"
                                onClick={() => loadHistory(totalPages)}
                                disabled={historyLoading || historyPage >= totalPages}
                            >
                                »
                            </Button>
                        </div>
                    </div>
                </div>
        </section>
    );
}
