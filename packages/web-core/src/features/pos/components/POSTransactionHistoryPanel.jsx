import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Eye, Globe, ListFilter, RefreshCcw, RotateCcw, Search, Store, Undo2, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination } from '@/components/ui/pagination';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getPaymentStatusLabel } from '../utils/posHistoryStatus.js';
import {
    formatPosVoidTimestamp,
    isVoidedPosTransaction,
    resolvePosVoidActorLabel,
    resolvePosVoidReason
} from '../utils/posVoidAudit.js';
import { isPosTabletPortraitViewport, isPosTabletViewport } from '../utils/posTabletViewport.js';
import { POS_HISTORY_PAGE_SIZE_OPTIONS } from '../utils/posHistoryQuery.js';
import { ORDER_METHOD_LABELS, resolveAppliedVouchers } from './orderFulfillmentUi.js';
import POSRefundWorkflowDialog from './POSRefundWorkflowDialog.jsx';
import { formatPosTransactionPaymentMethods } from '../utils/posPaymentMethods.js';

const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';

const money = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ORDER_SOURCE_LABELS = {
    in_store: 'In-Store',
    online_store: 'Online Store'
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

const fieldLabelClassName = 'text-[13px] font-semibold text-[#334155]';
const POS_HISTORY_MOBILE_MAX_WIDTH_PX = 767;
const POS_HISTORY_OPTION_TWO_COLUMN_MIN = 7;
const POS_HISTORY_OPTION_TWO_COLUMN_MAX = 12;

const isPosHistoryMobileViewport = (windowObj = typeof window !== 'undefined' ? window : null) => (
    Boolean(windowObj)
    && (Number(windowObj.innerWidth) <= POS_HISTORY_MOBILE_MAX_WIDTH_PX
        || windowObj.matchMedia?.(`(max-width: ${POS_HISTORY_MOBILE_MAX_WIDTH_PX}px)`)?.matches === true)
);

const isPosHistoryLandscapeViewport = (windowObj = typeof window !== 'undefined' ? window : null) => (
    Boolean(windowObj)
    && (windowObj.matchMedia?.('(orientation: landscape)')?.matches === true
        || Number(windowObj.innerWidth) > Number(windowObj.innerHeight))
);

const isPosHistoryNarrowLandscapeMobileViewport = (windowObj = typeof window !== 'undefined' ? window : null) => (
    isPosHistoryLandscapeViewport(windowObj)
    && Number(windowObj?.innerWidth) <= 1024
    && Number(windowObj?.innerHeight) <= 500
);

// The responsive device preview can render the POS surface inside a scaled
// frame while the browser window itself remains desktop-sized. Use the
// rendered History panel bounds as a second signal so landscape filter and
// calendar dialogs still receive their mobile-landscape layout in that shell.
const isPosHistoryLandscapePanelViewport = (panelElement) => {
    const rect = panelElement?.getBoundingClientRect?.();
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    return Number.isFinite(width)
        && Number.isFinite(height)
        && width > 0
        && height > 0
        && width > height
        && width <= 1024
        && height <= 500;
};

const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CALENDAR_PRESETS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' }
];

const parseDateInput = (value) => {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1])
        && date.getMonth() === Number(match[2]) - 1
        && date.getDate() === Number(match[3])
        ? date
        : null;
};

const dateToInput = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

const getManilaDateInput = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const addCalendarDays = (date, days) => {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
};

const getMonthRange = (date, monthOffset = 0) => {
    const first = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return { from: dateToInput(first), to: dateToInput(last) };
};

const getDatePresetRange = (preset) => {
    const today = parseDateInput(getManilaDateInput()) || new Date();
    const todayInput = dateToInput(today);
    if (preset === 'today') return { from: todayInput, to: todayInput };
    if (preset === 'yesterday') {
        const yesterday = dateToInput(addCalendarDays(today, -1));
        return { from: yesterday, to: yesterday };
    }
    if (preset === 'last_7_days') return { from: dateToInput(addCalendarDays(today, -6)), to: todayInput };
    if (preset === 'this_month') return { from: dateToInput(new Date(today.getFullYear(), today.getMonth(), 1)), to: todayInput };
    if (preset === 'last_month') return getMonthRange(today, -1);
    return { from: '', to: '' };
};

const getCalendarDays = (monthDate) => {
    const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const calendarStart = new Date(
        firstOfMonth.getFullYear(),
        firstOfMonth.getMonth(),
        1 - firstOfMonth.getDay()
    );
    return Array.from({ length: 42 }, (_, index) => addCalendarDays(calendarStart, index));
};

const dateRangesEqual = (left, right) => left?.from === right?.from && left?.to === right?.to;

function CalendarRangePicker({ from = '', to = '', onChange, onPreset, mobile = false }) {
    const initialMonth = parseDateInput(from) || parseDateInput(to) || new Date();
    const [monthDate, setMonthDate] = useState(() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));
    const [customRangeActive, setCustomRangeActive] = useState(false);
    const calendarDays = getCalendarDays(monthDate);
    const fromDate = parseDateInput(from);
    const toDate = parseDateInput(to);
    const fromKey = dateToInput(fromDate);
    const toKey = dateToInput(toDate);
    const todayKey = getManilaDateInput();
    const hasCompleteRange = Boolean(fromKey && toKey);
    const hasMultiDayRange = hasCompleteRange && fromKey !== toKey;
    const activePreset = CALENDAR_PRESETS.find((preset) => dateRangesEqual(
        { from, to },
        getDatePresetRange(preset.value)
    ))?.value;
    const isCustomRange = customRangeActive || (Boolean(fromKey || toKey) && !activePreset);
    const rangeTrackClassName = mobile ? 'before:inset-y-2' : 'before:inset-y-1';

    const selectDate = (date) => {
        const selectedKey = dateToInput(date);
        setCustomRangeActive(true);
        if (date.getMonth() !== monthDate.getMonth() || date.getFullYear() !== monthDate.getFullYear()) {
            setMonthDate(new Date(date.getFullYear(), date.getMonth(), 1));
        }
        if (!fromKey || toKey) {
            onChange(selectedKey, '');
            return;
        }
        if (selectedKey < fromKey) onChange(selectedKey, fromKey);
        else onChange(fromKey, selectedKey);
    };

    const applyPreset = (preset) => {
        const range = getDatePresetRange(preset);
        setCustomRangeActive(false);
        onPreset?.(preset);
        onChange(range.from, range.to);
        const anchor = parseDateInput(range.from);
        if (anchor) setMonthDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    };

    const activateCustomRange = () => {
        setCustomRangeActive(true);
        onChange('', '');
    };

    return (
        <div className={`grid ${mobile ? 'gap-3' : 'gap-2'}`} data-testid="pos-history-calendar-picker">
            <div className={`grid grid-cols-2 ${mobile ? 'gap-2.5' : 'gap-1.5'}`} role="group" aria-label="Date presets">
                {CALENDAR_PRESETS.map((preset) => {
                    const selected = activePreset === preset.value;
                    return (
                        <button
                            key={preset.value}
                            type="button"
                            data-testid={`pos-history-calendar-preset-${preset.value}`}
                            aria-pressed={selected}
                            onClick={() => applyPreset(preset.value)}
                            className={`${mobile ? 'h-11 rounded-lg px-2 text-[11px]' : 'h-8 rounded-lg px-2 text-[11px]'} min-w-0 border font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected
                                ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                                : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'
                                }`}
                        >
                            {preset.label}
                        </button>
                    );
                })}
                <button
                    type="button"
                    data-testid="pos-history-calendar-preset-custom"
                    aria-pressed={isCustomRange}
                    onClick={activateCustomRange}
                    className={`inline-flex ${mobile ? 'h-11 rounded-lg px-2 text-[11px]' : 'h-8 rounded-lg px-2 text-[11px]'} min-w-0 items-center justify-center gap-1 border font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${isCustomRange
                        ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                        : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'
                        }`}
                >
                    Custom Range
                    <CalendarDays className={`${mobile ? 'h-5 w-5' : 'h-3.5 w-3.5'} shrink-0`} aria-hidden="true" />
                </button>
            </div>

            <div className={`${mobile ? 'rounded-xl border-0 bg-transparent px-0 py-1' : 'rounded-lg border border-slate-100 bg-slate-50/40 px-2 py-1.5'}`}>
                <div className={`flex items-center justify-between gap-2 ${mobile ? 'px-0' : 'px-1'}`}>
                    <button
                        type="button"
                        data-testid="pos-history-calendar-previous-month"
                        aria-label="Previous month"
                        onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                        className={`grid ${mobile ? 'h-10 w-10 rounded-xl' : 'h-7 w-7 rounded-lg'} place-items-center text-slate-500 transition hover:bg-white hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100`}
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <p className={`${mobile ? 'text-[15px]' : 'text-[12px]'} font-black text-[#0F172A]`}>
                        {monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                    <button
                        type="button"
                        data-testid="pos-history-calendar-next-month"
                        aria-label="Next month"
                        onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                        className={`grid ${mobile ? 'h-10 w-10 rounded-xl' : 'h-7 w-7 rounded-lg'} place-items-center text-slate-500 transition hover:bg-white hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100`}
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
                <div className={`${mobile ? 'mt-2' : 'mt-1'} grid grid-cols-7 text-center`} role="row" aria-label="Days of the week">
                    {CALENDAR_WEEKDAYS.map((weekday) => (
                        <span key={weekday} className={`${mobile ? 'py-1 text-[11px]' : 'py-0.5 text-[9px]'} font-bold text-slate-400`}>{weekday}</span>
                    ))}
                </div>
                <div className="grid grid-cols-7" role="grid" aria-label="Calendar dates">
                    {calendarDays.map((date) => {
                        const dateKey = dateToInput(date);
                        const isOutsideMonth = date.getMonth() !== monthDate.getMonth();
                        const isStart = dateKey === fromKey;
                        const isEnd = dateKey === toKey;
                        const isInRange = hasCompleteRange && dateKey > fromKey && dateKey < toKey;
                        const isSelected = isStart || isEnd;
                        const isRangeStart = hasMultiDayRange && isStart;
                        const isRangeEnd = hasMultiDayRange && isEnd;
                        const isRangeSegment = hasMultiDayRange && (isInRange || isRangeStart || isRangeEnd);
                        const rangeTrackStartClassName = isRangeStart ? 'before:left-1/2' : 'before:left-0';
                        const rangeTrackEndClassName = isRangeEnd ? 'before:right-1/2' : 'before:right-0';
                        return (
                            <button
                                key={dateKey}
                                type="button"
                                role="gridcell"
                                data-testid={`pos-history-calendar-day-${dateKey}`}
                                aria-label={date.toLocaleDateString('en-US', { dateStyle: 'full' })}
                                aria-pressed={isSelected || isInRange}
                                onClick={() => selectDate(date)}
                                 className={`relative z-0 flex ${mobile ? 'h-10 text-[13px]' : 'h-7 text-[11px]'} min-w-0 items-center justify-center rounded-full transition focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${isRangeSegment ? `before:absolute ${rangeTrackClassName} ${rangeTrackStartClassName} ${rangeTrackEndClassName} before:z-0 before:bg-[#C7DCF3]` : ''} ${isRangeStart ? 'before:rounded-l-full' : ''} ${isRangeEnd ? 'before:rounded-r-full' : ''} ${isOutsideMonth ? 'text-slate-300' : 'text-slate-700'} hover:bg-blue-50`}
                            >
                                <span className={`relative z-10 grid ${mobile ? 'h-8 w-8' : 'h-6 w-6'} place-items-center rounded-full ${isSelected
                                    ? 'bg-[#1A4E8D] font-black text-white shadow-sm'
                                    : dateKey === todayKey
                                        ? 'font-black text-[#1A4E8D] ring-1 ring-[#8AA8CD]'
                                        : 'font-semibold'
                                    }`}>
                                    {date.getDate()}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="sr-only" aria-hidden="false">
                <label htmlFor="pos-history-calendar-from">Date from</label>
                <input
                    id="pos-history-calendar-from"
                    data-testid="pos-history-calendar-from"
                    type="date"
                    value={from}
                    onChange={(event) => {
                        setCustomRangeActive(true);
                        onChange(event.target.value, to);
                    }}
                />
                <label htmlFor="pos-history-calendar-to">Date to</label>
                <input
                    id="pos-history-calendar-to"
                    data-testid="pos-history-calendar-to"
                    type="date"
                    value={to}
                    onChange={(event) => {
                        setCustomRangeActive(true);
                        onChange(from, event.target.value);
                    }}
                />
            </div>
        </div>
    );
}

const getPaymentStatusTextClassName = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'paid') return 'text-emerald-700';
    if (['failed', 'refund_pending', 'refunded'].includes(normalized)) return 'text-rose-700';
    if (['unpaid', 'payment_pending', 'partial_refunded'].includes(normalized)) return 'text-amber-700';
    return 'text-slate-600';
};

const FILTER_OPTIONS = {
    status: [
        { value: 'all', label: 'Paid Sales' },
        { value: 'completed', label: 'Completed Sales' },
        { value: 'pending_sync', label: 'Pending Sync' },
        { value: 'voided', label: 'Voided' }
    ],
    paymentType: [
        { value: 'all', label: 'All' },
        { value: 'cash', label: 'Cash' },
        { value: 'gcash', label: 'GCash' },
        { value: 'maya', label: 'Maya' },
        { value: 'card', label: 'Card' },
        { value: 'bank_transfer', label: 'Bank Transfer' },
        { value: 'employee_credit', label: 'Employee Credit' },
        { value: 'other', label: 'Other' }
    ],
    orderSource: [
        { value: 'all', label: 'All' },
        { value: 'in_store', label: 'In-Store' },
        { value: 'online_store', label: 'Online Store' }
    ]
};

const getOrderMethodFilterOptions = (posWorkflow) => {
    const allowedMethods = Array.isArray(posWorkflow?.allowedMethods)
        ? posWorkflow.allowedMethods
        : (Array.isArray(posWorkflow?.allowed_methods) ? posWorkflow.allowed_methods : []);
    const uniqueAllowedMethods = Array.from(new Set(
        allowedMethods
            .map((method) => String(method || '').trim())
            .filter(Boolean)
    ));

    return [
        { value: 'all', label: 'All' },
        ...uniqueAllowedMethods.map((method) => ({
            value: method,
            label: ORDER_METHOD_LABELS[method] || method.replace(/_/g, ' ')
        }))
    ];
};

const resolveAllowedOrderMethod = (value, options) => {
    const normalizedValue = String(value || 'all').trim();
    return options.some((option) => option.value === normalizedValue) ? normalizedValue : 'all';
};

const SOURCE_TABS = [
    { value: 'all', label: 'All Sources' },
    { value: 'in_store', label: 'In-Store' },
    { value: 'online_store', label: 'Online Store' }
];

const getFilterOptionLabel = (filterKey, value, options = FILTER_OPTIONS[filterKey] || []) => (
    options.find((option) => option.value === value)?.label || value
);

const getActiveFilterSummaries = ({
    historyStatus,
    historyPaymentType,
    historyOrderMethod,
    historyCashierName,
    historyDateFrom,
    historyDateTo,
    orderMethodOptions
}) => [
    historyStatus !== 'all' ? `Sales: ${getFilterOptionLabel('status', historyStatus)}` : null,
    historyPaymentType !== 'all' ? `Payment: ${getFilterOptionLabel('paymentType', historyPaymentType)}` : null,
    historyOrderMethod !== 'all' ? `Method: ${getFilterOptionLabel('orderMethod', historyOrderMethod, orderMethodOptions)}` : null,
    String(historyCashierName || '').trim() ? `Cashier: ${String(historyCashierName).trim()}` : null,
    historyDateFrom ? `From: ${historyDateFrom}` : null,
    historyDateTo ? `To: ${historyDateTo}` : null
].filter(Boolean);

function FilterChoiceGroup({ label, value, options, onChange, testId, compact = false, mobile = false }) {
    const optionGroupClassName = compact
        ? 'mt-1.5 grid min-w-0 max-w-full grid-cols-4 gap-2'
        : mobile
        ? 'dgfy-pos-history-horizontal-scroll mt-1 flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 touch-pan-x'
            : 'mt-2 flex min-w-0 max-w-full flex-wrap gap-2';
    const optionClassName = compact
        ? 'h-8 w-full min-w-0 px-2 py-1 text-[10px]'
        : mobile
            ? 'h-11 w-[6.5rem] min-w-[6.5rem] shrink-0 px-2 py-1 text-[11px]'
            : 'min-h-9 w-max min-w-0 shrink-0 px-3 py-1.5 text-[12px]';

    return (
        <fieldset className="min-w-0">
            <legend className={fieldLabelClassName}>{label}</legend>
            <div className={optionGroupClassName} role="group" aria-label={`${label} options`}>
                {options.map((option) => {
                    const selected = value === option.value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            data-testid={`${testId}-${option.value}`}
                            aria-pressed={selected}
                            onClick={() => onChange(option.value)}
                            className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg border text-center font-extrabold leading-none transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${optionClassName} ${selected
                                ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                                : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'
                                }`}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}

function IconInput({ icon: Icon, children, mobileIconAlign = 'left', className = '' }) {
    const iconPositionClassName = mobileIconAlign === 'right'
        ? 'right-4 sm:right-auto sm:left-4'
        : 'left-4';
    return (
        <div className={`relative min-w-0 max-w-full ${className || 'mt-2'}`}>
            <Icon className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 ${iconPositionClassName}`} />
            {children}
        </div>
    );
}

function MobileHistoryField({ label, children, className = '' }) {
    return (
        <div className={`min-w-0 ${className}`}>
            <p className="text-[10px] font-semibold leading-4 text-slate-500">{label}</p>
            <div className="mt-0.5 min-h-4 min-w-0 text-[11px] font-medium leading-4 text-[#334155]">{children}</div>
        </div>
    );
}

function MobileHistoryCard({
    row,
    dateTime,
    sourceKey,
    isOfflinePending,
    isVoided,
    canVoidRow,
    canRefundRow,
    expanded,
    itemVoucherCode,
    deliveryVoucherLabel,
    voidActorLabel,
    voidReason,
    voidedAtLabel,
    historyDetailLoading,
    voidingTransactionId,
    refundWorkflowLoading,
    refundWorkflowSubmitting,
    openHistoryDetail,
    setVoidTarget,
    setVoidReason,
    onOpenRefundWorkflow,
    onToggleExpanded
}) {
    const stopPropagation = (event) => event.stopPropagation();
    const toggleDetails = () => onToggleExpanded(row.pos_transaction_id);
    const handleKeyDown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleDetails();
    };
    const actionButtonClassName = 'pos-history-action-button pos-history-action-button--standard grid h-9 w-9 min-h-0 min-w-0 shrink-0 aspect-square place-items-center rounded-lg border border-slate-200 bg-white p-0 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200';
    const discountLabel = row.discount
        ? `${row.discount.discount_type || row.discount_label_snapshot || 'Discount'}${row.discount.discount_rate != null ? ` (${money(row.discount.discount_rate)}%)` : ''}`
        : row.discount_label_snapshot
            ? `${row.discount_label_snapshot}${row.discount_rate_snapshot != null ? ` (${money(row.discount_rate_snapshot)}%)` : ''}`
            : '–';

    return (
        <article
            data-testid={`pos-history-mobile-card-${row.pos_transaction_id}`}
            className="border-b border-slate-200 bg-white text-slate-700 transition-colors last:border-b-0"
            tabIndex={0}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} details for ${row.invoice_number || row.pos_transaction_id}`}
            onClick={toggleDetails}
            onKeyDown={handleKeyDown}
        >
            <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-black leading-4 text-[#0F172A]">{row.invoice_number}</p>
                    {isOfflinePending && (
                        <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-wide text-amber-700">Pending Sync</span>
                    )}
                    <div data-testid={`pos-history-mobile-date-time-${row.pos_transaction_id}`} className="mt-0.5 flex min-w-0 gap-1 text-[10px] leading-3 text-slate-500">
                        <span className="truncate">{dateTime.date}</span>
                        <span aria-hidden="true">•</span>
                        <span className="truncate">{dateTime.time}</span>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1" aria-label={`Actions for ${row.invoice_number || row.pos_transaction_id}`}>
                    <button
                        type="button"
                        className={`${actionButtonClassName} pos-history-view-action bg-slate-50 text-slate-600 hover:bg-slate-100`}
                        onClick={(event) => {
                            stopPropagation(event);
                            openHistoryDetail(row);
                        }}
                        disabled={historyDetailLoading}
                        aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}
                        title="View receipt"
                    >
                        <ClipboardList className="h-5 w-5" aria-hidden="true" />
                    </button>
                    {canVoidRow && (
                        <button
                            type="button"
                            className={`${actionButtonClassName} pos-history-void-action text-rose-700 hover:text-rose-800`}
                            onClick={(event) => {
                                stopPropagation(event);
                                setVoidTarget(row);
                                setVoidReason('');
                            }}
                            disabled={voidingTransactionId !== null}
                            aria-label={`Void transaction ${row.invoice_number || row.pos_transaction_id}`}
                            title="Void transaction"
                        >
                            <Ban className="h-4 w-4" aria-hidden="true" />
                        </button>
                    )}
                    {canRefundRow && (
                        <button
                            type="button"
                            className={`${actionButtonClassName} text-amber-800 hover:text-amber-900`}
                            onClick={(event) => {
                                stopPropagation(event);
                                onOpenRefundWorkflow(row);
                            }}
                            disabled={refundWorkflowLoading || refundWorkflowSubmitting}
                            aria-label={`Resolve refund for ${row.invoice_number || row.pos_transaction_id}`}
                            title="Resolve refund"
                        >
                            <Undo2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    )}
                    <button
                        type="button"
                        className={`${actionButtonClassName} text-slate-600`}
                        onClick={(event) => {
                            stopPropagation(event);
                            toggleDetails();
                        }}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Hide' : 'Show'} transaction details for ${row.invoice_number || row.pos_transaction_id}`}
                        title={`${expanded ? 'Hide' : 'Show'} transaction details`}
                    >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {expanded && (
                <div
                    data-testid={`pos-history-mobile-details-${row.pos_transaction_id}`}
                    className="grid grid-cols-3 gap-x-3 gap-y-2 border-t border-slate-100 bg-slate-50/70 px-3 py-3"
                >
                    <MobileHistoryField label="Source">
                        <span className={`inline-flex max-w-full items-center gap-1 text-[11px] font-semibold ${sourceKey === 'online_store' ? 'text-sky-700' : 'text-emerald-700'}`}>
                            {sourceKey === 'online_store' ? <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                            <span className="truncate">{ORDER_SOURCE_LABELS[sourceKey]}</span>
                        </span>
                    </MobileHistoryField>
                    <MobileHistoryField label="Payment">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span className="truncate">{formatPosTransactionPaymentMethods(row)}</span>
                            <span className={`font-black uppercase tracking-wide ${getPaymentStatusTextClassName(row.payment_status)}`}>{getPaymentStatusLabel(row.payment_status)}</span>
                        </div>
                    </MobileHistoryField>
                    <MobileHistoryField label="Cashier">
                        <span className="block truncate">{row.cashier?.username || row.acceptedByUser?.username || '-'}</span>
                    </MobileHistoryField>
                    <MobileHistoryField label="Discount">
                        <span className="block truncate">{discountLabel}</span>
                        {itemVoucherCode && <span className="block truncate text-[10px] font-semibold text-emerald-700">Voucher: {itemVoucherCode}</span>}
                        {deliveryVoucherLabel && <span className="block truncate text-[10px] font-semibold text-emerald-700">Delivery voucher: {deliveryVoucherLabel}</span>}
                    </MobileHistoryField>
                    <MobileHistoryField label="Fee">₱{money(row.service_fee_amount)}</MobileHistoryField>
                    <MobileHistoryField label="Rest. charge">₱{money(row.restaurant_service_charge_amount)}</MobileHistoryField>
                    <MobileHistoryField label="VAT">₱{money(row.vat_amount)}</MobileHistoryField>
                    <MobileHistoryField label="Vatable">₱{money(row.vatable_sales)}</MobileHistoryField>
                    <MobileHistoryField label="Total" className="rounded-lg bg-[#E8F1FB] px-2 py-1.5">
                        <span className="block text-[14px] font-black text-[#1A4E8D]">₱{money(row.total_amount)}</span>
                    </MobileHistoryField>
                    {isVoided && (
                        <div className="col-span-3 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] leading-4 text-rose-800">
                            <p className="font-black uppercase tracking-wide">Voided transaction</p>
                            <p>Reason: {voidReason}</p>
                            <p>Voided by: {voidActorLabel}</p>
                            <p>Voided at: {voidedAtLabel}</p>
                        </div>
                    )}
                </div>
            )}
        </article>
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
    historyPageSize,
    setHistoryPageSize,
    historyPagination,
    pendingSyncBlockedCount = 0,
    syncPendingTransactions = () => {},
    syncingPendingTransactions = false,
    syncDisabled = false,
    syncRemaining = 0,
    syncResetAt = '',
    universalPendingSyncCount = 0,
    sidebarCollapsed = false,
    posWorkflow = null,
    isMobileViewport: isMobileViewportProp = null
}) {
    const [expandedRowId, setExpandedRowId] = useState(null);
    const [isTabletViewport, setIsTabletViewport] = useState(() => (
        typeof window !== 'undefined' && isPosTabletViewport({
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            isDgfyPosSurface: IS_DGFY_POS_SURFACE,
            windowObj: window
        })
    ));
    const [isTabletPortraitViewport, setIsTabletPortraitViewport] = useState(() => (
        typeof window !== 'undefined' && isPosTabletPortraitViewport({
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            isDgfyPosSurface: IS_DGFY_POS_SURFACE,
            windowObj: window
        })
    ));
    const [detectedMobileViewport, setDetectedMobileViewport] = useState(() => (
        isPosHistoryMobileViewport()
    ));
    const [detectedLandscapeViewport, setDetectedLandscapeViewport] = useState(() => (
        isPosHistoryLandscapeViewport()
    ));
    const [detectedLandscapePanelViewport, setDetectedLandscapePanelViewport] = useState(false);
    const [filterDialogOpen, setFilterDialogOpen] = useState(false);
    const [filterDialogMode, setFilterDialogMode] = useState('filters');
    const [filterDraft, setFilterDraft] = useState(null);
    const [cashierPickerOpen, setCashierPickerOpen] = useState(false);
    const [filterDialogPosition, setFilterDialogPosition] = useState(null);
    const historyPanelRef = useRef(null);
    const filterButtonRef = useRef(null);
    const calendarButtonRef = useRef(null);
    const filterApplyPendingRef = useRef(false);
    const [voidTarget, setVoidTarget] = useState(null);
    const [voidReason, setVoidReason] = useState('');
    const totalEntries = Number(historyPagination?.total || historyRows.length || 0);
    const pageSize = Number(historyPageSize || historyPagination?.limit || historyRows.length || 10);
    const pageStart = totalEntries === 0 ? 0 : ((Math.max(1, historyPage) - 1) * pageSize) + 1;
    const pageEnd = Math.min(totalEntries || historyRows.length, pageStart + Math.max(0, historyRows.length - 1));
    const totalPages = Math.max(1, Number(historyPagination?.totalPages || historyPagination?.total_pages || 1));
    const orderMethodOptions = useMemo(
        () => getOrderMethodFilterOptions(posWorkflow),
        [posWorkflow]
    );
    const currentFilterValues = {
        historyStatus,
        historyPaymentType,
        historyOrderMethod,
        historyOrderSource,
        historyCashierName,
        historyDateFrom,
        historyDateTo
    };
    const activeFilterSummaries = getActiveFilterSummaries({ ...currentFilterValues, orderMethodOptions });
    const activeFilterCount = activeFilterSummaries.length;
    const hasActiveDateFilter = Boolean(historyDateFrom || historyDateTo);
    const isMobileViewport = Boolean(isMobileViewportProp) || detectedMobileViewport || isTabletPortraitViewport;
    const isLandscapeMobileViewport = (isMobileViewport && detectedLandscapeViewport)
        || isPosHistoryNarrowLandscapeMobileViewport()
        || detectedLandscapePanelViewport;
    // Tablet portrait inherits the phone's complete card/detail interaction so
    // the narrow portrait surface stays readable. Tablet landscape and desktop
    // keep the full financial table. Tablet portrait uses the desktop dialog
    // shell for Filter and Calendar, centered within the viewport.
    const isCompactHistoryViewport = isMobileViewport;
    const isDesktopHistoryViewport = !isMobileViewport;
    const historyVisibleColumnCount = isMobileViewport ? 3 : 12;
    const isTabletPortraitDialog = isTabletPortraitViewport;
    const isMobileDialog = isMobileViewport && !isTabletPortraitDialog;
    const isDesktopDialog = !isMobileDialog;
    const isDesktopFilterDialog = filterDialogMode === 'filters' && isDesktopDialog;
    const cashierOptions = Array.from(new Set([
        ...historyRows.flatMap((row) => [row?.cashier?.username, row?.acceptedByUser?.username]),
        historyCashierName
    ].map((value) => String(value ?? '').trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
    const cashierSearchValue = String(filterDraft?.historyCashierName ?? historyCashierName ?? '').trim();
    const visibleCashierOptions = cashierOptions.filter((cashier) => (
        !cashierSearchValue || cashier.toLowerCase().includes(cashierSearchValue.toLowerCase())
    ));
    // Count the rendered list, including the always-present "All Cashiers" row,
    // so the layout thresholds match what the operator actually sees.
    const cashierListOptionCount = visibleCashierOptions.length + 1;
    const cashierListUsesTwoColumns = cashierListOptionCount >= POS_HISTORY_OPTION_TWO_COLUMN_MIN
        && cashierListOptionCount <= POS_HISTORY_OPTION_TWO_COLUMN_MAX;
    const cashierListIsScrollable = cashierListOptionCount > POS_HISTORY_OPTION_TWO_COLUMN_MAX;
    const pendingSyncLabel = universalPendingSyncCount > 0
        ? `Sync ${universalPendingSyncCount} pending POS record${universalPendingSyncCount === 1 ? '' : 's'}`
        : 'Sync pending POS records';
    const historyActionColumnClassName = isMobileViewport
        ? 'pos-history-action-column min-w-0 w-[28%]'
        : 'pos-history-action-column min-w-0';
    const historyActionButtonClassName = isMobileViewport
        ? 'h-10 w-10'
        : 'h-9 w-9';
    const historyActionSizeClassName = isMobileViewport
        ? 'pos-history-action-button--large'
        : 'pos-history-action-button--standard';
    const historyActionSquareClassName = `${historyActionButtonClassName} pos-history-action-button ${historyActionSizeClassName} min-h-0 min-w-0 aspect-square`;

    useEffect(() => {
        const selectedOrderMethod = resolveAllowedOrderMethod(historyOrderMethod, orderMethodOptions);
        if (selectedOrderMethod === String(historyOrderMethod || 'all').trim()) {
            return;
        }

        filterApplyPendingRef.current = true;
        setHistoryOrderMethod('all');
        setFilterDraft((current) => current ? { ...current, historyOrderMethod: 'all' } : current);
    }, [historyOrderMethod, orderMethodOptions, setHistoryOrderMethod]);

    const updateFilterDialogPosition = useCallback((mode = filterDialogMode, anchorElement = null) => {
        const trigger = anchorElement || (mode === 'calendar' ? calendarButtonRef.current : filterButtonRef.current);
        if (!trigger || typeof window === 'undefined') return;

        const viewportPadding = 16;
        const panelRect = historyPanelRef.current?.getBoundingClientRect?.();
        const hasUsablePanelBounds = panelRect && panelRect.width > 0;
        const panelLeft = hasUsablePanelBounds
            ? Math.max(viewportPadding, panelRect.left + viewportPadding)
            : viewportPadding;
        const panelRight = hasUsablePanelBounds
            ? Math.min(window.innerWidth - viewportPadding, panelRect.right - viewportPadding)
            : window.innerWidth - viewportPadding;
        // Keep Filter and Calendar on the same compact desktop/tablet column.
        // Calendar is the reference width: 464 CSS px (about 580 px at 125% display scaling).
        const dialogMaxWidth = 464;
        const panelWidth = Math.min(dialogMaxWidth, Math.max(0, panelRight - panelLeft));
        const buttonRect = trigger.getBoundingClientRect();
        const dialogRight = Math.min(panelRight, buttonRect.right);
        const left = Math.min(
            Math.max(panelLeft, dialogRight - panelWidth),
            Math.max(panelLeft, panelRight - panelWidth)
        );
        const minDialogHeight = mode === 'calendar' ? 480 : 280;
        const top = Math.max(
            viewportPadding,
            Math.min(
                buttonRect.bottom + 12,
                window.innerHeight - viewportPadding - minDialogHeight
            )
        );

        setFilterDialogPosition({
            left,
            top,
            width: panelWidth,
            maxHeight: Math.min(768, Math.max(240, window.innerHeight - top - viewportPadding))
        });
    }, [filterDialogMode]);

    const openFilterDialog = () => {
        setFilterDraft({
            ...currentFilterValues,
            historyOrderMethod: resolveAllowedOrderMethod(historyOrderMethod, orderMethodOptions)
        });
        setFilterDialogMode('filters');
        setCashierPickerOpen(false);
        updateFilterDialogPosition('filters', filterButtonRef.current);
        setFilterDialogOpen(true);
    };

    const openCalendarDialog = () => {
        setFilterDraft({ ...currentFilterValues });
        setFilterDialogMode('calendar');
        setCashierPickerOpen(false);
        updateFilterDialogPosition('calendar', calendarButtonRef.current);
        setFilterDialogOpen(true);
    };

    const closeFilterDialog = () => {
        setFilterDialogOpen(false);
        setFilterDialogMode('filters');
        setFilterDraft(null);
        setCashierPickerOpen(false);
        setFilterDialogPosition(null);
    };

    const updateFilterDraft = (field, value) => {
        setFilterDraft((current) => ({
            ...(current || currentFilterValues),
            [field]: value
        }));
    };

    const resetDraftFilters = () => {
        setFilterDraft((current) => ({
            ...(current || currentFilterValues),
            historyStatus: 'all',
            historyPaymentType: 'all',
            historyOrderMethod: 'all',
            historyOrderSource: 'all',
            historyCashierName: '',
            historyDateFrom: '',
            historyDateTo: ''
        }));
    };

    const resetDraftDates = () => {
        setFilterDraft((current) => ({
            ...(current || currentFilterValues),
            historyDateFrom: '',
            historyDateTo: ''
        }));
    };

    const applyDraftFilters = () => {
        const draftValues = filterDraft || currentFilterValues;
        const draftDateFrom = draftValues.historyDateFrom || '';
        const draftDateTo = draftValues.historyDateTo || '';
        const next = {
            ...draftValues,
            historyDateTo: filterDialogMode === 'calendar' && draftDateFrom && !draftDateTo
                ? draftDateFrom
                : draftDateTo,
            historyOrderMethod: resolveAllowedOrderMethod(
                draftValues.historyOrderMethod ?? historyOrderMethod,
                orderMethodOptions
            )
        };
        filterApplyPendingRef.current = true;
        setHistoryStatus(next.historyStatus);
        setHistoryPaymentType(next.historyPaymentType);
        setHistoryOrderMethod(next.historyOrderMethod);
        setHistoryOrderSource(next.historyOrderSource);
        setHistoryCashierName(next.historyCashierName);
        setHistoryDateFrom(next.historyDateFrom);
        setHistoryDateTo(next.historyDateTo);
        closeFilterDialog();
    };

    const selectSourceTab = (value) => {
        if (value === historyOrderSource) return;
        filterApplyPendingRef.current = true;
        setHistoryOrderSource(value);
    };

    useEffect(() => {
        if (!filterApplyPendingRef.current) return;
        filterApplyPendingRef.current = false;
        loadHistory(1);
    }, [
        historyCashierName,
        historyDateFrom,
        historyDateTo,
        historyOrderMethod,
        historyOrderSource,
        historyPaymentType,
        historyStatus,
        loadHistory
    ]);

    useEffect(() => {
        if (!filterDialogOpen || !isDesktopDialog || typeof window === 'undefined') return undefined;

        const reposition = () => updateFilterDialogPosition(filterDialogMode);
        reposition();
        window.addEventListener('resize', reposition);
        const resizeObserver = typeof ResizeObserver !== 'undefined' && historyPanelRef.current
            ? new ResizeObserver(reposition)
            : null;
        resizeObserver?.observe(historyPanelRef.current);
        return () => {
            window.removeEventListener('resize', reposition);
            resizeObserver?.disconnect();
        };
    }, [filterDialogOpen, filterDialogMode, isDesktopDialog, sidebarCollapsed, updateFilterDialogPosition]);

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
            viewportHeight: window.innerHeight,
            isDgfyPosSurface: IS_DGFY_POS_SURFACE,
            windowObj: window
        }));
        const syncPortrait = () => setIsTabletPortraitViewport(isPosTabletPortraitViewport({
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            isDgfyPosSurface: IS_DGFY_POS_SURFACE,
            windowObj: window
        }));
        sync();
        syncPortrait();
        window.addEventListener('resize', sync);
        window.addEventListener('resize', syncPortrait);
        window.addEventListener('orientationchange', syncPortrait);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('resize', syncPortrait);
            window.removeEventListener('orientationchange', syncPortrait);
        };
    }, []);

    useEffect(() => {
        if (isMobileViewportProp != null || typeof window === 'undefined') return undefined;
        const sync = () => setDetectedMobileViewport(isPosHistoryMobileViewport(window));
        sync();
        window.addEventListener('resize', sync);
        return () => window.removeEventListener('resize', sync);
    }, [isMobileViewportProp]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const sync = () => setDetectedLandscapeViewport(isPosHistoryLandscapeViewport(window));
        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('orientationchange', sync);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('orientationchange', sync);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const sync = () => {
            setDetectedLandscapePanelViewport(isPosHistoryLandscapePanelViewport(historyPanelRef.current));
        };

        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('orientationchange', sync);
        window.visualViewport?.addEventListener('resize', sync);
        const resizeObserver = typeof ResizeObserver !== 'undefined' && historyPanelRef.current
            ? new ResizeObserver(sync)
            : null;
        resizeObserver?.observe(historyPanelRef.current);

        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('orientationchange', sync);
            window.visualViewport?.removeEventListener('resize', sync);
            resizeObserver?.disconnect();
        };
    }, []);

    return (
        <section ref={historyPanelRef} data-pos-history-panel="true" className="dgfy-pos-history-panel flex h-full min-h-0 min-w-0 max-w-full flex-col gap-0 overflow-x-hidden rounded-xl bg-white p-1 lg:p-0">
            {/* History controls and transaction rows scroll in the flexible middle region;
                pagination stays in the fixed panel footer below it.
                A tall stacked mobile filter grid can therefore scroll with the content
                instead of clipping the buttons/table beneath it — previously only the table
                had its own scroll area, so overflow above it
                (see Fix: History Catalog Mobile Filter Clipping) was cut off by the ancestor
                overflow-hidden containers in POSCheckoutTerminal.jsx instead of scrolling. */}
            <div data-testid="pos-history-scroll-region" className="dgfy-pos-scrollbar-hidden min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div data-testid="pos-history-toolbar" className={`${isMobileViewport ? 'flex flex-nowrap gap-2' : 'flex flex-wrap gap-2 lg:gap-3'} ${isMobileViewport ? 'flex-row w-full px-0' : ''} items-center pb-4 pt-2 lg:px-4`}>
                    <IconInput icon={Search} className={`mt-0 min-w-0 flex-1 ${isMobileViewport ? 'basis-0' : 'basis-[18rem]'}`}>
                            <Input
                                value={historySearch}
                                onChange={(event) => setHistorySearch(event.target.value)}
                                placeholder="Search all transaction fields..."
                                className={`${isMobileViewport ? 'h-10 pl-10 pr-3 text-[11px]' : 'h-11 pl-12 pr-4 text-[13px]'} pos-history-toolbar-control rounded-xl border-slate-200 bg-white text-[#334155] shadow-sm shadow-slate-100 focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-100`}
                            />
                    </IconInput>
                    <div className="flex shrink-0 items-center gap-2">
                            <Button
                                type="button"
                                data-testid="pos-history-filter-button"
                                ref={filterButtonRef}
                            onClick={openFilterDialog}
                            aria-expanded={filterDialogOpen}
                            aria-controls="pos-history-filter-dialog"
                            variant="outline"
                            className={`${isMobileViewport ? 'relative h-10 w-10 min-w-0 px-0' : 'h-11 min-w-[6.25rem] px-4'} pos-history-toolbar-control shrink-0 rounded-xl border-[#1A4E8D] bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73] hover:text-white`}
                        >
                            <ListFilter className={`${isMobileViewport ? '' : 'mr-2'} h-4 w-4`} aria-hidden="true" />
                            {isMobileViewport ? <span className="sr-only">Filter</span> : 'Filter'}
                            {activeFilterCount > 0 && (
                                <span className={`${isMobileViewport ? 'absolute -right-1 -top-1' : 'ml-2'} grid min-w-5 place-items-center rounded-full bg-white px-1.5 py-0.5 text-[10px] leading-none text-[#1A4E8D]`}>
                                    {activeFilterCount}
                                </span>
                            )}
                        </Button>
                        <Button
                            type="button"
                            data-testid="pos-history-calendar-button"
                            ref={calendarButtonRef}
                            onClick={openCalendarDialog}
                            aria-expanded={filterDialogOpen && filterDialogMode === 'calendar'}
                            aria-controls="pos-history-calendar-dialog"
                            variant="outline"
                            className={`${isMobileViewport ? 'h-10 w-10 min-w-0 px-0' : 'h-11 min-w-[6.25rem] px-4'} pos-history-toolbar-control shrink-0 rounded-xl border-[#1A4E8D] text-[13px] font-extrabold text-[#1A4E8D] hover:bg-blue-50 ${hasActiveDateFilter ? 'bg-blue-50' : 'bg-white'}`}
                        >
                            <CalendarDays className={`${isMobileViewport ? '' : 'mr-2'} h-4 w-4`} aria-hidden="true" />
                            {isMobileViewport ? <span className="sr-only">Calendar</span> : 'Calendar'}
                        </Button>
                        <Button
                            type="button"
                            data-testid="pos-history-sync-button"
                            onClick={syncPendingTransactions}
                            disabled={syncDisabled || syncingPendingTransactions || universalPendingSyncCount <= 0}
                            size="icon"
                            aria-label={pendingSyncLabel}
                            title={pendingSyncLabel}
                            className={`${isMobileViewport ? 'h-10 w-10' : 'h-11 w-11'} pos-history-toolbar-control shrink-0 rounded-xl bg-[#1A4E8D] p-0 text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                            <RefreshCcw className={`h-4 w-4 ${syncingPendingTransactions ? 'animate-spin' : ''}`} aria-hidden="true" />
                        </Button>
                    </div>
                    <p className="sr-only" aria-live="polite">
                            {universalPendingSyncCount > 0
                                ? `${universalPendingSyncCount} pending POS record${universalPendingSyncCount === 1 ? '' : 's'} waiting to sync`
                                : 'All pending POS records are synced'}
                            {pendingSyncBlockedCount > 0 ? ` • ${pendingSyncBlockedCount} need retry` : ''}
                            {syncRemaining <= 0 && syncResetAt
                                ? ` • Daily limit reached until ${new Date(syncResetAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                                : ` • ${syncRemaining} manual sync${syncRemaining === 1 ? '' : 's'} left today`}
                    </p>
                </div>

                <div className={`dgfy-pos-scrollbar-hidden flex min-w-0 max-w-full ${isMobileViewport ? 'mb-0 overflow-x-hidden px-3' : 'mb-2 overflow-x-auto px-3 lg:px-4'}`} role="tablist" aria-label="Transaction sources">
                    {SOURCE_TABS.map((sourceTab) => {
                        const selected = historyOrderSource === sourceTab.value;
                        return (
                            <button
                                key={sourceTab.value}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                data-testid={`pos-history-source-tab-${sourceTab.value}`}
                                onClick={() => selectSourceTab(sourceTab.value)}
                                className={`relative ${isMobileViewport ? 'min-w-0 px-2 py-2 text-[11px]' : 'min-w-[8rem] px-4 py-3 text-[12px]'} flex-1 whitespace-nowrap font-extrabold transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected
                                    ? `text-[#1A4E8D] after:absolute ${isMobileViewport ? 'after:bottom-1' : 'after:bottom-0'} after:h-0.5 after:rounded-full after:bg-[#1A4E8D] ${isMobileViewport ? 'after:inset-x-0' : 'after:inset-x-4'}`
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-[#1A4E8D]'
                                    }`}
                            >
                                {sourceTab.label}
                            </button>
                        );
                    })}
                </div>

                {activeFilterSummaries.length > 0 && (
                    <div className={`${isMobileViewport ? 'dgfy-pos-history-horizontal-scroll flex-nowrap overflow-x-auto overscroll-x-contain touch-pan-x' : 'flex-wrap'} flex items-center gap-2 px-3 py-3 lg:px-4`} aria-label="Applied history filters">
                        <span className={`${isMobileViewport ? 'sr-only' : 'mr-1'} text-[12px] font-black uppercase tracking-wide text-slate-500`}>Applied</span>
                        {activeFilterSummaries.map((summary) => (
                            <span key={summary} className="inline-flex h-7 max-w-full shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0 text-[11px] font-bold leading-none text-emerald-800">
                                {summary}
                            </span>
                        ))}
                    </div>
                )}

                <Dialog
                    open={filterDialogOpen}
                    onOpenChange={(open) => !open && closeFilterDialog()}
                    overlayClassName={isMobileDialog || isTabletPortraitDialog ? 'bg-slate-950/60 backdrop-blur-sm' : 'bg-transparent backdrop-blur-none'}
                >
                    <DialogContent
                        id={filterDialogMode === 'calendar' ? 'pos-history-calendar-dialog' : 'pos-history-filter-dialog'}
                        className={`flex ${filterDialogMode === 'calendar' ? 'max-h-[min(90vh,40rem)] dgfy-pos-history-calendar-dialog max-w-none rounded-xl' : 'max-h-[min(90vh,48rem)]'} ${isMobileDialog
                            ? 'dgfy-pos-history-mobile-sheet max-w-none rounded-t-2xl'
                            : filterDialogMode === 'calendar'
                                ? ''
                                : isDesktopFilterDialog
                                    ? 'dgfy-pos-history-filter-dialog w-auto max-w-none rounded-xl'
                                : 'max-w-2xl'} ${isTabletPortraitDialog ? 'dgfy-pos-history-tablet-portrait-dialog' : ''} ${isLandscapeMobileViewport ? 'dgfy-pos-history-mobile-landscape-dialog' : ''} flex-col overflow-hidden border border-slate-300 p-0 shadow-[0_12px_30px_rgba(15,23,42,0.2)]`}
                        style={isDesktopDialog && !isTabletPortraitDialog && filterDialogPosition
                            ? {
                                position: 'fixed',
                                left: `${filterDialogPosition.left}px`,
                                top: `${filterDialogPosition.top}px`,
                                width: `${filterDialogPosition.width}px`,
                                maxWidth: `${filterDialogPosition.width}px`,
                                maxHeight: `${filterDialogPosition.maxHeight}px`,
                                boxSizing: 'border-box'
                            }
                            : undefined}
                    >
                        <DialogHeader className={`shrink-0 flex-row items-start justify-between gap-4 border-b border-slate-200 ${isMobileDialog ? 'px-4 py-3' : filterDialogMode === 'calendar' ? 'px-4 py-2.5' : isDesktopDialog ? 'px-4 py-3' : 'px-5 py-4 sm:px-6 sm:py-5'} dgfy-pos-history-dialog-header`}>
                            <div>
                                <DialogTitle className="text-xl font-black text-[#0F172A] dgfy-pos-history-dialog-title">{filterDialogMode === 'calendar' ? 'Select Date' : 'Filter'}</DialogTitle>
                                <DialogDescription className="mt-0.5 text-[12px] text-slate-500">
                                    {filterDialogMode === 'calendar'
                                        ? 'Choose a date range for the transaction history.'
                                        : isMobileDialog ? 'Refine your Transaction History' : 'Select the transaction history you want to review.'}
                                </DialogDescription>
                            </div>
                            {filterDialogMode === 'calendar' ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    data-testid="pos-history-reset-dates"
                                    onClick={resetDraftDates}
                                    aria-label="Reset history dates"
                                    title="Reset dates"
                                    className={`${isMobileDialog ? 'h-11 w-11 rounded-lg' : 'h-9 w-9 rounded-lg'} shrink-0 bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15 hover:bg-[#143F73] hover:text-white`}
                                >
                                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={closeFilterDialog}
                                    aria-label="Close history filters"
                                    className={`${isMobileDialog ? 'h-11 w-11 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50' : 'h-9 w-9'} shrink-0 text-slate-500 hover:text-slate-800`}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            )}
                        </DialogHeader>

                        <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${isMobileDialog ? 'px-4 py-3' : filterDialogMode === 'calendar' ? 'px-4 py-2' : isDesktopFilterDialog ? 'px-4 py-2.5' : 'px-5 py-5 sm:px-6'} dgfy-pos-history-dialog-body`}>
                            {filterDialogMode === 'calendar' ? (
                                <CalendarRangePicker
                                    from={filterDraft?.historyDateFrom ?? historyDateFrom}
                                    to={filterDraft?.historyDateTo ?? historyDateTo}
                                    mobile={isMobileDialog}
                                    onChange={(from, to) => setFilterDraft((current) => ({
                                        ...(current || currentFilterValues),
                                        historyDateFrom: from,
                                        historyDateTo: to
                                    }))}
                                />
                            ) : (
                                <div className={`grid min-w-0 ${isDesktopFilterDialog ? 'gap-4' : isMobileDialog ? 'gap-3' : 'gap-5'}`}>
                                    <FilterChoiceGroup
                                        label="Sales View"
                                        value={filterDraft?.historyStatus || historyStatus}
                                        options={FILTER_OPTIONS.status}
                                        onChange={(value) => updateFilterDraft('historyStatus', value)}
                                        testId="pos-history-filter-status"
                                        compact={isDesktopFilterDialog}
                                        mobile={isMobileViewport}
                                    />
                                    <FilterChoiceGroup
                                        label="Payment Method"
                                        value={filterDraft?.historyPaymentType || historyPaymentType}
                                        options={FILTER_OPTIONS.paymentType}
                                        onChange={(value) => updateFilterDraft('historyPaymentType', value)}
                                        testId="pos-history-filter-payment"
                                        compact={isDesktopFilterDialog}
                                        mobile={isMobileViewport}
                                    />
                                    <FilterChoiceGroup
                                        label="Order Method"
                                        value={filterDraft?.historyOrderMethod || historyOrderMethod}
                                        options={orderMethodOptions}
                                        onChange={(value) => updateFilterDraft('historyOrderMethod', value)}
                                        testId="pos-history-filter-order-method"
                                        compact={isDesktopFilterDialog}
                                        mobile={isMobileViewport}
                                    />

                                    <div className="block min-w-0">
                                        <span className={fieldLabelClassName}>Cashier</span>
                                            <div className={`${isMobileDialog ? 'relative mt-1.5' : 'relative mt-2'}`}>
                                            <IconInput icon={UserRound} className="mt-0">
                                            <Input
                                                id="pos-history-cashier-search"
                                                type="search"
                                                value={filterDraft?.historyCashierName ?? historyCashierName}
                                                onFocus={() => setCashierPickerOpen(true)}
                                                onChange={(event) => {
                                                    setCashierPickerOpen(true);
                                                    updateFilterDraft('historyCashierName', event.target.value);
                                                }}
                                                placeholder="Search Cashier"
                                                aria-label="Search Cashier"
                                                className={`${isDesktopFilterDialog ? 'h-10' : 'h-11'} rounded-xl border-slate-200 bg-white pl-12 pr-12 text-[13px] text-[#334155] shadow-sm shadow-slate-100 focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-100`}
                                            />
                                            </IconInput>
                                            <button
                                                type="button"
                                                data-testid="pos-history-cashier-dropdown-toggle"
                                                onClick={() => setCashierPickerOpen((open) => !open)}
                                                aria-expanded={cashierPickerOpen}
                                                aria-controls="pos-history-cashier-options"
                                                aria-label={`${cashierPickerOpen ? 'Collapse' : 'Expand'} cashier options`}
                                                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#1A4E8D] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                                            >
                                                <ChevronDown className={`h-4 w-4 transition-transform ${cashierPickerOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                                            </button>
                                        </div>
                                        {cashierPickerOpen && (
                                        <div className="mt-5 min-w-0" data-testid="pos-history-cashier-picker">
                                            <h3 className={fieldLabelClassName}>Select Cashier</h3>
                                            <div
                                                id="pos-history-cashier-options"
                                                className={`dgfy-pos-scrollbar-hidden mt-2 grid w-full min-w-0 gap-1 ${cashierListUsesTwoColumns ? 'grid-cols-2' : 'grid-cols-1'} ${cashierListIsScrollable ? 'max-h-52 overflow-y-auto overscroll-contain touch-pan-y pr-1' : ''}`}
                                                role="radiogroup"
                                                aria-label="Cashier options"
                                                data-testid="pos-history-cashier-options"
                                            >
                                                <label className={`flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 text-[#334155] hover:bg-blue-50 ${isDesktopFilterDialog ? 'py-1 text-[11px]' : 'py-1.5 text-[12px]'}`}>
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        <input
                                                            type="radio"
                                                            name="pos-history-cashier"
                                                            value=""
                                                            checked={!cashierSearchValue}
                                                            onChange={() => {
                                                                updateFilterDraft('historyCashierName', '');
                                                                setCashierPickerOpen(false);
                                                            }}
                                                            className="sr-only"
                                                            data-testid="pos-history-cashier-option-all"
                                                        />
                                                        <span className={`${isDesktopFilterDialog ? 'h-5 w-5' : 'h-6 w-6'} grid shrink-0 place-items-center rounded-full bg-white text-[#1A4E8D]`}>
                                                            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                                                        </span>
                                                        <span className="truncate font-semibold">All Cashiers</span>
                                                    </span>
                                                    <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${!cashierSearchValue ? 'border-[#1A4E8D] bg-[#1A4E8D] shadow-[inset_0_0_0_3px_white]' : 'border-[#1A4E8D] bg-white'}`} aria-hidden="true" />
                                                </label>
                                                {visibleCashierOptions.map((cashier) => {
                                                    const selected = cashierSearchValue === cashier;
                                                    const initials = cashier.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
                                                    return (
                                                        <label key={cashier} className={`flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 text-[#334155] hover:bg-blue-50 ${isDesktopFilterDialog ? 'py-1 text-[11px]' : 'py-1.5 text-[12px]'}`}>
                                                            <span className="flex min-w-0 items-center gap-2">
                                                                <input
                                                                    type="radio"
                                                                    name="pos-history-cashier"
                                                                    value={cashier}
                                                                    checked={selected}
                                                                    onChange={() => {
                                                                        updateFilterDraft('historyCashierName', cashier);
                                                                        setCashierPickerOpen(false);
                                                                    }}
                                                                    className="sr-only"
                                                                    data-testid={`pos-history-cashier-option-${cashier.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                                                                />
                                                                <span className={`${isDesktopFilterDialog ? 'h-5 w-5' : 'h-6 w-6'} grid shrink-0 place-items-center rounded-full bg-[#1683F4] text-[10px] font-black text-white`}>
                                                                    {initials}
                                                                </span>
                                                                <span className="truncate font-semibold">{cashier}</span>
                                                            </span>
                                                            <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${selected ? 'border-[#1A4E8D] bg-[#1A4E8D] shadow-[inset_0_0_0_3px_white]' : 'border-[#1A4E8D] bg-white'}`} aria-hidden="true" />
                                                        </label>
                                                    );
                                                })}
                                                {cashierSearchValue && visibleCashierOptions.length === 0 && (
                                                    <p className="px-2 py-2 text-[12px] text-slate-500">No matching cashiers.</p>
                                                )}
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <DialogFooter className={`shrink-0 flex-row justify-between ${isMobileDialog ? 'gap-3 px-4 py-3' : filterDialogMode === 'calendar' ? 'gap-2 px-4 py-2' : isDesktopFilterDialog ? 'gap-2 px-4 py-2.5' : 'gap-3 px-5 py-4 sm:px-6 sm:py-4'} border-t border-slate-200 dgfy-pos-history-dialog-footer`}>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={filterDialogMode === 'calendar' ? closeFilterDialog : resetDraftFilters}
                                data-testid={filterDialogMode === 'calendar' ? 'pos-history-cancel-dates' : 'pos-history-reset-filters'}
                                className={`${isMobileDialog ? 'h-12' : filterDialogMode === 'calendar' ? 'h-9' : isDesktopFilterDialog ? 'h-10' : 'h-11'} min-w-0 flex-1 rounded-xl border-rose-300 bg-rose-50/40 text-[13px] font-extrabold text-rose-700 shadow-sm shadow-rose-100/70 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800`}
                            >
                                {filterDialogMode === 'calendar' ? 'Cancel' : <><RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />Reset All</>}
                            </Button>
                            <Button
                                type="button"
                                onClick={applyDraftFilters}
                                data-testid={filterDialogMode === 'calendar' ? 'pos-history-apply-dates' : 'pos-history-apply-filters'}
                                className={`${isMobileDialog ? 'h-12' : filterDialogMode === 'calendar' ? 'h-9' : isDesktopFilterDialog ? 'h-10' : 'h-11'} min-w-0 flex-1 rounded-xl bg-[#1A4E8D] text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73]`}
                            >
                                {filterDialogMode === 'calendar'
                                    ? <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
                                    : <ListFilter className="mr-2 h-4 w-4" aria-hidden="true" />}
                                Apply Filters
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <div className={`w-full min-w-0 max-w-full overscroll-x-contain ${isTabletViewport && !isMobileViewport ? 'overflow-x-auto' : 'overflow-x-hidden'} border-t border-slate-200`} aria-busy={historyLoading}>
                    {isMobileViewport ? (
                        <div data-testid="pos-history-mobile-list" className="divide-y divide-slate-200 bg-white">
                            {historyLoading ? (
                                <div className="px-4 py-10 text-center text-[12px] text-slate-500" aria-live="polite">
                                    Loading transactions...
                                </div>
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
                                const appliedVouchers = resolveAppliedVouchers(row);
                                const itemVoucherCode = appliedVouchers.find((voucher) => voucher.benefit_target !== 'delivery')?.code || null;
                                const deliveryVoucherLabel = row.delivery_fee_waiver_label_snapshot
                                    || appliedVouchers.find((voucher) => voucher.benefit_target === 'delivery')?.code
                                    || null;

                                return (
                                    <MobileHistoryCard
                                        key={row.pos_transaction_id}
                                        row={row}
                                        dateTime={dateTime}
                                        sourceKey={sourceKey}
                                        isOfflinePending={isOfflinePending}
                                        isVoided={isVoided}
                                        canVoidRow={canVoidRow}
                                        canRefundRow={canRefundRow}
                                        expanded={expanded}
                                        itemVoucherCode={itemVoucherCode}
                                        deliveryVoucherLabel={deliveryVoucherLabel}
                                        voidActorLabel={voidActorLabel}
                                        voidReason={voidReason}
                                        voidedAtLabel={voidedAtLabel}
                                        historyDetailLoading={historyDetailLoading}
                                        voidingTransactionId={voidingTransactionId}
                                        refundWorkflowLoading={refundWorkflowLoading}
                                        refundWorkflowSubmitting={refundWorkflowSubmitting}
                                        openHistoryDetail={openHistoryDetail}
                                        setVoidTarget={setVoidTarget}
                                        setVoidReason={setVoidReason}
                                        onOpenRefundWorkflow={onOpenRefundWorkflow}
                                        onToggleExpanded={(transactionId) => setExpandedRowId((current) => current === transactionId ? null : transactionId)}
                                    />
                                );
                            }) : (
                                <div className="px-4 py-12 text-center text-[12px] text-slate-500">No transactions found.</div>
                            )}
                        </div>
                    ) : (
                    <table className={`dgfy-pos-history-table w-full whitespace-nowrap ${isMobileViewport ? 'text-[12px] min-w-0 table-fixed dgfy-pos-history-table--mobile' : isTabletViewport ? 'text-[12px] min-w-[1180px] table-fixed dgfy-pos-history-table--tablet dgfy-pos-history-table--tablet-landscape' : 'text-[13px] min-w-0 table-fixed dgfy-pos-history-table--single-view'}`} aria-label="POS transaction history table">
                            <caption className="sr-only">POS transaction history with payment and transaction status; mobile rows open details and actions</caption>
                            <colgroup>
                                {isMobileViewport ? (
                                    <>
                                        <col className="w-[34%]" />
                                        <col className="w-[36%]" />
                                        <col className="w-[30%]" />
                                    </>
                                ) : (
                                    <>
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                        <col className="w-[8.3333%]" />
                                    </>
                                )}
                            </colgroup>
                            <thead>
                                <tr className="border-b border-slate-200 bg-white text-[#0F172A] whitespace-nowrap">
                                    <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Invoice</th>
                                    <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Date &amp; Time</th>
                                    <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Source</th>
                                    {!isMobileViewport && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Payment</th>}
                                    {isDesktopHistoryViewport && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Cashier</th>}
                                    {isDesktopHistoryViewport && <th scope="col" className="dgfy-pos-history-header-cell w-[8rem] min-w-[8rem] max-w-[8rem] px-2 py-4 text-left text-[13px] font-black">Discount</th>}
                                    {isDesktopHistoryViewport && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Fee</th>}
                                    {isDesktopHistoryViewport && <th scope="col" className="dgfy-pos-history-header-cell dgfy-pos-history-header--wrap px-2.5 py-4 text-left text-[13px] font-black">Rest. charge</th>}
                                    {isDesktopHistoryViewport && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">VAT</th>}
                                    {isDesktopHistoryViewport && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Vatable</th>}
                                    {!isMobileViewport && <th scope="col" className="dgfy-pos-history-header-cell w-[8rem] min-w-[8rem] max-w-[8rem] whitespace-nowrap px-3 py-4 text-right text-[13px] font-black text-[#1A4E8D]">Total</th>}
                                    {!isMobileViewport && <th scope="col" className={`${historyActionColumnClassName} dgfy-pos-history-header-cell px-2.5 py-4 text-center text-[13px] font-black`}>Action</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {historyLoading ? (
                                    <tr>
                                        <td colSpan={historyVisibleColumnCount} className="px-6 py-10 text-center text-slate-500" aria-live="polite">
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
                                    // #1492: item-axis and delivery-axis vouchers surface separately --
                                    // the delivery waiver has its own label snapshot on the row already
                                    // (never routed through PosTransactionDiscount), independent of
                                    // whether an item-axis voucher also applied.
                                    const appliedVouchers = resolveAppliedVouchers(row);
                                    const itemVoucherCode = appliedVouchers.find((voucher) => voucher.benefit_target !== 'delivery')?.code || null;
                                    const deliveryVoucherLabel = row.delivery_fee_waiver_label_snapshot
                                        || appliedVouchers.find((voucher) => voucher.benefit_target === 'delivery')?.code
                                        || null;
                                    return (
                                        <React.Fragment key={row.pos_transaction_id}>
                                            <tr
                                                className={`border-b border-slate-100 text-slate-700 transition-colors whitespace-nowrap ${isMobileViewport ? 'cursor-pointer hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1A4E8D]' : ''}`}
                                                onClick={isMobileViewport ? () => setExpandedRowId((current) => current === row.pos_transaction_id ? null : row.pos_transaction_id) : undefined}
                                                onKeyDown={isMobileViewport ? (event) => {
                                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                                    event.preventDefault();
                                                    setExpandedRowId((current) => current === row.pos_transaction_id ? null : row.pos_transaction_id);
                                                } : undefined}
                                                tabIndex={isMobileViewport ? 0 : undefined}
                                                aria-expanded={isMobileViewport ? expanded : undefined}
                                                aria-label={isMobileViewport ? `${expanded ? 'Hide' : 'Show'} details for ${row.invoice_number || row.pos_transaction_id}` : undefined}
                                            >
                                                <td className="px-2.5 py-4 text-[13px] font-black text-[#0F172A]">
                                                    <div className="pos-history-row-content">
                                                        <div>{row.invoice_number}</div>
                                                        {isOfflinePending && (
                                                            <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                                                Pending Sync
                                                            </span>
                                                        )}
                                                        {isVoided && (
                                                            <div className="mt-2 space-y-0.5 text-[11px] leading-4 text-rose-700">
                                                                <p><span className="font-bold text-slate-700">Voided by:</span> {voidActorLabel}</p>
                                                                <p><span className="font-bold text-slate-700">Voided at:</span> {voidedAtLabel}</p>
                                                                <p className="max-w-[15rem] truncate" title={voidReason}>
                                                                    <span className="font-bold text-slate-700">Reason:</span> {voidReason}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2.5 py-4 text-[#334155]">
                                                    <div
                                                        data-testid={`pos-history-date-time-${row.pos_transaction_id}`}
                                                        className="pos-history-row-content pos-history-row-content--column min-w-0 leading-tight"
                                                    >
                                                        <span className="truncate">{dateTime.date}</span>
                                                        <span className="truncate text-[11px] text-slate-500">{dateTime.time}</span>
                                                    </div>
                                                </td>
                                                <td className="px-2.5 py-4">
                                                    <div className="pos-history-row-content">
                                                        <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${sourceKey === 'online_store' ? 'text-sky-700' : 'text-emerald-700'}`}>
                                                            {sourceKey === 'online_store' ? <Globe className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Store className="h-4 w-4 shrink-0" aria-hidden="true" />}
                                                            {ORDER_SOURCE_LABELS[sourceKey]}
                                                        </span>
                                                    </div>
                                                </td>
                                                {!isMobileViewport && <td className="px-2.5 py-4 text-[#334155]">
                                                    <div
                                                        data-testid={`pos-history-payment-${row.pos_transaction_id}`}
                                                        className="pos-history-row-content pos-history-row-content--column min-w-0 max-w-full gap-0.5 leading-tight"
                                                    >
                                                        <span className="max-w-full truncate">{formatPosTransactionPaymentMethods(row)}</span>
                                                        <span
                                                            className={`text-[10px] font-black uppercase leading-none tracking-wide ${getPaymentStatusTextClassName(row.payment_status)}`}
                                                            title={`Payment status: ${getPaymentStatusLabel(row.payment_status)}`}
                                                        >
                                                            {getPaymentStatusLabel(row.payment_status)}
                                                        </span>
                                                    </div>
                                                </td>}
                                                {isDesktopHistoryViewport && <td className="px-2.5 py-4 text-[#334155]"><div className="pos-history-row-content">{row.cashier?.username || row.acceptedByUser?.username || '-'}</div></td>}
                                                {isDesktopHistoryViewport && (
                                                    <td className="w-[8rem] min-w-[8rem] max-w-[8rem] break-words px-2 py-4 text-[#334155]">
                                                        <div className="pos-history-row-content">
                                                            {row.discount ? (
                                                                <div>
                                                                    <div className="font-semibold">
                                                                        {row.discount.discount_type || row.discount_label_snapshot || 'Discount'}
                                                                        {row.discount.discount_rate != null ? ` (${money(row.discount.discount_rate)}%)` : ''}
                                                                    </div>
                                                                    <div className="text-[11px] text-rose-700">₱{money(row.discount.discount_amount || row.discount_amount)}</div>
                                                                    {row.discount.discount_type === 'voucher' ? (
                                                                        itemVoucherCode && (
                                                                            <div className="text-[11px] font-semibold text-emerald-700">Voucher: {itemVoucherCode}</div>
                                                                        )
                                                                    ) : (
                                                                        <div className="text-[11px] text-slate-500">
                                                                            Authorized by {row.discount.approvedBy?.username || `employee #${row.discount.manager_approval_id || 'unknown'}`}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : row.discount_label_snapshot
                                                                ? `${row.discount_label_snapshot}${row.discount_rate_snapshot != null ? ` (${money(row.discount_rate_snapshot)}%)` : ''}`
                                                                : '–'}
                                                            {deliveryVoucherLabel && (
                                                                <div className="mt-0.5 text-[11px] font-semibold text-emerald-700">Delivery voucher: {deliveryVoucherLabel}</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                                {isDesktopHistoryViewport && <td className="px-2.5 py-4 text-left text-[#334155]"><div className="pos-history-row-content">₱{money(row.service_fee_amount)}</div></td>}
                                                {isDesktopHistoryViewport && <td className="px-2.5 py-4 text-left text-[#334155]"><div className="pos-history-row-content">₱{money(row.restaurant_service_charge_amount)}</div></td>}
                                                {isDesktopHistoryViewport && <td className="px-2.5 py-4 text-left text-[#334155]"><div className="pos-history-row-content">₱{money(row.vat_amount)}</div></td>}
                                                {isDesktopHistoryViewport && <td className="px-2.5 py-4 text-left text-[#334155]"><div className="pos-history-row-content">₱{money(row.vatable_sales)}</div></td>}
                                                {!isMobileViewport && <td className="w-[8rem] min-w-[8rem] max-w-[8rem] whitespace-nowrap px-3 py-4 text-right font-black tabular-nums text-[#1A4E8D]"><div className="pos-history-row-content">₱{money(row.total_amount)}</div></td>}
                                                {!isMobileViewport && <td className={`${historyActionColumnClassName} px-2.5 py-4 text-center`}>
                                                    <div className={`pos-history-row-content flex-nowrap ${isTabletViewport && !isMobileViewport ? 'justify-start' : 'justify-center'} ${isMobileViewport ? 'gap-1' : 'gap-2'}`}>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="outline"
                                                             className={`${historyActionSquareClassName} pos-history-view-action shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0 text-slate-600 shadow-sm hover:bg-slate-100`}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                openHistoryDetail(row);
                                                            }}
                                                            disabled={historyDetailLoading}
                                                            aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}
                                                            title="View receipt"
                                                        >
                                                            <ClipboardList className="h-5 w-5" aria-hidden="true" />
                                                        </Button>
                                                        {canVoidRow && (
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="outline"
                                                                 className={`${historyActionSquareClassName} pos-history-void-action shrink-0 rounded-md border border-slate-200 bg-white p-0 text-rose-700 shadow-sm hover:bg-slate-100 hover:text-rose-800`}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setVoidTarget(row);
                                                                    setVoidReason('');
                                                                }}
                                                                disabled={voidingTransactionId !== null}
                                                                aria-label={`Void transaction ${row.invoice_number || row.pos_transaction_id}`}
                                                                title="Void transaction"
                                                            >
                                                                <Ban className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                        )}
                                                        {canRefundRow && (
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="outline"
                                                                 className={`${historyActionSquareClassName} shrink-0 rounded-md border-0 bg-transparent p-0 text-amber-800 shadow-none hover:bg-transparent hover:text-amber-900`}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    onOpenRefundWorkflow(row);
                                                                }}
                                                                disabled={refundWorkflowLoading || refundWorkflowSubmitting}
                                                                aria-label={`Resolve refund for ${row.invoice_number || row.pos_transaction_id}`}
                                                                title="Resolve refund"
                                                            >
                                                                <Undo2 className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                        )}
                                                        {isCompactHistoryViewport && (
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="outline"
                                                                 className={`${historyActionSquareClassName} shrink-0 rounded-md border-0 bg-transparent p-0 text-slate-600 shadow-none hover:bg-transparent`}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setExpandedRowId((current) => current === row.pos_transaction_id ? null : row.pos_transaction_id);
                                                                }}
                                                                aria-expanded={expanded}
                                                                aria-label={`${expanded ? 'Hide' : 'Show'} transaction details for ${row.invoice_number || row.pos_transaction_id}`}
                                                                title={`${expanded ? 'Hide' : 'Show'} transaction details`}
                                                            >
                                                                <Eye className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>}
                                            </tr>
                                            {isCompactHistoryViewport && expanded && (
                                                <tr className="border-b border-slate-100 bg-slate-50/70 whitespace-normal">
                                                    <td colSpan={isMobileViewport ? 3 : 12} className={isMobileViewport ? 'px-3 py-3' : 'px-6 py-4'}>
                                                        <div className={`grid grid-cols-2 ${isMobileViewport ? 'gap-2 text-[11px]' : 'gap-3 text-[12px]'} text-[#334155]`}>
                                                            {isMobileViewport && (
                                                                <div>
                                                                    <span className="font-semibold text-[#0F172A]">Payment</span>
                                                                    <p className="mt-1">{formatPosTransactionPaymentMethods(row)}</p>
                                                                </div>
                                                            )}
                                                            {isMobileViewport && (
                                                                <div>
                                                                    <span className="font-semibold text-[#0F172A]">Status</span>
                                                                    <p className={`mt-1 font-bold ${isVoided ? 'text-rose-700' : 'text-emerald-700'}`}>{isVoided ? 'Voided' : 'Completed'}</p>
                                                                </div>
                                                            )}
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
                                                                {itemVoucherCode && (
                                                                    <p className="mt-0.5 font-semibold text-emerald-700">Voucher: {itemVoucherCode}</p>
                                                                )}
                                                                {deliveryVoucherLabel && (
                                                                    <p className="mt-0.5 font-semibold text-emerald-700">Delivery voucher: {deliveryVoucherLabel}</p>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">Fee</span>
                                                                <p className="mt-1">₱{money(row.service_fee_amount)}</p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">Restaurant charge</span>
                                                                <p className="mt-1">₱{money(row.restaurant_service_charge_amount)}</p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">VATable Sales</span>
                                                                <p className="mt-1">₱{money(row.vatable_sales)}</p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[#0F172A]">VAT Amount (12%)</span>
                                                                <p className="mt-1">₱{money(row.vat_amount)}</p>
                                                            </div>
                                                            {isMobileViewport && (
                                                                <div>
                                                                    <span className="font-semibold text-[#0F172A]">Total</span>
                                                                    <p className="mt-1 font-black text-[#1A4E8D]">₱{money(row.total_amount)}</p>
                                                                </div>
                                                            )}
                                                            {isMobileViewport && (
                                                                <div className="col-span-2 flex items-center justify-end gap-2 border-t border-slate-200 pt-2">
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="outline"
                                                                        className={`${historyActionSquareClassName} pos-history-view-action shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0 text-slate-600 shadow-sm hover:bg-slate-100`}
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            openHistoryDetail(row);
                                                                        }}
                                                                        disabled={historyDetailLoading}
                                                                        aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}
                                                                        title="View receipt"
                                                                    >
                                                                        <ClipboardList className="h-5 w-5" aria-hidden="true" />
                                                                    </Button>
                                                                    {canVoidRow && (
                                                                        <Button
                                                                            type="button"
                                                                            size="icon"
                                                                            variant="outline"
                                                                            className={`${historyActionSquareClassName} pos-history-void-action shrink-0 rounded-md border border-slate-200 bg-white p-0 text-rose-700 shadow-sm hover:bg-slate-100 hover:text-rose-800`}
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                setVoidTarget(row);
                                                                                setVoidReason('');
                                                                            }}
                                                                            disabled={voidingTransactionId !== null}
                                                                            aria-label={`Void transaction ${row.invoice_number || row.pos_transaction_id}`}
                                                                            title="Void transaction"
                                                                        >
                                                                            <Ban className="h-4 w-4" aria-hidden="true" />
                                                                        </Button>
                                                                    )}
                                                                    {canRefundRow && (
                                                                        <Button
                                                                            type="button"
                                                                            size="icon"
                                                                            variant="outline"
                                                                            className={`${historyActionSquareClassName} shrink-0 rounded-md border border-slate-200 bg-white p-0 text-amber-800 shadow-sm hover:bg-slate-100 hover:text-amber-900`}
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                onOpenRefundWorkflow(row);
                                                                            }}
                                                                            disabled={refundWorkflowLoading || refundWorkflowSubmitting}
                                                                            aria-label={`Resolve refund for ${row.invoice_number || row.pos_transaction_id}`}
                                                                            title="Resolve refund"
                                                                        >
                                                                            <Undo2 className="h-4 w-4" aria-hidden="true" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            )}
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
                                        <td colSpan={historyVisibleColumnCount} className="px-6 py-12 text-center text-slate-500">No transactions found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

            </div>
            <GlobalPagination
                testId="pos-history-pagination-footer"
                controlTestIdPrefix="pos-history"
                ariaLabel="Transaction history pagination"
                currentPage={historyPage}
                totalPages={totalPages}
                totalItems={totalEntries || historyRows.length}
                start={pageStart}
                end={pageEnd}
                itemLabel="entries"
                pageSize={pageSize}
                pageSizeOptions={POS_HISTORY_PAGE_SIZE_OPTIONS}
                loading={historyLoading}
                onPageChange={(nextPage) => loadHistory(nextPage)}
                onPageSizeChange={(nextPageSize) => {
                    if (!Number.isInteger(nextPageSize) || nextPageSize <= 0) return;
                    if (typeof setHistoryPageSize === 'function') setHistoryPageSize(nextPageSize);
                    if (typeof loadHistory === 'function') loadHistory(1, nextPageSize);
                }}
                className="dgfy-pos-history-pagination-footer shrink-0 rounded-none border-0 border-t border-slate-200 px-6 py-2.5 shadow-none"
            />
            <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && closeVoidDialog()}>
                <DialogContent className="pos-history-void-dialog sm:max-w-md">
                    <DialogHeader className="px-6">
                        <DialogTitle>Void Transaction</DialogTitle>
                        <DialogDescription>
                            Enter a reason to send this request to Back Office. The transaction and stock will change only after approval.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 px-6">
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
                    <DialogFooter className="pos-history-void-footer">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-10 w-full min-w-0 sm:flex-1"
                            onClick={closeVoidDialog}
                            disabled={voidingTransactionId !== null}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            className="h-10 w-full min-w-0 sm:flex-1"
                            onClick={submitVoid}
                            disabled={String(voidReason).trim().length < 3 || voidingTransactionId !== null}
                        >
                            {voidingTransactionId !== null ? 'Submitting request...' : 'Request Void Approval'}
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
