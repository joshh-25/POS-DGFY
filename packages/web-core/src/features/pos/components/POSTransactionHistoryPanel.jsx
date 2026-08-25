import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, Globe, ListFilter, RefreshCcw, RotateCcw, Search, Store, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    getPaymentStatusClassName,
    getPaymentStatusLabel
} from '../utils/posHistoryStatus.js';
import {
    formatPosVoidTimestamp,
    isVoidedPosTransaction,
    resolvePosVoidActorLabel,
    resolvePosVoidReason
} from '../utils/posVoidAudit.js';
import { isPosTabletViewport } from '../utils/posTabletViewport.js';
import POSRefundWorkflowDialog from './POSRefundWorkflowDialog.jsx';

const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';

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

const baseSelectClassName = 'w-full min-w-0 max-w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-[13px] font-medium text-[#334155] shadow-sm shadow-slate-100 outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100';
const fieldLabelClassName = 'text-[13px] font-semibold text-[#334155]';

function SelectField({ label, value, onChange, children, className = '' }) {
    return (
        <label className={className ? `block min-w-0 ${className}` : 'block min-w-0'}>
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
        <div className="relative mt-2 min-w-0 max-w-full">
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
    historyCashierName,
    setHistoryCashierName,
    historyDateFrom,
    setHistoryDateFrom,
    historyDateTo,
    setHistoryDateTo,
    historyLoading,
    historyRows,
    historyDetailLoading,
    openHistoryDetail,
    canVoidTransactions = false,
    onVoidTransaction = async () => {},
    voidingTransactionId = null,
    refundWorkflowTransaction = null,
    refundWorkflowLoading = false,
    refundWorkflowSubmitting = false,
    hasActiveShift = false,
    onOpenRefundWorkflow = async () => {},
    onCloseRefundWorkflow = () => {},
    onSubmitRefundWorkflow = async () => {},
    loadHistory,
    historyPage,
    historyPagination,
    pendingSyncBlockedCount = 0,
    syncPendingTransactions = () => {},
    syncingPendingTransactions = false,
    syncDisabled = false,
    syncRemaining = 0,
    syncResetAt = '',
    universalPendingSyncCount = 0
}) {
    const [expandedRowId, setExpandedRowId] = useState(null);
    const [isTabletViewport, setIsTabletViewport] = useState(false);
    const [voidTarget, setVoidTarget] = useState(null);
    const [voidReason, setVoidReason] = useState('');
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
        setHistoryCashierName('');
        setHistoryDateFrom('');
        setHistoryDateTo('');
    };

    const closeVoidDialog = () => {
        if (voidingTransactionId !== null) return;
        setVoidTarget(null);
        setVoidReason('');
    };

    const submitVoid = async () => {
        if (!voidTarget || String(voidReason).trim().length < 3) return;
        try {
            await onVoidTransaction(voidTarget, String(voidReason).trim());
            setVoidTarget(null);
            setVoidReason('');
        } catch {
            // The action handler reports the server error and keeps this dialog open for correction.
        }
    };

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const sync = () => setIsTabletViewport(isPosTabletViewport({
            viewportWidth: window.innerWidth,
            isDgfyPosSurface: IS_DGFY_POS_SURFACE,
            windowObj: window
        }));
        sync();
        window.addEventListener('resize', sync);
        return () => window.removeEventListener('resize', sync);
    }, []);

    return (
        <section className="flex h-full min-h-0 min-w-0 max-w-full flex-col gap-4 overflow-x-hidden rounded-xl bg-white p-1 lg:p-0">
            {/* Whole panel (search/sync bar, filter grid, table, pagination) scrolls as one
                region so a tall stacked mobile filter grid can't clip the buttons/table beneath
                it — previously only the table had its own scroll area, so overflow above it
                (see Fix: History Catalog Mobile Filter Clipping) was cut off by the ancestor
                overflow-hidden containers in POSCheckoutTerminal.jsx instead of scrolling. */}
            <div className="dgfy-pos-scrollbar-hidden min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="flex flex-col gap-3 border-b border-slate-200 px-3 pb-4 pt-2 xl:flex-row xl:items-start xl:justify-between lg:px-4">
                    <div className="flex w-full flex-col gap-3 lg:flex-row xl:w-auto">
                        <IconInput icon={Search}>
                            <Input
                                value={historySearch}
                                onChange={(event) => setHistorySearch(event.target.value)}
                                placeholder="Search all transaction fields..."
                                className="h-11 rounded-xl border-slate-200 bg-white pl-12 pr-4 text-[13px] text-[#334155] shadow-sm shadow-slate-100 focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-100 lg:min-w-[24rem]"
                            />
                        </IconInput>
                    </div>
                    <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[18rem] xl:items-end">
                        <Button
                            type="button"
                            onClick={syncPendingTransactions}
                            disabled={syncDisabled || syncingPendingTransactions || universalPendingSyncCount <= 0}
                            className="h-11 rounded-xl bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            {syncingPendingTransactions ? 'Syncing...' : 'Sync All Pending Records'}
                        </Button>
                        <p className="text-right text-[12px] font-medium text-[#64748B]">
                            {universalPendingSyncCount > 0
                                ? `${universalPendingSyncCount} pending POS record${universalPendingSyncCount === 1 ? '' : 's'} waiting to sync`
                                : 'All pending POS records are synced'}
                            {pendingSyncBlockedCount > 0 ? ` • ${pendingSyncBlockedCount} need retry` : ''}
                            {syncRemaining <= 0 && syncResetAt
                                ? ` • Daily limit reached until ${new Date(syncResetAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                                : ` • ${syncRemaining} manual sync${syncRemaining === 1 ? '' : 's'} left today`}
                        </p>
                    </div>
                </div>

                <div className="min-w-0 max-w-full overflow-x-hidden px-3 lg:px-4">
                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {/* Tablet-only reorder (see Task: Reorder Filters - History Catalog, Tablet):
                            Date From, Cashier Name, Date To. Explicit order-* values below make the
                            current natural sequence explicit for every field so the Cashier/Date
                            From swap can't disturb anything else's position; only applied when
                            isTabletViewport, so mobile (max-sm:order-*) and desktop (unordered,
                            default flow) are untouched. */}
                        <SelectField label="Sales View" className={`max-sm:order-2 ${isTabletViewport ? 'order-1' : ''}`} value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}>
                            <option value="all">Paid Sales</option>
                            <option value="completed">Completed Sales</option>
                            <option value="pending_sync">Pending Sync</option>
                            <option value="voided">Voided</option>
                        </SelectField>

                        <SelectField label="Payments" className={`max-sm:order-1 ${isTabletViewport ? 'order-2' : ''}`} value={historyPaymentType} onChange={(event) => setHistoryPaymentType(event.target.value)}>
                            <option value="all">All Payments</option>
                            <option value="cash">Cash</option>
                            <option value="gcash">GCash</option>
                            <option value="maya">Maya</option>
                            <option value="card">Card</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="employee_credit">Employee Credit</option>
                        </SelectField>

                        <SelectField label="Order Methods" className={`max-sm:order-4 max-sm:col-span-1 ${isTabletViewport ? 'order-3' : ''}`} value={historyOrderMethod} onChange={(event) => setHistoryOrderMethod(event.target.value)}>
                            <option value="all">All Order Methods</option>
                            <option value="dine_in">Dine In</option>
                            <option value="takeout">Takeout</option>
                            <option value="pickup">Pickup</option>
                            <option value="delivery">Delivery</option>
                            <option value="appointment">Appointment</option>
                            <option value="walk_in">Walk-in</option>
                        </SelectField>

                        <SelectField label="Sources" className={`max-sm:order-3 max-sm:col-span-1 ${isTabletViewport ? 'order-4' : ''}`} value={historyOrderSource} onChange={(event) => setHistoryOrderSource(event.target.value)}>
                            <option value="all">All Sources</option>
                            <option value="in_store">In-Store</option>
                            <option value="online_store">Online Store</option>
                        </SelectField>

                        <label className={`block min-w-0 max-sm:col-span-1 max-sm:order-5 ${isTabletViewport ? 'order-7' : ''}`}>
                            <span className={fieldLabelClassName}>Cashier Name</span>
                            <IconInput icon={UserRound}>
                                <Input
                                    type="search"
                                    value={historyCashierName}
                                    onChange={(event) => setHistoryCashierName(event.target.value)}
                                    placeholder="Search cashier name..."
                                    className="h-11 rounded-xl border-slate-200 bg-white pl-12 pr-4 text-[13px] text-[#334155] shadow-sm shadow-slate-100 focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-100"
                                />
                            </IconInput>
                        </label>

                        <div className={`grid min-w-0 grid-cols-1 gap-3 sm:contents max-sm:col-span-1 max-sm:order-6`}>
                        <label className={isTabletViewport ? 'block min-w-0 order-5' : 'block min-w-0'}>
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

                        <label className={isTabletViewport ? 'block min-w-0 order-6' : 'block min-w-0'}>
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

                        <div className={`flex min-w-0 items-end gap-3 max-sm:col-span-1 max-sm:order-7 sm:col-span-2 xl:col-span-1 xl:col-start-4 ${isTabletViewport ? 'order-8' : ''}`}>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={resetFilters}
                                className="h-11 min-w-0 flex-1 rounded-xl border-slate-200 bg-white text-[13px] font-extrabold text-[#334155] hover:bg-slate-50"
                            >
                                <RotateCcw className="mr-2 h-5 w-5" />
                                Reset
                            </Button>
                            <Button
                                type="button"
                                onClick={() => loadHistory(1)}
                                className="h-11 min-w-0 flex-[1.15] rounded-xl bg-[#1A4E8D] text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73]"
                            >
                                <ListFilter className="mr-2 h-5 w-5" />
                                Apply Filters
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="w-full min-w-0 max-w-full overscroll-x-contain overflow-x-auto border-t border-slate-200" aria-busy={historyLoading}>
                    <table className={`dgfy-pos-history-table w-full text-[13px] ${isTabletViewport ? 'min-w-[980px]' : 'min-w-[1220px]'}`} aria-label="POS transaction history table">
                            <caption className="sr-only">POS transaction history with payment and transaction status plus separate receipt actions</caption>
                            <thead>
                                <tr className="border-b border-slate-200 bg-white text-[#0F172A]">
                                    <th scope="col" className="px-6 py-4 text-left text-[13px] font-black">Invoice</th>
                                    <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Datetime</th>
                                    <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Source</th>
                                    <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Payment</th>
                                    <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Status</th>
                                    {!isTabletViewport && <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Cashier</th>}
                                    {!isTabletViewport && <th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Discount</th>}
                                    {!isTabletViewport && <th scope="col" className="px-4 py-4 text-right text-[13px] font-black">VATable Sales</th>}
                                    {!isTabletViewport && <th scope="col" className="px-4 py-4 text-right text-[13px] font-black">VAT Amount (12%)</th>}
                                    <th scope="col" className="px-4 py-4 text-right text-[13px] font-black text-[#1A4E8D]">Total</th>
                                    <th scope="col" className={`${isTabletViewport ? 'w-[15rem] min-w-[15rem]' : 'w-[10rem] min-w-[10rem]'} px-3 py-4 text-center text-[13px] font-black`}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historyLoading ? (
                                    <tr>
                                        <td colSpan={isTabletViewport ? 7 : 11} className="px-6 py-10 text-center text-slate-500" aria-live="polite">
                                            Loading transactions...
                                        </td>
                                    </tr>
                                ) : historyRows.length > 0 ? historyRows.map((row) => {
                                    const dateTime = formatDateTime(row.created_at);
                                    const sourceKey = row.order_source === 'online_store' ? 'online_store' : 'in_store';
                                    const isOfflinePending = row.offline_sync_state === 'pending_sync';
                                    const isVoided = isVoidedPosTransaction(row);
                                    const canVoidRow = canVoidTransactions && !isOfflinePending && !isVoided;
                                    const paymentStatus = String(row.payment_status || '').trim().toLowerCase();
                                    const canRefundRow = canVoidTransactions
                                        && !isOfflinePending
                                        && isVoided
                                        && ['paid', 'refund_pending', 'partial_refunded'].includes(paymentStatus);
                                    const voidActorLabel = resolvePosVoidActorLabel(row);
                                    const voidReason = resolvePosVoidReason(row);
                                    const voidedAtLabel = formatPosVoidTimestamp(row.voided_at);
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
                                                <td className="px-4 py-4 text-[#334155]">
                                                    <div className="capitalize">{row.payment_type || '-'}</div>
                                                    <span
                                                        className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${getPaymentStatusClassName(row.payment_status)}`}
                                                        title={`Payment status: ${getPaymentStatusLabel(row.payment_status)}`}
                                                    >
                                                        {getPaymentStatusLabel(row.payment_status)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    {isVoided ? (
                                                        <div data-testid={`pos-void-status-${row.pos_transaction_id}`} className="min-w-[12rem]">
                                                            <span className="inline-flex rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700">
                                                                Voided
                                                            </span>
                                                            <div className="mt-2 space-y-0.5 text-[11px] leading-4 text-slate-600">
                                                                <p><span className="font-bold text-slate-700">By:</span> {voidActorLabel}</p>
                                                                <p><span className="font-bold text-slate-700">At:</span> {voidedAtLabel}</p>
                                                                <p className="max-w-[15rem] truncate" title={voidReason}>
                                                                    <span className="font-bold text-slate-700">Reason:</span> {voidReason}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                                            Completed
                                                        </span>
                                                    )}
                                                </td>
                                                {!isTabletViewport && <td className="px-4 py-4 text-[#334155]">{row.cashier?.username || row.acceptedByUser?.username || '-'}</td>}
                                                {!isTabletViewport && (
                                                    <td className="px-4 py-4 text-[#334155]">
                                                        {row.discount ? (
                                                            <div>
                                                                <div className="font-semibold">
                                                                    {row.discount.discount_type || row.discount_label_snapshot || 'Discount'}
                                                                    {row.discount.discount_rate != null ? ` (${money(row.discount.discount_rate)}%)` : ''}
                                                                </div>
                                                                <div className="text-[11px] text-rose-700">PHP {money(row.discount.discount_amount || row.discount_amount)}</div>
                                                                <div className="text-[11px] text-slate-500">
                                                                    Authorized by {row.discount.approvedBy?.username || `employee #${row.discount.manager_approval_id || 'unknown'}`}
                                                                </div>
                                                            </div>
                                                        ) : row.discount_label_snapshot
                                                            ? `${row.discount_label_snapshot}${row.discount_rate_snapshot != null ? ` (${money(row.discount_rate_snapshot)}%)` : ''}`
                                                            : '–'}
                                                    </td>
                                                )}
                                                {!isTabletViewport && <td className="px-4 py-4 text-right text-[#334155]">PHP {money(row.vatable_sales)}</td>}
                                                {!isTabletViewport && <td className="px-4 py-4 text-right text-[#334155]">PHP {money(row.vat_amount)}</td>}
                                                <td className="px-4 py-4 text-right font-black text-[#1A4E8D]">PHP {money(row.total_amount)}</td>
                                                <td className={`${isTabletViewport ? 'w-[15rem] min-w-[15rem]' : 'w-[10rem] min-w-[10rem]'} px-2 py-3 text-center`}>
                                                    <div className="flex flex-nowrap justify-center gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="flex h-12 w-[4.75rem] shrink-0 flex-col items-center justify-center gap-0.5 px-2 text-center text-[11px] font-extrabold leading-none"
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
                                                        {canVoidRow && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-12 shrink-0 whitespace-nowrap border-rose-200 px-3 text-[11px] font-extrabold text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setVoidTarget(row);
                                                                    setVoidReason('');
                                                                }}
                                                                disabled={voidingTransactionId !== null}
                                                                aria-label={`Void transaction ${row.invoice_number || row.pos_transaction_id}`}
                                                            >
                                                                Void
                                                            </Button>
                                                        )}
                                                        {canRefundRow && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-12 shrink-0 whitespace-nowrap border-amber-200 px-3 text-[11px] font-extrabold text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    onOpenRefundWorkflow(row);
                                                                }}
                                                                disabled={refundWorkflowLoading || refundWorkflowSubmitting}
                                                                aria-label={`Resolve refund for ${row.invoice_number || row.pos_transaction_id}`}
                                                            >
                                                                {paymentStatus === 'refund_pending' || paymentStatus === 'partial_refunded' ? 'Continue Refund' : 'Refund'}
                                                            </Button>
                                                        )}
                                                        {isTabletViewport && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="shrink-0 whitespace-nowrap px-3"
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
                                                    <td colSpan={7} className="px-6 py-4">
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
                                                                <span className="font-semibold text-[#0F172A]">VATable Sales</span>
                                                                <p className="mt-1">PHP {money(row.vatable_sales)}</p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">VAT Amount (12%)</span>
                                                                <p className="mt-1">PHP {money(row.vat_amount)}</p>
                                                            </div>
                                                            {isVoided ? (
                                                                <div className="col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                                                                    <p className="font-black uppercase tracking-wide">Voided transaction</p>
                                                                    <p className="mt-1">Reason: {voidReason}</p>
                                                                    <p>Voided by: {voidActorLabel}</p>
                                                                    <p>Voided at: {voidedAtLabel}</p>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={isTabletViewport ? 7 : 11} className="px-6 py-12 text-center text-slate-500">No transactions found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                </div>

                <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-4 text-[13px] text-[#334155] lg:flex-row lg:items-center lg:justify-between">
                        <p>
                            Showing {pageStart} to {pageEnd || 0} of {totalEntries || historyRows.length} entries
                        </p>
                        <div className="flex flex-wrap items-center justify-end gap-3 max-sm:flex-col max-sm:items-center">
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

                            <div className="flex items-center gap-3">
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
            </div>
            <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && closeVoidDialog()}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Void Transaction</DialogTitle>
                        <DialogDescription>
                            This records a void and reverses the transaction stock movements. Enter a reason to continue.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <label htmlFor="pos-void-reason" className="text-sm font-semibold text-slate-900">Void reason</label>
                        <Input
                            id="pos-void-reason"
                            value={voidReason}
                            onChange={(event) => setVoidReason(event.target.value)}
                            minLength={3}
                            maxLength={255}
                            placeholder="Required reason"
                            disabled={voidingTransactionId !== null}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeVoidDialog} disabled={voidingTransactionId !== null}>Cancel</Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={submitVoid}
                            disabled={String(voidReason).trim().length < 3 || voidingTransactionId !== null}
                        >
                            {voidingTransactionId !== null ? 'Voiding...' : 'Confirm Void'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {refundWorkflowTransaction ? (
                <POSRefundWorkflowDialog
                    key={refundWorkflowTransaction.pos_transaction_id}
                    transaction={refundWorkflowTransaction}
                    open
                    loading={refundWorkflowLoading}
                    submitting={refundWorkflowSubmitting}
                    hasActiveShift={hasActiveShift}
                    onOpenChange={(open) => !open && onCloseRefundWorkflow()}
                    onSubmit={onSubmitRefundWorkflow}
                />
            ) : null}
        </section>
    );
}
