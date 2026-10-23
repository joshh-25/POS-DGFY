import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    BarChart3,
    Bell,
    Building2,
    CalendarDays,
    CheckCircle2,
    ChefHat,
    Clock3,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Database,
    Download,
    ExternalLink,
    Info,
    Lock,
    MapPin,
    Menu,
    Monitor,
    Package,
    Plus,
    Receipt,
    RefreshCw,
    Search,
    Settings,
    ShoppingBag,
    ShieldCheck,
    Store,
    UserRound,
    Users,
    Utensils,
    Wallet,
    X
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import { businessAdminApi, getBusinessAdminErrorMessage } from './businessAdminService.js';
import {
    buildBusinessAdminSettingsPath,
    buildBusinessAdminSettingsEditorUser,
    canAccessBusinessAdminSettingsSection,
    getBusinessAdminSettingsSectionDefinition,
    getVisibleBusinessAdminSettingsSections,
    normalizeBusinessAdminSettingsCapabilities,
    parseBusinessAdminPath,
    resolveSettingsBranchId,
    settingsScopeLabel,
    shouldBlockSettingsNavigation
} from './businessAdminSettingsModel.js';
import SettingsWorkspace from '../../../../../packages/web-core/src/features/pos/settings/PosSettingsWorkspace.jsx';
import { resolveAppAssetUrl } from '../../../../../packages/web-core/src/utils/assetUrl.js';
import {
    installCrossAppSettingsRefresh,
    publishBusinessAdminSettingsUpdated
} from '../../../../../packages/web-core/src/features/pos/utils/businessAdminSettingsSync.js';
import { DGFY_COMPANY_SELECT_ROUTE } from '../../../../../packages/web-core/src/features/dgfyRouteHelpers.js';
import {
    isPosLocationContextForTenant,
    subscribeToPosLocationContext
} from '../../../../../packages/web-core/src/features/pos/utils/posLocationContext.js';
import { useWorkflowMode } from '../../../../../packages/web-core/src/features/settings/WorkflowModeContext.jsx';
import UserManagementModal from '../../../../../packages/web-core/Components/users/UserManagementModal.jsx';
import {
    BackOfficeDataTable as DataTable,
    BackOfficeEmptyState as Empty,
    BackOfficeMetric as Metric,
    BackOfficeSectionCard as SectionCard,
    BackOfficeStatusPill as StatusPill
} from '../../../../../packages/web-core/src/components/backOffice/BackOfficePrimitives.jsx';
import MigratedBackOfficeModule from './MigratedBackOfficeModule.jsx';
import PosActivityAnalyticsPage from './PosActivityAnalyticsPage.jsx';
import BusinessAdminReceiptModal from './BusinessAdminReceiptModal.jsx';
import BusinessAdminAccountActions from './BusinessAdminAccountActions.jsx';
import ProcessingFeePolicyEditor from './ProcessingFeePolicyEditor.jsx';
import CanonicalBusinessNameEditor from './CanonicalBusinessNameEditor.jsx';
import StaffRolesPanel from './StaffRolesPanel.jsx';
import {
    BACKOFFICE_SECTION_META,
    buildBackOfficeOverviewPath,
    buildBackOfficeLocationsPath,
    buildBackOfficeModulePath,
    MERCHANT_BACKOFFICE_MODULE_META
} from './businessAdminManifest.js';
import {
    BUSINESS_ADMIN_SIDEBAR_GROUPS,
    buildBusinessAdminSidebarItemPath,
    getBusinessAdminSidebarActiveKey,
    getBusinessAdminWorkspaceTabs
} from './businessAdminNavigation.js';
import {
    getBusinessAdminWorkflowPageName,
    isBusinessAdminWorkflowSectionVisible
} from './businessAdminWorkflowVisibility.js';
import {
    BUSINESS_ADMIN_UI_VISIBILITY,
    isBusinessAdminDestinationAccessible,
    isBusinessAdminNavigationVisible
} from './businessAdminUiVisibility.js';
import { buildPosTerminalUrl } from '../../../../../packages/web-core/src/features/pos/utils/businessBackOfficeHandoff.js';
import {
    DATE_RANGE_PRESETS,
    formatDateRangeLabel,
    getDateRangeForPreset,
    getDefaultDateRangeForSection,
    getDefaultDateRangePreset,
    isHistoricalBusinessAdminSection
} from './businessAdminDateRange.js';
import './businessAdmin.css';

const MIGRATED_BACKOFFICE_MODULE_KEYS = new Set(Object.keys(MERCHANT_BACKOFFICE_MODULE_META));
const DGFY_BUSINESS_ADMIN_LOGO = resolveAppAssetUrl('/dgfy-horizontal_logo-removebg-preview.png');
const BUSINESS_ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY = 'dgfy.businessAdmin.sidebarCollapsed';
const BUSINESS_ADMIN_SESSION_REQUIRED_MESSAGE = 'Your session is missing or expired. Sign in to continue with an authorized manager account.';
const BUSINESS_ADMIN_COMPANY_SWITCHED_MESSAGE = 'The company changed in another window. Return to POS and open Back Office again for the selected company.';
const BUSINESS_ADMIN_ACCESS_DENIED_MESSAGE = 'Your account is authenticated but is not authorized to open Back Office.';
const BUSINESS_ADMIN_ORDERS_PAGE_SIZE = 20;
const BUSINESS_ADMIN_VOID_HISTORY_PAGE_SIZE = 20;
const BUSINESS_ADMIN_CASH_SUMMARY_PAGE_SIZE = 10;
const BUSINESS_ADMIN_CASH_SUMMARY_EXPORT_PAGE_SIZE = 100;
const BUSINESS_ADMIN_INVENTORY_PAGE_SIZE = 10;
const BUSINESS_ADMIN_OVERVIEW_PAGE_SIZE = 10;
const BUSINESS_ADMIN_RECEIPT_TYPE_OPTIONS = Object.freeze([
    { value: '', label: 'All receipts' },
    { value: 'sales', label: 'Sales receipts' },
    { value: 'refund', label: 'Refund receipts' },
    { value: 'voided', label: 'Voided receipts' }
]);

const INVENTORY_WORKFLOW_LINKS = Object.freeze([
    {
        moduleId: 'catalog',
        title: 'Item Editor',
        description: 'Items, categories, variants, pricing, branch stock, import/export, packaging, and labels.',
        icon: Package
    },
    {
        moduleId: 'stock-movements',
        title: 'Stock movements',
        description: 'Audited receipts, adjustments, transfers, history, export, and voids.',
        icon: RefreshCw
    },
    {
        moduleId: 'suppliers',
        title: 'Suppliers',
        description: 'Maintain supplier records and the items they cover.',
        icon: Store
    },
    {
        moduleId: 'purchase-orders',
        title: 'Purchase orders',
        description: 'Create, receive, archive, and review procurement orders.',
        icon: Receipt
    },
    {
        moduleId: 'recipes',
        title: 'Ingredients & recipes',
        description: 'Review compositions, recipe cost, units, and branch availability.',
        icon: ChefHat
    },
    {
        moduleId: 'job-orders',
        title: 'Production',
        description: 'Use the canonical job-order workflow when production is enabled.',
        icon: Utensils
    }
]);

const readBusinessAdminSidebarCollapsed = () => {
    if (typeof window === 'undefined') return false;
    try {
        return window.sessionStorage.getItem(BUSINESS_ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const money = (value) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2
}).format(Number(value) || 0);

const number = (value) => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Number(value) || 0);

const dateTime = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
};

const escapeCsvCell = (value) => {
    const normalized = value == null ? '' : String(value);
    return /[",\r\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
};

const buildCashSummaryCsv = (rows = []) => {
    const headers = ['POS', 'Cashier', 'Opening time', 'Closing time', 'Expected cash amount', 'Actual cash amount', 'Difference'];
    const values = rows.map((row) => [
        row.terminal_id || '',
        row.cashier_name || '',
        row.opened_at ? dateTime(row.opened_at) : '',
        row.closed_at ? dateTime(row.closed_at) : '',
        row.expected_cash_amount == null ? '' : Number(row.expected_cash_amount).toFixed(2),
        row.closing_cash_amount == null ? '' : Number(row.closing_cash_amount).toFixed(2),
        row.cash_variance_amount == null ? '' : Number(row.cash_variance_amount).toFixed(2)
    ]);
    return [headers, ...values].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
};

const downloadCsv = (filename, content) => {
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const humanize = (value) => String(value || '—').replace(/_/g, ' ');

const todayManilaDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date());

const expenseCategories = ['supplies', 'utilities', 'rent', 'payroll', 'transport', 'marketing', 'maintenance', 'other'];
const expensePaymentMethods = ['cash', 'bank_transfer', 'card', 'gcash', 'maya', 'other'];

const newExpenseForm = () => ({
    expense_date: todayManilaDate(),
    branch_id: '',
    category: 'supplies',
    description: '',
    amount: '',
    payment_method: 'cash',
    vendor_name: '',
    reference: '',
    notes: ''
});

const createExpenseIdempotencyKey = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const statusClass = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

const NOTIFICATION_FILTERS = [
    { key: 'all', label: 'All open' },
    { key: 'unread', label: 'Unread' },
    { key: 'critical', label: 'Critical' },
    { key: 'warning', label: 'Warnings' }
];

const notificationSeverity = (notification) => statusClass(notification?.severity || 'info') || 'info';
const notificationType = (notification) => notification?.type || notification?.alert_type || 'operational alert';
const notificationPriority = (notification) => {
    const severityRank = { critical: 0, warning: 1, info: 2 };
    const unreadRank = notification?.read_at ? 1 : 0;
    return (unreadRank * 10) + (severityRank[notificationSeverity(notification)] ?? 3);
};

const notificationSourceIcon = (sourceDomain) => {
    switch (String(sourceDomain || '').toLowerCase()) {
        case 'inventory': return Package;
        case 'pos': return Monitor;
        case 'payments': return Wallet;
        case 'storefront': return Store;
        case 'governance': return ShieldCheck;
        default: return Bell;
    }
};

const NotificationMetric = ({ icon: Icon, label, value, detail, tone = '' }) => (
    <div className={`business-admin-notification-metric${tone ? ` ${tone}` : ''}`}>
        <div className="business-admin-notification-metric-icon"><Icon size={17} /></div>
        <div className="business-admin-notification-metric-copy">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    </div>
);

// `href` mode is for real cross-origin navigation (e.g. OPIS → POS terminal links):
// react-router <Link> only performs client-side routing on this origin, so it can
// never leave OPIS. The dirty-guard contract (confirm, then onLeave) is identical
// in both modes; the external branch navigates via window.location.assign after it.
const GuardedLink = ({ to, href, isDirty = false, onLeave, children, ...props }) => {
    const externalHref = href || (typeof to === 'string' && /^(https?:)?\/\//.test(to) ? to : null);
    const handleClick = (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        if (shouldBlockSettingsNavigation(isDirty)) {
            const confirmed = typeof window === 'undefined'
                || typeof window.confirm !== 'function'
                || window.confirm('You have unsaved settings changes. Leave this page and discard them?');
            if (!confirmed) {
                event.preventDefault();
                return;
            }
        }
        onLeave?.();
        if (externalHref) {
            event.preventDefault();
            if (typeof window !== 'undefined') window.location.assign(externalHref);
        }
    };

    if (externalHref) {
        return <a {...props} href={externalHref} onClick={handleClick}>{children}</a>;
    }
    return <Link {...props} to={to} onClick={handleClick}>{children}</Link>;
};

const Loading = () => (
    <div className="business-admin-loading"><span className="business-admin-spinner" /> Loading Back Office data…</div>
);

const WorkspaceLoading = ({ label = 'Loading Back Office data…' }) => (
    <div className="business-admin-loading business-admin-workspace-loading" role="status" aria-live="polite">
        <span className="business-admin-spinner" aria-hidden="true" />
        <span>{label}</span>
    </div>
);

const useBusinessAdminPaginatedPanelTransition = ({ page, refreshing }) => {
    const recordRootRef = useRef(null);
    const renderedPageRef = useRef(null);
    const currentPage = Number(page) || 1;

    useEffect(() => {
        if (renderedPageRef.current === null) {
            renderedPageRef.current = currentPage;
            return undefined;
        }
        if (currentPage === renderedPageRef.current || refreshing) return undefined;

        let frameId = null;
        const scrollToPanelStart = () => {
            const recordRoot = recordRootRef.current;
            if (!recordRoot) return;
            recordRoot.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        };

        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            frameId = window.requestAnimationFrame(scrollToPanelStart);
        } else {
            scrollToPanelStart();
        }
        renderedPageRef.current = currentPage;
        return () => {
            if (frameId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(frameId);
            }
        };
    }, [currentPage, refreshing]);

    return recordRootRef;
};

const BlockedFeature = ({ icon: Icon = Lock, title, description, reason }) => (
    <div className="business-admin-feature">
        <Icon size={18} color="#159891" />
        <h3>{title}</h3>
        <p>{description}</p>
        {reason ? <p className="mt-2 text-[11px] font-semibold text-amber-700">Gate: {reason}</p> : null}
    </div>
);

const extractId = (row, keys) => {
    for (const key of keys) {
        if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
    }
    return null;
};

const buildQuery = ({ dateFrom, dateTo, branchId, search, itemId, receiptType }) => ({
    date_from: dateFrom,
    date_to: dateTo,
    ...(branchId ? { branch_id: branchId } : {}),
    ...(itemId ? { item_id: itemId } : {}),
    ...(receiptType ? { receipt_type: receiptType } : {}),
    ...(search ? { search } : {})
});

const buildTenantRevenueQuery = (params = {}) => ({
    ...(params.branch_id ? { branch_id: params.branch_id } : {}),
    ...(params.date_from ? { period_start: `${params.date_from}T00:00:00.000Z` } : {}),
    ...(params.date_to ? { period_end: `${params.date_to}T23:59:59.999Z` } : {})
});

const historicalEmptyMessage = (message, dateFrom, dateTo) => (
    `${message} Date range: ${formatDateRangeLabel(dateFrom, dateTo)}. Choose a wider date range to view older records.`
);

const formatOverviewDateLabel = (dateKey) => {
    const parsed = new Date(`${dateKey}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return dateKey;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed);
};

const formatOverviewHourLabel = (periodKey) => {
    const parsed = new Date(`${String(periodKey).replace(' ', 'T')}:00Z`);
    if (Number.isNaN(parsed.getTime())) return periodKey;
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true, timeZone: 'UTC' }).format(parsed);
};

const buildOverviewDateKeys = (dateFrom, dateTo) => {
    const start = new Date(`${dateFrom}T00:00:00Z`);
    const end = new Date(`${dateTo}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

    const keys = [];
    for (const cursor = new Date(start); cursor <= end && keys.length < 366; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        keys.push(cursor.toISOString().slice(0, 10));
    }
    return keys;
};

const buildOverviewHourKeys = (dateKey) => Array.from({ length: 24 }, (_, hour) => (
    `${dateKey} ${String(hour).padStart(2, '0')}:00`
));

const OVERVIEW_SALES_METRICS = [
    { key: 'gross_sales', label: 'Gross Sales', color: '#2563eb' },
    { key: 'refunds', label: 'Refunds', color: '#dc2626' },
    { key: 'discounts', label: 'Discounts', color: '#d97706' },
    { key: 'net_sales', label: 'Net Sales', color: '#159891' },
    { key: 'gross_profit', label: 'Gross Profit', color: '#7c3aed' }
];

const OverviewChartCard = ({ title, subtitle, action, children, className = '' }) => (
    <section className={`business-admin-card business-admin-overview-chart-card ${className}`.trim()}>
        <div className="business-admin-overview-chart-header">
            <div>
                <h2>{title}</h2>
                {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {action || null}
        </div>
        <div className="business-admin-overview-chart-body">{children}</div>
    </section>
);

const OverviewChartEmpty = ({ message }) => (
    <div className="business-admin-overview-chart-empty">{message}</div>
);

function OverviewWorkspace({ data, onOrderClick, locationsPath, ordersPath }) {
    const [salesMetric, setSalesMetric] = useState('gross_sales');
    const branches = Array.isArray(data?.branches) ? data.branches.slice(0, BUSINESS_ADMIN_OVERVIEW_PAGE_SIZE) : [];
    const registers = Array.isArray(data?.registers) ? data.registers.slice(0, BUSINESS_ADMIN_OVERVIEW_PAGE_SIZE) : [];
    const recentTransactions = Array.isArray(data?.recent_transactions) ? data.recent_transactions.slice(0, BUSINESS_ADMIN_OVERVIEW_PAGE_SIZE) : [];
    const paymentSummary = Array.isArray(data?.payment_summary) ? data.payment_summary : [];
    const dateKeys = buildOverviewDateKeys(data?.filters?.date_from, data?.filters?.date_to);
    const isSingleDate = Boolean(data?.filters?.date_from && data?.filters?.date_from === data?.filters?.date_to);
    const periodKeys = isSingleDate ? buildOverviewHourKeys(data.filters.date_from) : dateKeys;
    const trendByDate = new Map(
        (Array.isArray(data?.sales_trend) ? data.sales_trend : []).map((row) => [String(row?.period || '').slice(0, isSingleDate ? 16 : 10), row])
    );
    const salesTrend = (periodKeys.length ? periodKeys : [...trendByDate.keys()]).map((period) => ({
        period,
        label: isSingleDate ? formatOverviewHourLabel(period) : formatOverviewDateLabel(period),
        gross_sales: Number(trendByDate.get(period)?.gross_sales) || 0,
        refunds: Number(trendByDate.get(period)?.refunds) || 0,
        discounts: Number(trendByDate.get(period)?.discounts) || 0,
        net_sales: Number(trendByDate.get(period)?.net_sales) || 0,
        gross_profit: Number(trendByDate.get(period)?.gross_profit) || 0,
        vat: Number(trendByDate.get(period)?.vat) || 0,
        transaction_count: Number(trendByDate.get(period)?.transaction_count) || 0
    }));
    const overviewFinancialTotals = salesTrend.reduce((totals, row) => ({
        gross_sales: totals.gross_sales + row.gross_sales,
        refunds: totals.refunds + row.refunds,
        discounts: totals.discounts + row.discounts,
        net_sales: totals.net_sales + row.net_sales,
        gross_profit: totals.gross_profit + row.gross_profit,
        vat: totals.vat + row.vat
    }), { gross_sales: 0, refunds: 0, discounts: 0, net_sales: 0, gross_profit: 0, vat: 0 });
    const selectedSalesMetric = OVERVIEW_SALES_METRICS.find((metric) => metric.key === salesMetric) || OVERVIEW_SALES_METRICS[0];
    const salesChartSeries = salesMetric === 'all' ? OVERVIEW_SALES_METRICS : [selectedSalesMetric];
    const salesXAxisInterval = salesTrend.length > 12 ? Math.ceil(salesTrend.length / 8) - 1 : 0;

    const branchSales = branches.map((branch) => ({
        label: branch.name || `Branch ${branch.branch_id}`,
        sales: Number(branch.sales) || 0
    }));
    const paymentTotals = new Map();
    paymentSummary.forEach((row) => {
        const label = humanize(row.payment_type || 'other');
        paymentTotals.set(label, (paymentTotals.get(label) || 0) + (Number(row.amount) || 0));
    });
    const paymentMix = [...paymentTotals.entries()].map(([label, amount]) => ({ label, amount }));
    const registerStatusOrder = [
        ['Online', '#159891'],
        ['Offline', '#dc2626'],
        ['Not reported', '#94a3b8']
    ];
    const registerStatusCounts = new Map(registerStatusOrder.map(([label]) => [label, 0]));
    registers.forEach((register) => {
        const status = String(register.terminal_status || 'not_reported').toLowerCase();
        const label = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Not reported';
        registerStatusCounts.set(label, registerStatusCounts.get(label) + 1);
    });
    const registerHealth = registerStatusOrder.map(([label, fill]) => ({ label, count: registerStatusCounts.get(label), fill }));
    const recentOrderActivity = recentTransactions.map((transaction) => ({
        label: transaction.invoice_number || `#${transaction.transaction_id}`,
        amount: Number(transaction.total_amount) || 0,
        sourceRow: transaction
    }));

    return (
        <>
            <div className="business-admin-metric-grid business-admin-overview-metrics">
                <Metric label="Gross sales" value={money(overviewFinancialTotals.gross_sales)} hint="Selected date range" />
                <Metric label="Refunds" value={money(overviewFinancialTotals.refunds)} hint="Selected date range" />
                <Metric label="Discounts" value={money(overviewFinancialTotals.discounts)} hint="Selected date range" />
                <Metric label="Net sales" value={money(overviewFinancialTotals.net_sales)} hint="Selected date range" />
                <Metric label="Gross profit" value={money(overviewFinancialTotals.gross_profit)} hint="Selected date range" />
                <Metric label="VAT" value={money(overviewFinancialTotals.vat)} hint="Selected date range" />
            </div>
            <div className="business-admin-overview-chart-grid">
                <OverviewChartCard
                    title={salesMetric === 'all' ? 'Sales overview' : selectedSalesMetric.label}
                    action={(
                        <select
                            aria-label="Sales chart metric"
                            className="business-admin-overview-chart-control"
                            value={salesMetric}
                            onChange={(event) => setSalesMetric(event.target.value)}
                        >
                            {OVERVIEW_SALES_METRICS.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
                            <option value="all">All</option>
                        </select>
                    )}
                    className="business-admin-overview-sales-card"
                >
                    <div className="business-admin-overview-chart-plot" data-testid="business-admin-overview-sales-chart">
                        {salesTrend.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={salesTrend} margin={{ top: 12, right: 18, left: 0, bottom: 18 }}>
                                    <defs>
                                        <linearGradient id="businessAdminSalesTrendFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.04} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="label" stroke="#64748b" fontSize={11} minTickGap={24} interval={salesXAxisInterval} />
                                    <YAxis stroke="#64748b" fontSize={11} tickFormatter={(value) => money(value)} width={76} />
                                    <Tooltip labelFormatter={(label) => label} formatter={(value, name) => [money(value), name]} />
                                    {salesMetric === 'all' ? <Legend /> : null}
                                    {salesChartSeries.map((series) => (
                                        <Area
                                            key={series.key}
                                            type="monotone"
                                            dataKey={series.key}
                                            name={series.label}
                                            stroke={series.color}
                                            fill={series.key === 'gross_sales' && salesMetric !== 'all' ? 'url(#businessAdminSalesTrendFill)' : series.color}
                                            fillOpacity={salesMetric === 'all' ? 0.06 : 0.18}
                                            strokeWidth={2.5}
                                            dot={{ r: 3, fill: '#fff', stroke: series.color, strokeWidth: 2 }}
                                            activeDot={{ r: 5 }}
                                        />
                                    ))}
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : <OverviewChartEmpty message="No sales data is available for this date range." />}
                    </div>
                </OverviewChartCard>

                <OverviewChartCard
                    title="Branch sales"
                    subtitle="Gross sales by visible branch"
                    action={locationsPath ? <GuardedLink to={locationsPath} className="business-admin-link">Manage locations</GuardedLink> : null}
                >
                    <div className="business-admin-overview-chart-plot" data-testid="business-admin-overview-branch-chart">
                        {branchSales.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={branchSales} margin={{ top: 12, right: 18, left: 0, bottom: 28 }}>
                                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} angle={-20} textAnchor="end" interval={0} height={52} />
                                    <YAxis stroke="#64748b" fontSize={11} tickFormatter={(value) => money(value)} width={76} />
                                    <Tooltip formatter={(value) => [money(value), 'Gross sales']} />
                                    <Bar dataKey="sales" fill="#2563eb" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <OverviewChartEmpty message="No branch sales data is available." />}
                    </div>
                </OverviewChartCard>

                <OverviewChartCard title="Payment mix" subtitle="Recorded sales by payment method">
                    <div className="business-admin-overview-chart-plot" data-testid="business-admin-overview-payment-chart">
                        {paymentMix.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={paymentMix} margin={{ top: 12, right: 18, left: 0, bottom: 28 }}>
                                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} angle={-20} textAnchor="end" interval={0} height={52} />
                                    <YAxis stroke="#64748b" fontSize={11} tickFormatter={(value) => money(value)} width={76} />
                                    <Tooltip formatter={(value) => [money(value), 'Amount']} />
                                    <Bar dataKey="amount" fill="#159891" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <OverviewChartEmpty message="No payment data is available." />}
                    </div>
                </OverviewChartCard>

                <OverviewChartCard title="Register health" subtitle="Current terminal heartbeat status" action={locationsPath ? <GuardedLink to={locationsPath} className="business-admin-link">View registers</GuardedLink> : null}>
                    <div className="business-admin-overview-chart-plot" data-testid="business-admin-overview-register-chart">
                        {registers.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={registerHealth} margin={{ top: 12, right: 18, left: 0, bottom: 28 }}>
                                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} interval={0} />
                                    <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} />
                                    <Tooltip formatter={(value) => [number(value), 'Registers']} />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                        {registerHealth.map((entry) => <Cell key={entry.label} fill={entry.fill} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <OverviewChartEmpty message="No registers are configured." />}
                    </div>
                </OverviewChartCard>

                <OverviewChartCard title="Recent order activity" subtitle="Latest completed and voided orders" action={ordersPath ? <GuardedLink to={ordersPath} className="business-admin-link">View orders</GuardedLink> : null}>
                    <div className="business-admin-overview-chart-plot" data-testid="business-admin-overview-orders-chart">
                        {recentOrderActivity.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={recentOrderActivity}
                                    margin={{ top: 12, right: 18, left: 0, bottom: 34 }}
                                    onClick={(state) => onOrderClick?.(state?.activePayload?.[0]?.payload?.sourceRow)}
                                >
                                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="label" stroke="#64748b" fontSize={9} angle={-28} textAnchor="end" interval={0} height={58} />
                                    <YAxis stroke="#64748b" fontSize={11} tickFormatter={(value) => money(value)} width={76} />
                                    <Tooltip formatter={(value) => [money(value), 'Order total']} />
                                    <Bar dataKey="amount" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <OverviewChartEmpty message="No completed or voided orders in this range." />}
                    </div>
                </OverviewChartCard>
            </div>
        </>
    );
}

const BranchSummaryMetric = ({ icon: Icon, label, value, detail }) => (
    <div className="business-admin-card business-admin-branches-metric">
        <div className="business-admin-branches-metric-icon"><Icon size={18} /></div>
        <div className="business-admin-branches-metric-copy">
            <div className="business-admin-branches-metric-label">{label}</div>
            <div className="business-admin-branches-metric-value">{value}</div>
            <div className="business-admin-branches-metric-detail">{detail}</div>
        </div>
    </div>
);

const LocationsRefreshSurface = ({ children, refreshing = false, refreshError = '', label = 'Updating location data…' }) => (
    <div
        className={`business-admin-locations-results ${refreshing ? 'is-refreshing' : ''}`}
        data-testid="business-admin-locations-results"
        aria-busy={refreshing ? 'true' : 'false'}
    >
        <div className="business-admin-locations-results-content">{children}</div>
        {refreshing ? (
            <div className="business-admin-locations-refreshing" role="status" aria-live="polite">
                <span className="business-admin-spinner" aria-hidden="true" /> {label}
            </div>
        ) : null}
        {refreshError ? (
            <div className="business-admin-alert error business-admin-locations-panel-error" role="alert">
                <AlertTriangle size={17} />
                <div><strong>Location data could not be refreshed.</strong><div>{refreshError}</div></div>
            </div>
        ) : null}
    </div>
);

function BranchWorkspace({ data, onManageBranches, canViewBranchSettings = false, refreshing = false, refreshError = '' }) {
    const branches = Array.isArray(data?.branches) ? data.branches : [];
    const totals = branches.reduce((summary, branch) => ({
        sales: summary.sales + (Number(branch.sales) || 0),
        cashiers: summary.cashiers + (Number(branch.active_cashiers) || 0),
        registers: summary.registers + (Number(branch.active_registers) || 0)
    }), { sales: 0, cashiers: 0, registers: 0 });

    return (
        <LocationsRefreshSurface refreshing={refreshing} refreshError={refreshError} label="Updating branch metrics…">
            <div className="business-admin-branches-workspace">
                <div className="business-admin-branches-summary" aria-label="Branch summary">
                    <BranchSummaryMetric icon={Building2} label="Visible branches" value={number(branches.length)} detail="Active locations in scope" />
                    <BranchSummaryMetric icon={BarChart3} label="Sales in range" value={money(totals.sales)} detail="Across visible locations" />
                    <BranchSummaryMetric icon={Users} label="Active cashiers" value={number(totals.cashiers)} detail="Open POS shifts" />
                    <BranchSummaryMetric icon={Monitor} label="Active registers" value={number(totals.registers)} detail="Registered terminals" />
                </div>

                <SectionCard
                    className="business-admin-branches-primary-card"
                    title="Active branches"
                    subtitle="Branch-level operating metrics for the selected period"
                    action={(
                        <div className="business-admin-branches-header-actions">
                            <span className="business-admin-branches-count">{number(branches.length)} visible</span>
                            {canViewBranchSettings ? (
                                <button type="button" className="business-admin-button primary" onClick={onManageBranches}>
                                    <Settings size={14} aria-hidden="true" /> Manage branches
                                </button>
                            ) : null}
                        </div>
                    )}
                >
                    {branches.length ? (
                        <div className="business-admin-branch-grid">
                            {branches.map((branch) => (
                                <article className="business-admin-branch-card" key={branch.branch_id}>
                                    <div className="business-admin-branch-card-heading">
                                        <div className="business-admin-branch-icon"><Building2 size={18} /></div>
                                        <div className="business-admin-branch-name-block">
                                            <strong>{branch.name}</strong>
                                            <span className="business-admin-branch-status"><span className="business-admin-branch-status-dot" /> Active location</span>
                                        </div>
                                    </div>
                                    <div className="business-admin-branch-card-metrics">
                                        <div><span>Sales</span><strong>{money(branch.sales)}</strong></div>
                                        <div><span>Transactions</span><strong>{number(branch.transaction_count)}</strong></div>
                                        <div><span>Cashiers</span><strong>{number(branch.active_cashiers)}</strong></div>
                                        <div><span>Registers</span><strong>{number(branch.active_registers)}</strong></div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : <Empty message="No active branches are available in your scope." />}
                </SectionCard>
            </div>
        </LocationsRefreshSurface>
    );
}

function RegistersWorkspace({ data, onManageRegisters, canViewRegisterSettings = false, refreshing = false, refreshError = '' }) {
    return (
        <LocationsRefreshSurface refreshing={refreshing} refreshError={refreshError} label="Updating register data…">
            <SectionCard
                title="Register health"
                subtitle="Terminal registry is authoritative; heartbeat is optional telemetry"
                action={canViewRegisterSettings ? (
                    <button type="button" className="business-admin-button primary" onClick={onManageRegisters}>
                        <Settings size={14} aria-hidden="true" /> Manage registers
                    </button>
                ) : null}
            >
                <DataTable
                    rows={data?.registers || []}
                    rowKey={(row) => row.terminal_id}
                    emptyMessage="No register registry entries match this scope."
                    columns={[
                        { key: 'label', label: 'Register', render: (row) => <strong>{row.label || row.terminal_id}</strong> },
                        { key: 'branch_name', label: 'Branch' },
                        { key: 'terminal_status', label: 'Status', render: (row) => <StatusPill value={row.terminal_status} /> },
                        { key: 'sync_state', label: 'Sync', render: (row) => <StatusPill value={row.sync_state} /> },
                        { key: 'printer_status', label: 'Printer', render: (row) => <StatusPill value={row.printer_status} /> },
                        { key: 'has_open_shift', label: 'Shift', render: (row) => row.has_open_shift ? <StatusPill value="open" /> : <StatusPill value="closed" /> }
                    ]}
                />
            </SectionCard>
        </LocationsRefreshSurface>
    );
}

function LocationsWorkspace({
    data,
    activeView = 'branches',
    onViewChange,
    onManageBranches,
    onManageRegisters,
    canViewBranchSettings = false,
    canViewRegisterSettings = false,
    refreshing = false,
    refreshError = ''
}) {
    const normalizedView = activeView === 'registers' ? 'registers' : 'branches';
    return (
        <div className="business-admin-locations-workspace">
            <div className="business-admin-locations-tabs" role="tablist" aria-label="Locations sections">
                <button
                    type="button"
                    role="tab"
                    aria-selected={normalizedView === 'branches'}
                    className={`business-admin-locations-tab ${normalizedView === 'branches' ? 'active' : ''}`}
                    onClick={() => onViewChange?.('branches')}
                >
                    <Building2 size={15} aria-hidden="true" /> Branches
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={normalizedView === 'registers'}
                    className={`business-admin-locations-tab ${normalizedView === 'registers' ? 'active' : ''}`}
                    onClick={() => onViewChange?.('registers')}
                >
                    <Monitor size={15} aria-hidden="true" /> Registers
                </button>
            </div>
            {normalizedView === 'registers'
                ? <RegistersWorkspace data={data} onManageRegisters={onManageRegisters} canViewRegisterSettings={canViewRegisterSettings} refreshing={refreshing} refreshError={refreshError} />
                : <BranchWorkspace data={data} onManageBranches={onManageBranches} canViewBranchSettings={canViewBranchSettings} refreshing={refreshing} refreshError={refreshError} />}
        </div>
    );
}

const OrderHistoryCard = ({ row, onSelect }) => {
    const label = row.invoice_number || `Transaction #${row.transaction_id}`;
    const fulfillmentStatus = row.fulfillment_status || row.transaction_status;
    const activate = () => onSelect(row);

    return (
        <article
            className="business-admin-order-card"
            role="button"
            tabIndex={0}
            aria-label={`Open order ${label}`}
            onClick={activate}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activate();
                }
            }}
        >
            <div className="business-admin-order-card-heading">
                <div className="business-admin-order-card-identity">
                    <div className="business-admin-order-card-icon"><ShoppingBag size={16} /></div>
                    <div className="business-admin-order-card-copy">
                        <strong>{label}</strong>
                        <span>{dateTime(row.created_at)} · {row.branch_name || 'Branch not recorded'}</span>
                    </div>
                </div>
                <StatusPill value={fulfillmentStatus} />
            </div>
            <div className="business-admin-order-card-facts">
                <div><span>Branch</span><strong>{row.branch_name || '—'}</strong></div>
                <div><span>Source</span><strong>{humanize(row.source)}</strong></div>
                <div><span>Fulfillment</span><strong><StatusPill value={fulfillmentStatus} /></strong></div>
                <div><span>Payment</span><strong><StatusPill value={row.payment_status} /></strong></div>
                <div><span>Total</span><strong>{money(row.total_amount)}</strong></div>
            </div>
        </article>
    );
};

const OrdersPagination = ({ page, totalPages, total, onPageChange, refreshing = false }) => {
    const normalizedTotal = Math.max(Number(total) || 0, 0);
    const normalizedTotalPages = Math.max(Number(totalPages) || 1, 1);
    const currentPage = Math.min(Math.max(Number(page) || 1, 1), normalizedTotalPages);
    if (!normalizedTotal) return null;
    const start = ((currentPage - 1) * BUSINESS_ADMIN_ORDERS_PAGE_SIZE) + 1;
    const end = Math.min(currentPage * BUSINESS_ADMIN_ORDERS_PAGE_SIZE, normalizedTotal);
    const invoiceLabel = normalizedTotal === 1 ? 'invoice' : 'invoices';

    return (
        <nav className="business-admin-orders-pagination" aria-label="Orders pagination">
            <div className="business-admin-orders-pagination-summary">
                <strong>{number(start)}–{number(end)}</strong>
                <span>of {number(normalizedTotal)} {invoiceLabel}</span>
            </div>
            <div className="business-admin-orders-pagination-actions">
                <button type="button" className="business-admin-button" onClick={() => onPageChange(currentPage - 1)} disabled={refreshing || currentPage <= 1} aria-label="Previous orders page">
                    <ChevronLeft size={14} /> Previous
                </button>
                <span className="business-admin-orders-pagination-page">Page {number(currentPage)} of {number(normalizedTotalPages)}</span>
                <button type="button" className="business-admin-button" onClick={() => onPageChange(currentPage + 1)} disabled={refreshing || currentPage >= normalizedTotalPages} aria-label="Next orders page">
                    Next <ChevronRight size={14} />
                </button>
            </div>
        </nav>
    );
};

function OrdersWorkspace({ data, onSelect, selected, onClose, dateFrom, dateTo, onPageChange, page, refreshing = false, refreshError = '' }) {
    const orders = Array.isArray(data?.orders) ? data.orders.slice(0, BUSINESS_ADMIN_ORDERS_PAGE_SIZE) : [];
    const pagination = data?.pagination || {};
    const total = Number(pagination.total || 0);
    const totalPages = Math.max(Number(pagination.total_pages) || Math.ceil(total / BUSINESS_ADMIN_ORDERS_PAGE_SIZE), 1);
    const ordersRecordsRef = useBusinessAdminPaginatedPanelTransition({ page: pagination.page || page, refreshing });
    const emptyMessage = historicalEmptyMessage('No orders match the selected filters.', dateFrom, dateTo);
    const columns = [
        { key: 'invoice_number', label: 'Invoice', render: (row) => <button className="business-admin-link" type="button">{row.invoice_number || `#${row.transaction_id}`}</button> },
        { key: 'created_at', label: 'Created', render: (row) => dateTime(row.created_at) },
        { key: 'branch_name', label: 'Branch' },
        { key: 'source', label: 'Source', render: (row) => humanize(row.source) },
        { key: 'fulfillment_status', label: 'Fulfillment', render: (row) => <StatusPill value={row.fulfillment_status || row.transaction_status} /> },
        { key: 'payment_status', label: 'Payment', render: (row) => <StatusPill value={row.payment_status} /> },
        { key: 'total_amount', label: 'Total', render: (row) => money(row.total_amount) }
    ];

    return (
        <div className="business-admin-orders-workspace">
            <div className="business-admin-orders-contract" role="note">
                <ShieldCheck size={17} />
                <div className="business-admin-orders-contract-copy">
                    <strong>Read-only order history</strong>
                    <span>Completed, voided, and storefront orders are shown from canonical POS records. Select an order to view the original POS receipt in a read-only popup.</span>
                </div>
            </div>
            <SectionCard
                className="business-admin-orders-section-card"
                title="Order center"
                subtitle={`${number(data?.pagination?.total)} orders in scope`}
                action={<span className="business-admin-orders-count">{number(orders.length)} visible</span>}
            >
                <div
                    ref={ordersRecordsRef}
                    className={`business-admin-orders-results ${refreshing ? 'is-refreshing' : ''}`}
                    data-testid="business-admin-orders-results"
                    aria-busy={refreshing ? 'true' : 'false'}
                >
                    <div className="business-admin-orders-results-content">
                        {orders.length ? (
                            <>
                                <div className="business-admin-orders-table-view">
                                    <DataTable rows={orders} rowKey={(row) => row.transaction_id} onRowClick={onSelect} columns={columns} />
                                </div>
                                <div className="business-admin-orders-mobile-view">
                                    <div className="business-admin-orders-card-list">
                                        {orders.map((row) => <OrderHistoryCard key={row.transaction_id} row={row} onSelect={onSelect} />)}
                                    </div>
                                </div>
                            </>
                        ) : <Empty message={emptyMessage} />}
                    </div>
                    {refreshing ? (
                        <div className="business-admin-orders-refreshing" role="status" aria-live="polite">
                            <span className="business-admin-spinner" aria-hidden="true" /> Updating order history…
                        </div>
                    ) : null}
                </div>
                {refreshError ? (
                    <div className="business-admin-alert error business-admin-orders-panel-error">
                        <AlertTriangle size={17} />
                        <div><strong>Order history could not be refreshed.</strong><div>{refreshError}</div></div>
                    </div>
                ) : null}
                <OrdersPagination page={pagination.page || page} totalPages={totalPages} total={total} onPageChange={onPageChange} refreshing={refreshing} />
            </SectionCard>
            {selected ? <BusinessAdminReceiptModal order={selected} onClose={onClose} /> : null}
        </div>
    );
}

function CustomersWorkspace({ data, onSelect, selected, onClose, onOrderSelect, selectedOrder, onOrderClose, onCreate, creating = false }) {
    const [isAdding, setIsAdding] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', phone: '', address_line: '' });
    const [formError, setFormError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const closeForm = () => {
        if (creating) return;
        setIsAdding(false);
        setFormError('');
        setForm({ name: '', email: '', phone: '', address_line: '' });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormError('');
        setSuccessMessage('');
        try {
            const result = await onCreate(form);
            setSuccessMessage(result?.message || 'Customer profile created.');
            closeForm();
        } catch (error) {
            setFormError(getBusinessAdminErrorMessage(error));
        }
    };

    return (
        <>
            <div className="business-admin-customer-contract" role="note">
                <UserRound size={17} aria-hidden="true" />
                <div className="business-admin-customer-contract-copy">
                    <strong>Tenant-scoped customer workspace</strong>
                    <span>Customer details and purchase history are limited to this business and the selected branch/date scope. DGFY global identity is not inferred from guest contact snapshots.</span>
                </div>
            </div>
            <div className="business-admin-customer-loyalty-contract" role="note">
                <ShieldCheck size={17} aria-hidden="true" />
                <div className="business-admin-customer-contract-copy">
                    <strong>Loyalty is read-only here</strong>
                    <span>Earning, redemption, refunds, adjustments, ownership, and accounting treatment are not a merchant Back Office write contract yet. No loyalty mutation controls are exposed.</span>
                </div>
            </div>
            {successMessage ? <div className="business-admin-alert success" role="status"><CheckCircle2 size={17} /><div>{successMessage}</div></div> : null}
            {isAdding ? (
                <section className="business-admin-card business-admin-customer-form-card" aria-labelledby="business-admin-add-customer-title">
                    <div className="business-admin-card-header">
                        <div>
                            <div id="business-admin-add-customer-title" className="business-admin-card-title">Add customer</div>
                            <div className="business-admin-card-subtitle">Create a tenant-scoped customer profile for POS and customer history.</div>
                        </div>
                        <button type="button" className="business-admin-button" onClick={closeForm} disabled={creating}><X size={14} /> Cancel</button>
                    </div>
                    <div className="business-admin-card-body">
                        <form className="business-admin-customer-form" onSubmit={handleSubmit}>
                            <div className="business-admin-field">
                                <label htmlFor="business-admin-customer-name">Name</label>
                                <input id="business-admin-customer-name" type="text" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={255} required autoFocus />
                            </div>
                            <div className="business-admin-field">
                                <label htmlFor="business-admin-customer-email">Email</label>
                                <input id="business-admin-customer-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} maxLength={255} required />
                            </div>
                            <div className="business-admin-field">
                                <label htmlFor="business-admin-customer-phone">Phone <span className="business-admin-muted">(optional)</span></label>
                                <input id="business-admin-customer-phone" type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} maxLength={50} />
                            </div>
                            <div className="business-admin-field business-admin-customer-address-field">
                                <label htmlFor="business-admin-customer-address">Full address <span className="business-admin-muted">(optional)</span></label>
                                <textarea id="business-admin-customer-address" value={form.address_line} onChange={(event) => setForm((current) => ({ ...current, address_line: event.target.value }))} maxLength={4000} rows={2} placeholder="House/building, street, barangay, city, province, postal code" />
                            </div>
                            <div className="business-admin-customer-form-actions">
                                <button type="submit" className="business-admin-button primary" disabled={creating}>{creating ? 'Saving…' : 'Save customer'}</button>
                            </div>
                        </form>
                        {formError ? <div className="business-admin-alert error mb-0" role="alert"><AlertTriangle size={17} /><div>{formError}</div></div> : null}
                    </div>
                </section>
            ) : null}
            <SectionCard
                title="Customer analytics"
                subtitle={`${number(data?.pagination?.total)} customer profiles`}
                action={<button type="button" className="business-admin-button primary" onClick={() => { setSuccessMessage(''); setFormError(''); setIsAdding(true); }} disabled={creating}><Plus size={14} /> Add customer</button>}
            >
                <div className="business-admin-customer-table">
                    <DataTable
                        rows={data?.rows || []}
                        rowKey={(row) => row.profile_ref}
                        onRowClick={onSelect}
                        emptyMessage="No customer activity matches the selected period."
                        columns={[
                            { key: 'name', label: 'Full name', render: (row) => <button className="business-admin-link" type="button">{row.name}</button> },
                            { key: 'address_line', label: 'Full address', render: (row) => <span className="business-admin-customer-address" title={row.address_line || ''}>{row.address_line || 'No address recorded'}</span> },
                            { key: 'phone', label: 'Phone', render: (row) => <span className="business-admin-customer-phone">{row.phone || 'No phone recorded'}</span> },
                            { key: 'identity_source', label: 'Identity source', render: (row) => humanize(row.identity_source) },
                            { key: 'visit_count', label: 'Visits', render: (row) => number(row.visit_count) },
                            { key: 'total_spend', label: 'Total spend', render: (row) => money(row.total_spend) },
                            { key: 'average_order', label: 'Average order', render: (row) => money(row.average_order) },
                            { key: 'last_purchase_at', label: 'Last purchase', render: (row) => dateTime(row.last_purchase_at) }
                        ]}
                    />
                </div>
            </SectionCard>
            {selected ? <CustomerDetailPanel customer={selected} onClose={onClose} onOrderSelect={onOrderSelect} /> : null}
            {selectedOrder ? <BusinessAdminReceiptModal order={selectedOrder} onClose={onOrderClose} /> : null}
        </>
    );
}

function CustomerDetailPanel({ customer, onClose, onOrderSelect }) {
    return (
        <div className="business-admin-detail-panel">
            <div className="flex items-start justify-between gap-3">
                <div><div className="business-admin-kicker">Customer profile</div><h2 className="mt-1 text-lg font-black text-[#173e58]">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{customer.email || 'No email recorded'} · {humanize(customer.identity_source)}</p></div>
                <button type="button" className="business-admin-button" onClick={onClose}>Close</button>
            </div>
            <div className="business-admin-customer-detail-contract" role="note">
                <strong>Read-only tenant history</strong>
                <span>This profile uses the selected business scope. Loyalty earning, redemption, refunds, and adjustments are not editable from this screen.</span>
            </div>
            <div className="business-admin-customer-contact-grid">
                <div><div className="business-admin-kicker">Full name</div><div className="business-admin-customer-contact-value">{customer.name || 'Unnamed customer'}</div></div>
                <div><div className="business-admin-kicker">Phone</div><div className="business-admin-customer-contact-value">{customer.phone || 'No phone recorded'}</div></div>
                <div className="business-admin-customer-contact-address"><div className="business-admin-kicker">Full address</div><div className="business-admin-customer-contact-value">{customer.address_line || 'No address recorded'}</div></div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3"><div><div className="business-admin-kicker">Visits</div><div className="mt-1 text-sm font-black text-slate-800">{number(customer.visit_count)}</div></div><div><div className="business-admin-kicker">Spend</div><div className="mt-1 text-sm font-black text-slate-800">{money(customer.total_spend)}</div></div><div><div className="business-admin-kicker">Frequency</div><div className="mt-1 text-sm text-slate-700">{customer.purchase_frequency_days == null ? 'Not enough history' : `${number(customer.purchase_frequency_days)} days`}</div></div></div>
            {(customer.favorite_products || []).length ? <div className="mt-4"><div className="business-admin-kicker mb-1">Favorite products</div><DataTable rows={customer.favorite_products} columns={[{ key: 'item_name', label: 'Item' }, { key: 'quantity', label: 'Quantity', render: (row) => number(row.quantity) }, { key: 'net_spend', label: 'Spend', render: (row) => money(row.net_spend) }]} /></div> : null}
            {(customer.orders || []).length ? <div className="mt-4"><div className="business-admin-kicker mb-1">Recent transactions</div><p className="mb-2 text-xs text-slate-500">Select a transaction to open the original POS receipt popup.</p><DataTable rows={customer.orders} rowKey={(row) => row.transaction_id} onRowClick={onOrderSelect} columns={[{ key: 'invoice_number', label: 'Invoice' }, { key: 'created_at', label: 'When', render: (row) => dateTime(row.created_at) }, { key: 'source', label: 'Source', render: (row) => humanize(row.source) }, { key: 'payment_type', label: 'Payment', render: (row) => humanize(row.payment_type) }, { key: 'total_amount', label: 'Total', render: (row) => money(row.total_amount) }]} /></div> : null}
        </div>
    );
}

const InventorySummaryMetric = ({ icon: Icon, label, value, detail, tone = '' }) => (
    <div className={`business-admin-card business-admin-inventory-metric ${tone}`}>
        <div className="business-admin-inventory-metric-icon"><Icon size={18} /></div>
        <div className="business-admin-inventory-metric-copy">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    </div>
);

const InventoryValuationCard = ({ row }) => (
    <article className="business-admin-inventory-record">
        <div className="business-admin-inventory-record-heading">
            <div className="business-admin-inventory-record-identity">
                <div className="business-admin-inventory-record-icon"><Building2 size={16} /></div>
                <div className="business-admin-inventory-record-copy">
                    <strong>{row.location_name || 'Unnamed branch'}</strong>
                    <span>Branch valuation</span>
                </div>
            </div>
            <span className="business-admin-inventory-record-tag">Read-only</span>
        </div>
        <div className="business-admin-inventory-record-facts">
            <div><span>Available</span><strong>{number(row.available_qty)}</strong></div>
            <div><span>Value</span><strong>{row.inventory_value == null ? 'Hidden' : money(row.inventory_value)}</strong></div>
            <div><span>FIFO drift</span><strong>{number(row.drift_item_count)}</strong></div>
        </div>
    </article>
);

const InventoryLowStockCard = ({ row }) => (
    <article className="business-admin-inventory-record low-stock">
        <div className="business-admin-inventory-record-heading">
            <div className="business-admin-inventory-record-identity">
                <div className="business-admin-inventory-record-icon"><Package size={16} /></div>
                <div className="business-admin-inventory-record-copy">
                    <strong>{row.item || 'Unnamed item'}</strong>
                    <span>{row.branch || 'Unassigned branch'}</span>
                </div>
            </div>
            <span className={`business-admin-inventory-record-tag ${row.stock_status === 'out_of_stock' ? 'critical' : 'warning'}`}>
                {row.stock_status === 'out_of_stock' ? 'Out of stock' : 'Below threshold'}
            </span>
        </div>
        <div className="business-admin-inventory-record-facts">
            <div><span>On hand</span><strong>{number(row.quantity_on_hand)}</strong></div>
            <div><span>Threshold</span><strong>{number(row.min_threshold)}</strong></div>
            <div><span>Shortage</span><strong>{number(row.shortage_quantity)}</strong></div>
        </div>
    </article>
);

const InventoryPagination = ({ pagination = {}, onPageChange, refreshing = false }) => {
    const total = Math.max(Number(pagination.total) || 0, 0);
    const totalPages = Math.max(Number(pagination.total_pages) || Math.ceil(total / BUSINESS_ADMIN_INVENTORY_PAGE_SIZE), 1);
    const page = Math.min(Math.max(Number(pagination.page) || 1, 1), totalPages);
    if (!total) return null;
    const start = ((page - 1) * BUSINESS_ADMIN_INVENTORY_PAGE_SIZE) + 1;
    const end = Math.min(page * BUSINESS_ADMIN_INVENTORY_PAGE_SIZE, total);

    return (
        <nav className="business-admin-inventory-pagination" aria-label="Stock-health pagination">
            <div className="business-admin-inventory-pagination-summary">
                <strong>{number(start)}–{number(end)}</strong>
                <span>of {number(total)} items</span>
            </div>
            <div className="business-admin-inventory-pagination-actions">
                <button type="button" className="business-admin-button" onClick={() => onPageChange(page - 1)} disabled={refreshing || page <= 1} aria-label="Previous stock-health page">
                    <ChevronLeft size={14} /> Previous
                </button>
                <span className="business-admin-inventory-pagination-page">Page {number(page)} of {number(totalPages)}</span>
                <button type="button" className="business-admin-button" onClick={() => onPageChange(page + 1)} disabled={refreshing || page >= totalPages} aria-label="Next stock-health page">
                    Next <ChevronRight size={14} />
                </button>
            </div>
        </nav>
    );
};

const InventoryWorkflowLink = ({ rootPath, moduleId, title, description, icon: Icon, settingsDirty = false, onLeaveSettings }) => (
    <GuardedLink
        to={buildBackOfficeModulePath(rootPath, moduleId)}
        className="business-admin-inventory-workflow-link"
        isDirty={settingsDirty}
        onLeave={onLeaveSettings}
        aria-label={`Open ${title}`}
    >
        <span className="business-admin-inventory-workflow-icon"><Icon size={16} aria-hidden="true" /></span>
        <span className="business-admin-inventory-workflow-copy">
            <strong>{title}</strong>
            <span>{description}</span>
        </span>
        <ExternalLink className="business-admin-inventory-workflow-arrow" size={14} aria-hidden="true" />
    </GuardedLink>
);

function InventoryWorkspace({ data, onPageChange, refreshing = false, rootPath = '/', settingsDirty = false, onLeaveSettings }) {
    const valuation = data?.valuation?.valuation || data?.valuation || {};
    const locations = Array.isArray(valuation.locations) ? valuation.locations : [];
    const lowStock = Array.isArray(data?.lowStock?.rows) ? data.lowStock.rows.slice(0, BUSINESS_ADMIN_INVENTORY_PAGE_SIZE) : [];
    const costHidden = data?.valuation?.meta?.cost_visibility === false;
    const lowStockPagination = data?.lowStock?.pagination || { page: 1, total: lowStock.length };
    const lowStockTotal = lowStockPagination.total ?? lowStock.length;
    const fifoDriftTotal = locations.reduce((total, row) => total + (Number(row.drift_item_count) || 0), 0);
    const valuationColumns = [
        { key: 'location_name', label: 'Branch', render: (row) => <strong>{row.location_name}</strong> },
        { key: 'available_qty', label: 'Available', render: (row) => number(row.available_qty) },
        { key: 'inventory_value', label: 'Value', render: (row) => row.inventory_value == null ? 'Hidden' : money(row.inventory_value) },
        { key: 'drift_item_count', label: 'FIFO drift', render: (row) => number(row.drift_item_count) }
    ];
    const lowStockColumns = [
        { key: 'item', label: 'Item', render: (row) => <strong>{row.item}</strong> },
        { key: 'branch', label: 'Branch' },
        { key: 'quantity_on_hand', label: 'On hand', render: (row) => number(row.quantity_on_hand) },
        { key: 'min_threshold', label: 'Threshold', render: (row) => number(row.min_threshold) },
        { key: 'shortage_quantity', label: 'Shortage', render: (row) => number(row.shortage_quantity) }
    ];

    return (
        <div className="business-admin-inventory-workspace" data-testid="business-admin-inventory-workspace">
            <div className="business-admin-inventory-summary" aria-label="Inventory summary">
                <InventorySummaryMetric icon={Package} label="Available quantity" value={number(valuation.weighted_total_available_qty)} detail="FIFO or ledger scoped" />
                <InventorySummaryMetric icon={Wallet} label="Inventory value" value={costHidden ? 'Hidden' : money(valuation.weighted_total_inventory_value)} detail={costHidden ? 'Cost permission required' : 'Weighted FIFO value'} tone={costHidden ? 'muted' : 'teal'} />
                <InventorySummaryMetric icon={AlertTriangle} label="Stock attention" value={number(lowStockTotal)} detail="Low or out of stock" tone={lowStockTotal ? 'warning' : 'teal'} />
                <InventorySummaryMetric icon={RefreshCw} label="FIFO drift" value={number(fifoDriftTotal)} detail="Items needing review" tone={fifoDriftTotal ? 'critical' : 'teal'} />
            </div>

            <div className="business-admin-inventory-context">
                <Database size={16} />
                <div><strong>Read-only inventory view</strong><span>Use Item Editor and Stock movements for inventory changes.</span></div>
            </div>

            <SectionCard
                className="business-admin-inventory-workflows"
                title="Inventory workflows"
                subtitle="One entry point per canonical workflow; commands remain with their existing owner."
            >
                <div className="business-admin-inventory-workflow-grid">
                    {INVENTORY_WORKFLOW_LINKS.map((workflow) => (
                        <InventoryWorkflowLink
                            key={workflow.moduleId}
                            rootPath={rootPath}
                            {...workflow}
                            settingsDirty={settingsDirty}
                            onLeaveSettings={onLeaveSettings}
                        />
                    ))}
                </div>
                <div className="business-admin-inventory-follow-up" role="note">
                    <AlertTriangle size={15} aria-hidden="true" />
                    <div>
                        <strong>Stock counts need a separate command-owner decision.</strong>
                        <span>No dedicated count workflow is exposed by the current canonical inventory owner, so this surface does not create a second adjustment form.</span>
                    </div>
                </div>
            </SectionCard>

            <div className="business-admin-grid business-admin-inventory-grid">
                <SectionCard
                    className="business-admin-inventory-section"
                    title="Branch valuation"
                    subtitle="Read-only projection of the inventory cost service"
                    action={<span className="business-admin-inventory-count">{number(locations.length)} branches</span>}
                >
                    <div className="business-admin-inventory-table-view">
                        <DataTable rows={locations} rowKey={(row) => row.location_id || row.location_name} emptyMessage="No branch valuation rows are available." columns={valuationColumns} />
                    </div>
                    <div className="business-admin-inventory-mobile-view">
                        {locations.length ? <div className="business-admin-inventory-record-list">{locations.map((row) => <InventoryValuationCard key={row.location_id || row.location_name} row={row} />)}</div> : <Empty message="No branch valuation rows are available." />}
                    </div>
                </SectionCard>

                <SectionCard
                    className="business-admin-inventory-section"
                    title="Stock-health queue"
                    subtitle="Low-stock and out-of-stock items in this branch"
                    action={<span className="business-admin-inventory-count">{number(lowStockTotal)} items</span>}
                >
                    <div className="business-admin-inventory-table-view">
                        <DataTable rows={lowStock} rowKey={(row, index) => `${row.sku_code || row.item}-${index}`} emptyMessage="No stock-health alerts in this scope." columns={lowStockColumns} />
                    </div>
                    <div className="business-admin-inventory-mobile-view">
                        {lowStock.length ? <div className="business-admin-inventory-record-list">{lowStock.map((row, index) => <InventoryLowStockCard key={`${row.sku_code || row.item}-${index}`} row={row} />)}</div> : <Empty message="No stock-health alerts in this scope." />}
                    </div>
                    <InventoryPagination pagination={lowStockPagination} onPageChange={onPageChange} refreshing={refreshing} />
                </SectionCard>
            </div>
        </div>
    );
}

function WorkforceWorkspace({ data, bootstrap, teamCapability, onManageTeam }) {
    const employees = data?.employees || [];
    const canEditUsers = bootstrap?.user?.is_master_admin === true || teamCapability?.user_edit === true;
    const canViewUsers = canEditUsers || teamCapability?.user_view === true;

    return (
        <div className="business-admin-workforce-workspace">
            <div className="business-admin-workforce-contract" role="note">
                <ShieldCheck size={17} aria-hidden="true" />
                <div className="business-admin-workforce-contract-copy">
                    <strong>Team &amp; Access model</strong>
                    <span>Employee records describe the person and operational activity. Login accounts control authentication. Effective permissions and branch grants are managed in the canonical users-and-roles workflow; terminal permissions and Back Office permissions remain separate.</span>
                </div>
            </div>
            <SectionCard
                title="Workforce activity"
                subtitle={`${number(employees.length)} employees in the selected scope`}
                action={canViewUsers ? (
                    <div className="business-admin-workforce-header-actions">
                        <button type="button" className="business-admin-button primary" onClick={onManageTeam}>
                            <Users size={14} aria-hidden="true" /> Manage team
                        </button>
                    </div>
                ) : null}
            >
                <DataTable
                    rows={employees}
                    rowKey={(row) => row.user_id}
                    emptyMessage="No employees match this branch scope."
                    columns={[
                        { key: 'username', label: 'Employee record', render: (row) => <strong>{row.username}</strong> },
                        { key: 'role', label: 'Role', render: (row) => <span>{row.role_preset_key ? humanize(row.role_preset_key) : humanize(row.role)}</span> },
                        { key: 'branch_assignments', label: 'Branch access', render: (row) => {
                            const assignments = Array.isArray(row.branch_assignments) ? row.branch_assignments : [];
                            return assignments.length ? assignments.map((assignment) => assignment.name || `Branch #${assignment.location_id}`).join(', ') : 'No branch grant';
                        } },
                        { key: 'is_active', label: 'Login account', render: (row) => <StatusPill value={row.is_active ? 'active' : 'inactive'} /> },
                        { key: 'orders_processed', label: 'Orders', render: (row) => number(row.performance?.orders_processed) },
                        { key: 'completed_sales_amount', label: 'Sales', render: (row) => money(row.performance?.completed_sales_amount) },
                        { key: 'void_count', label: 'Voids', render: (row) => number(row.performance?.void_count) },
                        { key: 'cash_difference_amount', label: 'Cash variance', render: (row) => money(row.performance?.cash_difference_amount) }
                    ]}
                />
            </SectionCard>
        </div>
    );
}

const AttendanceSummaryMetric = ({ icon: Icon, label, value, detail }) => (
    <div className="business-admin-card business-admin-attendance-metric">
        <div className="business-admin-attendance-metric-icon"><Icon size={18} /></div>
        <div className="business-admin-attendance-metric-copy">
            <div className="business-admin-attendance-metric-label">{label}</div>
            <div className="business-admin-attendance-metric-value">{value}</div>
            <div className="business-admin-attendance-metric-detail">{detail}</div>
        </div>
    </div>
);

const AttendanceSessionCard = ({ row, branchLabel }) => (
    <article className="business-admin-attendance-record">
        <div className="business-admin-attendance-record-heading">
            <div className="business-admin-attendance-record-identity">
                <div className="business-admin-attendance-record-icon"><UserRound size={16} /></div>
                <div className="business-admin-attendance-record-copy">
                    <strong>{row.cashier_name || 'Unknown operator'}</strong>
                    <span>{branchLabel(row)} · {humanize(row.duty_type)}</span>
                </div>
            </div>
            <StatusPill value={row.status} />
        </div>
        <div className="business-admin-attendance-record-facts">
            <div><span>Started</span><strong>{dateTime(row.started_at)}</strong></div>
            <div><span>Ended</span><strong>{row.ended_at ? dateTime(row.ended_at) : <StatusPill value="active" />}</strong></div>
            <div><span>Break</span><strong>{number(row.break_minutes)} min</strong></div>
            <div><span>Worked</span><strong>{number(row.worked_minutes)} min</strong></div>
        </div>
    </article>
);

const CashierDutyActionButton = ({ row, canEndShift, onEndShift, actionLoading }) => canEndShift ? (
    <button
        type="button"
        className="business-admin-button danger business-admin-attendance-table-action"
        onClick={() => onEndShift?.(row)}
        disabled={actionLoading === 'attendance-end-shift'}
        aria-label={`End shift for ${row.cashier_name || 'cashier'}`}
    >
        <X size={13} aria-hidden="true" />
        {actionLoading === 'attendance-end-shift' ? 'Ending…' : 'End shift'}
    </button>
) : <span className="business-admin-attendance-read-only">View only</span>;

const CashierDutyMobileCard = ({ row, branchLabel, canEndShift, onEndShift, actionLoading }) => (
    <article className="business-admin-attendance-duty-card" data-testid={`attendance-duty-mobile-${row.shift_id}`}>
        <div className="business-admin-attendance-record-heading">
            <div className="business-admin-attendance-table-identity">
                <div className="business-admin-attendance-record-icon duty"><Wallet size={15} aria-hidden="true" /></div>
                <strong>{row.cashier_name || 'Unknown cashier'}</strong>
            </div>
            <StatusPill value="open" />
        </div>
        <div className="business-admin-attendance-duty-card-facts">
            <div><span>Branch / terminal</span><strong>{branchLabel(row)} · {row.terminal_id || 'Register not recorded'}</strong></div>
            <div><span>Shift</span><strong>#{row.shift_id || '—'}</strong></div>
            <div><span>Started</span><strong>{dateTime(row.opened_at)}</strong></div>
            <div><span>Expected cash</span><strong>{money(row.expected_cash_amount)}</strong></div>
        </div>
        <div className="business-admin-attendance-duty-card-action">
            <CashierDutyActionButton row={row} canEndShift={canEndShift} onEndShift={onEndShift} actionLoading={actionLoading} />
        </div>
    </article>
);

const CashierDutyTable = ({ rows = [], branchLabel, canEndShift, onEndShift, actionLoading }) => (
    <div className="business-admin-attendance-duty-table" data-testid="attendance-duty-table">
        <DataTable
            rows={rows}
            rowKey={(row) => row.shift_id}
            emptyMessage="No cashiers currently have an open POS shift in this scope."
            columns={[
                {
                    key: 'cashier',
                    label: 'Cashier',
                    render: (row) => (
                        <div className="business-admin-attendance-table-identity">
                            <div className="business-admin-attendance-record-icon duty"><Wallet size={15} aria-hidden="true" /></div>
                            <strong>{row.cashier_name || 'Unknown cashier'}</strong>
                        </div>
                    )
                },
                {
                    key: 'branch_terminal',
                    label: 'Branch / terminal',
                    render: (row) => (
                        <div className="business-admin-attendance-table-stack">
                            <strong>{branchLabel(row)}</strong>
                            <span>{row.terminal_id || 'Register not recorded'}</span>
                        </div>
                    )
                },
                {
                    key: 'shift',
                    label: 'Shift',
                    render: (row) => <strong>#{row.shift_id || '—'}</strong>
                },
                {
                    key: 'started_at',
                    label: 'Started',
                    render: (row) => dateTime(row.opened_at)
                },
                {
                    key: 'expected_cash_amount',
                    label: 'Expected cash',
                    render: (row) => <strong>{money(row.expected_cash_amount)}</strong>
                },
                {
                    key: 'status',
                    label: 'Status',
                    render: () => <StatusPill value="open" />
                },
                {
                    key: 'actions',
                    label: 'Action',
                    render: (row) => <CashierDutyActionButton row={row} canEndShift={canEndShift} onEndShift={onEndShift} actionLoading={actionLoading} />
                }
            ]}
        />
        <div className="business-admin-attendance-duty-mobile">
            {rows.length ? rows.map((row) => (
                <CashierDutyMobileCard
                    key={row.shift_id}
                    row={row}
                    branchLabel={branchLabel}
                    canEndShift={canEndShift}
                    onEndShift={onEndShift}
                    actionLoading={actionLoading}
                />
            )) : <Empty message="No cashiers currently have an open POS shift in this scope." />}
        </div>
    </div>
);

const AttendanceCashReconciliation = ({ row }) => (
    <section className="business-admin-attendance-cash-reconciliation" data-testid="attendance-cash-reconciliation" aria-label="POS cash reconciliation">
        <div className="business-admin-attendance-cash-reconciliation-heading">
            <div>
                <strong>POS drawer calculation</strong>
                <span>Live expected cash from this cashier shift</span>
            </div>
            <Wallet size={17} aria-hidden="true" />
        </div>
        <div className="business-admin-attendance-cash-reconciliation-grid">
            <div><span>Opening / petty cash</span><strong>{money(row?.opening_cash_amount)}</strong></div>
            <div><span>Cash sales</span><strong>{money(row?.cash_sales_amount)}</strong></div>
            <div><span>Cash in</span><strong>{money(row?.cash_in_amount)}</strong></div>
            <div><span>Cash out</span><strong>{money(row?.cash_out_amount)}</strong></div>
        </div>
        <div className="business-admin-attendance-cash-reconciliation-total">
            <span>Expected cash in drawer</span>
            <strong>{money(row?.expected_cash_amount)}</strong>
        </div>
    </section>
);

const OperatorSessionCard = ({ row, branchLabel }) => (
    <article className="business-admin-attendance-record">
        <div className="business-admin-attendance-record-heading">
            <div className="business-admin-attendance-record-identity">
                <div className="business-admin-attendance-record-icon operator"><Monitor size={16} /></div>
                <div className="business-admin-attendance-record-copy">
                    <strong>{row.cashier_name || 'Unknown operator'}</strong>
                    <span>{branchLabel(row)} · {row.terminal_id || 'Register not recorded'}</span>
                </div>
            </div>
            <StatusPill value={row.status} />
        </div>
        <div className="business-admin-attendance-record-facts operator">
            <div><span>Register</span><strong>{row.terminal_id || '—'}</strong></div>
            <div><span>Shift</span><strong>{row.shift_id || '—'}</strong></div>
            <div><span>Started</span><strong>{dateTime(row.started_at)}</strong></div>
            <div><span>Ended</span><strong>{row.ended_at ? dateTime(row.ended_at) : <StatusPill value="active" />}</strong></div>
            <div><span>End reason</span><strong>{humanize(row.ended_reason)}</strong></div>
            <div><span>Minutes</span><strong>{number(row.minutes)}</strong></div>
        </div>
    </article>
);

function AttendanceWorkspace({ data, branches = [], capabilities = {}, onEndShift, actionLoading = null }) {
    const attendanceRows = data?.attendance?.rows || [];
    const operatorRows = data?.operators?.rows || [];
    const activeShifts = data?.active_shifts || [];
    const activeAttendance = attendanceRows.filter((row) => !row.ended_at).length;
    const [endingShift, setEndingShift] = useState(null);
    const [closingCashAmount, setClosingCashAmount] = useState('');
    const [endReason, setEndReason] = useState('');
    const canEndShift = capabilities?.force_close_shifts === true;
    const branchNames = new Map((Array.isArray(branches) ? branches : []).map((branch) => [
        String(branch.branch_id ?? branch.location_id),
        branch.name
    ]));
    const branchLabel = (row) => {
        const branchId = row?.location_id ?? row?.branch_id;
        return row?.branch_name
            || (branchId != null ? branchNames.get(String(branchId)) || `Branch #${branchId}` : 'Branch not recorded');
    };

    const openEndShift = (row) => {
        setEndingShift(row);
        setClosingCashAmount(row?.expected_cash_amount != null ? String(row.expected_cash_amount) : '');
        setEndReason('');
    };

    const closeEndShift = () => {
        setEndingShift(null);
        setClosingCashAmount('');
        setEndReason('');
    };

    const submitEndShift = async (event) => {
        event.preventDefault();
        if (!endingShift || !onEndShift) return;
        await onEndShift(endingShift.shift_id, {
            closing_cash_amount: Number(closingCashAmount),
            reason: endReason,
            idempotency_key: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `opis-attendance-${endingShift.shift_id}-${Date.now()}`
        });
        closeEndShift();
    };

    const expectedClosingCash = Number(endingShift?.expected_cash_amount || 0);
    const countedClosingCash = closingCashAmount.trim() === '' ? null : Number(closingCashAmount);
    const closingCashVariance = countedClosingCash == null || !Number.isFinite(countedClosingCash)
        ? null
        : countedClosingCash - expectedClosingCash;

    return (
        <div className="business-admin-attendance-workspace">
            <div className="business-admin-attendance-contract" role="note">
                <ShieldCheck size={17} />
                <div className="business-admin-attendance-contract-copy">
                    <strong>POS attendance and shift supervision</strong>
                    <span>Canonical POS records only. Authorized admins can end an active cashier shift here; no cashier PIN is required.</span>
                </div>
            </div>
            <div className="business-admin-attendance-summary" aria-label="Attendance summary">
                <AttendanceSummaryMetric icon={CalendarDays} label="Attendance sessions" value={number(data?.attendance?.pagination?.total)} detail="POS duty records" />
                <AttendanceSummaryMetric icon={Clock3} label="Active attendance" value={number(activeAttendance)} detail="No recorded time-out" />
                <AttendanceSummaryMetric icon={Monitor} label="Operator sessions" value={number(data?.operators?.pagination?.total)} detail="Terminal activity records" />
                <AttendanceSummaryMetric icon={Wallet} label="Cashiers on duty" value={number(activeShifts.length)} detail="Open POS shifts" />
            </div>
            <SectionCard
                className="business-admin-attendance-section-card"
                title="Cashiers on duty"
                subtitle="Cashiers with an active POS shift in the selected branch scope"
                action={<span className="business-admin-attendance-count">{number(activeShifts.length)} active</span>}
            >
                <CashierDutyTable
                    rows={activeShifts}
                    branchLabel={branchLabel}
                    canEndShift={canEndShift}
                    onEndShift={openEndShift}
                    actionLoading={actionLoading}
                />
            </SectionCard>
            <div className="business-admin-attendance-grid">
                <SectionCard
                    className="business-admin-attendance-section-card"
                    title="Attendance sessions"
                    subtitle={`${number(data?.attendance?.pagination?.total)} sessions in the selected scope`}
                    action={<span className="business-admin-attendance-count">{number(attendanceRows.length)} visible</span>}
                >
                    <div className="business-admin-attendance-record-list">
                        {attendanceRows.length ? attendanceRows.map((row) => (
                            <AttendanceSessionCard key={row.attendance_session_id} row={row} branchLabel={branchLabel} />
                        )) : <Empty message="No attendance sessions were recorded for these filters." />}
                    </div>
                </SectionCard>
                <SectionCard
                    className="business-admin-attendance-section-card"
                    title="Operator sessions"
                    subtitle={`${number(data?.operators?.pagination?.total)} terminal sessions in the selected scope`}
                    action={<span className="business-admin-attendance-count">{number(operatorRows.length)} visible</span>}
                >
                    <div className="business-admin-attendance-record-list">
                        {operatorRows.length ? operatorRows.map((row) => (
                            <OperatorSessionCard key={row.operator_session_id} row={row} branchLabel={branchLabel} />
                        )) : <Empty message="No operator sessions were recorded for these filters." />}
                    </div>
                </SectionCard>
            </div>
            {endingShift && typeof document !== 'undefined' ? createPortal(
                <div className="business-admin-expense-modal-backdrop business-admin-attendance-modal-backdrop" role="presentation">
                    <form className="business-admin-expense-modal business-admin-attendance-modal" onSubmit={submitEndShift} role="dialog" aria-modal="true" aria-labelledby="end-attendance-shift-title" aria-describedby="end-attendance-shift-description">
                        <div className="business-admin-attendance-modal-heading">
                            <div>
                                <span className="business-admin-attendance-modal-kicker">Admin shift control</span>
                                <h2 id="end-attendance-shift-title">End cashier shift</h2>
                            </div>
                            <button type="button" className="business-admin-attendance-modal-close" onClick={closeEndShift} disabled={actionLoading === 'attendance-end-shift'} aria-label="Cancel ending this shift">
                                <X size={17} aria-hidden="true" />
                            </button>
                        </div>
                        <p id="end-attendance-shift-description" className="business-admin-attendance-modal-copy">This closes the canonical POS shift, ends the linked attendance duty, and records an X-reading. Z-reading remains a separate day-close action.</p>
                        <div className="business-admin-expense-modal-record business-admin-attendance-modal-record">
                            <div className="business-admin-attendance-modal-record-copy">
                                <strong>{endingShift.cashier_name || 'Unknown cashier'}</strong>
                                <span>{branchLabel(endingShift)} · {endingShift.terminal_id || 'Register not recorded'} · Shift #{endingShift.shift_id}</span>
                            </div>
                            <StatusPill value="open" />
                        </div>
                        <AttendanceCashReconciliation row={endingShift} />
                        <div className="business-admin-form-grid business-admin-attendance-modal-fields">
                            <label className="business-admin-field">
                                <span>Counted closing cash (physical)</span>
                                <input className="business-admin-attendance-cash-input" type="number" inputMode="decimal" min="0" step="0.01" value={closingCashAmount} onChange={(event) => setClosingCashAmount(event.target.value)} required />
                                <small className="business-admin-attendance-cash-helper">Prefilled from the POS expected amount. Edit it if the physical count is different.</small>
                            </label>
                            <div className="business-admin-attendance-cash-variance" aria-live="polite">
                                <span>Variance after count</span>
                                <strong className={closingCashVariance == null ? '' : closingCashVariance === 0 ? 'balanced' : 'unbalanced'}>
                                    {closingCashVariance == null ? 'Enter a count' : money(closingCashVariance)}
                                </strong>
                            </div>
                            <label className="business-admin-field business-admin-form-field-full">
                                <span>Reason for ending shift</span>
                                <textarea value={endReason} onChange={(event) => setEndReason(event.target.value)} minLength={8} maxLength={255} rows={3} placeholder="Enter at least 8 characters" required />
                            </label>
                        </div>
                        <div className="business-admin-attendance-modal-footer">
                            <span>Server recalculates the drawer total before saving. No cashier PIN required · X-reading is recorded automatically.</span>
                            <div className="business-admin-attendance-modal-footer-actions">
                                <button type="button" className="business-admin-button" onClick={closeEndShift} disabled={actionLoading === 'attendance-end-shift'}>Cancel</button>
                                <button type="submit" className="business-admin-button primary" disabled={actionLoading === 'attendance-end-shift'}>{actionLoading === 'attendance-end-shift' ? 'Ending…' : 'End shift'}</button>
                            </div>
                        </div>
                    </form>
                </div>,
                document.body
            ) : null}
        </div>
    );
}

const ShiftSummaryMetric = ({ icon: Icon, label, value, detail }) => (
    <div className="business-admin-card business-admin-shifts-metric">
        <div className="business-admin-shifts-metric-icon"><Icon size={18} /></div>
        <div className="business-admin-shifts-metric-copy">
            <div className="business-admin-shifts-metric-label">{label}</div>
            <div className="business-admin-shifts-metric-value">{value}</div>
            {detail ? <div className="business-admin-shifts-metric-detail">{detail}</div> : null}
        </div>
    </div>
);

const CashSummaryTable = ({ rows = [] }) => (
    <div className="business-admin-cash-summary-table-wrap">
        <table className="business-admin-table business-admin-cash-summary-table">
            <thead>
                <tr>
                    <th>POS</th>
                    <th>Cashier</th>
                    <th>Opening time</th>
                    <th>Closing time</th>
                    <th>Expected cash amount</th>
                    <th>Actual cash amount</th>
                    <th>Difference</th>
                </tr>
            </thead>
            <tbody>
                {rows.length ? rows.map((row) => (
                    <tr key={row.shift_id}>
                        <td><strong>{row.terminal_id || '—'}</strong></td>
                        <td>{row.cashier_name || '—'}</td>
                        <td>{dateTime(row.opened_at)}</td>
                        <td>{row.closed_at ? dateTime(row.closed_at) : '—'}</td>
                        <td>{money(row.expected_cash_amount)}</td>
                        <td>{row.closing_cash_amount == null ? '—' : money(row.closing_cash_amount)}</td>
                        <td>{row.cash_variance_amount == null ? '—' : money(row.cash_variance_amount)}</td>
                    </tr>
                )) : (
                    <tr>
                        <td colSpan={7}>
                            <div className="business-admin-cash-summary-empty">
                                <div className="business-admin-cash-summary-empty-icon" aria-hidden="true"><Clock3 size={42} /></div>
                                <strong>No data to display</strong>
                                <span>There are no closed shifts in the selected time period</span>
                            </div>
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    </div>
);

const CashSummaryPagination = ({ pagination = {}, onPageChange, refreshing = false }) => {
    const total = Math.max(Number(pagination.total) || 0, 0);
    const limit = Math.max(Number(pagination.limit) || BUSINESS_ADMIN_CASH_SUMMARY_PAGE_SIZE, 1);
    const totalPages = Math.max(Number(pagination.total_pages) || Math.ceil(total / limit), 1);
    const page = Math.min(Math.max(Number(pagination.page) || 1, 1), totalPages);
    return (
        <nav className="business-admin-cash-summary-pagination" aria-label="Shift history pagination">
            <div className="business-admin-cash-summary-pagination-actions">
                <button type="button" className="business-admin-cash-summary-pagination-button" onClick={() => onPageChange(page - 1)} disabled={refreshing || page <= 1} aria-label="Previous shift history page">
                    <ChevronLeft size={17} />
                </button>
                <button type="button" className="business-admin-cash-summary-pagination-button" onClick={() => onPageChange(page + 1)} disabled={refreshing || page >= totalPages} aria-label="Next shift history page">
                    <ChevronRight size={17} />
                </button>
            </div>
            <span className="business-admin-cash-summary-pagination-page">Page: <strong>{number(page)}</strong> of {number(totalPages)}</span>
            <span className="business-admin-cash-summary-pagination-limit">Rows per page: <strong>{number(limit)}</strong> <ChevronDown size={14} aria-hidden="true" /></span>
        </nav>
    );
};

function ShiftsWorkspace({ data, onCashSummaryPageChange = () => {}, onExportCashSummary = () => {}, exportingCashSummary = false, refreshing = false }) {
    const summary = data?.summary || {};
    const cashSummary = Array.isArray(data?.cashSummary) ? data.cashSummary : [];
    const cashSummaryPagination = data?.cashSummaryPagination || {};

    return (
        <div className="business-admin-shifts-workspace">
            <div className="business-admin-shifts-summary" aria-label="Shift summary">
                <ShiftSummaryMetric icon={Clock3} label="Total shifts" value={number(summary.total_shifts)} detail="POS shift records" />
                <ShiftSummaryMetric icon={CheckCircle2} label="Closed" value={number(summary.closed_shifts)} detail="Finalized drawer records" />
                <ShiftSummaryMetric icon={CalendarDays} label="Open" value={number(summary.open_shifts)} detail="Currently active shifts" />
                <ShiftSummaryMetric icon={AlertTriangle} label="Overdue" value={number(summary.overdue_shifts)} detail="Open beyond threshold" />
                <ShiftSummaryMetric icon={ShieldCheck} label="Force-close requests" value={number(summary.force_close_requests)} detail="Canonical POS command pending" />
            </div>
            <SectionCard
                className="business-admin-cash-summary-section-card"
                title="Shift history"
                action={(
                    <button
                        type="button"
                        className="business-admin-button"
                        onClick={onExportCashSummary}
                        disabled={exportingCashSummary || refreshing}
                        aria-label="Export shift history as CSV"
                    >
                        <Download size={14} aria-hidden="true" />
                        {exportingCashSummary ? 'Exporting…' : 'Export CSV'}
                    </button>
                )}
            >
                <CashSummaryTable rows={cashSummary} />
                <CashSummaryPagination pagination={cashSummaryPagination} onPageChange={onCashSummaryPageChange} refreshing={refreshing} />
            </SectionCard>
        </div>
    );
}

function NotificationsWorkspace({ data, onAction, actionLoading, refreshing = false, refreshError = '' }) {
    const notifications = useMemo(() => (Array.isArray(data?.notifications) ? data.notifications : []), [data]);
    const [activeFilter, setActiveFilter] = useState('unread');
    const counts = useMemo(() => ({
        all: notifications.length,
        unread: notifications.filter((notification) => !notification.read_at).length,
        critical: notifications.filter((notification) => notificationSeverity(notification) === 'critical').length,
        warning: notifications.filter((notification) => notificationSeverity(notification) === 'warning').length
    }), [notifications]);
    const filteredNotifications = useMemo(() => {
        let nextNotifications = notifications;
        if (activeFilter === 'unread') nextNotifications = notifications.filter((notification) => !notification.read_at);
        if (activeFilter === 'critical' || activeFilter === 'warning') {
            nextNotifications = notifications.filter((notification) => notificationSeverity(notification) === activeFilter);
        }
        return [...nextNotifications].sort((left, right) => notificationPriority(left) - notificationPriority(right));
    }, [activeFilter, notifications]);
    const unreadNotificationLabel = counts.unread === 1 ? 'unread notification' : 'unread notifications';
    const attentionAction = counts.unread ? 'Review unread' : 'View all alerts';
    const emptyNotificationMessage = activeFilter === 'all'
        ? 'No active alerts.'
        : (activeFilter === 'unread' ? 'You are all caught up.' : 'No alerts match this filter.');

    return (
        <div className="business-admin-notifications-workspace" data-testid="business-admin-notifications-workspace">
            <section className="business-admin-notifications-attention" aria-label="Notifications needing attention">
                <div className="business-admin-notifications-attention-copy">
                    <div className="business-admin-notifications-attention-icon"><Bell size={20} /></div>
                    <div>
                        <span className="business-admin-notifications-attention-kicker">Needs attention</span>
                        <h2>{counts.unread ? `${number(counts.unread)} ${unreadNotificationLabel} need your attention` : 'No unread notifications'}</h2>
                        <p>Start with unread alerts, then follow up on anything critical.</p>
                    </div>
                </div>
                <button
                    type="button"
                    className="business-admin-notifications-primary-action"
                    aria-label={attentionAction}
                    onClick={() => setActiveFilter(counts.unread ? 'unread' : 'all')}
                >
                    <CheckCircle2 size={15} /> {attentionAction}
                </button>
            </section>
            <div className="business-admin-notifications-summary" aria-label="Notification summary">
                <NotificationMetric icon={AlertTriangle} label="Critical" value={number(counts.critical)} detail="Act first" tone="critical" />
                <NotificationMetric icon={Clock3} label="Warnings" value={number(counts.warning)} detail="Follow up" tone="warning" />
                <NotificationMetric icon={CheckCircle2} label="Active alerts" value={number(counts.all)} detail="Current scope" tone="teal" />
            </div>
            <SectionCard
                className="business-admin-notifications-inbox"
                title="What needs your attention"
                subtitle={`${number(counts.unread)} unread · ${humanize(data?.scope)} scope`}
                action={<span className="business-admin-notifications-count">{number(filteredNotifications.length)} shown</span>}
            >
                <div className="business-admin-notifications-toolbar" role="toolbar" aria-label="Notification filters">
                    <span className="business-admin-notifications-filter-label">Show</span>
                    <div className="business-admin-notification-filter-group" role="group" aria-label="Notification severity filters">
                        {NOTIFICATION_FILTERS.map((filter) => (
                            <button
                                type="button"
                                key={filter.key}
                                className={`business-admin-notification-filter ${activeFilter === filter.key ? 'active' : ''}`}
                                aria-pressed={activeFilter === filter.key}
                                data-testid={`business-admin-notification-filter-${filter.key}`}
                                onClick={() => setActiveFilter(filter.key)}
                            >
                                {filter.label}
                                <span>{number(counts[filter.key])}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div
                    className={`business-admin-notifications-list-panel ${refreshing ? 'is-refreshing' : ''}`}
                    aria-busy={refreshing}
                >
                    <div className="business-admin-notifications-list-content">
                        {refreshError ? (
                            <div className="business-admin-alert error business-admin-notifications-panel-error">
                                <AlertTriangle size={17} />
                                <div><strong>Notifications could not be refreshed.</strong><div>{refreshError}</div></div>
                            </div>
                        ) : (
                            <div className="business-admin-notifications-list">
                    {filteredNotifications.length ? filteredNotifications.map((notification) => {
                        const id = extractId(notification, ['business_admin_alert_snapshot_id', 'notification_id', 'id']);
                        const severity = notificationSeverity(notification);
                        const sourceDomain = notification.source_domain || 'operations';
                        const SourceIcon = notificationSourceIcon(sourceDomain);
                        const isRead = Boolean(notification.read_at);
                        const isAcknowledged = Boolean(notification.acknowledged_at);
                        const isLoading = refreshing || actionLoading === id;
                        return (
                            <article
                                className={`business-admin-notification-card severity-${severity} ${isRead ? 'is-read' : 'is-unread'}`}
                                key={id || notification.alert_key}
                                data-testid="business-admin-notification-card"
                            >
                                <div className="business-admin-notification-card-rail" aria-hidden="true" />
                                <div className="business-admin-notification-card-content">
                                    <div className="business-admin-notification-card-heading">
                                        <div className="business-admin-notification-identity">
                                            <div className={`business-admin-notification-source-icon ${statusClass(sourceDomain)}`}><SourceIcon size={17} /></div>
                                            <div className="business-admin-notification-copy">
                                                <div className="business-admin-notification-meta">
                                                    <span className="business-admin-notification-type">{humanize(notificationType(notification))}</span>
                                                    <span className={isRead ? 'business-admin-notification-read' : 'business-admin-notification-unread'}>{isRead ? 'Read' : 'Unread'}</span>
                                                </div>
                                                <h3>{notification.message || 'Operational notification'}</h3>
                                            </div>
                                        </div>
                                        <StatusPill value={severity} />
                                    </div>
                                    <div className="business-admin-notification-details">
                                        <span>{humanize(sourceDomain)}</span>
                                        <span aria-hidden="true">·</span>
                                        <span>{dateTime(notification.last_seen_at || notification.created_at)}</span>
                                        {notification.branch_id !== null && notification.branch_id !== undefined ? <><span aria-hidden="true">·</span><span>Branch #{notification.branch_id}</span></> : null}
                                    </div>
                                    <div className="business-admin-notification-footer">
                                        <span className="business-admin-notification-state">
                                            {isAcknowledged ? <><CheckCircle2 size={13} /> Acknowledged</> : 'Operational alert'}
                                        </span>
                                        <div className="business-admin-notification-actions">
                                            {!isRead ? <button type="button" className="business-admin-notification-action primary" disabled={isLoading} onClick={() => onAction('read', id)}><CheckCircle2 size={14} /> Mark read</button> : null}
                                            <button type="button" className="business-admin-notification-action" disabled={isLoading} onClick={() => onAction('dismiss', id)}><X size={14} /> Dismiss</button>
                                            {data?.scope === 'all' && !isAcknowledged ? <button type="button" className="business-admin-notification-action" disabled={isLoading} onClick={() => onAction('acknowledge', id)}><ShieldCheck size={14} /> Acknowledge</button> : null}
                                        </div>
                                    </div>
                                </div>
                            </article>
                        );
                    }) : <Empty message={emptyNotificationMessage} />}
                            </div>
                        )}
                    </div>
                    {refreshing ? (
                        <div className="business-admin-notifications-loading" role="status" aria-live="polite">
                            <span className="business-admin-spinner" /> Refreshing notifications...
                        </div>
                    ) : null}
                </div>
            </SectionCard>
        </div>
    );
}
const normalizeVoidHistoryTransactionId = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? String(normalized) : '';
};

const buildApprovedVoidHistoryRows = ({ approvals = [], orders = [] } = {}) => {
    const approvedVoidApprovals = (Array.isArray(approvals) ? approvals : [])
        .filter((row) => row?.action_type === 'pos_void' && ['approved', 'executed'].includes(String(row.status || '').toLowerCase()));
    const approvalByTransaction = new Map();
    approvedVoidApprovals.forEach((row) => {
        const transactionId = normalizeVoidHistoryTransactionId(row.related_transaction_id || row.payload?.transaction_id || row.entity_id);
        if (transactionId && !approvalByTransaction.has(transactionId)) approvalByTransaction.set(transactionId, row);
    });

    const seenTransactionIds = new Set();
    const rows = (Array.isArray(orders) ? orders : []).map((order, index) => {
        const transactionId = normalizeVoidHistoryTransactionId(order.transaction_id);
        const approval = transactionId ? approvalByTransaction.get(transactionId) : null;
        if (transactionId) seenTransactionIds.add(transactionId);
        return {
            key: `transaction-${transactionId || index}`,
            occurred_at: order.voided_at || approval?.executed_at || approval?.approved_at || order.created_at,
            invoice_number: order.invoice_number || approval?.payload?.invoice_number || (transactionId ? `Transaction #${transactionId}` : '—'),
            total_amount: order.total_amount ?? approval?.requested_value ?? null,
            voided_by: order.voided_by || approval?.approved_by || '—',
            requested_by: approval?.requested_by || '—',
            approved_by: approval?.approved_by || '—',
            source: approval ? 'Approved workflow' : 'Direct/admin void',
            reason: order.void_reason || approval?.reason || '—',
            branch: order.branch_name || (approval?.branch_id ? `Branch #${approval.branch_id}` : '—'),
            terminal: order.terminal_id || approval?.terminal_id || '—',
            status: order.transaction_status || approval?.status || 'voided'
        };
    });

    approvedVoidApprovals.forEach((approval, index) => {
        const transactionId = normalizeVoidHistoryTransactionId(approval.related_transaction_id || approval.payload?.transaction_id || approval.entity_id);
        if (transactionId && seenTransactionIds.has(transactionId)) return;
        rows.push({
            key: `approval-${approval.approval_request_id || index}`,
            occurred_at: approval.executed_at || approval.approved_at || approval.requested_at,
            invoice_number: approval.payload?.invoice_number || (transactionId ? `Transaction #${transactionId}` : '—'),
            total_amount: approval.requested_value ?? null,
            voided_by: approval.approved_by || '—',
            requested_by: approval.requested_by || '—',
            approved_by: approval.approved_by || '—',
            source: 'Approved workflow',
            reason: approval.reason || '—',
            branch: approval.branch_id ? `Branch #${approval.branch_id}` : '—',
            terminal: approval.terminal_id || '—',
            status: approval.status || 'executed'
        });
    });

    return rows.sort((left, right) => new Date(right.occurred_at || 0).getTime() - new Date(left.occurred_at || 0).getTime());
};

const VoidHistoryPagination = ({ page, totalPages, total, onPageChange, refreshing = false }) => {
    const normalizedTotal = Math.max(Number(total) || 0, 0);
    const normalizedTotalPages = Math.max(Number(totalPages) || 1, 1);
    const currentPage = Math.min(Math.max(Number(page) || 1, 1), normalizedTotalPages);
    if (!normalizedTotal) return null;
    const start = ((currentPage - 1) * BUSINESS_ADMIN_VOID_HISTORY_PAGE_SIZE) + 1;
    const end = Math.min(currentPage * BUSINESS_ADMIN_VOID_HISTORY_PAGE_SIZE, normalizedTotal);
    const recordLabel = normalizedTotal === 1 ? 'void record' : 'void records';

    return (
        <nav className="business-admin-orders-pagination" aria-label="Approved void history pagination">
            <div className="business-admin-orders-pagination-summary">
                <strong>{number(start)}–{number(end)}</strong>
                <span>of {number(normalizedTotal)} {recordLabel}</span>
            </div>
            <div className="business-admin-orders-pagination-actions">
                <button type="button" className="business-admin-button" onClick={() => onPageChange(currentPage - 1)} disabled={refreshing || currentPage <= 1} aria-label="Previous approved void history page">
                    <ChevronLeft size={14} /> Previous
                </button>
                <span className="business-admin-orders-pagination-page">Page {number(currentPage)} of {number(normalizedTotalPages)}</span>
                <button type="button" className="business-admin-button" onClick={() => onPageChange(currentPage + 1)} disabled={refreshing || currentPage >= normalizedTotalPages} aria-label="Next approved void history page">
                    Next <ChevronRight size={14} />
                </button>
            </div>
        </nav>
    );
};

function ApprovalsWorkspace({ data, capabilities = {}, onDecision, actionLoading, voidHistoryOpen, voidHistoryRows, voidHistoryLoading, voidHistoryError, onToggleVoidHistory, onRefreshVoidHistory }) {
    const [voidHistoryPage, setVoidHistoryPage] = useState(1);
    const rows = data?.approvals || [];
    const historyRows = Array.isArray(voidHistoryRows) ? voidHistoryRows : [];
    const historyTotal = historyRows.length;
    const historyTotalPages = Math.max(Math.ceil(historyTotal / BUSINESS_ADMIN_VOID_HISTORY_PAGE_SIZE), 1);
    const currentHistoryPage = Math.min(Math.max(voidHistoryPage, 1), historyTotalPages);
    const visibleHistoryRows = historyRows.slice(
        (currentHistoryPage - 1) * BUSINESS_ADMIN_VOID_HISTORY_PAGE_SIZE,
        currentHistoryPage * BUSINESS_ADMIN_VOID_HISTORY_PAGE_SIZE
    );
    const handleHistoryToggle = () => {
        if (!voidHistoryOpen) setVoidHistoryPage(1);
        onToggleVoidHistory();
    };
    const handleHistoryRefresh = () => {
        setVoidHistoryPage(1);
        onRefreshVoidHistory();
    };
    const canDecideHighRisk = capabilities?.can_decide_high_risk === true;
    const targetLabel = (row) => {
        const payload = row.payload || {};
        const reference = payload.invoice_number || payload.park_reference
            || `${humanize(row.entity_type)} #${row.entity_id}`;
        const amount = payload.amount == null ? '' : ` · ${money(payload.amount)}`;
        const branch = row.branch_id == null ? '' : ` · Branch #${row.branch_id}`;
        return `${reference}${amount}${branch}`;
    };
    const approvalColumns = [
        { key: 'action_type', label: 'Action', render: (row) => humanize(row.action_type) },
        { key: 'target', label: 'Target', render: (row) => targetLabel(row) },
        { key: 'requested_by', label: 'Requested by' },
        { key: 'requested_at', label: 'Requested', render: (row) => dateTime(row.requested_at) },
        { key: 'reason', label: 'Reason', render: (row) => <span title={row.reason || ''}>{row.reason || '—'}</span> },
        { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
        {
            key: 'actions',
            label: 'Decision',
            render: (row) => row.status === 'pending'
                ? (canDecideHighRisk
                    ? <div className="flex flex-wrap gap-1"><button type="button" className="business-admin-button primary" disabled={actionLoading === row.approval_request_id} onClick={(event) => { event.stopPropagation(); onDecision(row.approval_request_id, 'approve'); }}>Approve</button><button type="button" className="business-admin-button danger" disabled={actionLoading === row.approval_request_id} onClick={(event) => { event.stopPropagation(); onDecision(row.approval_request_id, 'reject'); }}>Reject</button></div>
                    : <span className="business-admin-muted">Decision access restricted</span>)
                : <span className="business-admin-muted">No action</span>
        }
    ];
    const voidHistoryColumns = [
        { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) },
        { key: 'invoice_number', label: 'Invoice' },
        { key: 'total_amount', label: 'Amount', render: (row) => row.total_amount == null ? '—' : money(row.total_amount) },
        { key: 'voided_by', label: 'Voided by' },
        { key: 'requested_by', label: 'Requested by' },
        { key: 'approved_by', label: 'Approved by' },
        { key: 'source', label: 'Source' },
        { key: 'reason', label: 'Reason' }
    ];

    return <>
        {!voidHistoryOpen ? (
            <SectionCard
                title="Approval queue"
                subtitle="Review the reason and target before deciding. POS and Inventory perform approved changes; rejected requests leave the sale and stock unchanged."
                action={<button type="button" className="business-admin-button" data-testid="approved-void-history-toggle" onClick={handleHistoryToggle}><Receipt size={14} /> Approved Void History</button>}
            >
                <DataTable rows={rows} rowKey={(row) => row.approval_request_id} emptyMessage="No approval requests are pending." columns={approvalColumns} />
            </SectionCard>
        ) : null}
        {voidHistoryOpen ? (
            <SectionCard
                title="Approved Void History"
                subtitle="Includes completed approval voids and direct/admin POS voids. Original records remain read-only."
                action={<div className="flex flex-wrap gap-2"><button type="button" className="business-admin-button" data-testid="approved-void-history-back" onClick={handleHistoryToggle}><X size={14} /> Back to Approval Queue</button><button type="button" className="business-admin-button" data-testid="approved-void-history-refresh" onClick={handleHistoryRefresh} disabled={voidHistoryLoading}><RefreshCw size={14} /> Refresh</button></div>}
            >
                {voidHistoryLoading ? <div className="business-admin-loading" role="status" aria-live="polite"><span className="business-admin-spinner" /> Loading void history…</div> : null}
                {!voidHistoryLoading && voidHistoryError ? <div className="business-admin-alert error"><AlertTriangle size={17} /><div>{voidHistoryError}</div></div> : null}
                {!voidHistoryLoading && !voidHistoryError ? <><DataTable rows={visibleHistoryRows} rowKey={(row) => row.key} emptyMessage="No approved or direct/admin voids were found." columns={voidHistoryColumns} /><VoidHistoryPagination page={currentHistoryPage} totalPages={historyTotalPages} total={historyTotal} onPageChange={setVoidHistoryPage} refreshing={voidHistoryLoading} /></> : null}
            </SectionCard>
        ) : null}
    </>;
}

function AuditWorkspace({ data, dateFrom, dateTo }) {
    const rows = data?.logs || [];
    return <SectionCard title="Audit log" subtitle="Immutable historical events with sensitive values redacted at the API boundary"><DataTable rows={rows} rowKey={(row, index) => row.audit_log_id || `${row.timestamp}-${row.entity_type}-${row.entity_id}-${index}`} emptyMessage={historicalEmptyMessage('No audit history is available for this scope.', dateFrom, dateTo)} columns={[{ key: 'timestamp', label: 'When', render: (row) => dateTime(row.timestamp) }, { key: 'action', label: 'Action' }, { key: 'entity_type', label: 'Entity' }, { key: 'entity_id', label: 'ID' }, { key: 'actor_name', label: 'Actor' }, { key: 'outcome', label: 'Outcome', render: (row) => <StatusPill value={row.outcome} /> }]} /></SectionCard>;
}

function FiscalWorkspace({ data }) {
    const fiscalEvidenceRows = [...(data?.z_readings || []), ...(data?.esales_reports || [])];
    const fiscalEvidenceColumns = [
        { key: 'record_type', label: 'Record', render: (row) => row.reading_identifier ? 'Z reading' : 'eSales' },
        { key: 'business_date', label: 'Business date', render: (row) => row.business_date || '—' },
        { key: 'report_month', label: 'Report month', render: (row) => row.report_month || '—' },
        { key: 'location_name', label: 'Branch', render: (row) => row.location_name || '—' },
        { key: 'reading_identifier', label: 'Reading', render: (row) => row.reading_identifier || '—' },
        { key: 'generated_at', label: 'Generated', render: (row) => dateTime(row.generated_at) },
        { key: 'z_total_amount', label: 'Z total', render: (row) => row.summary?.total_amount == null ? '—' : money(row.summary.total_amount) },
        { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status || (row.immutable ? 'persisted' : '—')} /> },
        { key: 'evidence_ref', label: 'Evidence', render: (row) => row.evidence_ref || '—' },
        { key: 'source', label: 'Source', render: (row) => row.source || '—' }
    ];

    return <>
        <div className="business-admin-alert info"><Database size={17} /><div><strong>Immutable fiscal read model.</strong><div>Z-readings and eSales evidence are shown from POS records. BIR accreditation, CAS/POS registration, and legal filing remain external owner gates.</div></div></div>
        <div className="business-admin-grid">
            <SectionCard title="X readings" subtitle="Current, non-persisted read summaries">
                <DataTable rows={data?.current_x_readings || []} columns={[{ key: 'business_date', label: 'Business date' }, { key: 'location_name', label: 'Branch' }, { key: 'terminal_id', label: 'Register' }, { key: 'reading_identifier', label: 'Reading' }, { key: 'source', label: 'Source' }]} emptyMessage="No X-reading summary is available." />
            </SectionCard>
            <SectionCard title="Z readings & eSales" subtitle="Persisted evidence snapshots with generated time and Z total">
                <DataTable rows={fiscalEvidenceRows} columns={fiscalEvidenceColumns} emptyMessage="No fiscal evidence is recorded for this period." />
            </SectionCard>
        </div>
    </>;
}

function RecipesWorkspace({ data }) {
    const recipes = data?.rows || [];
    return <SectionCard title="Recipe visibility" subtitle={`${number(data?.pagination?.total)} products · source ${humanize(data?.meta?.stock_source)}`}><DataTable rows={recipes} rowKey={(row) => row.item_id} emptyMessage="No recipes are configured for this scope." columns={[{ key: 'name', label: 'Product', render: (row) => <strong>{row.name}</strong> }, { key: 'sku_code', label: 'SKU' }, { key: 'product_type', label: 'Type', render: (row) => humanize(row.product_type) }, { key: 'recipe_cost', label: 'Recipe cost', render: (row) => money(row.recipe_cost) }, { key: 'availability', label: 'Availability', render: (row) => <StatusPill value={row.availability?.status} /> }, { key: 'possible_units', label: 'Possible units', render: (row) => row.availability?.possible_units == null ? '—' : number(row.availability.possible_units) }]} /></SectionCard>;
}

const PaymentSummaryMetric = ({ icon: Icon, label, value, detail, tone = '' }) => (
    <div className={`business-admin-payment-metric${tone ? ` ${tone}` : ''}`}>
        <div className="business-admin-payment-metric-icon"><Icon size={17} /></div>
        <div className="business-admin-payment-metric-copy">
            <div className="business-admin-payment-metric-label">{label}</div>
            <div className="business-admin-payment-metric-value">{value}</div>
            {detail ? <div className="business-admin-payment-metric-detail">{detail}</div> : null}
        </div>
    </div>
);

const PaymentSessionCard = ({ row }) => (
    <article className="business-admin-payment-card">
        <div className="business-admin-payment-card-heading">
            <div className="business-admin-payment-card-identity">
                <div className="business-admin-payment-card-icon"><Wallet size={16} /></div>
                <div className="business-admin-payment-card-copy">
                    <strong>{row.payment_session_id || 'Payment session'}</strong>
                    <span>{humanize(row.target_type)}</span>
                </div>
            </div>
            <StatusPill value={row.status} />
        </div>
        <div className="business-admin-payment-card-facts">
            <div><span>Amount</span><strong>{money(Number(row.total_amount_centavos || 0) / 100)}</strong></div>
            <div><span>Refunds</span><strong>{money(Number(row.refund_amount_centavos || 0) / 100)}</strong></div>
            <div><span>Paid</span><strong>{dateTime(row.paid_at || row.created_at)}</strong></div>
        </div>
    </article>
);

const processingFeeBasisLabel = (source) => {
    if (source === 'fallback') return 'Estimated fallback';
    if (source === 'manual_review') return 'Manual review';
    if (source === 'statement') return 'Provider statement';
    if (source === 'api') return 'Provider API';
    return 'Provider evidence';
};

function PaymentsWorkspace({ data }) {
    const account = data?.payment_account;
    const reconciliation = data?.reconciliation || {};
    const sessions = (data?.payment_sessions || []).map((session) => ({
        ...session,
        refund_amount_centavos: (session.refunds || []).reduce((total, refund) => total + Number(refund.amount_centavos || 0), 0)
    }));
    const paymentSessionTotal = data?.payment_sessions_page?.total ?? sessions.length;
    const exceptionCount = Number(reconciliation.exception_count || 0);
    const revenueSummary = data?.tenant_revenue?.summary || {};
    const revenueTotals = revenueSummary.totals || {};
    const processingFeeSources = revenueSummary.processing_fee_sources || {};
    const revenueTransactions = data?.tenant_revenue?.transactions || [];
    const revenueStatementAvailable = Boolean(data?.tenant_revenue?.summary);

    return (
        <div className="business-admin-payments-workspace">
                <div className="business-admin-payments-summary" aria-label="Payment summary">
                <PaymentSummaryMetric icon={Wallet} label="Collected" value={money(Number(reconciliation.collected_amount_centavos || 0) / 100)} detail="Recorded online payments" />
                <PaymentSummaryMetric icon={ShieldCheck} label="Business amount" value={money(Number(reconciliation.merchant_net_before_provider_fees_centavos || 0) / 100)} detail="Before payment processing fees" />
                <PaymentSummaryMetric icon={RefreshCw} label="Refunded" value={money(Number(reconciliation.succeeded_refund_centavos || 0) / 100)} detail={`${money(Number(reconciliation.pending_refund_centavos || 0) / 100)} pending`} />
                <PaymentSummaryMetric icon={AlertTriangle} label="Exceptions" value={number(reconciliation.exception_count)} detail={`${number(reconciliation.paid_unfinalized_count)} paid but unfinalized`} tone={exceptionCount ? 'warning' : 'positive'} />
            </div>
            <div className="business-admin-alert info business-admin-payments-contract" role="note">
                <Wallet size={17} />
                <div className="business-admin-payments-contract-copy">
                    <strong>Read-only payment activity</strong>
                    <span>{reconciliation.scope || 'Shows recorded payment-session evidence for this business; it does not change payments or transfers.'}</span>
                </div>
            </div>
            <div className="business-admin-grid">
                <SectionCard className="business-admin-payment-account-card" title="Payment account" subtitle="Your payment provider connection">
                    {account ? (
                        <div className="business-admin-payment-account-grid">
                            <div className="business-admin-payment-account-field"><span>Provider</span><strong>{humanize(account.provider)}</strong></div>
                            <div className="business-admin-payment-account-field"><span>Wallet</span><StatusPill value={account.wallet_status} /></div>
                            <div className="business-admin-payment-account-field"><span>Account setup</span><StatusPill value={account.onboarding_status} /></div>
                            <div className="business-admin-payment-account-field"><span>QR Ph payments</span><StatusPill value={account.qrph_enabled ? 'enabled' : 'disabled'} /></div>
                            <div className="business-admin-payment-account-field"><span>Payment routing</span><StatusPill value={account.split_enabled ? 'enabled' : 'disabled'} /></div>
                            <div className="business-admin-payment-account-field"><span>Last sync</span><strong>{dateTime(account.last_synced_at)}</strong></div>
                        </div>
                    ) : <Empty message="PayMongo is not configured for this business." />}
                </SectionCard>
                <SectionCard className="business-admin-payment-exceptions-card" title="Payment issues" subtitle="Items that may need follow-up">
                    <div className="business-admin-payment-exception-list">
                        <div className="business-admin-payment-exception"><div><strong>Paid but unfinalized</strong><span>Webhook finalization follow-up</span></div><b>{number(reconciliation.paid_unfinalized_count)}</b></div>
                        <div className="business-admin-payment-exception"><div><strong>Payment reconciliation</strong><span>Provider and business records need review</span></div><b>{number(reconciliation.manual_settlement_count)}</b></div>
                        <div className="business-admin-payment-exception"><div><strong>Pending refunds</strong><span>Provider refund status is not terminal</span></div><b>{money(Number(reconciliation.pending_refund_centavos || 0) / 100)}</b></div>
                    </div>
                </SectionCard>
            </div>
            <SectionCard
                className="business-admin-processing-fee-report"
                title="Processing fee statement"
                subtitle="Provider evidence, configured estimates, and reconciliation status for this business"
            >
                {revenueStatementAvailable ? (
                    <>
                        <div className="business-admin-processing-fee-report-summary">
                            <PaymentSummaryMetric icon={Wallet} label="Processing fees" value={money(Number(revenueTotals.provider_fee_centavos || 0) / 100)} detail={`${number(revenueSummary.counts?.transactions || 0)} revenue transactions`} />
                            <PaymentSummaryMetric icon={ShieldCheck} label="Actual / reconciled" value={money(Number(processingFeeSources.actual?.amount_centavos || 0) / 100)} detail={`${number(processingFeeSources.actual?.count || 0)} payments`} tone="positive" />
                            <PaymentSummaryMetric icon={AlertTriangle} label="Estimated fallback" value={money(Number(processingFeeSources.estimated_fallback?.amount_centavos || 0) / 100)} detail={`${number(processingFeeSources.estimated_fallback?.count || 0)} on hold`} tone={Number(processingFeeSources.estimated_fallback?.count || 0) ? 'warning' : ''} />
                            <PaymentSummaryMetric icon={Lock} label="Manual review" value={number(processingFeeSources.manual_review?.count || 0)} detail="Missing provider fee evidence" tone={Number(processingFeeSources.manual_review?.count || 0) ? 'warning' : 'positive'} />
                        </div>
                        <div className="business-admin-alert info mt-4" role="note">
                            <Info size={17} />
                            <span>Estimated fallback fees never replace provider evidence. The actual or reconciled amount updates the immutable financial snapshot and closes the estimate exception.</span>
                        </div>
                        {revenueTransactions.length ? (
                            <div className="business-admin-table-wrap mt-4">
                                <DataTable
                                    rows={revenueTransactions}
                                    rowKey={(row) => row.revenue_transaction_id || row.provider_payment_id}
                                    columns={[
                                        { key: 'provider_payment_id', label: 'Payment', render: (row) => <strong>{row.provider_payment_id || '—'}</strong> },
                                        { key: 'payment_method', label: 'Method', render: (row) => humanize(row.payment_method) },
                                        { key: 'gross_amount_centavos', label: 'Gross', render: (row) => money(Number(row.gross_amount_centavos || 0) / 100) },
                                        { key: 'provider_fee_centavos', label: 'Processing fee', render: (row) => row.provider_fee_centavos == null ? 'Manual review' : money(Number(row.provider_fee_centavos || 0) / 100) },
                                        { key: 'provider_fee_basis', label: 'Basis', render: (row) => processingFeeBasisLabel(row.provider_fee_source) },
                                        { key: 'reconciliation_status', label: 'Reconciliation', render: (row) => <StatusPill value={row.reconciliation_status} /> },
                                        { key: 'paid_at', label: 'Paid', render: (row) => dateTime(row.paid_at) }
                                    ]}
                                />
                            </div>
                        ) : <Empty message="No tenant-revenue transactions match the selected period." />}
                    </>
                ) : <Empty message="The source-aware processing-fee statement is not available for the selected account." />}
            </SectionCard>
            <SectionCard
                className="business-admin-payments-section-card"
                title="Recent online payments"
                subtitle={`${number(paymentSessionTotal)} payments in scope`}
                action={<span className="business-admin-payments-count">{number(sessions.length)} visible</span>}
            >
                {sessions.length ? (
                    <>
                        <div className="business-admin-payments-table-view">
                            <DataTable
                                rows={sessions}
                                rowKey={(row) => row.payment_session_id}
                                columns={[
                                    { key: 'payment_session_id', label: 'Reference', render: (row) => <strong>{row.payment_session_id}</strong> },
                                    { key: 'target_type', label: 'Order type', render: (row) => humanize(row.target_type) },
                                    { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
                                    { key: 'total_amount_centavos', label: 'Amount', render: (row) => money(Number(row.total_amount_centavos || 0) / 100) },
                                    { key: 'refund_amount_centavos', label: 'Refunds', render: (row) => money(Number(row.refund_amount_centavos || 0) / 100) },
                                    { key: 'paid_at', label: 'Paid', render: (row) => dateTime(row.paid_at || row.created_at) }
                                ]}
                            />
                        </div>
                        <div className="business-admin-payments-mobile-view">
                            <div className="business-admin-payment-card-list">
                                {sessions.map((row) => <PaymentSessionCard key={row.payment_session_id} row={row} />)}
                            </div>
                        </div>
                    </>
                ) : <Empty message="No payment sessions match the selected filters." />}
            </SectionCard>
        </div>
    );
}

const BUSINESS_ADMIN_EDITOR_TABS = Object.freeze({
    profile: ['profile', 'pos_setup'],
    pos: ['pos_setup'],
    taxes: ['taxes'],
    discounts: ['discounts'],
    storefront: ['storefront'],
    delivery: ['delivery_pricing'],
    branches: ['storefront'],
    attendance: ['pos_setup'],
    payments: ['payments'],
    processing_fees: [],
    registers: ['pos_setup']
});

function BusinessAdminSettingsEditor({
    bootstrap,
    definition,
    sectionCapability,
    settingsBranchId,
    rootPath = '/business-admin',
    settingsDirty = false,
    onLeaveSettings = () => {},
    onDirtyChange,
    onReload,
    onSettingsSaved,
    onOpenActivity = () => {},
    settingsRefreshKey = 0
}) {
    const rawCapabilities = bootstrap?.access?.settings_sections || bootstrap?.access?.capabilities?.settings_sections;
    const branchLocations = (Array.isArray(bootstrap?.business?.branches) ? bootstrap.business.branches : []).map((branch) => ({
        location_id: Number(branch?.branch_id),
        name: branch?.name || `Branch ${branch?.branch_id}`
    }));
    const editorUser = useMemo(() => buildBusinessAdminSettingsEditorUser({
        baseUser: bootstrap?.user || {},
        sectionKey: definition?.key,
        rawCapabilities
    }), [bootstrap?.user, definition?.key, rawCapabilities]);
    const isMasterAdmin = bootstrap?.user?.is_master_admin === true;
    const normalizedCapabilities = normalizeBusinessAdminSettingsCapabilities(rawCapabilities);
    const processingFeeCapability = normalizedCapabilities.processing_fees || {};
    const canViewProcessingFee = isMasterAdmin || processingFeeCapability.view === true;
    const canEditProcessingFee = isMasterAdmin || processingFeeCapability.edit === true;
    const baseAllowedTabIds = BUSINESS_ADMIN_EDITOR_TABS[definition?.key] || [];
    const allowedTabIds = definition?.key === 'pos' && canViewProcessingFee
        ? [...baseAllowedTabIds, 'processing_fees']
        : baseAllowedTabIds;
    const canViewUsers = isMasterAdmin || sectionCapability?.user_view === true || sectionCapability?.user_edit === true;
    const canEditUsers = isMasterAdmin || sectionCapability?.user_edit === true;
    const canManageStaffRoles = isMasterAdmin || String(bootstrap?.user?.role || '').toLowerCase() === 'admin';
    const hasEmployeeEditor = sectionCapability?.employee_edit === true
        || sectionCapability?.employee_credit_edit === true;
    const canViewActivity = bootstrap?.access?.capabilities?.view_audit === true;
    const handleReload = useCallback(async (options = {}) => {
        await onReload?.(options);
    }, [onReload]);
    const notifySettingsSaved = useCallback((details = {}) => {
        onSettingsSaved?.({
            section: definition?.key,
            branchId: definition?.scope === 'branch' ? settingsBranchId : '',
            ...details
        });
    }, [definition?.key, definition?.scope, onSettingsSaved, settingsBranchId]);
    const canEditCanonicalBusinessName = isMasterAdmin
        || String(bootstrap?.user?.role || '').trim().toLowerCase() === 'admin';
    const handleCanonicalBusinessNameSaved = useCallback(async (details) => {
        await handleReload({ optimisticBusinessName: details?.name });
        notifySettingsSaved({ action: 'updated', setting: 'canonical_business_name', details });
    }, [handleReload, notifySettingsSaved]);

    if (definition?.key === 'processing_fees') {
        return (
            <ProcessingFeePolicyEditor
                canEdit={canEditProcessingFee}
                onDirtyChange={onDirtyChange}
                onSettingsSaved={notifySettingsSaved}
            />
        );
    }

    if (definition?.key === 'team') {
        return (
            <div className="space-y-4" data-testid="business-admin-settings-editor-team">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-[13px] font-black text-[#0F172A]">User accounts, roles and branch access</p>
                            <p className="mt-1 text-[12px] leading-5 text-slate-600">
                                Manage team roles, including F&amp;B Admin, Restaurant Manager, Cashier and other role
                                presets. Permission changes, role scopes and branch grants use the canonical API.
                            </p>
                            {!canEditUsers ? (
                                <p className="mt-2 text-[11px] font-semibold text-amber-700">View-only access: account mutations are disabled.</p>
                            ) : null}
                        </div>
                        {canViewUsers ? (
                            <div className="business-admin-team-actions">
                                <GuardedLink
                                    to={buildBackOfficeModulePath(rootPath, 'users-roles')}
                                    isDirty={settingsDirty}
                                    onLeave={onLeaveSettings}
                                    className="business-admin-button primary"
                                >
                                    <Users size={14} /> Manage users &amp; roles
                                </GuardedLink>
                                {canViewActivity ? (
                                    <button
                                        type="button"
                                        className="business-admin-button"
                                        onClick={onOpenActivity}
                                    >
                                        <ExternalLink size={14} /> View activity
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <span className="business-admin-muted shrink-0">User access is not assigned.</span>
                        )}
                    </div>
                    {canViewUsers ? (
                        <p className="mt-3 text-[11px] leading-5 text-slate-600">
                            Employees, invitations, account status, roles, permissions and branch grants use this canonical Team &amp; Access workflow.
                            {canViewActivity ? ' Account and access changes are recorded in Audit logs.' : ''}
                        </p>
                    ) : null}
                </div>
                {hasEmployeeEditor ? (
                    <SettingsWorkspace
                        terminalUser={editorUser}
                        terminalMeta={{ pettyCashAmount: 0, pettyCashSymbol: 'PHP', locationBindingReadiness: null }}
                        locationsState={{ loading: false, locations: branchLocations }}
                        queueLocationScopeId={settingsBranchId || null}
                        incomingOrdersState={{ loading: false, orders: [] }}
                        locked={false}
                        sectionId="business-admin-settings-team-employees"
                        initialTab="employees"
                        allowedTabIds={['employees']}
                        readOnly={sectionCapability?.edit !== true}
                        showTerminalOnlyControls={false}
                        settingsSurface="business-admin"
                        editorSection={definition.key}
                        onRefreshTerminalUser={handleReload}
                        onRefreshTerminalMeta={async () => {}}
                        onPosSetupSaved={handleReload}
                        onStorefrontSetupSaved={handleReload}
                        onSettingsSaved={notifySettingsSaved}
                        settingsRefreshKey={settingsRefreshKey}
                        onDirtyChange={onDirtyChange}
                    />
                ) : null}
                {canManageStaffRoles ? <StaffRolesPanel canManage onSaved={notifySettingsSaved} /> : null}
            </div>
        );
    }

    return (
        <div data-testid={`business-admin-settings-editor-${definition?.key || 'unknown'}`}>
            <SettingsWorkspace
                terminalUser={editorUser}
                terminalMeta={{ pettyCashAmount: 0, pettyCashSymbol: 'PHP', locationBindingReadiness: null }}
                locationsState={{ loading: false, locations: branchLocations }}
                queueLocationScopeId={settingsBranchId || null}
                incomingOrdersState={{ loading: false, orders: [] }}
                locked={false}
                sectionId={`business-admin-settings-${definition?.key || 'unknown'}`}
                initialTab={allowedTabIds[0] || 'pos_setup'}
                allowedTabIds={allowedTabIds}
                readOnly={sectionCapability?.edit !== true}
                showTerminalOnlyControls={false}
                settingsSurface="business-admin"
                editorSection={definition?.key}
                profileSettingsHeader={definition?.key === 'profile' ? (
                    <CanonicalBusinessNameEditor
                        currentName={bootstrap?.business?.name || ''}
                        canEdit={canEditCanonicalBusinessName}
                        onSaved={handleCanonicalBusinessNameSaved}
                    />
                ) : null}
                onRefreshTerminalUser={handleReload}
                onRefreshTerminalMeta={async () => {}}
                onPosSetupSaved={handleReload}
                onStorefrontSetupSaved={handleReload}
                onSettingsSaved={notifySettingsSaved}
                settingsRefreshKey={settingsRefreshKey}
                onDirtyChange={onDirtyChange}
                locationScopeId={definition?.key === 'branches' ? settingsBranchId : null}
                processingFeePane={canViewProcessingFee ? (
                    <ProcessingFeePolicyEditor
                        canEdit={canEditProcessingFee}
                        onDirtyChange={onDirtyChange}
                        onSettingsSaved={notifySettingsSaved}
                    />
                ) : null}
            />
        </div>
    );
}

function BusinessAdminSettingsWorkspace({
    bootstrap,
    rootPath = '/business-admin',
    settingsSection,
    settingsBranchId,
    onBranchChange,
    onSelectSection,
    settingsDirty = false,
    onLeaveSettings = () => {},
    onDirtyChange = () => {},
    onReload = async () => {},
    onSettingsSaved = () => {},
    onOpenActivity = () => {},
    settingsRefreshKey = 0
}) {
    const access = bootstrap?.access || {};
    const branches = Array.isArray(bootstrap?.business?.branches) ? bootstrap.business.branches : [];
    const rawCapabilities = access.settings_sections || access.capabilities?.settings_sections;
    const capabilities = normalizeBusinessAdminSettingsCapabilities(rawCapabilities);
    const visibleSections = getVisibleBusinessAdminSettingsSections(rawCapabilities);
    const definition = getBusinessAdminSettingsSectionDefinition(settingsSection);
    const sectionCapability = definition ? capabilities[definition.key] : null;
    const isVisible = definition ? canAccessBusinessAdminSettingsSection(rawCapabilities, definition.key, 'view') : false;
    const settingsSectionListRef = useRef(null);
    const [settingsSectionScrollState, setSettingsSectionScrollState] = useState({
        canScrollLeft: false,
        canScrollRight: false
    });

    const updateSettingsSectionScrollState = useCallback(() => {
        const element = settingsSectionListRef.current;
        if (!element) return;
        const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
        setSettingsSectionScrollState({
            canScrollLeft: element.scrollLeft > 1,
            canScrollRight: element.scrollLeft < maxScrollLeft - 1
        });
    }, []);

    const scrollSettingsSections = useCallback((direction) => {
        const element = settingsSectionListRef.current;
        if (!element) return;
        const distance = Math.max(220, Math.round(element.clientWidth * 0.72));
        element.scrollBy({ left: direction * distance, behavior: 'smooth' });
    }, []);

    useEffect(() => {
        const element = settingsSectionListRef.current;
        if (!element) return undefined;
        updateSettingsSectionScrollState();
        element.addEventListener('scroll', updateSettingsSectionScrollState, { passive: true });
        window.addEventListener('resize', updateSettingsSectionScrollState);
        const resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(updateSettingsSectionScrollState)
            : null;
        resizeObserver?.observe(element);
        return () => {
            element.removeEventListener('scroll', updateSettingsSectionScrollState);
            window.removeEventListener('resize', updateSettingsSectionScrollState);
            resizeObserver?.disconnect();
        };
    }, [updateSettingsSectionScrollState, visibleSections.length]);

    useEffect(() => {
        const activeSection = settingsSectionListRef.current?.querySelector('.business-admin-settings-section.active');
        if (typeof activeSection?.scrollIntoView === 'function') {
            activeSection.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }, [definition?.key]);

    const handleBranchChange = (nextBranchId) => {
        if (String(nextBranchId || '') === String(settingsBranchId || '')) return;
        if (shouldBlockSettingsNavigation(settingsDirty)) {
            const confirmed = typeof window === 'undefined'
                || typeof window.confirm !== 'function'
                || window.confirm('You have unsaved settings changes. Change branch and discard them?');
            if (!confirmed) return;
            onLeaveSettings?.();
        }
        onBranchChange(nextBranchId);
    };

    if (!visibleSections.length) {
        return (
            <div className="business-admin-alert error" data-testid="business-admin-settings-denied">
                <Lock size={17} />
                <div>
                    <strong>Settings access is not assigned.</strong>
                    <div>Your Back Office access does not include a view permission for any settings section.</div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="business-admin-settings-workspace">
                <div className="business-admin-settings-layout">
                    <section className="business-admin-card business-admin-settings-nav" aria-label="Settings sections">
                        <div className="business-admin-card-header">
                            <div>
                                <div className="business-admin-card-title">Settings sections</div>
                            </div>
                        </div>
                        <div className="business-admin-card-body business-admin-settings-nav-body">
                            <div className="business-admin-settings-nav-strip">
                                <button
                                    type="button"
                                    className="business-admin-settings-nav-control"
                                    aria-label="Scroll settings sections left"
                                    title="Scroll settings sections left"
                                    onClick={() => scrollSettingsSections(-1)}
                                    disabled={!settingsSectionScrollState.canScrollLeft}
                                >
                                    <ChevronLeft size={17} aria-hidden="true" />
                                </button>
                                <div className="business-admin-settings-section-list" ref={settingsSectionListRef}>
                                    {visibleSections.map((section) => {
                                        const sectionAccess = capabilities[section.key] || {};
                                        return (
                                            <button
                                                type="button"
                                                key={section.key}
                                                className={`business-admin-settings-section ${section.key === definition?.key ? 'active' : ''}`}
                                                onClick={() => onSelectSection(section.key)}
                                                aria-current={section.key === definition?.key ? 'page' : undefined}
                                            >
                                                <span><strong>{section.label}</strong></span>
                                                <span className={`business-admin-status ${sectionAccess.edit ? 'available' : ''}`}>
                                                    {sectionAccess.edit ? 'Edit' : 'View'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    type="button"
                                    className="business-admin-settings-nav-control"
                                    aria-label="Scroll settings sections right"
                                    title="Scroll settings sections right"
                                    onClick={() => scrollSettingsSections(1)}
                                    disabled={!settingsSectionScrollState.canScrollRight}
                                >
                                    <ChevronRight size={17} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
                <section className="business-admin-card" data-testid="business-admin-settings-section">
                    {!definition || !isVisible ? (
                        <div className="business-admin-card-body">
                            <div className="business-admin-alert error mb-0">
                                <Lock size={17} />
                                <div>
                                    <strong>Settings section unavailable.</strong>
                                    <div>This section is not enabled for your current Back Office permissions.</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="business-admin-card-header">
                                <div>
                                    <div className="business-admin-card-title">{definition.label}</div>
                                    <div className="business-admin-card-subtitle">{definition.description}</div>
                                </div>
                                <span className={`business-admin-status ${sectionCapability?.edit ? 'available' : ''}`}>
                                    {sectionCapability?.edit ? 'Edit permission' : 'Read-only'}
                                </span>
                            </div>
                            <div className="business-admin-card-body">
                                <div className="business-admin-settings-context-grid">
                                    <div>
                                        <div className="business-admin-kicker">Business</div>
                                        <strong>{bootstrap?.business?.name || 'Business'}</strong>
                                    </div>
                                    <div>
                                        <div className="business-admin-kicker">Scope</div>
                                        <strong>{settingsScopeLabel(access.scope, definition.scope)}</strong>
                                    </div>
                                </div>
                                {definition.scope === 'branch' ? (
                                    <div className="business-admin-field mt-4 max-w-sm">
                                        <label htmlFor="ba-settings-branch"><MapPin size={12} className="inline mr-1" /> Branch context</label>
                                        <select id="ba-settings-branch" value={settingsBranchId} onChange={(event) => handleBranchChange(event.target.value)}>
                                            {!branches.length ? <option value="">No visible branches</option> : null}
                                            {branches.map((branch) => <option value={branch.branch_id} key={branch.branch_id}>{branch.name}</option>)}
                                        </select>
                                    </div>
                                ) : null}
                                <div className="mt-4">
                                    <BusinessAdminSettingsEditor
                                        key={`${definition.key}-${settingsRefreshKey}`}
                                        bootstrap={bootstrap}
                                        definition={definition}
                                        sectionCapability={sectionCapability}
                                        settingsBranchId={settingsBranchId}
                                        rootPath={rootPath}
                                        settingsDirty={settingsDirty}
                                        onLeaveSettings={onLeaveSettings}
                                        onDirtyChange={onDirtyChange}
                                        onReload={onReload}
                                        onSettingsSaved={onSettingsSaved}
                                        onOpenActivity={onOpenActivity}
                                        settingsRefreshKey={settingsRefreshKey}
                                    />
                                </div>
                                <div className="business-admin-settings-terminal-link">
                                    <GuardedLink
                                        href={buildPosTerminalUrl({ path: '/terminal', search: `?view=${encodeURIComponent('terminal_setup')}` })}
                                        isDirty={settingsDirty}
                                        onLeave={onLeaveSettings}
                                        className="business-admin-button"
                                    >
                                        <ExternalLink size={14} /> Open POS terminal controls
                                    </GuardedLink>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </>
    );
}

function BusinessAdminUsersRolesWorkspace({
    bootstrap,
    canViewUsers,
    canEditUsers,
    onSettingsSaved = () => {},
    onBack = () => {}
}) {
    const locationOptions = useMemo(() => (
        (Array.isArray(bootstrap?.business?.branches) ? bootstrap.business.branches : []).map((branch) => ({
            location_id: Number(branch?.branch_id),
            name: branch?.name || `Branch ${branch?.branch_id}`
        }))
    ), [bootstrap]);

    if (!canViewUsers) {
        return (
            <div className="business-admin-card" data-testid="business-admin-users-roles-denied">
                <div className="business-admin-card-body">
                    <div className="business-admin-alert error mb-0">
                        <Lock size={17} />
                        <div>
                            <strong>Users &amp; Roles access is not assigned.</strong>
                            <div>Your Back Office permissions do not include user-account access.</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="business-admin-users-roles-workspace">
            <section className="business-admin-card">
                <div className="business-admin-card-header">
                    <div>
                        <div className="business-admin-card-title">Users &amp; Roles</div>
                        <div className="business-admin-card-subtitle">Manage user accounts, invitations, roles, permissions, and branch access.</div>
                    </div>
                    <button type="button" className="business-admin-button" onClick={onBack}>
                        <ChevronLeft size={14} /> Team &amp; access
                    </button>
                </div>
            </section>
            <UserManagementModal
                open
                embedded
                onOpenChange={(isOpen) => {
                    if (!isOpen) onBack();
                }}
                readOnly={!canEditUsers}
                onSettingsSaved={onSettingsSaved}
                locationOptions={locationOptions}
                invitationTitle="Add team member"
                invitationSubmitLabel="Send invitation"
            />
        </div>
    );
}

const ExpensesPagination = ({ pagination = {}, onPageChange, refreshing = false }) => {
    const total = Math.max(Number(pagination.total) || 0, 0);
    const limit = Math.max(Number(pagination.limit) || 20, 1);
    const totalPages = Math.max(Number(pagination.total_pages) || Math.ceil(total / limit), 1);
    const page = Math.min(Math.max(Number(pagination.page) || 1, 1), totalPages);
    if (!total || totalPages <= 1) return null;
    const start = ((page - 1) * limit) + 1;
    const end = Math.min(page * limit, total);
    return (
        <nav className="business-admin-orders-pagination" aria-label="Expenses pagination">
            <div className="business-admin-orders-pagination-summary">
                <strong>{number(start)}–{number(end)}</strong>
                <span>of {number(total)} expenses</span>
            </div>
            <div className="business-admin-orders-pagination-actions">
                <button type="button" className="business-admin-button" onClick={() => onPageChange(page - 1)} disabled={refreshing || page <= 1} aria-label="Previous expenses page"> <ChevronLeft size={14} /> Previous</button>
                <span className="business-admin-orders-pagination-page">Page {number(page)} of {number(totalPages)}</span>
                <button type="button" className="business-admin-button" onClick={() => onPageChange(page + 1)} disabled={refreshing || page >= totalPages} aria-label="Next expenses page">Next <ChevronRight size={14} /></button>
            </div>
        </nav>
    );
};

const ExpenseMobileCard = ({ row, canVoid, onVoid, actionLoading }) => (
    <article className="business-admin-expense-card">
        <div className="business-admin-expense-card-heading">
            <div className="business-admin-expense-card-identity">
                <div className="business-admin-expense-card-icon"><Receipt size={16} /></div>
                <div className="business-admin-expense-card-copy">
                    <strong>{row.description}</strong>
                    <span>{row.expense_date} · {row.branch_name}</span>
                </div>
            </div>
            <StatusPill value={row.status} />
        </div>
        <div className="business-admin-expense-card-facts">
            <div><span>Category</span><strong>{humanize(row.category)}</strong></div>
            <div><span>Amount</span><strong>{money(row.amount)}</strong></div>
            <div><span>Paid via</span><strong>{humanize(row.payment_method)}</strong></div>
            <div><span>Vendor</span><strong>{row.vendor_name || '—'}</strong></div>
        </div>
        {canVoid && row.status === 'posted' ? <button type="button" className="business-admin-expense-void-link" onClick={() => onVoid(row)} disabled={actionLoading}>Void expense</button> : null}
    </article>
);

function ExpensesWorkspace({ data, branches, capabilities, accessScope, onCreate, onVoid, actionLoading, onPageChange, refreshing = false, refreshError = '' }) {
    const [isAdding, setIsAdding] = useState(false);
    const [form, setForm] = useState(newExpenseForm);
    const [voidingExpense, setVoidingExpense] = useState(null);
    const [voidReason, setVoidReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [voidSubmitting, setVoidSubmitting] = useState(false);
    const expenses = Array.isArray(data?.expenses) ? data.expenses : [];
    const summary = data?.summary || {};
    const categories = Array.isArray(data?.categories) && data.categories.length ? data.categories : expenseCategories;
    const paymentMethods = Array.isArray(data?.payment_methods) && data.payment_methods.length ? data.payment_methods : expensePaymentMethods;
    const canView = capabilities?.view_expenses === true;
    const canCreate = Boolean(capabilities?.create_expenses);
    const canVoid = Boolean(capabilities?.void_expenses);
    const expensesRecordsRef = useBusinessAdminPaginatedPanelTransition({ page: data?.pagination?.page, refreshing });

    useEffect(() => {
        if (accessScope !== 'all' && !form.branch_id && branches.length) {
            setForm((current) => ({ ...current, branch_id: String(branches[0].branch_id) }));
        }
    }, [accessScope, branches, form.branch_id]);

    const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
    const submitCreate = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            await onCreate({
                ...form,
                branch_id: form.branch_id || null,
                amount: String(form.amount || '').trim(),
                idempotency_key: createExpenseIdempotencyKey()
            });
            setForm(newExpenseForm());
            setIsAdding(false);
        } catch {
            // The parent surface displays the API error without closing the form.
        } finally {
            setSubmitting(false);
        }
    };

    const submitVoid = async (event) => {
        event.preventDefault();
        if (!voidingExpense) return;
        setVoidSubmitting(true);
        try {
            await onVoid(voidingExpense.expense_id, { reason: voidReason });
            setVoidingExpense(null);
            setVoidReason('');
        } catch {
            // Keep the dialog open so the reason can be corrected or retried.
        } finally {
            setVoidSubmitting(false);
        }
    };

    if (!canView) {
        return <div className="business-admin-alert info"><ShieldCheck size={17} /><div><strong>Expense ledger access is restricted.</strong><div>Your role can open Back Office but does not have the expense viewing permission.</div></div></div>;
    }

    return (
        <div className="business-admin-expenses-workspace">
            <div className="business-admin-expenses-contract" role="note">
                <Receipt size={17} />
                <div className="business-admin-expenses-contract-copy">
                    <strong>Operational expense ledger</strong>
                    <span>Posted expenses are branch-scoped and auditable. Cash drawer additions and cash-outs remain in Shifts & cash.</span>
                </div>
            </div>
            <div className="business-admin-expenses-summary">
                <Metric label="Posted expenses" value={money(summary.posted_amount)} hint={`${number(summary.posted_entries)} posted entries`} tone="positive" />
                <Metric label="All recorded" value={money(summary.total_amount)} hint={`${number(summary.entry_count)} entries in this scope`} />
                <Metric label="Voided amount" value={money(summary.voided_amount)} hint={`${number(summary.voided_entries)} voided entries`} tone="warning" />
            </div>
            {isAdding ? (
                <section className="business-admin-expense-entry-card">
                    <div className="business-admin-expense-entry-heading">
                        <div><div className="business-admin-kicker">New record</div><h2>Record an operating expense</h2></div>
                        <button type="button" className="business-admin-button" onClick={() => setIsAdding(false)}><X size={14} /> Close</button>
                    </div>
                    <form className="business-admin-expense-form" onSubmit={submitCreate}>
                        <div className="business-admin-expense-form-grid">
                            <label className="business-admin-field"><span>Date</span><input type="date" value={form.expense_date} onChange={updateField('expense_date')} required /></label>
                            <label className="business-admin-field"><span>Category</span><select value={form.category} onChange={updateField('category')}>{categories.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
                            <label className="business-admin-field"><span>Amount (PHP)</span><input type="number" min="0.01" step="0.0001" inputMode="decimal" value={form.amount} onChange={updateField('amount')} placeholder="0.00" required /></label>
                            <label className="business-admin-field"><span>Paid via</span><select value={form.payment_method} onChange={updateField('payment_method')}>{paymentMethods.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
                            <label className="business-admin-field"><span>Branch</span><select value={form.branch_id} onChange={updateField('branch_id')}><option value="">Company-wide</option>{branches.map((branch) => <option key={branch.branch_id} value={branch.branch_id}>{branch.name}</option>)}</select></label>
                            <label className="business-admin-field business-admin-expense-form-wide"><span>Description</span><input type="text" maxLength="255" value={form.description} onChange={updateField('description')} placeholder="What was purchased or paid?" required /></label>
                            <label className="business-admin-field"><span>Vendor</span><input type="text" maxLength="160" value={form.vendor_name} onChange={updateField('vendor_name')} placeholder="Optional" /></label>
                            <label className="business-admin-field"><span>Reference</span><input type="text" maxLength="120" value={form.reference} onChange={updateField('reference')} placeholder="Receipt or invoice no." /></label>
                            <label className="business-admin-field business-admin-expense-form-wide"><span>Notes</span><textarea maxLength="500" rows="2" value={form.notes} onChange={updateField('notes')} placeholder="Optional context for the audit trail" /></label>
                        </div>
                        <div className="business-admin-expense-form-actions"><span>Profit-after-expenses and tax calculations remain deferred.</span><button type="submit" className="business-admin-button primary" disabled={submitting || actionLoading === 'expense-create'}><Plus size={14} /> {submitting ? 'Saving…' : 'Save expense'}</button></div>
                    </form>
                </section>
            ) : null}
            <SectionCard
                className="business-admin-expenses-section-card"
                title="Expense ledger"
                subtitle={`${number(data?.pagination?.total)} recorded expenses in the selected scope`}
                action={canCreate ? <button type="button" className="business-admin-button primary" onClick={() => setIsAdding(true)}><Plus size={14} /> Add expense</button> : null}
            >
                <div
                    ref={expensesRecordsRef}
                    className={`business-admin-expenses-results ${refreshing ? 'is-refreshing' : ''}`}
                    data-testid="business-admin-expenses-results"
                    aria-busy={refreshing ? 'true' : 'false'}
                >
                    <div className="business-admin-expenses-results-content">
                        {expenses.length ? (
                            <>
                                <div className="business-admin-expenses-table-view">
                                    <DataTable
                                        rows={expenses}
                                        rowKey={(row) => row.expense_id}
                                        columns={[
                                            { key: 'expense_date', label: 'Date' },
                                            { key: 'description', label: 'Description', render: (row) => <strong>{row.description}</strong> },
                                            { key: 'category', label: 'Category', render: (row) => humanize(row.category) },
                                            { key: 'branch_name', label: 'Branch' },
                                            { key: 'payment_method', label: 'Paid via', render: (row) => humanize(row.payment_method) },
                                            { key: 'amount', label: 'Amount', render: (row) => <strong>{money(row.amount)}</strong> },
                                            { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
                                            { key: 'actions', label: 'Actions', render: (row) => canVoid && row.status === 'posted' ? <button type="button" className="business-admin-expense-void-button" onClick={() => { setVoidingExpense(row); setVoidReason(''); }}>Void</button> : '—' }
                                        ]}
                                    />
                                </div>
                                <div className="business-admin-expenses-mobile-view">
                                    <div className="business-admin-expense-card-list">{expenses.map((row) => <ExpenseMobileCard key={row.expense_id} row={row} canVoid={canVoid} onVoid={(expense) => { setVoidingExpense(expense); setVoidReason(''); }} actionLoading={voidSubmitting || actionLoading === row.expense_id} />)}</div>
                                </div>
                            </>
                        ) : <Empty message={canCreate ? 'No expenses match the selected filters. Use Add expense to record the first operating cost.' : 'No expenses match the selected filters for this account.'} />}
                    </div>
                    {refreshing ? (
                        <div className="business-admin-expenses-refreshing" role="status" aria-live="polite">
                            <span className="business-admin-spinner" aria-hidden="true" /> Updating expense ledger…
                        </div>
                    ) : null}
                </div>
                {refreshError ? (
                    <div className="business-admin-alert error business-admin-expenses-panel-error">
                        <AlertTriangle size={17} />
                        <div><strong>Expense ledger could not be refreshed.</strong><div>{refreshError}</div></div>
                    </div>
                ) : null}
                <ExpensesPagination pagination={data?.pagination} onPageChange={onPageChange} refreshing={refreshing} />
            </SectionCard>
            {voidingExpense ? (
                <div className="business-admin-expense-modal-backdrop" role="presentation">
                    <form className="business-admin-expense-modal" onSubmit={submitVoid} role="dialog" aria-modal="true" aria-labelledby="void-expense-title">
                        <div className="business-admin-expense-entry-heading"><div><div className="business-admin-kicker">Correct record</div><h2 id="void-expense-title">Void expense</h2></div><button type="button" className="business-admin-button" onClick={() => setVoidingExpense(null)}><X size={14} /> Close</button></div>
                        <p className="business-admin-expense-modal-copy">This keeps the original record and marks it voided. It will remain visible in the ledger and audit history.</p>
                        <div className="business-admin-expense-modal-record"><strong>{voidingExpense.description}</strong><span>{voidingExpense.expense_date} · {money(voidingExpense.amount)}</span></div>
                        <label className="business-admin-field"><span>Reason</span><textarea rows="3" maxLength="500" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Explain why this record is being voided" required /></label>
                        <div className="business-admin-expense-form-actions"><span>This action cannot be undone.</span><button type="submit" className="business-admin-button danger" disabled={voidSubmitting || actionLoading === voidingExpense.expense_id}> {voidSubmitting ? 'Voiding…' : 'Void expense'} </button></div>
                    </form>
                </div>
            ) : null}
        </div>
    );
}

function SimpleWorkspace({ section, bootstrap }) {
    const capabilities = bootstrap?.workflow?.capabilities || {};
    const access = bootstrap?.access || {};
    const business = bootstrap?.business || {};
    const features = {
        fnb: [
            <BlockedFeature key="dining" icon={Utensils} title="Dining mode" description="The current operating mode determines which dining features are available." reason={capabilities.fnbDining ? 'Enabled' : 'Mode capability is disabled'} />,
            <BlockedFeature key="tables" icon={MapPin} title="Table service" description="Table and kitchen queue ownership stays in POS/F&B workflows." reason={capabilities.tableService ? 'Enabled' : 'Mode capability is disabled'} />,
            <BlockedFeature key="charges" icon={Wallet} title="Service charges" description="Restaurant service-charge settings are read from the shared workflow capability resolver." reason={capabilities.restaurantServiceCharge ? 'Enabled' : 'Mode capability is disabled'} />
        ],
        onboarding: [
            <BlockedFeature key="branch" icon={Building2} title="Branch readiness" description={`${number(business.branches?.length)} active branch(es) are visible to this account.`} reason={access.scope === 'all' ? 'All business branches' : 'Assigned branch scope'} />,
            <BlockedFeature key="terminal" icon={Monitor} title="Terminal handoff" description="Open the POS terminal to pair hardware, open shifts, and perform checkout operations." reason="POS owns terminal mutations" />,
            <BlockedFeature key="fiscal" icon={Receipt} title="Fiscal readiness" description="Fiscal evidence is available in this workspace when the POS fiscal module has recorded it." reason="External accreditation is not inferred" />
        ],
        storefront: [
            <BlockedFeature key="catalog" icon={Store} title="Storefront catalog" description="Catalog publishing remains owned by the shared inventory/catalog workflow." reason="Use the POS catalog workspace for authoring" />,
            <BlockedFeature key="orders" icon={ShoppingBag} title="Online orders" description="Storefront orders are visible in Orders and routed through the canonical POS queue." reason="Storefront owns public commerce" />,
            <BlockedFeature key="delivery" icon={MapPin} title="Delivery operations" description="Delivery runs and provider handoffs remain in the POS operational flow." reason="No duplicate Back Office mutation path" />
        ],
        settings: [
            <BlockedFeature key="scope" icon={ShieldCheck} title="Access scope" description="Back Office follows the business and branch access assigned to the signed-in user." reason={`${humanize(access.scope || 'unknown')} access`} />,
            <BlockedFeature key="catalog" icon={Package} title="Catalog settings" description="Use the POS terminal's catalog workspace for item and category authoring." reason="Canonical catalog owner: POS" />,
            <BlockedFeature key="policy" icon={Settings} title="Policy-gated features" description="Expenses, selfie attendance, and BIR accreditation are not enabled by inventing unapproved storage or biometric flows." reason="Owner/policy approval required" />
        ],
        attendance: [
            <BlockedFeature key="operator-sessions" icon={Clock3} title="POS operator sessions" description="Workforce and shift activity are available from POS records, including operator session context where recorded." reason="Use Team & access and Shifts & cash" />,
            <BlockedFeature key="selfie" icon={UserRound} title="Selfie time-in / time-out" description="Biometric attendance is not enabled in this workspace." reason="ADR 0073 non-goal; privacy, consent, retention, and owner approval required" />,
            <BlockedFeature key="payroll" icon={Users} title="Payroll export" description="Payroll and statutory attendance exports are outside the current POS ownership contract." reason="HR/payroll owner required" />
        ]
    };
    const cards = features[section] || features.settings;
    return <><div className="business-admin-alert info"><CheckCircle2 size={17} /><div><strong>Read-model boundary.</strong><div>This business Back Office keeps POS, Storefront, catalog, inventory, identity, and fiscal ownership boundaries intact.</div></div></div><div className="business-admin-feature-grid">{cards}</div><div className="mt-5 flex flex-wrap gap-3"><a href={buildPosTerminalUrl()} className="business-admin-button primary"><ExternalLink size={14} /> Open POS terminal</a>{section === 'fnb' ? <a href={buildPosTerminalUrl()} className="business-admin-button"><ChefHat size={14} /> Open F&B operations</a> : null}</div></>;
}

function CompanyWorkspace({ data }) {
    const readiness = data?.readiness || {};
    const checks = [
        ['company_profile', 'Company profile'],
        ['storefront', 'Storefront settings'],
        ['location', 'Primary location'],
        ['hours', 'Business hours'],
        ['uploads_reviewed', 'Registration uploads reviewed'],
        ['menu_extraction', 'Menu extraction reviewed']
    ];
    return <div className="space-y-5" data-testid="company-workspace">
        <SectionCard title="Company readiness" subtitle="Company registration and setup status for this tenant.">
            <div className="grid gap-4 sm:grid-cols-3"><Metric label="Company" value={data?.identity?.name || '—'} /><Metric label="Registration" value={humanize(data?.registration?.review_status || 'not submitted')} /><Metric label="Provisioning" value={humanize(data?.registration?.provisioning_status || 'not started')} /></div>
            <div className="mt-5 rounded-xl border border-[#d8e8e3] bg-[#f7fbfa] p-4"><div className="business-admin-kicker">Next authorized action</div><p className="mt-1 font-semibold text-[#173e58]">{data?.next_action || 'Review company setup.'}</p></div>
        </SectionCard>
        <SectionCard title="Readiness checks" subtitle="These checks read canonical settings and location data; this page does not duplicate their editors."><div className="grid gap-3 sm:grid-cols-2">{checks.map(([key, label]) => <div key={key} className="flex items-center justify-between rounded-xl border p-3"><span className="text-sm font-medium">{label}</span><StatusPill value={readiness[key] ? 'ready' : 'needs attention'} /></div>)}</div></SectionCard>
        <SectionCard title="Registration uploads" subtitle="Original files remain private and auditable. Menu extraction never publishes catalog rows automatically."><DataTable rows={data?.storefront?.uploads || []} rowKey={(row) => row.id} emptyMessage="No registration uploads." columns={[{ key: 'original_filename', label: 'File', render: (row) => <strong>{row.original_filename}</strong> }, { key: 'asset_kind', label: 'Kind', render: (row) => humanize(row.asset_kind) }, { key: 'extraction_status', label: 'Extraction', render: (row) => <StatusPill value={row.extraction_status} /> }, { key: 'review_status', label: 'Review', render: (row) => <StatusPill value={row.review_status} /> }]} /></SectionCard>
        <SectionCard title="Canonical editors" subtitle="Use the existing settings and location owners for changes."><div className="flex flex-wrap gap-3"><a className="business-admin-button primary" href={data?.authorized_actions?.settings_profile || '/settings/profile'}>Open business settings</a><a className="business-admin-button" href={data?.authorized_actions?.storefront_settings || '/settings/storefront'}>Open Storefront settings</a><a className="business-admin-button" href={data?.authorized_actions?.locations || '/settings/branches'}>Open locations</a></div></SectionCard>
    </div>;
}

const BusinessAdminWorkspaceTabs = ({ tabs = [], activeKey = '', onNavigate }) => {
    if (!tabs.length) return null;
    return (
        <nav className="business-admin-workspace-tabs" aria-label="Workspace sections" data-testid="business-admin-workspace-tabs">
            <div className="business-admin-workspace-tabs-scroll">
                {tabs.map((tab) => (
                    <button
                        type="button"
                        key={tab.key}
                        className={`business-admin-workspace-tab ${activeKey === tab.key ? 'active' : ''}`}
                        aria-current={activeKey === tab.key ? 'page' : undefined}
                        data-testid={`business-admin-workspace-tab-${tab.key}`}
                        onClick={() => onNavigate(tab)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </nav>
    );
};

export default function BusinessAdminPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const {
        loading: workflowModeLoading,
        resolved: workflowModeResolved,
        workflowMode,
        enabledCapabilities,
        disabledCapabilities
    } = useWorkflowMode();
    // OPIS sections live at the origin root. Legacy prefixed URLs are redirected in main.jsx.
    const rootPath = location.pathname.startsWith('/business-admin')
        ? '/business-admin'
        : location.pathname.startsWith('/backoffice') ? '/backoffice' : '/';
    const pathInfo = useMemo(() => parseBusinessAdminPath(location.pathname, rootPath), [location.pathname, rootPath]);
    const pathSegment = pathInfo.activeSection;
    const knownSections = useMemo(() => new Set(Object.keys(BACKOFFICE_SECTION_META)), []);
    const activeSection = knownSections.has(pathSegment) ? pathSegment : 'overview';
    const settingsSection = activeSection === 'settings' ? pathInfo.settingsSection : '';
    const usersRolesShortcut = pathInfo.usersRolesShortcut === true;
    const locationView = activeSection === 'locations' ? pathInfo.locationView : '';
    const [bootstrap, setBootstrap] = useState(null);
    const [bootstrapLoading, setBootstrapLoading] = useState(true);
    const [bootstrapRefreshing, setBootstrapRefreshing] = useState(false);
    const [bootstrapError, setBootstrapError] = useState('');
    const [bootstrapAuthRequired, setBootstrapAuthRequired] = useState(false);
    const [bootstrapAccessDenied, setBootstrapAccessDenied] = useState(false);
    const [sectionData, setSectionData] = useState(null);
    const [loadedSection, setLoadedSection] = useState('');
    const [sectionLoading, setSectionLoading] = useState(false);
    const [sectionError, setSectionError] = useState('');
    const [sectionAccessDenied, setSectionAccessDenied] = useState(false);
    const initialDateRangePreset = getDefaultDateRangePreset(activeSection);
    const initialDateRange = getDefaultDateRangeForSection(activeSection);
    const [dateRangePreset, setDateRangePreset] = useState(initialDateRangePreset);
    const [dateFrom, setDateFrom] = useState(initialDateRange.dateFrom);
    const [dateTo, setDateTo] = useState(initialDateRange.dateTo);
    const branchId = useMemo(() => (
        String(new URLSearchParams(location.search).get('branch_id') || '').trim()
    ), [location.search]);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [receiptType, setReceiptType] = useState('');
    const [ordersPage, setOrdersPage] = useState(1);
    const [expensesPage, setExpensesPage] = useState(1);
    const [cashSummaryPage, setCashSummaryPage] = useState(1);
    const [inventoryPage, setInventoryPage] = useState(1);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [actionError, setActionError] = useState('');
    const [voidHistoryOpen, setVoidHistoryOpen] = useState(false);
    const [voidHistoryRows, setVoidHistoryRows] = useState([]);
    const [voidHistoryLoading, setVoidHistoryLoading] = useState(false);
    const [voidHistoryError, setVoidHistoryError] = useState('');
    const [cashSummaryExporting, setCashSummaryExporting] = useState(false);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(readBusinessAdminSidebarCollapsed);
    const [settingsBranchId, setSettingsBranchId] = useState(() => (
        String(new URLSearchParams(location.search).get('branch_id') || '').trim()
    ));
    const [settingsDirty, setSettingsDirty] = useState(false);
    const requestRef = useRef(0);
    const sectionAbortRef = useRef(null);
    const bootstrapRef = useRef(null);
    const previousSectionRef = useRef(activeSection);

    useEffect(() => {
        bootstrapRef.current = bootstrap;
    }, [bootstrap]);

    useEffect(() => {
        setMobileNavOpen(false);
    }, [activeSection]);

    useEffect(() => {
        if (!mobileNavOpen || typeof window === 'undefined') return undefined;
        const handleMobileNavKeyDown = (event) => {
            if (event.key === 'Escape') setMobileNavOpen(false);
        };
        window.addEventListener('keydown', handleMobileNavKeyDown);
        return () => window.removeEventListener('keydown', handleMobileNavKeyDown);
    }, [mobileNavOpen]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.sessionStorage.setItem(
                BUSINESS_ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY,
                String(sidebarCollapsed)
            );
        } catch {
            // Sidebar preference is best-effort when browser storage is unavailable.
        }
    }, [sidebarCollapsed]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
        const pageClass = 'business-admin-page';
        const activeClass = 'business-admin-scrollbar-active';
        let hideTimer;
        const activateScrollbars = () => {
            document.documentElement.classList.add(activeClass);
            window.clearTimeout(hideTimer);
            hideTimer = window.setTimeout(() => {
                document.documentElement.classList.remove(activeClass);
            }, 900);
        };
        const handlePointerMove = (event) => {
            if (window.innerWidth - event.clientX <= 18) activateScrollbars();
        };
        const handleKeyDown = (event) => {
            if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) {
                activateScrollbars();
            }
        };

        document.documentElement.classList.add(pageClass);
        window.addEventListener('scroll', activateScrollbars, { passive: true });
        window.addEventListener('wheel', activateScrollbars, { passive: true });
        window.addEventListener('touchmove', activateScrollbars, { passive: true });
        window.addEventListener('pointerdown', activateScrollbars, { passive: true });
        window.addEventListener('pointermove', handlePointerMove, { passive: true });
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.clearTimeout(hideTimer);
            window.removeEventListener('scroll', activateScrollbars);
            window.removeEventListener('wheel', activateScrollbars);
            window.removeEventListener('touchmove', activateScrollbars);
            window.removeEventListener('pointerdown', activateScrollbars);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('keydown', handleKeyDown);
            document.documentElement.classList.remove(pageClass, activeClass);
        };
    }, []);

    const handleSidebarToggle = () => {
        setSidebarCollapsed((value) => !value);
    };

    useEffect(() => {
        if (previousSectionRef.current === activeSection) return;
        previousSectionRef.current = activeSection;
        if (dateRangePreset === 'custom') return;
        const nextPreset = getDefaultDateRangePreset(activeSection);
        const nextRange = getDateRangeForPreset(nextPreset);
        setDateRangePreset(nextPreset);
        setDateFrom(nextRange.dateFrom);
        setDateTo(nextRange.dateTo);
    }, [activeSection, dateRangePreset]);

    const activeDateRangePreset = previousSectionRef.current !== activeSection && dateRangePreset !== 'custom'
            ? getDefaultDateRangePreset(activeSection)
            : dateRangePreset;
    const activeDateRange = useMemo(() => {
        const effectivePreset = activeDateRangePreset;
        return effectivePreset === 'custom'
            ? { dateFrom, dateTo }
            : getDateRangeForPreset(effectivePreset);
    }, [activeDateRangePreset, dateFrom, dateTo]);

    useEffect(() => {
        if (activeSection === 'orders') setOrdersPage(1);
        if (activeSection === 'expenses') setExpensesPage(1);
        if (activeSection === 'shifts') setCashSummaryPage(1);
        if (activeSection === 'inventory') setInventoryPage(1);
    }, [activeSection, activeDateRange.dateFrom, activeDateRange.dateTo, branchId, receiptType, search]);

    useEffect(() => {
        const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const settingsCapabilities = useMemo(() => normalizeBusinessAdminSettingsCapabilities(
        bootstrap?.access?.settings_sections || bootstrap?.access?.capabilities?.settings_sections
    ), [bootstrap]);
    const visibleSettingsSections = useMemo(() => getVisibleBusinessAdminSettingsSections(settingsCapabilities), [settingsCapabilities]);
    const canViewUsers = bootstrap?.user?.is_master_admin === true
        || settingsCapabilities.team?.user_view === true
        || settingsCapabilities.team?.user_edit === true;
    const canEditUsers = bootstrap?.user?.is_master_admin === true
        || settingsCapabilities.team?.user_edit === true;
    const settingsDefinition = useMemo(
        () => getBusinessAdminSettingsSectionDefinition(settingsSection),
        [settingsSection]
    );
    const branches = useMemo(() => bootstrap?.business?.branches || [], [bootstrap]);
    const catalogOnlyAccess = bootstrap?.access?.tenant_capabilities?.pos_enabled === false;

    const selectAuthorizedBranch = useCallback((nextBranchId, source = 'manual') => {
        const normalizedBranchId = String(nextBranchId || '').trim();
        const allowedBranchIds = new Set(branches.map((branch) => String(branch?.branch_id || '').trim()).filter(Boolean));
        if (normalizedBranchId && !allowedBranchIds.has(normalizedBranchId)) {
            setActionError(`The selected location is not available in this company (${source}).`);
            return false;
        }

        if (activeSection === 'settings' && settingsDefinition?.scope === 'branch') {
            setSettingsBranchId(normalizedBranchId);
        }
        const searchParams = new URLSearchParams(location.search);
        if (normalizedBranchId) searchParams.set('branch_id', normalizedBranchId);
        else searchParams.delete('branch_id');
        const nextSearch = searchParams.toString();
        const currentSearch = String(location.search || '').replace(/^\?/, '');
        if (nextSearch !== currentSearch) {
            navigate({
                pathname: location.pathname,
                search: nextSearch ? `?${nextSearch}` : ''
            }, { replace: true });
        }
        return true;
    }, [activeSection, branches, location.pathname, location.search, navigate, settingsDefinition?.scope]);

    useEffect(() => {
        if (!branchId || branches.length === 0) return;
        const allowedBranchIds = new Set(branches.map((branch) => String(branch?.branch_id || '').trim()));
        if (!allowedBranchIds.has(branchId)) selectAuthorizedBranch('', 'url');
    }, [branchId, branches, selectAuthorizedBranch]);

    useEffect(() => {
        if (!bootstrap || typeof window === 'undefined') return undefined;
        const tenantId = bootstrap?.business?.tenant_id;
        return subscribeToPosLocationContext((payload) => {
            if (!isPosLocationContextForTenant(payload, tenantId)) return;
            const candidateLocationId = Number(payload?.operatingLocationId || payload?.viewingLocationId || 0);
            if (!Number.isInteger(candidateLocationId) || candidateLocationId <= 0) return;
            const isAllowedLocation = branches.some((branch) => Number(branch?.branch_id) === candidateLocationId);
            if (!isAllowedLocation) return;
            const normalizedBranchId = String(candidateLocationId);
            selectAuthorizedBranch(normalizedBranchId, 'pos-location-context');
        });
    }, [bootstrap, branches, selectAuthorizedBranch]);

    const navigateBusinessAdmin = useCallback((target, options) => {
        if (shouldBlockSettingsNavigation(settingsDirty)) {
            const confirmed = typeof window === 'undefined'
                || typeof window.confirm !== 'function'
                || window.confirm('You have unsaved settings changes. Leave this page and discard them?');
            if (!confirmed) return false;
            setSettingsDirty(false);
        }
        setMobileNavOpen(false);
        navigate(target, options);
        return true;
    }, [navigate, settingsDirty]);

    useEffect(() => {
        if (!bootstrap || !catalogOnlyAccess || activeSection === 'catalog') return;
        navigateBusinessAdmin(buildBackOfficeModulePath(rootPath, 'catalog'), { replace: true });
    }, [activeSection, bootstrap, catalogOnlyAccess, navigateBusinessAdmin, rootPath]);

    const handleOrderDetailClose = useCallback(() => {
        setSelectedOrder(null);
        const searchParams = new URLSearchParams(location.search);
        if (!searchParams.has('transaction_id')) return;
        searchParams.delete('transaction_id');
        const nextSearch = searchParams.toString();
        navigate({
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : ''
        }, { replace: true });
    }, [location.pathname, location.search, navigate]);

    const handleGlobalLocationChange = selectAuthorizedBranch;

    const handleOverviewOrderClick = useCallback((order) => {
        const id = extractId(order, ['transaction_id', 'pos_transaction_id']);
        if (!id) return;
        const ordersPath = buildBackOfficeModulePath(rootPath, 'orders');
        navigateBusinessAdmin(`${ordersPath}?transaction_id=${encodeURIComponent(id)}`);
    }, [navigateBusinessAdmin, rootPath]);

    const handleSettingsBranchChange = selectAuthorizedBranch;

    useEffect(() => {
        if (!settingsDirty || typeof window === 'undefined') return undefined;
        const handleBeforeUnload = (event) => {
            event.preventDefault();
            event.returnValue = '';
            return '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [settingsDirty]);

    useEffect(() => {
        if (activeSection !== 'settings' || settingsDefinition?.scope !== 'branch') return;
        const requestedBranchId = String(new URLSearchParams(location.search).get('branch_id') || '').trim();
        const nextBranchId = resolveSettingsBranchId({
            requestedId: settingsBranchId || requestedBranchId,
            scope: bootstrap?.access?.scope,
            branches,
            allowedLocationIds: bootstrap?.access?.location_ids
        });
        if (nextBranchId !== settingsBranchId) setSettingsBranchId(nextBranchId);
    }, [activeSection, bootstrap?.access?.location_ids, bootstrap?.access?.scope, branches, location.search, settingsBranchId, settingsDefinition?.scope]);

    const bootstrapRequestRef = useRef(0);

    const loadBootstrap = useCallback(async ({ optimisticBusinessName = '' } = {}) => {
        const normalizedOptimisticBusinessName = String(optimisticBusinessName || '').trim();
        if (normalizedOptimisticBusinessName) {
            setBootstrap((previous) => previous?.business
                ? {
                    ...previous,
                    business: {
                        ...previous.business,
                        name: normalizedOptimisticBusinessName
                    }
                }
                : previous);
        }
        const requestId = bootstrapRequestRef.current + 1;
        bootstrapRequestRef.current = requestId;
        const hadBootstrap = bootstrapRef.current != null;
        setBootstrapLoading(!hadBootstrap);
        setBootstrapRefreshing(hadBootstrap);
        setBootstrapError('');
        setBootstrapAuthRequired(false);
        setBootstrapAccessDenied(false);
        try {
            const nextBootstrap = await businessAdminApi.bootstrap();
            if (bootstrapRequestRef.current !== requestId) return;
            const resolvedBootstrap = normalizedOptimisticBusinessName && nextBootstrap?.business
                ? {
                    ...nextBootstrap,
                    business: {
                        ...nextBootstrap.business,
                        name: normalizedOptimisticBusinessName
                    }
                }
                : nextBootstrap;
            bootstrapRef.current = resolvedBootstrap;
            setBootstrap(resolvedBootstrap);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (bootstrapRequestRef.current !== requestId) return;
            const sessionRequired = status === 401 || status === 419;
            setBootstrapAuthRequired(sessionRequired);
            setBootstrapAccessDenied(status === 403);
            if (sessionRequired || status === 403) {
                bootstrapRef.current = null;
                setBootstrap(null);
            }
            setBootstrapError(sessionRequired
                ? BUSINESS_ADMIN_SESSION_REQUIRED_MESSAGE
                : (status === 403 ? BUSINESS_ADMIN_ACCESS_DENIED_MESSAGE : getBusinessAdminErrorMessage(error)));
        } finally {
            if (bootstrapRequestRef.current === requestId) {
                setBootstrapLoading(false);
                setBootstrapRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const handleSessionInvalidation = () => {
            bootstrapRequestRef.current += 1;
            bootstrapRef.current = null;
            setBootstrap(null);
            setBootstrapLoading(false);
            setBootstrapRefreshing(false);
            setBootstrapAuthRequired(true);
            setBootstrapAccessDenied(false);
            setBootstrapError(BUSINESS_ADMIN_SESSION_REQUIRED_MESSAGE);
            setSectionData(null);
            setLoadedSection('');
            setSectionError('');
            setSettingsDirty(false);
        };
        const handleTenantSwitch = () => {
            bootstrapRequestRef.current += 1;
            bootstrapRef.current = null;
            setBootstrap(null);
            setBootstrapLoading(false);
            setBootstrapRefreshing(false);
            setBootstrapAuthRequired(true);
            setBootstrapAccessDenied(false);
            setBootstrapError(BUSINESS_ADMIN_COMPANY_SWITCHED_MESSAGE);
            setSectionData(null);
            setLoadedSection('');
            setSectionError('');
            setSettingsDirty(false);
        };
        window.addEventListener('auth:session-expired', handleSessionInvalidation);
        window.addEventListener('auth:session-cleared', handleSessionInvalidation);
        window.addEventListener('auth:logout', handleSessionInvalidation);
        window.addEventListener('auth:tenant-switched', handleTenantSwitch);
        return () => {
            window.removeEventListener('auth:session-expired', handleSessionInvalidation);
            window.removeEventListener('auth:session-cleared', handleSessionInvalidation);
            window.removeEventListener('auth:logout', handleSessionInvalidation);
            window.removeEventListener('auth:tenant-switched', handleTenantSwitch);
        };
    }, []);

    const handleBusinessAdminRefresh = useCallback(() => {
        if (shouldBlockSettingsNavigation(settingsDirty)) {
            const confirmed = typeof window === 'undefined'
                || typeof window.confirm !== 'function'
                || window.confirm('You have unsaved settings changes. Refresh and discard them?');
            if (!confirmed) return;
            setSettingsDirty(false);
        }
        setReloadNonce((value) => value + 1);
        void loadBootstrap();
    }, [loadBootstrap, settingsDirty]);

    const handleSettingsSaved = useCallback(({ section = '', branchId = '' } = {}) => {
        publishBusinessAdminSettingsUpdated({
            tenantId: bootstrap?.business?.tenant_id || bootstrap?.user?.company?.id,
            branchId,
            section
        });
    }, [bootstrap?.business?.tenant_id, bootstrap?.user?.company?.id]);

    const handleDateRangePresetChange = useCallback((event) => {
        const nextPreset = event.target.value;
        setDateRangePreset(nextPreset);
        if (nextPreset === 'custom') return;
        const nextRange = getDateRangeForPreset(nextPreset);
        setDateFrom(nextRange.dateFrom);
        setDateTo(nextRange.dateTo);
    }, []);

    const handleDateFromChange = useCallback((event) => {
        setDateRangePreset('custom');
        setDateFrom(event.target.value);
    }, []);

    const handleDateToChange = useCallback((event) => {
        setDateRangePreset('custom');
        setDateTo(event.target.value);
    }, []);

    useEffect(() => { loadBootstrap(); }, [loadBootstrap]);

    useEffect(() => {
        if (activeSection !== 'settings' || typeof window === 'undefined') return undefined;

        // POS and OPIS use separate browser origins, so POS permission changes cannot
        // arrive through same-origin storage or BroadcastChannel events. Revalidate the
        // settings workspace when OPIS regains focus, while protecting unsaved edits.
        return installCrossAppSettingsRefresh(() => {
            if (settingsDirty) return undefined;
            setReloadNonce((value) => value + 1);
            return loadBootstrap();
        });
    }, [activeSection, loadBootstrap, settingsDirty]);

    const requestedItemId = useMemo(() => {
        if (activeSection !== 'orders') return '';
        const value = String(new URLSearchParams(location.search).get('item_id') || '').trim();
        return /^\d+$/.test(value) && Number(value) > 0 ? value : '';
    }, [activeSection, location.search]);

    const params = useMemo(() => buildQuery({
        dateFrom: activeDateRange.dateFrom,
        dateTo: activeDateRange.dateTo,
        branchId: activeSection === 'audit' ? '' : branchId,
        search,
        itemId: requestedItemId,
        receiptType: activeSection === 'orders' ? receiptType : ''
    }), [activeDateRange.dateFrom, activeDateRange.dateTo, activeSection, branchId, receiptType, requestedItemId, search]);

    const loadSection = useCallback(async () => {
        if (!bootstrap) return;
        sectionAbortRef.current?.abort();
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        sectionAbortRef.current = controller;
        const requestConfig = controller ? { signal: controller.signal } : {};
        if (catalogOnlyAccess && activeSection !== 'catalog') {
            setSectionData(null);
            setLoadedSection(activeSection);
            setSectionError('');
            setSectionLoading(false);
            return;
        }
        if (MIGRATED_BACKOFFICE_MODULE_KEYS.has(activeSection)) {
            setSectionData(null);
            setLoadedSection(activeSection);
            setSectionError('');
            setSectionLoading(false);
            return;
        }
        if (activeSection === 'settings') {
            setSectionData(null);
            setLoadedSection(activeSection);
            setSectionError('');
            setSectionLoading(false);
            return;
        }
        setSectionLoading(true);
        setSectionError('');
        setSectionAccessDenied(false);
        setActionError('');
        try {
            let payload;
            if (['overview', 'locations'].includes(activeSection)) payload = { overview: await businessAdminApi.overview(params, requestConfig) };
            else if (activeSection === 'orders') payload = await businessAdminApi.orders({ ...params, page: ordersPage, limit: BUSINESS_ADMIN_ORDERS_PAGE_SIZE }, requestConfig);
            else if (activeSection === 'expenses') payload = await businessAdminApi.expenses({ ...params, page: expensesPage, limit: BUSINESS_ADMIN_ORDERS_PAGE_SIZE }, requestConfig);
            else if (activeSection === 'customers') payload = await businessAdminApi.customers({ ...params, page: 1, limit: 50 }, requestConfig);
            else if (activeSection === 'team') payload = await businessAdminApi.workforce(params, requestConfig);
            else if (activeSection === 'attendance') payload = await businessAdminApi.attendance({ ...params, page: 1, limit: 100 }, requestConfig);
            else if (activeSection === 'shifts') {
                const [shiftHistory, cashSummary] = await Promise.all([
                    businessAdminApi.shifts({ ...params, page: 1, limit: BUSINESS_ADMIN_CASH_SUMMARY_PAGE_SIZE }, requestConfig),
                    businessAdminApi.shifts({ ...params, status: 'closed', page: cashSummaryPage, limit: BUSINESS_ADMIN_CASH_SUMMARY_PAGE_SIZE }, requestConfig)
                ]);
                payload = {
                    summary: shiftHistory?.summary || {},
                    cashSummary: cashSummary?.shifts || [],
                    cashSummaryPagination: cashSummary?.pagination || {}
                };
            }
            else if (activeSection === 'inventory') {
                const [valuation, lowStock] = await Promise.all([
                    businessAdminApi.inventoryValuation(branchId ? { branch_id: branchId } : {}, requestConfig),
                    businessAdminApi.reportDataset('low_stock', { ...params, page: inventoryPage, limit: BUSINESS_ADMIN_INVENTORY_PAGE_SIZE }, requestConfig)
                ]);
                payload = { valuation, lowStock };
            } else if (activeSection === 'recipes') payload = await businessAdminApi.recipes({ ...params, page: 1, limit: 50 }, requestConfig);
            else if (activeSection === 'fiscal') payload = await businessAdminApi.fiscal(params, requestConfig);
            else if (activeSection === 'notifications') payload = await businessAdminApi.notifications({ ...(branchId ? { branch_id: branchId } : {}), status: 'open', limit: 100 }, requestConfig);
            else if (activeSection === 'audit') payload = await businessAdminApi.audit({ ...params, limit: 100, page: 1 }, requestConfig);
            else if (activeSection === 'approvals') payload = { approvals: (await businessAdminApi.approvals({ status: 'pending', limit: 100 }, requestConfig)).approvals || [] };
            else if (activeSection === 'payments') {
                const revenueParams = buildTenantRevenueQuery(params);
                const [monitoring, revenueSummary, revenueTransactions, feeHistory] = await Promise.allSettled([
                    businessAdminApi.payments(params, requestConfig),
                    businessAdminApi.tenantRevenueSummary(revenueParams, requestConfig),
                    businessAdminApi.tenantRevenueTransactions({ ...revenueParams, limit: 100, offset: 0 }, requestConfig),
                    businessAdminApi.tenantRevenueFeeHistory(requestConfig)
                ]);
                if (monitoring.status === 'rejected') throw monitoring.reason;
                payload = {
                    ...monitoring.value,
                    tenant_revenue: {
                        summary: revenueSummary.status === 'fulfilled' ? revenueSummary.value : null,
                        transactions: revenueTransactions.status === 'fulfilled'
                            ? (revenueTransactions.value?.transactions || [])
                            : [],
                        policies: feeHistory.status === 'fulfilled'
                            ? (feeHistory.value?.policies || [])
                            : [],
                        error: [revenueSummary, revenueTransactions, feeHistory]
                            .find((result) => result.status === 'rejected')?.reason || null
                    }
                };
            }
            else if (activeSection === 'company') payload = await businessAdminApi.company(requestConfig);
            else if (activeSection === 'pos-activity') payload = await businessAdminApi.posActivityAnalytics(params, requestConfig);
            else payload = { bootstrap };
            if (requestRef.current === requestId) {
                setSectionData(payload);
                setLoadedSection(activeSection);
            }
        } catch (error) {
            if (controller?.signal.aborted || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return;
            if (requestRef.current === requestId) {
                setSectionAccessDenied(Number(error?.response?.status || 0) === 403);
                setSectionError(getBusinessAdminErrorMessage(error));
                setLoadedSection(activeSection);
            }
        } finally {
            if (requestRef.current === requestId) {
                setSectionLoading(false);
                if (sectionAbortRef.current === controller) sectionAbortRef.current = null;
            }
        }
    }, [activeSection, bootstrap, cashSummaryPage, catalogOnlyAccess, expensesPage, inventoryPage, ordersPage, params, branchId]);

    useEffect(() => {
        setSelectedOrder(null);
        setSelectedCustomer(null);
        loadSection();
        return () => {
            requestRef.current += 1;
            sectionAbortRef.current?.abort();
            sectionAbortRef.current = null;
        };
    }, [loadSection, reloadNonce]);

    const handleOrderSelect = useCallback(async (order) => {
        const id = extractId(order, ['transaction_id', 'pos_transaction_id']);
        if (!id) return;
        setActionError('');
        try { setSelectedOrder(await businessAdminApi.orderDetail(id)); } catch (error) { setActionError(getBusinessAdminErrorMessage(error)); }
    }, []);

    const handleCustomerSelect = useCallback(async (customer) => {
        if (!customer?.profile_ref) return;
        setActionError('');
        try { setSelectedCustomer(await businessAdminApi.customerDetail(customer.profile_ref, params)); } catch (error) { setActionError(getBusinessAdminErrorMessage(error)); }
    }, [params]);

    const handleCashSummaryExport = useCallback(async () => {
        if (cashSummaryExporting) return;
        setCashSummaryExporting(true);
        setActionError('');
        try {
            const rows = [];
            let page = 1;
            let totalPages = 1;
            do {
                const result = await businessAdminApi.shifts({
                    ...params,
                    status: 'closed',
                    page,
                    limit: BUSINESS_ADMIN_CASH_SUMMARY_EXPORT_PAGE_SIZE
                });
                if (Array.isArray(result?.shifts)) rows.push(...result.shifts);
                const reportedTotalPages = Number(result?.pagination?.total_pages);
                totalPages = Math.max(reportedTotalPages || Math.ceil((Number(result?.pagination?.total) || rows.length) / BUSINESS_ADMIN_CASH_SUMMARY_EXPORT_PAGE_SIZE), 1);
                page += 1;
            } while (page <= totalPages);

            const dateFromPart = String(params.date_from || 'all').replace(/[^a-z0-9-]/gi, '-');
            const dateToPart = String(params.date_to || 'dates').replace(/[^a-z0-9-]/gi, '-');
            downloadCsv(`shift-history-${dateFromPart}-${dateToPart}.csv`, buildCashSummaryCsv(rows));
        } catch (error) {
            setActionError(getBusinessAdminErrorMessage(error));
        } finally {
            setCashSummaryExporting(false);
        }
    }, [cashSummaryExporting, params]);

    const requestedOrderId = useMemo(() => {
        if (activeSection !== 'orders') return '';
        const value = String(new URLSearchParams(location.search).get('transaction_id') || '').trim();
        return /^\d+$/.test(value) && Number(value) > 0 ? value : '';
    }, [activeSection, location.search]);

    useEffect(() => {
        if (activeSection !== 'orders' || !requestedOrderId) return undefined;
        if (Number(selectedOrder?.transaction_id) === Number(requestedOrderId)) return undefined;
        let cancelled = false;
        setActionError('');
        businessAdminApi.orderDetail(requestedOrderId)
            .then((order) => {
                if (!cancelled) setSelectedOrder(order);
            })
            .catch((error) => {
                if (!cancelled) setActionError(getBusinessAdminErrorMessage(error));
            });
        return () => {
            cancelled = true;
        };
    }, [activeSection, requestedOrderId, selectedOrder?.transaction_id]);

    const handleNotificationAction = useCallback(async (action, id) => {
        if (!id) return;
        setActionLoading(id);
        setActionError('');
        try {
            if (action === 'read') await businessAdminApi.markNotificationRead(id);
            if (action === 'dismiss') await businessAdminApi.dismissNotification(id);
            if (action === 'acknowledge') await businessAdminApi.acknowledgeNotification(id, 'Acknowledged from Back Office.');
            setReloadNonce((value) => value + 1);
        } catch (error) { setActionError(getBusinessAdminErrorMessage(error)); } finally { setActionLoading(null); }
    }, []);

    const handleApprovalDecision = useCallback(async (id, decision) => {
        setActionLoading(id);
        setActionError('');
        try {
            await businessAdminApi.decideApproval(id, decision, `${decision} requested from Back Office.`);
            setReloadNonce((value) => value + 1);
        } catch (error) { setActionError(getBusinessAdminErrorMessage(error)); } finally { setActionLoading(null); }
    }, []);

    const loadVoidHistory = useCallback(async () => {
        setVoidHistoryLoading(true);
        setVoidHistoryError('');
        try {
            const [executedApprovals, approvedApprovals, voidedOrders] = await Promise.all([
                businessAdminApi.approvals({ status: 'executed', limit: 100 }),
                businessAdminApi.approvals({ status: 'approved', limit: 100 }),
                businessAdminApi.orders({ receipt_type: 'voided', page: 1, limit: 100 })
            ]);
            setVoidHistoryRows(buildApprovedVoidHistoryRows({
                approvals: [...(executedApprovals?.approvals || []), ...(approvedApprovals?.approvals || [])],
                orders: voidedOrders?.orders || []
            }));
        } catch (error) {
            setVoidHistoryRows([]);
            setVoidHistoryError(getBusinessAdminErrorMessage(error));
        } finally {
            setVoidHistoryLoading(false);
        }
    }, []);

    const handleVoidHistoryToggle = useCallback(() => {
        if (voidHistoryOpen) {
            setVoidHistoryOpen(false);
            return;
        }
        setVoidHistoryOpen(true);
        void loadVoidHistory();
    }, [loadVoidHistory, voidHistoryOpen]);

    const handleExpenseCreate = useCallback(async (payload) => {
        setActionLoading('expense-create');
        setActionError('');
        try {
            const result = await businessAdminApi.createExpense(payload);
            setReloadNonce((value) => value + 1);
            return result;
        } catch (error) {
            setActionError(getBusinessAdminErrorMessage(error));
            throw error;
        } finally {
            setActionLoading(null);
        }
    }, []);

    const handleExpenseVoid = useCallback(async (id, payload) => {
        setActionLoading(id);
        setActionError('');
        try {
            const result = await businessAdminApi.voidExpense(id, payload);
            setReloadNonce((value) => value + 1);
            return result;
        } catch (error) {
            setActionError(getBusinessAdminErrorMessage(error));
            throw error;
        } finally {
            setActionLoading(null);
        }
    }, []);

    const handleEndAttendanceShift = useCallback(async (shiftId, payload) => {
        setActionLoading('attendance-end-shift');
        setActionError('');
        try {
            const result = await businessAdminApi.endAttendanceShift(shiftId, payload);
            setReloadNonce((value) => value + 1);
            return result;
        } catch (error) {
            setActionError(getBusinessAdminErrorMessage(error));
            throw error;
        } finally {
            setActionLoading(null);
        }
    }, []);

    const handleCustomerCreate = useCallback(async (payload) => {
        setActionLoading('customer-create');
        setActionError('');
        try {
            const result = await businessAdminApi.createCustomer(payload);
            setReloadNonce((value) => value + 1);
            return result;
        } catch (error) {
            setActionError(getBusinessAdminErrorMessage(error));
            throw error;
        } finally {
            setActionLoading(null);
        }
    }, []);

    const showDateFilters = [
        'overview', 'locations', 'orders', 'customers', 'team',
        'attendance', 'shifts', 'expenses', 'inventory', 'recipes', 'fiscal', 'audit',
        'pos-activity'
    ].includes(activeSection);
    const showHistoricalRangePreset = isHistoricalBusinessAdminSection(activeSection);
    const showBranchFilter = activeSection !== 'audit';
    const hasInlineBranchFilter = showDateFilters && showBranchFilter;

    if (bootstrapLoading && !bootstrap) return <Loading />;
    if (!bootstrap) {
        // OPIS has no /terminal route: recovery stays in-app. Sign-in returns
        // to the requested Back Office path via the company picker's `next`
        // contract; access-denied offers a business switch; a generic failure
        // retries the bootstrap through the same guarded refresh as settings.
        const signInTarget = `${DGFY_COMPANY_SELECT_ROUTE}?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
        const recoveryAction = bootstrapAuthRequired
            ? <Link to={signInTarget} className="business-admin-button primary mt-5"><ExternalLink size={14} /> Sign in to Back Office</Link>
            : (bootstrapAccessDenied
                ? <Link to={DGFY_COMPANY_SELECT_ROUTE} className="business-admin-button primary mt-5"><ExternalLink size={14} /> Switch business</Link>
                : <button type="button" onClick={handleBusinessAdminRefresh} className="business-admin-button primary mt-5"><RefreshCw size={14} /> Try again</button>);
        return <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] p-6"><section className="business-admin-card w-full max-w-lg p-7 text-center" data-testid={bootstrapAuthRequired ? 'business-admin-session-required' : (bootstrapAccessDenied ? 'business-admin-access-denied' : 'business-admin-unavailable')}><ShieldCheck className="mx-auto text-[#159891]" size={32} /><h1 className="mt-3 text-2xl font-black text-[#173e58]">{bootstrapAuthRequired ? 'Back Office sign-in required' : (bootstrapAccessDenied ? 'Back Office access denied' : 'Back Office unavailable')}</h1><p className="mt-2 text-sm text-slate-600">{bootstrapAuthRequired ? (bootstrapError || BUSINESS_ADMIN_SESSION_REQUIRED_MESSAGE) : (bootstrapAccessDenied ? BUSINESS_ADMIN_ACCESS_DENIED_MESSAGE : (bootstrapError || 'Your account does not have Back Office access.'))}</p>{recoveryAction}</section></main>;
    }

    const activeDestinationDefinition = usersRolesShortcut
        ? BACKOFFICE_SECTION_META['users-roles']
        : activeSection === 'settings' && settingsSection === 'team'
            ? BACKOFFICE_SECTION_META.team
            : (BACKOFFICE_SECTION_META[activeSection] || BACKOFFICE_SECTION_META.overview);
    const destinationAccessGranted = isBusinessAdminDestinationAccessible(activeDestinationDefinition, {
        usersRolesVisible: canViewUsers,
        capabilities: bootstrap.access?.capabilities || {},
        settingsCapabilities
    });
    const meta = usersRolesShortcut
        ? BACKOFFICE_SECTION_META['users-roles']
        : activeSection === 'settings' && settingsDefinition
            ? { title: settingsDefinition.label, description: settingsDefinition.description }
        : (BACKOFFICE_SECTION_META[activeSection] || BACKOFFICE_SECTION_META.overview);
    const activeNavigationKey = getBusinessAdminSidebarActiveKey({
        activeSection,
        settingsSection,
        usersRolesShortcut
    });
    const activeWorkspaceTabKey = usersRolesShortcut
        ? 'users-roles'
        : (activeSection === 'settings' && settingsSection === 'team' ? 'team' : activeSection);
    const overviewData = sectionData?.overview || (activeSection === 'overview' ? sectionData : null);
    const workflowPageName = getBusinessAdminWorkflowPageName(activeSection);
    const workflowVisibilityReady = workflowModeResolved && !workflowModeLoading;
    const workflowSectionVisible = isBusinessAdminWorkflowSectionVisible(
        activeSection,
        workflowMode,
        enabledCapabilities,
        disabledCapabilities
    );
    const isSidebarItemVisible = (item) => {
        const definition = BACKOFFICE_SECTION_META[item.accessKey];
        if (!definition) return false;
        if (!isBusinessAdminNavigationVisible(definition, {
            catalogOnlyAccess,
            usersRolesVisible: canViewUsers,
            capabilities: bootstrap.access?.capabilities || {},
            settingsCapabilities
        })) return false;
        if (item.accessKey === 'settings' && visibleSettingsSections.length === 0) return false;
        const workflowPageName = getBusinessAdminWorkflowPageName(item.accessKey);
        if (!workflowPageName) return true;
        if (!workflowVisibilityReady) return false;
        return isBusinessAdminWorkflowSectionVisible(
            item.accessKey,
            workflowMode,
            enabledCapabilities,
            disabledCapabilities
        );
    };
    const workspaceTabs = getBusinessAdminWorkspaceTabs({
        activeSection,
        settingsSection,
        usersRolesShortcut
    }).filter(isSidebarItemVisible);
    const preserveBusinessAdminNavigationContext = (targetPath) => {
        const rawTarget = String(targetPath || '');
        const hashIndex = rawTarget.indexOf('#');
        const targetHash = hashIndex >= 0 ? rawTarget.slice(hashIndex) : (location.hash || '');
        const targetWithoutHash = hashIndex >= 0 ? rawTarget.slice(0, hashIndex) : rawTarget;
        const queryIndex = targetWithoutHash.indexOf('?');
        const targetPathname = queryIndex >= 0 ? targetWithoutHash.slice(0, queryIndex) : targetWithoutHash;
        const targetSearch = queryIndex >= 0 ? targetWithoutHash.slice(queryIndex + 1) : '';
        const searchParams = new URLSearchParams(location.search);
        const targetSearchParams = new URLSearchParams(targetSearch);
        targetSearchParams.forEach((value, key) => searchParams.set(key, value));
        const serializedSearch = searchParams.toString();
        return `${targetPathname}${serializedSearch ? `?${serializedSearch}` : ''}${targetHash}`;
    };
    const handleSidebarItemNavigate = (item) => {
        const targetPath = item.key === 'settings'
            ? buildBusinessAdminSettingsPath(rootPath, visibleSettingsSections[0]?.key || 'profile')
            : buildBusinessAdminSidebarItemPath(rootPath, item);
        navigateBusinessAdmin(preserveBusinessAdminNavigationContext(targetPath));
    };
    const handleWorkspaceTabNavigate = (tab) => {
        navigateBusinessAdmin(preserveBusinessAdminNavigationContext(buildBusinessAdminSidebarItemPath(rootPath, tab)));
    };
    const unreadNotificationCount = Number(overviewData?.summary?.unread_notifications || 0);
    const notificationWorkspaceHasData = activeSection === 'notifications'
        && Array.isArray(sectionData?.notifications);
    const workspaceBusy = Boolean(
        (workflowPageName && workflowModeLoading)
        || sectionLoading
        || loadedSection !== activeSection
    );
    const renderWorkspace = () => {
        if (!destinationAccessGranted) {
            return (
                <div className="business-admin-alert error" data-testid="business-admin-destination-access-denied">
                    <Lock size={17} />
                    <div>
                        <strong>{meta.title} access is not assigned.</strong>
                        <div>This destination is hidden unless the server-projected read capability is present.</div>
                    </div>
                </div>
            );
        }
        const canKeepPaginatedWorkspace = ['orders', 'expenses', 'shifts', 'inventory'].includes(activeSection)
            && Boolean(sectionData)
            && loadedSection === activeSection;
        const canKeepLocationsWorkspace = activeSection === 'locations'
            && Boolean(sectionData?.overview)
            && loadedSection === activeSection;
        const canKeepSectionWorkspace = Boolean(sectionData) && loadedSection === activeSection;
        if (workflowPageName && workflowModeLoading) return <WorkspaceLoading label={`Loading ${meta.title}…`} />;
        if (workflowPageName && !workflowModeResolved) {
            return <Navigate to={buildBackOfficeOverviewPath(rootPath)} replace />;
        }
        if (workflowPageName && !workflowSectionVisible) {
            return <Navigate to={buildBackOfficeOverviewPath(rootPath)} replace />;
        }
        if (notificationWorkspaceHasData) {
            return (
                <NotificationsWorkspace
                    data={sectionData}
                    onAction={handleNotificationAction}
                    actionLoading={actionLoading}
                    refreshing={sectionLoading}
                    refreshError={sectionError}
                />
        );
        }
        if (loadedSection !== activeSection) return <WorkspaceLoading label={`Loading ${meta.title}…`} />;
        if (canKeepPaginatedWorkspace) {
            if (activeSection === 'orders') {
                return <OrdersWorkspace data={sectionData} selected={selectedOrder} onSelect={handleOrderSelect} onClose={handleOrderDetailClose} dateFrom={activeDateRange.dateFrom} dateTo={activeDateRange.dateTo} page={ordersPage} onPageChange={setOrdersPage} refreshing={sectionLoading} refreshError={sectionError} />;
            }
            if (activeSection === 'expenses') {
                return <ExpensesWorkspace data={sectionData} branches={branches} capabilities={bootstrap.access?.capabilities || {}} accessScope={bootstrap.access?.scope} onCreate={handleExpenseCreate} onVoid={handleExpenseVoid} actionLoading={actionLoading} onPageChange={setExpensesPage} refreshing={sectionLoading} refreshError={sectionError} />;
            }
            if (activeSection === 'inventory') {
                return <InventoryWorkspace data={sectionData} onPageChange={setInventoryPage} refreshing={sectionLoading} rootPath={rootPath} settingsDirty={settingsDirty} onLeaveSettings={() => setSettingsDirty(false)} />;
            }
            return <ShiftsWorkspace data={sectionData} onCashSummaryPageChange={setCashSummaryPage} onExportCashSummary={handleCashSummaryExport} exportingCashSummary={cashSummaryExporting} refreshing={sectionLoading} />;
        }
        if (canKeepLocationsWorkspace) {
            return (
                <LocationsWorkspace
                    data={sectionData.overview}
                    activeView={locationView}
                    onViewChange={(nextView) => navigateBusinessAdmin(buildBackOfficeLocationsPath(rootPath, nextView))}
                    onManageBranches={() => navigateBusinessAdmin(buildBusinessAdminSettingsPath(rootPath, 'branches'))}
                    onManageRegisters={() => navigateBusinessAdmin(buildBusinessAdminSettingsPath(rootPath, 'registers'))}
                    canViewBranchSettings={bootstrap.user?.is_master_admin === true || settingsCapabilities.branches?.view === true}
                    canViewRegisterSettings={bootstrap.user?.is_master_admin === true || settingsCapabilities.registers?.view === true}
                    refreshing={sectionLoading}
                    refreshError={sectionError}
                />
            );
        }
        if (sectionError && !canKeepSectionWorkspace) return <div className="business-admin-alert error" data-testid={sectionAccessDenied ? 'business-admin-section-access-denied' : 'business-admin-section-error'}><AlertTriangle size={17} /><div><strong>{sectionAccessDenied ? 'Back Office access denied.' : 'Back Office data unavailable.'}</strong><div>{sectionError}</div></div></div>;
        if (usersRolesShortcut) {
            return (
                <BusinessAdminUsersRolesWorkspace
                    bootstrap={bootstrap}
                    canViewUsers={canViewUsers}
                    canEditUsers={canEditUsers}
                    onSettingsSaved={handleSettingsSaved}
                    onBack={() => navigateBusinessAdmin(buildBackOfficeModulePath(rootPath, 'team'))}
                />
            );
        }
        if (activeSection === 'settings') {
            return (
                <BusinessAdminSettingsWorkspace
                    bootstrap={bootstrap}
                    rootPath={rootPath}
                    settingsSection={settingsSection}
                    settingsBranchId={settingsBranchId}
                    onBranchChange={handleSettingsBranchChange}
                    onSelectSection={(sectionKey) => navigateBusinessAdmin(buildBusinessAdminSettingsPath(rootPath, sectionKey))}
                    settingsDirty={settingsDirty}
                    onLeaveSettings={() => setSettingsDirty(false)}
                    onDirtyChange={setSettingsDirty}
                    settingsRefreshKey={reloadNonce}
                    onReload={loadBootstrap}
                    onSettingsSaved={handleSettingsSaved}
                    onOpenActivity={() => navigateBusinessAdmin(buildBackOfficeModulePath(rootPath, 'audit'))}
                />
            );
        }
        if (MIGRATED_BACKOFFICE_MODULE_KEYS.has(activeSection)) {
            return <MigratedBackOfficeModule section={activeSection} />;
        }
        if (activeSection === 'overview') return <OverviewWorkspace data={overviewData} onOrderClick={handleOverviewOrderClick} locationsPath={buildBackOfficeLocationsPath(rootPath, 'branches')} ordersPath={buildBackOfficeModulePath(rootPath, 'orders')} />;
        if (activeSection === 'locations') {
            return (
                <LocationsWorkspace
                    data={sectionData?.overview}
                    activeView={locationView}
                    onViewChange={(nextView) => navigateBusinessAdmin(buildBackOfficeLocationsPath(rootPath, nextView))}
                    onManageBranches={() => navigateBusinessAdmin(buildBusinessAdminSettingsPath(rootPath, 'branches'))}
                    onManageRegisters={() => navigateBusinessAdmin(buildBusinessAdminSettingsPath(rootPath, 'registers'))}
                    canViewBranchSettings={bootstrap.user?.is_master_admin === true || settingsCapabilities.branches?.view === true}
                    canViewRegisterSettings={bootstrap.user?.is_master_admin === true || settingsCapabilities.registers?.view === true}
                    refreshing={sectionLoading}
                    refreshError={sectionError}
                />
            );
        }
        if (activeSection === 'orders') return <OrdersWorkspace data={sectionData} selected={selectedOrder} onSelect={handleOrderSelect} onClose={handleOrderDetailClose} dateFrom={activeDateRange.dateFrom} dateTo={activeDateRange.dateTo} page={ordersPage} onPageChange={setOrdersPage} />;
        if (activeSection === 'expenses') return <ExpensesWorkspace data={sectionData} branches={branches} capabilities={bootstrap.access?.capabilities || {}} accessScope={bootstrap.access?.scope} onCreate={handleExpenseCreate} onVoid={handleExpenseVoid} actionLoading={actionLoading} onPageChange={setExpensesPage} />;
        if (activeSection === 'customers') return <CustomersWorkspace data={sectionData} selected={selectedCustomer} onSelect={handleCustomerSelect} onClose={() => setSelectedCustomer(null)} onOrderSelect={handleOrderSelect} selectedOrder={selectedOrder} onOrderClose={handleOrderDetailClose} onCreate={handleCustomerCreate} creating={actionLoading === 'customer-create'} />;
        if (activeSection === 'team') return <WorkforceWorkspace data={sectionData} bootstrap={bootstrap} teamCapability={settingsCapabilities.team} onManageTeam={() => navigateBusinessAdmin(buildBackOfficeModulePath(rootPath, 'users-roles'))} />;
        if (activeSection === 'attendance') return <AttendanceWorkspace data={sectionData} branches={branches} capabilities={bootstrap.access?.capabilities || {}} onEndShift={handleEndAttendanceShift} actionLoading={actionLoading} />;
        if (activeSection === 'shifts') return <ShiftsWorkspace data={sectionData} onCashSummaryPageChange={setCashSummaryPage} onExportCashSummary={handleCashSummaryExport} exportingCashSummary={cashSummaryExporting} />;
        if (activeSection === 'inventory') return <InventoryWorkspace data={sectionData} onPageChange={setInventoryPage} rootPath={rootPath} settingsDirty={settingsDirty} onLeaveSettings={() => setSettingsDirty(false)} />;
        if (activeSection === 'recipes') return <RecipesWorkspace data={sectionData} />;
        if (activeSection === 'fiscal') return <FiscalWorkspace data={sectionData} />;
        if (activeSection === 'notifications') return <NotificationsWorkspace data={sectionData} onAction={handleNotificationAction} actionLoading={actionLoading} />;
        if (activeSection === 'approvals') return <ApprovalsWorkspace data={sectionData} capabilities={bootstrap.access?.capabilities || {}} onDecision={handleApprovalDecision} actionLoading={actionLoading} voidHistoryOpen={voidHistoryOpen} voidHistoryRows={voidHistoryRows} voidHistoryLoading={voidHistoryLoading} voidHistoryError={voidHistoryError} onToggleVoidHistory={handleVoidHistoryToggle} onRefreshVoidHistory={loadVoidHistory} />;
        if (activeSection === 'audit') return <AuditWorkspace data={sectionData} dateFrom={activeDateRange.dateFrom} dateTo={activeDateRange.dateTo} />;
        if (activeSection === 'payments') return <PaymentsWorkspace data={sectionData} />;
        if (activeSection === 'company') return <CompanyWorkspace data={sectionData} />;
        if (activeSection === 'pos-activity') return <PosActivityAnalyticsPage data={sectionData} />;
        return <SimpleWorkspace section={activeSection} bootstrap={bootstrap} />;
    };

    return (
        <div className={`business-admin-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
            <aside
                id="business-admin-sidebar"
                data-testid="business-admin-sidebar"
                className={`business-admin-sidebar ${mobileNavOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`.trim()}
            >
                <div className="business-admin-sidebar-header">
                    <div className="business-admin-brand">
                        <img className="business-admin-brand-logo" src={DGFY_BUSINESS_ADMIN_LOGO} alt="DGFY" />
                        <div>
                            <div className="business-admin-brand-title">{bootstrap.business?.name || 'Your business'}</div>
                            <div className="business-admin-brand-subtitle">Business back office</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="business-admin-sidebar-toggle"
                        data-testid="business-admin-sidebar-toggle"
                        aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                        aria-expanded={!sidebarCollapsed}
                        aria-controls="business-admin-sidebar"
                        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                        onClick={handleSidebarToggle}
                    >
                        {sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
                    </button>
                </div>
                {mobileNavOpen ? <button type="button" className="business-admin-mobile-sidebar-close" data-testid="business-admin-mobile-sidebar-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={16} /> Close menu</button> : null}
                {BUSINESS_ADMIN_SIDEBAR_GROUPS.map((group) => {
                    const items = group.items.filter(isSidebarItemVisible);
                    if (!items.length) return null;
                    return (
                        <div className={`business-admin-nav-group ${group.standalone ? 'is-standalone' : ''}`.trim()} key={group.label}>
                            <div className="business-admin-nav-label">{group.label}</div>
                            {items.map((item) => {
                                const Icon = item.icon;
                                const isActive = activeNavigationKey === item.key;
                                return (
                                    <button
                                        type="button"
                                        key={item.key}
                                        className={`business-admin-nav-item ${isActive ? 'active' : ''}`}
                                        aria-label={item.label}
                                        title={sidebarCollapsed ? item.label : undefined}
                                        aria-current={isActive ? 'page' : undefined}
                                        onClick={() => handleSidebarItemNavigate(item)}
                                    >
                                        <Icon size={16} />
                                        <span className="business-admin-nav-item-label">{item.label}</span>
                                        {item.key === 'approvals' && overviewData?.summary?.pending_approvals ? <span className="business-admin-nav-item-badge ml-auto rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] text-amber-800">{overviewData.summary.pending_approvals}</span> : null}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
                {BUSINESS_ADMIN_UI_VISIBILITY.showSidebarPosTerminal ? <div className="business-admin-terminal-link mt-6 border-t border-white/15 pt-4"><GuardedLink href={buildPosTerminalUrl()} isDirty={settingsDirty} onLeave={() => setSettingsDirty(false)} className="business-admin-nav-item" aria-label="Open POS terminal" title={sidebarCollapsed ? 'Open POS terminal' : undefined}><ExternalLink size={16} /> <span className="business-admin-nav-item-label">Open POS terminal</span></GuardedLink></div> : null}
                <BusinessAdminAccountActions sidebarCollapsed={sidebarCollapsed} />
            </aside>
            {mobileNavOpen ? <button type="button" className="business-admin-mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} /> : null}
            <main className="business-admin-main">
                <div className="business-admin-mobile-bar">
                    <button
                        type="button"
                        className={`business-admin-mobile-nav-toggle ${mobileNavOpen ? 'is-open' : ''}`}
                        data-testid="business-admin-mobile-nav-toggle"
                        aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
                        aria-expanded={mobileNavOpen}
                        aria-controls="business-admin-sidebar"
                        onClick={() => setMobileNavOpen((value) => !value)}
                    >
                        {mobileNavOpen ? <X size={17} /> : <Menu size={17} />}
                        <span>{mobileNavOpen ? 'Close menu' : 'Menu'}</span>
                    </button>
                    <div className="business-admin-mobile-context">
                        <span className="business-admin-mobile-brand-subtitle">Business back office</span>
                        <span className="business-admin-mobile-page-title">{meta.title}</span>
                    </div>
                </div>
                <div className="business-admin-topbar">
                    <div className="business-admin-topbar-leading">
                        <div>
                            <div className="business-admin-eyebrow">{bootstrap.business?.name || 'Business'} · {humanize(bootstrap.access?.scope)} scope</div>
                            <h1 className="business-admin-heading">{meta.title}</h1>
                            {activeSection !== 'settings' && meta.description ? <p className="business-admin-description">{meta.description}</p> : null}
                        </div>
                    </div>
                    <div className="business-admin-top-actions">
                        <button
                            type="button"
                            className="business-admin-header-action"
                            data-testid="business-admin-notifications-trigger"
                            aria-label="Open notifications"
                            title="Open notifications"
                            onClick={() => navigateBusinessAdmin(preserveBusinessAdminNavigationContext(buildBackOfficeModulePath(rootPath, 'notifications')))}
                        >
                            <Bell size={16} />
                            <span>Notifications</span>
                            {Number.isFinite(unreadNotificationCount) && unreadNotificationCount > 0 ? (
                                <span className="business-admin-header-action-badge" aria-label={`${unreadNotificationCount} unread notifications`}>
                                    {unreadNotificationCount}
                                </span>
                            ) : null}
                        </button>
                        {!hasInlineBranchFilter && branches.length > 0 ? (
                            <div className="business-admin-field business-admin-location-switcher" data-testid="business-admin-location-scope">
                                <label htmlFor="business-admin-location-scope"><MapPin size={12} className="inline mr-1" /> Location scope</label>
                                <select
                                    id="business-admin-location-scope"
                                    aria-label="Location scope"
                                    value={branchId}
                                    onChange={(event) => handleGlobalLocationChange(event.target.value)}
                                >
                                    <option value="">All visible locations</option>
                                    {branches.map((branch) => (
                                        <option value={branch.branch_id} key={branch.branch_id}>{branch.name}</option>
                                    ))}
                                </select>
                            </div>
                        ) : null}
                    </div>
                </div>
                <BusinessAdminWorkspaceTabs
                    tabs={workspaceTabs}
                    activeKey={activeWorkspaceTabKey}
                    onNavigate={handleWorkspaceTabNavigate}
                />
                {showDateFilters ? (
                    <div className={`business-admin-filter-card ${activeSection === 'locations' ? 'business-admin-branches-filter-card' : ''}`}>
                        {showHistoricalRangePreset ? (
                            <div className="business-admin-field">
                                <label htmlFor="ba-date-range"><CalendarDays size={12} className="inline mr-1" /> Date range</label>
                                <select id="ba-date-range" value={activeDateRangePreset} onChange={handleDateRangePresetChange}>
                                    {DATE_RANGE_PRESETS.map((preset) => <option value={preset.value} key={preset.value}>{preset.label}</option>)}
                                </select>
                            </div>
                        ) : null}
                        <div className="business-admin-field">
                            <label htmlFor="ba-date-from"><CalendarDays size={12} className="inline mr-1" /> From</label>
                            <input id="ba-date-from" type="date" value={activeDateRange.dateFrom} onChange={handleDateFromChange} />
                        </div>
                        <div className="business-admin-field">
                            <label htmlFor="ba-date-to"><CalendarDays size={12} className="inline mr-1" /> To</label>
                            <input id="ba-date-to" type="date" value={activeDateRange.dateTo} onChange={handleDateToChange} />
                        </div>
                        {showBranchFilter ? (
                            <div className="business-admin-field">
                                <label htmlFor="ba-branch"><MapPin size={12} className="inline mr-1" /> Branch</label>
                                <select id="ba-branch" value={branchId} onChange={(event) => handleGlobalLocationChange(event.target.value)}>
                                    <option value="">All visible branches</option>
                                    {branches.map((branch) => <option value={branch.branch_id} key={branch.branch_id}>{branch.name}</option>)}
                                </select>
                            </div>
                        ) : null}
                        {activeSection === 'orders' ? (
                            <div className="business-admin-field">
                                <label htmlFor="ba-receipt-type"><Receipt size={12} className="inline mr-1" /> Receipt type</label>
                                <select id="ba-receipt-type" value={receiptType} onChange={(event) => setReceiptType(event.target.value)}>
                                    {BUSINESS_ADMIN_RECEIPT_TYPE_OPTIONS.map((option) => <option value={option.value} key={option.value || 'all'}>{option.label}</option>)}
                                </select>
                            </div>
                        ) : null}
                        {['orders', 'customers', 'expenses'].includes(activeSection) ? (
                            <div className="business-admin-field flex-1">
                                <label htmlFor="ba-search"><Search size={12} className="inline mr-1" /> Search</label>
                                <input id="ba-search" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={activeSection === 'orders' ? 'Invoice, customer, tracking PIN' : (activeSection === 'customers' ? 'Name, email, or phone' : 'Description, vendor, reference')} />
                            </div>
                        ) : null}
                        <div className="business-admin-filter-spacer" />
                        <div className="business-admin-scope">Timezone: Asia/Manila · Currency: PHP</div>
                    </div>
                ) : null}
                {actionError ? <div className="business-admin-alert error"><AlertTriangle size={17} /><div>{actionError}</div></div> : null}
                {bootstrapRefreshing ? <div className="business-admin-alert info" data-testid="business-admin-bootstrap-refreshing">Refreshing Back Office access…</div> : null}
                {bootstrapError && bootstrap ? <div className="business-admin-alert error" data-testid="business-admin-bootstrap-refresh-error"><AlertTriangle size={17} /><div>{bootstrapError}</div></div> : null}
                {sectionLoading && loadedSection === activeSection && sectionData ? <div className="business-admin-alert info" data-testid="business-admin-section-refreshing">Refreshing {meta.title}…</div> : null}
                {sectionError && loadedSection === activeSection && sectionData ? <div className="business-admin-alert error" data-testid="business-admin-section-refresh-error"><AlertTriangle size={17} /><div>{sectionError}</div></div> : null}
                <div
                    className="business-admin-workspace"
                    data-testid="business-admin-workspace"
                    aria-busy={workspaceBusy ? 'true' : 'false'}
                >
                    {renderWorkspace()}
                </div>
            </main>
        </div>
    );
}
