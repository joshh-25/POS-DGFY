import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Eye, History, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const getManilaDate = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const money = (value, currency) => `${currency} ${Number(value || 0).toFixed(2)}`;
const reconciliationMoney = (value, currency, pendingLabel) => (
    value == null ? pendingLabel : money(value, currency)
);

const paymentLabel = (entry) => String(
    entry?.payment_label || entry?.payment_type || 'Other'
).replace(/_/g, ' ');

const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : '-';
};

function SummaryMetric({ label, value, strong = false }) {
    return (
        <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className={`text-right tabular-nums ${strong ? 'font-black text-[#0F172A]' : 'font-bold text-slate-700'}`}>
                {value}
            </span>
        </div>
    );
}

export default function CashierHistoryPanel({
    state = { loading: false, records: [], pagination: null, errorMessage: '' },
    onRefresh = async () => {},
    onViewSummary = () => {},
    activeShift = null,
    locked = false,
    isOnline = true,
    currency = 'PHP'
}) {
    const [rangeMode, setRangeMode] = useState('today');
    const [page, setPage] = useState(1);
    const today = useMemo(() => getManilaDate(), []);
    const records = Array.isArray(state?.records) ? state.records : [];
    const pagination = state?.pagination || {};
    const totalPages = Math.max(1, Number(pagination.totalPages || 1));
    const activeShiftId = activeShift?.pos_terminal_shift_id || activeShift?.shift_id || null;
    const activeShiftBusinessDate = String(activeShift?.business_date || '').slice(0, 10);
    const activeShiftLocationId = activeShift?.location_id || activeShift?.location?.location_id || null;
    const activeShiftIsInRecords = Boolean(
        activeShiftId
        && records.some((record) => String(record?.shift?.pos_terminal_shift_id || record?.shift?.shift_id || '') === String(activeShiftId))
    );

    const buildFilters = useCallback((nextPage = page, nextRangeMode = rangeMode) => ({
        page: nextPage,
        limit: 10,
        ...(nextRangeMode === 'today' ? { date_from: today, date_to: today } : {})
    }), [page, rangeMode, today]);

    const refresh = useCallback((nextPage = page, nextRangeMode = rangeMode) => {
        setPage(nextPage);
        return onRefresh(buildFilters(nextPage, nextRangeMode));
    }, [buildFilters, onRefresh, page, rangeMode]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refresh(1, rangeMode);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [activeShiftBusinessDate, activeShiftId, activeShiftLocationId, rangeMode]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <History className="h-5 w-5 text-[#1A4E8D]" />
                        <h3 className="text-base font-black text-[#0F172A]">Cashier History</h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                        Your shift summaries only. Other cashiers’ records are not visible.
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg border-slate-300 px-3 text-xs font-extrabold"
                    onClick={() => void refresh(page, rangeMode)}
                    disabled={state?.loading || !isOnline}
                >
                    <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${state?.loading ? 'animate-spin' : ''}`} />
                    {state?.loading ? 'Refreshing...' : 'Refresh History'}
                </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                <Button
                    type="button"
                    variant={rangeMode === 'today' ? 'default' : 'outline'}
                    className="h-9 rounded-lg px-3 text-xs font-extrabold"
                    onClick={() => setRangeMode('today')}
                    aria-pressed={rangeMode === 'today'}
                >
                    <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                    Today
                </Button>
                <Button
                    type="button"
                    variant={rangeMode === 'all' ? 'default' : 'outline'}
                    className="h-9 rounded-lg px-3 text-xs font-extrabold"
                    onClick={() => setRangeMode('all')}
                    aria-pressed={rangeMode === 'all'}
                >
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    All records
                </Button>
                <span className="text-xs text-slate-500">
                    {state?.cashier?.cashier_name ? `Cashier: ${state.cashier.cashier_name}` : 'Current cashier'}
                </span>
            </div>

            {state?.errorMessage ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                    {state.errorMessage}
                </div>
            ) : null}

            {state?.loading && records.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600" role="status">
                    Loading your cashier summaries...
                </p>
            ) : records.length === 0 ? (
                activeShift && !activeShiftIsInRecords ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900" role="status">
                        <p className="font-bold">
                            Your active shift #{activeShiftId || '-'} is open, but it belongs to business date {activeShiftBusinessDate || '-'}.
                        </p>
                        <p className="mt-1 text-blue-800">
                            It is not included in the selected date period. Open All records to view this shift without changing its accounting date.
                        </p>
                        {rangeMode === 'today' ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="mt-3 h-9 rounded-lg border-blue-300 bg-white px-3 text-xs font-extrabold text-blue-900"
                                onClick={() => setRangeMode('all')}
                                disabled={locked || !isOnline}
                            >
                                View All records
                            </Button>
                        ) : null}
                    </div>
                ) : (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                        No cashier shift records found for this period.
                    </p>
                )
            ) : (
                <div className="space-y-3">
                    {records.map((record) => {
                        const shift = record?.shift || {};
                        const cash = record?.cash_summary || {};
                        const sales = record?.sales_summary || {};
                        const payments = Array.isArray(sales.payment_breakdown) ? sales.payment_breakdown : [];
                        const shiftId = shift.pos_terminal_shift_id || shift.shift_id;
                        return (
                            <article key={shiftId} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black text-[#0F172A]">
                                            {shift.business_date || '-'} · Shift #{shiftId || '-'}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {shift.terminal_id || 'No terminal'} · {shift.status || 'unknown'} · Opened {formatDateTime(shift.opened_at)}
                                        </p>
                                        {shift.closed_at ? (
                                            <p className="mt-1 text-xs text-slate-500">Closed {formatDateTime(shift.closed_at)}</p>
                                        ) : null}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs font-extrabold"
                                        onClick={() => onViewSummary(record)}
                                        disabled={locked}
                                    >
                                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                                        View Summary
                                    </Button>
                                </div>

                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
                                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Sales</p>
                                        <SummaryMetric label="Transactions" value={sales.transaction_count || 0} />
                                        <SummaryMetric label="Total sales (excluding opening cash)" value={money(sales.total_amount, currency)} strong />
                                        <SummaryMetric label="Discounts" value={money(sales.discount_amount, currency)} />
                                        <SummaryMetric label="Voids" value={`${sales.void_transaction_count || 0} · ${money(sales.void_amount, currency)}`} />
                                    </div>
                                    <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
                                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Cash reconciliation</p>
                                        <SummaryMetric label="Opening/petty cash" value={money(cash.opening_float_amount, currency)} />
                                        <SummaryMetric label="Cash sales" value={money(cash.cash_sales_amount, currency)} />
                                        <SummaryMetric label="Expected cash in drawer" value={money(cash.expected_cash_amount, currency)} />
                                        <SummaryMetric label="Variance" value={reconciliationMoney(cash.cash_variance_amount, currency, 'Pending close')} strong />
                                    </div>
                                </div>

                                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Payment methods</p>
                                    {payments.length === 0 ? (
                                        <p className="text-sm text-slate-500">No payment records.</p>
                                    ) : (
                                        <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                                            {payments.map((entry) => (
                                                <SummaryMetric
                                                    key={`${entry.payment_type}-${entry.count}`}
                                                    label={`${paymentLabel(entry)} (${entry.count || 0})`}
                                                    value={money(entry.amount, currency)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>
                    Showing {records.length} of {Number(pagination.total || records.length)} records
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-lg px-2 text-xs font-bold"
                        onClick={() => void refresh(Math.max(1, page - 1), rangeMode)}
                        disabled={state?.loading || page <= 1 || !isOnline}
                        aria-label="Previous cashier history page"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-20 text-center font-bold">Page {page} of {totalPages}</span>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-lg px-2 text-xs font-bold"
                        onClick={() => void refresh(Math.min(totalPages, page + 1), rangeMode)}
                        disabled={state?.loading || page >= totalPages || !isOnline}
                        aria-label="Next cashier history page"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
