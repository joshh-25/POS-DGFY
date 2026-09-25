import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CalendarDays, ClipboardList, Eye, Filter, Globe, List, ListFilter, RefreshCcw, RotateCcw, Store, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination, POS_PAGINATION_FOOTER_CLASS } from '@/components/ui/pagination';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getPaymentStatusClassName, getPaymentStatusLabel } from '../utils/posHistoryStatus.js';
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
import PosTableSurface from './PosTableSurface.jsx';
import PosTableActionButton from './PosTableActionButton.jsx';
import PosTableDetailsDialog from './PosTableDetailsDialog.jsx';
import PosCashierFilterControl from './PosCashierFilterControl.jsx';
import PosDateRangePicker from './PosDateRangePicker.jsx';
import PosFilterCountBadge from './PosFilterCountBadge.jsx';
import PosPageFrame from './PosPageFrame.jsx';
import { POS_MOBILE_PAGE_STACK_CLASS } from './PosPageSpacing.js';
import {
    PosFilterChoiceGroup,
    PosFilterDialogFooter,
    PosFilterDialogHeader
} from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import PosLineTabNavigation from './PosLineTabNavigation.jsx';
import PosAppliedFilterChips from './PosAppliedFilterChips.jsx';
import PosSearchField from './PosSearchField.jsx';
import { POS_FILTER_TRIGGER_HEIGHT_CLASS, POS_TOOLBAR_CONTROL_HEIGHT_CLASS } from './posToolbarSizing.js';
import { formatPosDateRangeLabel } from './posFilterLabelUtils.js';

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
const POS_HISTORY_TABLET_MAX_WIDTH_PX = 1199;

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
    { value: 'all', label: 'All Sources', icon: List },
    { value: 'in_store', label: 'In-Store', icon: Store },
    { value: 'online_store', label: 'Online Store', icon: Globe }
];

const getFilterOptionLabel = (filterKey, value, options = FILTER_OPTIONS[filterKey] || []) => (
    options.find((option) => option.value === value)?.label || value
);

const getActiveFilterChips = ({
    historySearch,
    historyStatus,
    historyPaymentType,
    historyOrderMethod,
    historyCashierName,
    historyDateFrom,
    historyDateTo,
    orderMethodOptions
}) => [
    historyStatus !== 'all' ? { key: 'status', label: `Sales: ${getFilterOptionLabel('status', historyStatus)}` } : null,
    historyPaymentType !== 'all' ? { key: 'payment', label: `Payment: ${getFilterOptionLabel('paymentType', historyPaymentType)}` } : null,
    historyOrderMethod !== 'all' ? { key: 'method', label: `Method: ${getFilterOptionLabel('orderMethod', historyOrderMethod, orderMethodOptions)}` } : null,
    String(historyCashierName || '').trim() ? { key: 'cashier', label: `Cashier: ${String(historyCashierName).trim()}` } : null,
    historyDateFrom || historyDateTo
        ? { key: 'date', label: `Date: ${formatPosDateRangeLabel(historyDateFrom, historyDateTo)}` }
        : null,
    String(historySearch || '').trim() ? { key: 'search', label: `Search: ${String(historySearch).trim()}` } : null
].filter(Boolean);

const getHistoryOrderMethodLabel = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return ORDER_METHOD_LABELS[normalized]
        || normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
        || '—';
};

const getHistoryDiscountLabel = (row) => {
    if (row?.discount) {
        const label = row.discount.discount_type || row.discount_label_snapshot || 'Discount';
        const rate = row.discount.discount_rate != null ? ` (${money(row.discount.discount_rate)}%)` : '';
        return `${label}${rate}`;
    }
    if (row?.discount_label_snapshot) {
        const rate = row.discount_rate_snapshot != null ? ` (${money(row.discount_rate_snapshot)}%)` : '';
        return `${row.discount_label_snapshot}${rate}`;
    }
    return '—';
};

const buildHistoryDetailsSections = (row) => {
    const dateTime = formatDateTime(row?.created_at);
    const sourceKey = row?.order_source === 'online_store' ? 'online_store' : 'in_store';
    const isVoided = isVoidedPosTransaction(row);
    const isOfflinePending = row?.offline_sync_state === 'pending_sync';
    const appliedVouchers = resolveAppliedVouchers(row);
    const itemVoucherCode = appliedVouchers.find((voucher) => voucher.benefit_target !== 'delivery')?.code || null;
    const deliveryVoucherLabel = row?.delivery_fee_waiver_label_snapshot
        || appliedVouchers.find((voucher) => voucher.benefit_target === 'delivery')?.code
        || null;
    const cashier = row?.cashier?.username || row?.acceptedByUser?.username || '-';

    return [
        {
            key: 'transaction-information',
            title: 'Transaction Information',
            fields: [
                { key: 'created-at', label: 'Date & Time', value: dateTime === '-' ? '—' : `${dateTime.date}, ${dateTime.time}` },
                { key: 'invoice', label: 'Transaction/Invoice', value: row?.invoice_number || row?.pos_transaction_id || '—' },
                { key: 'cashier', label: 'Cashier', value: cashier },
                {
                    key: 'source',
                    label: 'Source',
                    value: <span className="inline-flex items-center gap-1.5 text-[#1A4E8D]"><span aria-hidden="true">{sourceKey === 'online_store' ? <Globe className="h-4 w-4" /> : <Store className="h-4 w-4" />}</span>{ORDER_SOURCE_LABELS[sourceKey]}</span>
                },
                { key: 'payment', label: 'Payment Method', value: formatPosTransactionPaymentMethods(row) },
                { key: 'payment-status', label: 'Payment Status', value: <span className={getPaymentStatusTextClassName(row?.payment_status)}>{getPaymentStatusLabel(row?.payment_status)}</span> },
                { key: 'order-method', label: 'Order Method', value: getHistoryOrderMethodLabel(row?.order_method) },
                { key: 'sync-state', label: 'Sync State', value: isOfflinePending ? 'Pending Sync' : 'Synced' }
            ]
        },
        {
            key: 'sales-summary',
            title: 'Sales Summary',
            fields: [
                { key: 'discount', label: 'Discount', value: getHistoryDiscountLabel(row) },
                { key: 'fee', label: 'Fee', value: `₱${money(row?.service_fee_amount)}` },
                { key: 'restaurant-charge', label: 'Restaurant Charge', value: `₱${money(row?.restaurant_service_charge_amount)}` },
                { key: 'vat', label: 'VAT', value: `₱${money(row?.vat_amount)}` },
                { key: 'vatable', label: 'Vatable Sales', value: `₱${money(row?.vatable_sales)}` },
                { key: 'total', label: 'Total', value: `₱${money(row?.total_amount)}`, valueClassName: 'text-base font-black text-[#1A4E8D]' },
                itemVoucherCode ? { key: 'item-voucher', label: 'Item Voucher', value: itemVoucherCode } : null,
                deliveryVoucherLabel ? { key: 'delivery-voucher', label: 'Delivery Voucher', value: deliveryVoucherLabel } : null
            ].filter(Boolean)
        },
        isVoided ? {
            key: 'void-audit',
            title: 'Void Audit',
            fields: [
                { key: 'void-reason', label: 'Reason', value: resolvePosVoidReason(row) },
                { key: 'void-actor', label: 'Voided By', value: resolvePosVoidActorLabel(row) },
                { key: 'voided-at', label: 'Voided At', value: formatPosVoidTimestamp(row?.voided_at) }
            ]
        } : null
    ].filter(Boolean);
};

function MobileHistoryDetailRow({ label, children, className = '', valueClassName = '' }) {
    return (
        <div className={`flex items-start justify-between gap-4 text-[11px] leading-4 ${className}`}>
            <dt className="shrink-0 text-slate-500">{label}</dt>
            <dd className={`min-w-0 max-w-[68%] break-words text-right font-medium text-[#334155] ${valueClassName}`}>{children}</dd>
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
    const toggleDetails = () => onToggleExpanded(row.pos_transaction_id);
    const detailsId = `pos-history-mobile-details-${row.pos_transaction_id}`;
    const discountLabel = getHistoryDiscountLabel(row);
    const paymentStatusLabel = isVoided ? 'Voided' : getPaymentStatusLabel(row.payment_status);
    const paymentStatusClassName = isVoided
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : getPaymentStatusClassName(row.payment_status);

    return (
        <article
            data-testid={`pos-history-mobile-card-${row.pos_transaction_id}`}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"
        >
            <div className="px-2.5 py-2">
                <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1 pt-0.5">
                        <p className="truncate text-[12px] font-black leading-4 text-[#0F172A]">{row.invoice_number || row.pos_transaction_id}</p>
                        {isOfflinePending && (
                            <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-wide text-amber-700">Pending Sync</span>
                        )}
                        <div data-testid={`pos-history-mobile-date-time-${row.pos_transaction_id}`} className="mt-0.5 flex min-w-0 gap-1 text-[10px] leading-3 text-slate-500">
                            <span className="truncate">{dateTime.date}</span>
                            <span aria-hidden="true">•</span>
                            <span className="truncate">{dateTime.time}</span>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={`Actions for ${row.invoice_number || row.pos_transaction_id}`}>
                    <PosTableActionButton
                        icon={ClipboardList}
                        onClick={() => openHistoryDetail(row)}
                        disabled={historyDetailLoading}
                        aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}
                        title="View receipt"
                    />
                    {canVoidRow && (
                        <PosTableActionButton
                            icon={Ban}
                            tone="danger"
                            onClick={() => {
                                setVoidTarget(row);
                                setVoidReason('');
                            }}
                            disabled={voidingTransactionId !== null}
                            aria-label={`Void transaction ${row.invoice_number || row.pos_transaction_id}`}
                            title="Void transaction"
                        />
                    )}
                    {canRefundRow && (
                        <PosTableActionButton
                            icon={Undo2}
                            onClick={() => onOpenRefundWorkflow(row)}
                            disabled={refundWorkflowLoading || refundWorkflowSubmitting}
                            aria-label={`Resolve refund for ${row.invoice_number || row.pos_transaction_id}`}
                            title="Resolve refund"
                        />
                    )}
                        <PosTableActionButton
                            icon={Eye}
                            className={expanded ? 'bg-blue-50' : undefined}
                            onClick={toggleDetails}
                            aria-expanded={expanded}
                            aria-controls={detailsId}
                            aria-label={`${expanded ? 'Hide' : 'Show'} transaction details for ${row.invoice_number || row.pos_transaction_id}`}
                            title={`${expanded ? 'Hide' : 'Show'} transaction details`}
                    />
                    </div>
                </div>

                <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
                    <span className={`inline-flex min-w-0 items-center gap-1 text-[10px] font-semibold ${sourceKey === 'online_store' ? 'text-sky-700' : 'text-emerald-700'}`}>
                        {sourceKey === 'online_store' ? <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                        <span className="truncate">{ORDER_SOURCE_LABELS[sourceKey]}</span>
                    </span>
                    <span className={`inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-black uppercase leading-3 tracking-wide ${paymentStatusClassName}`}>
                        {paymentStatusLabel}
                    </span>
                </div>
            </div>

            <div
                id={detailsId}
                data-testid={`pos-history-mobile-details-${row.pos_transaction_id}`}
                role="region"
                aria-label={`Details for ${row.invoice_number || row.pos_transaction_id}`}
                hidden={!expanded}
                className="border-t border-slate-100 px-3 py-2.5"
            >
                    <dl className="space-y-2 text-[11px] leading-4">
                        <MobileHistoryDetailRow label="Payment">
                            {formatPosTransactionPaymentMethods(row)}
                        </MobileHistoryDetailRow>
                        <MobileHistoryDetailRow label="Cashier">
                            {row.cashier?.username || row.acceptedByUser?.username || '—'}
                        </MobileHistoryDetailRow>
                        <MobileHistoryDetailRow label="Discount">
                            <span>{discountLabel}</span>
                            {itemVoucherCode && <span className="mt-0.5 block font-semibold text-emerald-700">Voucher: {itemVoucherCode}</span>}
                            {deliveryVoucherLabel && <span className="mt-0.5 block font-semibold text-emerald-700">Delivery voucher: {deliveryVoucherLabel}</span>}
                        </MobileHistoryDetailRow>
                        <MobileHistoryDetailRow label="Rest. charge">
                            ₱{money(row.restaurant_service_charge_amount)}
                        </MobileHistoryDetailRow>

                        <div className="space-y-2 border-t border-slate-200 pt-2">
                            <MobileHistoryDetailRow label="VAT">₱{money(row.vat_amount)}</MobileHistoryDetailRow>
                            <MobileHistoryDetailRow label="Vatable">₱{money(row.vatable_sales)}</MobileHistoryDetailRow>
                            <MobileHistoryDetailRow label="Fee">₱{money(row.service_fee_amount)}</MobileHistoryDetailRow>
                        </div>

                        <MobileHistoryDetailRow
                            label="Total"
                            className="rounded-lg bg-[#E8F1FB] px-2 py-1.5"
                            valueClassName="text-[13px] font-black text-[#1A4E8D]"
                        >
                            ₱{money(row.total_amount)}
                        </MobileHistoryDetailRow>
                    </dl>

                    {isVoided && (
                        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] leading-4 text-rose-800">
                            <p className="font-black uppercase tracking-wide">Voided transaction</p>
                            <p>Reason: {voidReason}</p>
                            <p>Voided by: {voidActorLabel}</p>
                            <p>Voided at: {voidedAtLabel}</p>
                        </div>
                    )}
            </div>
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
    const [isTabletTableViewport, setIsTabletTableViewport] = useState(() => (
        typeof window !== 'undefined'
        && window.innerWidth > POS_HISTORY_MOBILE_MAX_WIDTH_PX
        && window.innerWidth <= POS_HISTORY_TABLET_MAX_WIDTH_PX
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
    const [historyDetailsRow, setHistoryDetailsRow] = useState(null);
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
    const activeFilterChips = getActiveFilterChips({ ...currentFilterValues, historySearch, orderMethodOptions });
    const activeFilterCount = activeFilterChips.length;
    const hasActiveDateFilter = Boolean(historyDateFrom || historyDateTo);
    const isMobileViewport = Boolean(isMobileViewportProp) || detectedMobileViewport;
    const isLandscapeMobileViewport = (isMobileViewport && detectedLandscapeViewport)
        || isPosHistoryNarrowLandscapeMobileViewport()
        || detectedLandscapePanelViewport;
    // Keep the phone's existing card interaction below 768px. Tablet tables
    // progressively expose more fields as the available width increases.
    const isCompactHistoryViewport = isMobileViewport;
    const isDesktopHistoryViewport = !isMobileViewport && !isTabletTableViewport;
    const isTabletLandscapeTableViewport = isTabletTableViewport && !isTabletPortraitViewport;
    const historyVisibleColumnCount = isMobileViewport
        ? 3
        : isTabletTableViewport
            ? (isTabletPortraitViewport ? 5 : 6)
            : 8;
    const isTabletPortraitDialog = isTabletPortraitViewport;
    const isMobileDialog = isMobileViewport && !isTabletPortraitDialog;
    const isDesktopDialog = !isMobileDialog;
    const isDesktopFilterDialog = filterDialogMode === 'filters' && isDesktopDialog;
    const cashierOptions = Array.from(new Set([
        ...historyRows.flatMap((row) => [row?.cashier?.username, row?.acceptedByUser?.username]),
        historyCashierName
    ].map((value) => String(value ?? '').trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
    const pendingSyncLabel = universalPendingSyncCount > 0
        ? `Sync ${universalPendingSyncCount} pending POS record${universalPendingSyncCount === 1 ? '' : 's'}`
        : 'Sync pending POS records';
    const historyActionColumnClassName = isMobileViewport
        ? 'pos-history-action-column min-w-0 w-[28%]'
        : 'pos-history-action-column min-w-0';
    const historyTableSurfaceClassName = isMobileViewport
        ? 'w-full min-w-0 max-w-full overscroll-x-contain overflow-visible rounded-none border-0 bg-transparent shadow-none'
        : `w-full min-w-0 max-w-full overscroll-x-contain ${isTabletViewport ? 'overflow-x-auto' : 'overflow-x-hidden'}`;
    const historyDetailsIsVoided = historyDetailsRow ? isVoidedPosTransaction(historyDetailsRow) : false;
    const historyDetailsIsOfflinePending = historyDetailsRow?.offline_sync_state === 'pending_sync';
    const historyDetailsPaymentStatus = String(historyDetailsRow?.payment_status || '').trim().toLowerCase();
    const historyDetailsCanVoid = Boolean(historyDetailsRow)
        && canVoidTransactions
        && !historyDetailsIsOfflinePending
        && !historyDetailsIsVoided;
    const historyDetailsCanRefund = Boolean(historyDetailsRow)
        && canVoidTransactions
        && !historyDetailsIsOfflinePending
        && historyDetailsIsVoided
        && ['paid', 'refund_pending', 'partial_refunded'].includes(historyDetailsPaymentStatus);

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

    const removeHistoryFilter = (filterKey) => {
        if (filterKey !== 'search') filterApplyPendingRef.current = true;

        if (filterKey === 'status') setHistoryStatus('all');
        if (filterKey === 'payment') setHistoryPaymentType('all');
        if (filterKey === 'method') setHistoryOrderMethod('all');
        if (filterKey === 'cashier') setHistoryCashierName('');
        if (filterKey === 'date') {
            setHistoryDateFrom('');
            setHistoryDateTo('');
        }
        if (filterKey === 'search') setHistorySearch('');
    };

    const clearAllHistoryFilters = () => {
        filterApplyPendingRef.current = true;
        setHistorySearch('');
        setHistoryStatus('all');
        setHistoryPaymentType('all');
        setHistoryOrderMethod('all');
        setHistoryOrderSource('all');
        setHistoryCashierName('');
        setHistoryDateFrom('');
        setHistoryDateTo('');
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

    const sourceTabNavigation = (
        <PosLineTabNavigation
            tabs={SOURCE_TABS.map((sourceTab) => ({
                id: sourceTab.value,
                label: sourceTab.label,
                icon: sourceTab.icon,
                testId: `pos-history-source-tab-${sourceTab.value}`
            }))}
            activeTab={historyOrderSource}
            onTabChange={selectSourceTab}
            ariaLabel="Transaction sources"
            idPrefix="pos-history-source-tab"
            panelId="pos-history-table-panel"
        />
    );

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
        const syncTabletTable = () => setIsTabletTableViewport(
            window.innerWidth > POS_HISTORY_MOBILE_MAX_WIDTH_PX
            && window.innerWidth <= POS_HISTORY_TABLET_MAX_WIDTH_PX
        );
        sync();
        syncPortrait();
        syncTabletTable();
        window.addEventListener('resize', sync);
        window.addEventListener('resize', syncPortrait);
        window.addEventListener('resize', syncTabletTable);
        window.addEventListener('orientationchange', syncPortrait);
        window.addEventListener('orientationchange', syncTabletTable);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('resize', syncPortrait);
            window.removeEventListener('resize', syncTabletTable);
            window.removeEventListener('orientationchange', syncPortrait);
            window.removeEventListener('orientationchange', syncTabletTable);
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
        <PosPageFrame page="history" className="flex h-full min-h-0 flex-col">
        <section ref={historyPanelRef} data-pos-history-panel="true" className="dgfy-pos-history-panel flex h-full min-h-0 min-w-0 max-w-full flex-col gap-0 overflow-x-hidden rounded-xl bg-white">
            {isMobileViewport && (
                <div data-testid="pos-history-source-tabs" className="dgfy-pos-scrollbar-hidden mb-4 min-w-0 max-w-full shrink-0 overflow-x-hidden">
                    {sourceTabNavigation}
                </div>
            )}
            {/* History controls and transaction rows scroll in the flexible middle region;
                pagination stays in the fixed panel footer below it.
                A tall stacked mobile filter grid can therefore scroll with the content
                instead of clipping the buttons/table beneath it — previously only the table
                had its own scroll area, so overflow above it
                (see Fix: History Catalog Mobile Filter Clipping) was cut off by the ancestor
                overflow-hidden containers in POSCheckoutTerminal.jsx instead of scrolling. */}
            <div data-testid="pos-history-scroll-region" className={`dgfy-pos-scrollbar-hidden min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y ${isMobileViewport ? POS_MOBILE_PAGE_STACK_CLASS : ''}`} style={{ WebkitOverflowScrolling: 'touch' }}>
                {!isMobileViewport && (
                    <div data-testid="pos-history-source-tabs" className="dgfy-pos-scrollbar-hidden mb-2 min-w-0 max-w-full overflow-x-auto">
                        {sourceTabNavigation}
                    </div>
                )}

                <div data-testid="pos-history-toolbar" className={`${isMobileViewport ? 'flex flex-nowrap gap-2 flex-row w-full px-0 py-0' : 'flex flex-nowrap gap-2 lg:gap-3 items-center pb-4 pt-2'}`}>
                    <PosSearchField
                        ariaLabel="Search all transaction fields"
                        value={historySearch}
                        onChange={(event) => setHistorySearch(event.target.value)}
                        placeholder="Search all transaction fields..."
                        inputClassName={POS_TOOLBAR_CONTROL_HEIGHT_CLASS}
                        className={`flex-1 ${isMobileViewport ? 'basis-0' : 'basis-[18rem]'}`}
                    />
                    <div className="flex shrink-0 items-center gap-2">
                            <Button
                                type="button"
                                data-testid="pos-history-filter-button"
                                ref={filterButtonRef}
                            onClick={openFilterDialog}
                            aria-haspopup="dialog"
                            aria-expanded={filterDialogOpen && filterDialogMode === 'filters'}
                            aria-controls="pos-history-filter-dialog"
                            variant="outline"
                            className={`${isMobileViewport ? 'relative w-11 min-w-0 px-0' : 'relative min-w-[6.25rem] px-4'} ${POS_FILTER_TRIGGER_HEIGHT_CLASS} shrink-0 rounded-xl border-[#1A4E8D] bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73] hover:text-white`}
                        >
                            <Filter className={`${isMobileViewport ? '' : 'mr-2'} h-4 w-4`} aria-hidden="true" />
                            {isMobileViewport ? <span className="sr-only">Filter</span> : 'Filter'}
                            <PosFilterCountBadge count={activeFilterCount} />
                        </Button>
                        <Button
                            type="button"
                            data-testid="pos-history-calendar-button"
                            ref={calendarButtonRef}
                            onClick={openCalendarDialog}
                            aria-haspopup="dialog"
                            aria-expanded={filterDialogOpen && filterDialogMode === 'calendar'}
                            aria-controls="pos-history-calendar-dialog"
                            variant="outline"
                            className={`${isMobileViewport ? 'w-11 min-w-0 px-0' : 'min-w-[8.75rem] px-4'} ${POS_FILTER_TRIGGER_HEIGHT_CLASS} shrink-0 whitespace-nowrap rounded-xl border-[#1A4E8D] text-[13px] font-extrabold text-[#1A4E8D] hover:bg-blue-50 ${hasActiveDateFilter ? 'bg-blue-50' : 'bg-white'}`}
                        >
                            <CalendarDays className={`${isMobileViewport ? '' : 'mr-2'} h-4 w-4`} aria-hidden="true" />
                            {isMobileViewport ? <span className="sr-only">Filter by Date</span> : 'Filter by Date'}
                        </Button>
                        <Button
                            type="button"
                            data-testid="pos-history-sync-button"
                            onClick={syncPendingTransactions}
                            disabled={syncDisabled || syncingPendingTransactions || universalPendingSyncCount <= 0}
                            size="icon"
                            aria-label={pendingSyncLabel}
                            title={pendingSyncLabel}
                            className={`${isMobileViewport ? 'w-11' : 'w-10'} ${POS_TOOLBAR_CONTROL_HEIGHT_CLASS} shrink-0 rounded-xl bg-[#1A4E8D] p-0 text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60`}
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

                <PosAppliedFilterChips
                    activeFilters={activeFilterChips}
                    onRemoveFilter={removeHistoryFilter}
                    onClearAllFilters={clearAllHistoryFilters}
                    groupLabel="Applied history filters"
                    clearAllAriaLabel="Clear all history filters"
                    className={isMobileViewport
                        ? 'dgfy-pos-history-horizontal-scroll flex-nowrap overflow-x-auto overscroll-x-contain touch-pan-x px-3 py-0'
                        : 'flex-wrap px-3 py-3 lg:px-4'}
                />

                <PosFilterDialogShell
                    open={filterDialogOpen}
                    onClose={closeFilterDialog}
                    mode={filterDialogMode}
                    mobile={isMobileDialog}
                    tabletPortrait={isTabletPortraitDialog}
                    landscapeMobile={isLandscapeMobileViewport}
                    position={filterDialogPosition}
                    id={filterDialogMode === 'calendar' ? 'pos-history-calendar-dialog' : 'pos-history-filter-dialog'}
                    ariaLabelledBy={filterDialogMode === 'calendar' ? 'pos-history-calendar-title' : 'pos-history-filter-title'}
                    ariaDescribedBy={filterDialogMode === 'calendar' ? 'pos-history-calendar-description' : 'pos-history-filter-description'}
                >
                        <PosFilterDialogHeader
                            title={filterDialogMode === 'calendar' ? 'Select Date' : 'Filter'}
                            description={filterDialogMode === 'calendar'
                                ? 'Choose a date range for the transaction history.'
                                : isMobileDialog ? 'Refine your Transaction History' : 'Select the transaction history you want to review.'}
                            titleId={filterDialogMode === 'calendar' ? 'pos-history-calendar-title' : 'pos-history-filter-title'}
                            descriptionId={filterDialogMode === 'calendar' ? 'pos-history-calendar-description' : 'pos-history-filter-description'}
                            onClose={filterDialogMode === 'calendar' ? undefined : closeFilterDialog}
                            closeLabel="Close history filters"
                            mobile={isMobileDialog}
                            headerAction={filterDialogMode === 'calendar' ? (
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
                            ) : null}
                            titleClassName="text-xl font-black text-[#0F172A]"
                            descriptionClassName="mt-0.5 text-[12px] text-slate-500"
                            className={`${isMobileDialog ? 'px-4 py-3' : filterDialogMode === 'calendar' ? 'px-4 py-2.5' : isDesktopDialog ? 'px-4 py-3' : 'px-5 py-4 sm:px-6 sm:py-5'} dgfy-pos-history-dialog-header`}
                        />

                        <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${isMobileDialog ? 'px-4 py-3' : filterDialogMode === 'calendar' ? 'px-4 py-2' : isDesktopFilterDialog ? 'px-4 py-2.5' : 'px-5 py-5 sm:px-6'} dgfy-pos-history-dialog-body`}>
                            {filterDialogMode === 'calendar' ? (
                                <PosDateRangePicker
                                    from={filterDraft?.historyDateFrom ?? historyDateFrom}
                                    to={filterDraft?.historyDateTo ?? historyDateTo}
                                    mobile={isMobileDialog}
                                    testIdPrefix="pos-history-calendar"
                                    timeZone="Asia/Manila"
                                    onChange={(from, to) => setFilterDraft((current) => ({
                                        ...(current || currentFilterValues),
                                        historyDateFrom: from,
                                        historyDateTo: to
                                    }))}
                                />
                            ) : (
                                <div className={`grid min-w-0 ${isDesktopFilterDialog ? 'gap-4' : isMobileDialog ? 'gap-3' : 'gap-5'}`}>
                                    <PosFilterChoiceGroup
                                        label="Sales View"
                                        value={filterDraft?.historyStatus || historyStatus}
                                        options={FILTER_OPTIONS.status}
                                        onChange={(value) => updateFilterDraft('historyStatus', value)}
                                        testId="pos-history-filter-status"
                                        compact={isDesktopFilterDialog}
                                        mobile={isMobileViewport}
                                    />
                                    <PosFilterChoiceGroup
                                        label="Payment Method"
                                        value={filterDraft?.historyPaymentType || historyPaymentType}
                                        options={FILTER_OPTIONS.paymentType}
                                        onChange={(value) => updateFilterDraft('historyPaymentType', value)}
                                        testId="pos-history-filter-payment"
                                        compact={isDesktopFilterDialog}
                                        mobile={isMobileViewport}
                                    />
                                    <PosFilterChoiceGroup
                                        label="Order Method"
                                        value={filterDraft?.historyOrderMethod || historyOrderMethod}
                                        options={orderMethodOptions}
                                        onChange={(value) => updateFilterDraft('historyOrderMethod', value)}
                                        testId="pos-history-filter-order-method"
                                        compact={isDesktopFilterDialog}
                                        mobile={isMobileViewport}
                                    />

                                    <PosCashierFilterControl
                                        value={filterDraft?.historyCashierName ?? historyCashierName}
                                        searchValue={filterDraft?.historyCashierName ?? historyCashierName}
                                        options={cashierOptions.map((cashier) => ({ value: cashier, label: cashier }))}
                                        onSearchChange={(value) => updateFilterDraft('historyCashierName', value)}
                                        onChange={(value) => updateFilterDraft('historyCashierName', value)}
                                        expanded={cashierPickerOpen}
                                        onExpandedChange={setCashierPickerOpen}
                                        compact={isDesktopFilterDialog}
                                        mobile={isMobileDialog}
                                        id="pos-history-cashier-search"
                                        testIdPrefix="pos-history-cashier"
                                        optionName="pos-history-cashier"
                                    />
                                </div>
                            )}
                        </div>

                        <PosFilterDialogFooter
                            onCancel={filterDialogMode === 'calendar' ? closeFilterDialog : undefined}
                            onReset={filterDialogMode === 'calendar' ? undefined : resetDraftFilters}
                            onApply={applyDraftFilters}
                            resetLabel="Reset All"
                            cancelLabel="Cancel"
                            resetTestId="pos-history-reset-filters"
                            cancelTestId="pos-history-cancel-dates"
                            applyTestId={filterDialogMode === 'calendar' ? 'pos-history-apply-dates' : 'pos-history-apply-filters'}
                            applyIcon={filterDialogMode === 'calendar' ? CalendarDays : ListFilter}
                            mobile={isMobileDialog}
                            className={`${isMobileDialog ? 'gap-3 px-4 py-3' : filterDialogMode === 'calendar' ? 'gap-2 px-4 py-2' : isDesktopFilterDialog ? 'gap-2 px-4 py-2.5' : 'gap-3 px-5 py-4 sm:px-6 sm:py-4'} dgfy-pos-history-dialog-footer`}
                            leftButtonClassName={`${isMobileDialog ? 'h-9' : filterDialogMode === 'calendar' ? 'h-9' : isDesktopFilterDialog ? 'h-10' : 'h-11'} border-rose-300 bg-rose-50/40 text-[13px] font-extrabold text-rose-700 shadow-sm shadow-rose-100/70 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800`}
                            applyButtonClassName={`${isMobileDialog ? 'h-9' : filterDialogMode === 'calendar' ? 'h-9' : isDesktopFilterDialog ? 'h-10' : 'h-11'} text-[13px]`}
                        />
                </PosFilterDialogShell>

                <PosTableSurface id="pos-history-table-panel" className={historyTableSurfaceClassName} aria-busy={historyLoading}>
                    {isMobileViewport ? (
                        <div data-testid="pos-history-mobile-list" className="flex flex-col gap-1.5 bg-white py-2">
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
                    <table className={`dgfy-pos-history-table w-full whitespace-nowrap ${isMobileViewport ? 'text-[12px] min-w-0 table-fixed dgfy-pos-history-table--mobile' : isTabletTableViewport ? `text-[12px] min-w-0 table-fixed dgfy-pos-history-table--tablet ${isTabletPortraitViewport ? 'dgfy-pos-history-table--tablet-portrait' : 'dgfy-pos-history-table--tablet-landscape'}` : 'text-[13px] min-w-0 table-fixed dgfy-pos-history-table--single-view'}`} aria-label="POS transaction history table">
                            <caption className="sr-only">POS transaction history with payment and transaction status; mobile rows open details and actions</caption>
                            <colgroup>
                                {isTabletTableViewport ? (
                                    isTabletPortraitViewport ? (
                                        <>
                                            <col className="w-[18%]" />
                                            <col className="w-[20%]" />
                                            <col className="w-[19%]" />
                                            <col className="w-[18%]" />
                                            <col className="w-[25%]" />
                                        </>
                                    ) : (
                                        <>
                                            <col className="w-[15%]" />
                                            <col className="w-[15%]" />
                                            <col className="w-[16%]" />
                                            <col className="w-[16%]" />
                                            <col className="w-[16%]" />
                                            <col className="w-[22%]" />
                                        </>
                                    )
                                ) : (
                                    <>
                                        <col className="w-[12.5%]" />
                                        <col className="w-[12.5%]" />
                                        <col className="w-[12.5%]" />
                                        <col className="w-[12.5%]" />
                                        <col className="w-[12.5%]" />
                                        <col className="w-[12.5%]" />
                                        <col className="w-[12.5%]" />
                                        <col className="w-[12.5%]" />
                                    </>
                                )}
                            </colgroup>
                            <thead>
                                <tr className="border-b border-slate-200 bg-white text-[#0F172A] whitespace-nowrap">
                                    <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Invoice</th>
                                    <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Date &amp; Time</th>
                                    <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Source</th>
                                    {(!isTabletTableViewport || isTabletLandscapeTableViewport) && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Payment</th>}
                                    {isDesktopHistoryViewport && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Cashier</th>}
                                    {isDesktopHistoryViewport && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Vatable</th>}
                                    {!isMobileViewport && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black text-[#1A4E8D]">Total</th>}
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
                                                {(!isTabletTableViewport || isTabletLandscapeTableViewport) && <td className="px-2.5 py-4 text-[#334155]">
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
                                                {isDesktopHistoryViewport && <td className="px-2.5 py-4 text-left text-[#334155]"><div className="pos-history-row-content">₱{money(row.vatable_sales)}</div></td>}
                                                {!isMobileViewport && <td className="px-2.5 py-4 text-left font-black text-[#1A4E8D]"><div className="pos-history-row-content">₱{money(row.total_amount)}</div></td>}
                                                {!isMobileViewport && <td className={`${historyActionColumnClassName} px-2.5 py-4 text-center`}>
                                                    <div className={`pos-history-action-group flex w-full flex-nowrap items-center justify-center ${isMobileViewport ? 'gap-1' : 'gap-2'}`}>
                                                        <PosTableActionButton
                                                            icon={ClipboardList}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                openHistoryDetail(row);
                                                            }}
                                                            disabled={historyDetailLoading}
                                                            aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}
                                                            title="View receipt"
                                                        />
                                                        {canVoidRow && (
                                                            <PosTableActionButton
                                                                icon={Ban}
                                                                tone="danger"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setVoidTarget(row);
                                                                    setVoidReason('');
                                                                }}
                                                                disabled={voidingTransactionId !== null}
                                                                aria-label={`Void transaction ${row.invoice_number || row.pos_transaction_id}`}
                                                                title="Void transaction"
                                                            />
                                                        )}
                                                        {canRefundRow && (
                                                            <PosTableActionButton
                                                                icon={Undo2}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    onOpenRefundWorkflow(row);
                                                                }}
                                                                disabled={refundWorkflowLoading || refundWorkflowSubmitting}
                                                                aria-label={`Resolve refund for ${row.invoice_number || row.pos_transaction_id}`}
                                                                title="Resolve refund"
                                                            />
                                                        )}
                                                        {isCompactHistoryViewport && (
                                                            <PosTableActionButton
                                                                icon={Eye}
                                                                className={expanded ? 'bg-blue-50' : undefined}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setExpandedRowId((current) => current === row.pos_transaction_id ? null : row.pos_transaction_id);
                                                                }}
                                                                aria-expanded={expanded}
                                                                aria-label={`${expanded ? 'Hide' : 'Show'} transaction details for ${row.invoice_number || row.pos_transaction_id}`}
                                                                title={`${expanded ? 'Hide' : 'Show'} transaction details`}
                                                            />
                                                        )}
                                                        {!isCompactHistoryViewport && (
                                                            <PosTableActionButton
                                                                icon={Eye}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setHistoryDetailsRow(row);
                                                                }}
                                                                aria-label={"View details for " + (row.invoice_number || row.pos_transaction_id)}
                                                                title="View details"
                                                            />
                                                        )}
                                                    </div>
                                                </td>}
                                            </tr>
                                            {isCompactHistoryViewport && expanded && (
                                                <tr className="border-b border-slate-100 bg-slate-50/70 whitespace-normal">
                                                    <td colSpan={historyVisibleColumnCount} className={isMobileViewport ? 'px-3 py-3' : 'px-6 py-4'}>
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
                                                                    <PosTableActionButton
                                                                        icon={ClipboardList}
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            openHistoryDetail(row);
                                                                        }}
                                                                        disabled={historyDetailLoading}
                                                                        aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}
                                                                        title="View receipt"
                                                                    />
                                                                    {canVoidRow && (
                                                                        <PosTableActionButton
                                                                            icon={Ban}
                                                                            tone="danger"
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                setVoidTarget(row);
                                                                                setVoidReason('');
                                                                            }}
                                                                            disabled={voidingTransactionId !== null}
                                                                            aria-label={`Void transaction ${row.invoice_number || row.pos_transaction_id}`}
                                                                            title="Void transaction"
                                                                        />
                                                                    )}
                                                                    {canRefundRow && (
                                                                        <PosTableActionButton
                                                                            icon={Undo2}
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                onOpenRefundWorkflow(row);
                                                                            }}
                                                                            disabled={refundWorkflowLoading || refundWorkflowSubmitting}
                                                                            aria-label={`Resolve refund for ${row.invoice_number || row.pos_transaction_id}`}
                                                                            title="Resolve refund"
                                                                        />
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
                </PosTableSurface>

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
                className={POS_PAGINATION_FOOTER_CLASS}
            />
            <PosTableDetailsDialog
                open={Boolean(historyDetailsRow)}
                onOpenChange={(open) => !open && setHistoryDetailsRow(null)}
                title="Transaction Details"
                subtitle={historyDetailsRow ? (historyDetailsRow.invoice_number || historyDetailsRow.pos_transaction_id || '') : ''}
                sections={historyDetailsRow ? buildHistoryDetailsSections(historyDetailsRow) : []}
                testId="pos-history-details-dialog"
                footer={historyDetailsRow ? (
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-10 min-w-[8rem] border-slate-300 text-slate-700 hover:bg-slate-50"
                            onClick={() => {
                                const selectedRow = historyDetailsRow;
                                setHistoryDetailsRow(null);
                                openHistoryDetail(selectedRow);
                            }}
                            disabled={historyDetailLoading}
                        >
                            View receipt
                        </Button>
                        {historyDetailsCanVoid ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 min-w-[7rem] border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                onClick={() => {
                                    setVoidTarget(historyDetailsRow);
                                    setVoidReason('');
                                    setHistoryDetailsRow(null);
                                }}
                                disabled={voidingTransactionId !== null}
                            >
                                Void transaction
                            </Button>
                        ) : null}
                        {historyDetailsCanRefund ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 min-w-[7rem] border-amber-200 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                                onClick={() => {
                                    const selectedRow = historyDetailsRow;
                                    setHistoryDetailsRow(null);
                                    onOpenRefundWorkflow(selectedRow);
                                }}
                                disabled={refundWorkflowLoading || refundWorkflowSubmitting}
                            >
                                Resolve refund
                            </Button>
                        ) : null}
                    </div>
                ) : null}
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
        </PosPageFrame>
    );
}
