import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    BarChart3,
    Bell,
    BookOpen,
    Building2,
    CalendarDays,
    CheckCircle2,
    ChefHat,
    ClipboardList,
    Clock3,
    ChevronLeft,
    ChevronRight,
    Database,
    Download,
    ExternalLink,
    Factory,
    Hotel,
    LayoutDashboard,
    Lock,
    MapPin,
    Menu,
    Monitor,
    Package,
    Plus,
    Receipt,
    RefreshCw,
    Search,
    Send,
    Settings,
    ShoppingBag,
    ShieldCheck,
    Store,
    ScrollText,
    Sparkles,
    Truck,
    UserRound,
    Users,
    UserPlus,
    Utensils,
    Wallet,
    Wrench,
    X
} from 'lucide-react';
import { businessAdminApi, getBusinessAdminErrorMessage } from './businessAdminService.js';
import {
    buildBusinessAdminSettingsPath,
    buildPosSettingsOwnerPath,
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
import { publishBusinessAdminSettingsUpdated } from '../../../../../packages/web-core/src/features/pos/utils/businessAdminSettingsSync.js';
import { useWorkflowMode } from '../../../../../packages/web-core/src/features/settings/WorkflowModeContext.jsx';
import UserManagementModal from '../../../../../packages/web-core/Components/users/UserManagementModal.jsx';
import UserInvitationModal from '../../../../../packages/web-core/Components/users/UserInvitationModal.jsx';
import { getRoleCatalog } from '../../../../../packages/web-core/src/services/userService.js';
import MigratedBackOfficeModule, { MERCHANT_BACKOFFICE_MODULE_META } from './MigratedBackOfficeModule.jsx';
import {
    getBusinessAdminWorkflowPageName,
    isBusinessAdminWorkflowSectionVisible
} from './businessAdminWorkflowVisibility.js';
import {
    DATE_RANGE_PRESETS,
    formatDateRangeLabel,
    getDateRangeForPreset,
    getDefaultDateRangeForSection,
    getDefaultDateRangePreset,
    isHistoricalBusinessAdminSection
} from './businessAdminDateRange.js';
import './businessAdmin.css';

const NAV_GROUPS = [
    {
        label: 'Workspace',
        items: [
            { key: 'overview', label: 'Overview', icon: LayoutDashboard },
            { key: 'branches', label: 'Branches', icon: Building2 },
            { key: 'team', label: 'Team & access', icon: Users },
            { key: 'attendance', label: 'Attendance', icon: CalendarDays },
            { key: 'registers', label: 'Registers', icon: Monitor }
        ]
    },
    {
        label: 'Operations',
        items: [
            { key: 'shifts', label: 'Shifts & cash', icon: Clock3 },
            { key: 'orders', label: 'Orders', icon: ShoppingBag },
            { key: 'customers', label: 'Customers', icon: UserRound },
            { key: 'payments', label: 'Payments', icon: Wallet },
            { key: 'expenses', label: 'Expenses', icon: Receipt },
            { key: 'notifications', label: 'Notifications', icon: Bell }
        ]
    },
    {
        label: 'Catalog & F&B',
        items: [
            { key: 'catalog', label: 'Catalog editor', icon: Package },
            { key: 'inventory', label: 'Inventory insights', icon: Database },
            { key: 'suppliers', label: 'Suppliers', icon: Truck },
            { key: 'purchase-orders', label: 'Purchase orders', icon: ClipboardList },
            { key: 'stock-movements', label: 'Stock movements', icon: RefreshCw },
            { key: 'recipes', label: 'Ingredients & recipes', icon: BookOpen },
            { key: 'fnb', label: 'F&B Setup', icon: Utensils },
            { key: 'services', label: 'Services', icon: Wrench },
            { key: 'hospitality', label: 'Hospitality', icon: Hotel }
        ]
    },
    {
        label: 'Production & delivery',
        items: [
            { key: 'job-orders', label: 'Job orders', icon: Factory },
            { key: 'dispatch-orders', label: 'Dispatch orders', icon: Send }
        ]
    },
    {
        label: 'Governance',
        items: [
            { key: 'sales', label: 'Sales timeline', icon: ShoppingBag },
            { key: 'reports', label: 'Reports & analytics', icon: BarChart3 },
            { key: 'fiscal', label: 'Fiscal & BIR', icon: Receipt },
            { key: 'audit', label: 'Audit logs', icon: ScrollText },
            { key: 'approvals', label: 'Approvals', icon: ShieldCheck }
        ]
    },
    {
        label: 'Configuration',
        items: [
            { key: 'onboarding', label: 'POS onboarding', icon: CheckCircle2 },
            { key: 'storefront', label: 'Storefront', icon: Store },
            { key: 'settings', label: 'Settings', icon: Settings },
            { key: 'ai-chat', label: 'Business assistant', icon: Sparkles }
        ]
    }
];

const SECTION_META = {
    overview: { title: 'Business overview', description: 'A clear view of sales, branches, registers, shifts, and exceptions for this business.' },
    branches: { title: 'Branches', description: 'Compare active locations and review branch-level operating activity.' },
    team: { title: 'Team & access', description: 'Review workforce activity and branch assignments without duplicating the User owner.' },
    attendance: { title: 'Attendance', description: 'Review read-only POS attendance and operator sessions while keeping biometric attendance and payroll outside the approved contract.' },
    registers: { title: 'Registers', description: 'See configured terminals, current shifts, sync state, and printer telemetry when available.' },
    shifts: { title: 'Shifts & cash', description: 'Inspect immutable POS shifts, drawer events, variances, and activity totals.' },
    orders: { title: 'Orders', description: 'Search completed, voided, and storefront orders with receipt-safe detail history.' },
    customers: { title: 'Customers', description: 'Review customer links and transaction history for this business.' },
    payments: { title: 'Payments', description: 'Review this business’s online payments, refunds, and payment account status.' },
    expenses: { title: 'Expenses', description: 'Record and review operating expenses by branch while keeping cash drawer activity in Shifts & cash.' },
    catalog: MERCHANT_BACKOFFICE_MODULE_META.catalog,
    inventory: { title: 'Inventory insights', description: 'Read the canonical branch stock ledger and FIFO valuation where cost access is granted.' },
    suppliers: MERCHANT_BACKOFFICE_MODULE_META.suppliers,
    'purchase-orders': MERCHANT_BACKOFFICE_MODULE_META['purchase-orders'],
    'job-orders': MERCHANT_BACKOFFICE_MODULE_META['job-orders'],
    'stock-movements': MERCHANT_BACKOFFICE_MODULE_META['stock-movements'],
    'dispatch-orders': MERCHANT_BACKOFFICE_MODULE_META['dispatch-orders'],
    recipes: { title: 'Ingredients & recipes', description: 'Review product compositions, recipe cost, unit-of-measure review, and branch availability.' },
    fnb: MERCHANT_BACKOFFICE_MODULE_META.fnb,
    services: MERCHANT_BACKOFFICE_MODULE_META.services,
    hospitality: MERCHANT_BACKOFFICE_MODULE_META.hospitality,
    sales: MERCHANT_BACKOFFICE_MODULE_META.sales,
    reports: MERCHANT_BACKOFFICE_MODULE_META.reports,
    fiscal: { title: 'Fiscal & BIR', description: 'Inspect immutable Z-reading and eSales evidence. Accreditation remains an external gate.' },
    notifications: { title: 'Notifications', description: 'Triage inventory, terminal, payment, fulfillment, and governance conditions.' },
    audit: { title: 'Audit logs', description: 'Review activity across this business with sensitive values protected.' },
    approvals: { title: 'Approvals', description: 'Review high-risk requests. Execution stays with the canonical POS command owner.' },
    onboarding: { title: 'POS onboarding', description: 'Track the current business, branch, and workflow readiness contract.' },
    storefront: { title: 'Storefront', description: 'Review storefront-facing readiness while keeping public commerce ownership in Storefront.' },
    settings: { title: 'Settings', description: 'Back Office owns business and branch configuration; terminal-only controls remain in POS.' },
    'ai-chat': MERCHANT_BACKOFFICE_MODULE_META['ai-chat']
};

const MIGRATED_BACKOFFICE_MODULE_KEYS = new Set(Object.keys(MERCHANT_BACKOFFICE_MODULE_META));
const DGFY_BUSINESS_ADMIN_LOGO = resolveAppAssetUrl('/dgfy-horizontal_logo-removebg-preview.png');
const BUSINESS_ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY = 'dgfy.businessAdmin.sidebarCollapsed';
const BUSINESS_ADMIN_SESSION_REQUIRED_MESSAGE = 'Your session is missing or expired. Return to POS to sign in with an authorized manager account.';
const BUSINESS_ADMIN_COMPANY_SWITCHED_MESSAGE = 'The company changed in another window. Return to POS and open Back Office again for the selected company.';
const BUSINESS_ADMIN_ACCESS_DENIED_MESSAGE = 'Your account is authenticated but is not authorized to open Back Office.';
const BUSINESS_ADMIN_ORDERS_PAGE_SIZE = 20;
const BUSINESS_ADMIN_SHIFTS_PAGE_SIZE = 20;

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
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
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

const StatusPill = ({ value, fallback = 'unknown' }) => (
    <span className={`business-admin-status ${statusClass(value)}`}>{humanize(value || fallback)}</span>
);

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

const GuardedLink = ({ to, isDirty = false, onLeave, children, ...props }) => {
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
    };

    return <Link {...props} to={to} onClick={handleClick}>{children}</Link>;
};

const Metric = ({ label, value, hint, tone = '' }) => (
    <div className={`business-admin-card business-admin-metric ${tone}`}>
        <div className="business-admin-metric-label">{label}</div>
        <div className="business-admin-metric-value">{value}</div>
        {hint ? <div className="business-admin-metric-hint">{hint}</div> : null}
    </div>
);

const SectionCard = ({ title, subtitle, children, action, className = '' }) => (
    <section className={`business-admin-card ${className}`}>
        <div className="business-admin-card-header">
            <div>
                <div className="business-admin-card-title">{title}</div>
                {subtitle ? <div className="business-admin-card-subtitle">{subtitle}</div> : null}
            </div>
            {action || null}
        </div>
        <div className="business-admin-card-body flush">{children}</div>
    </section>
);

const Empty = ({ message = 'No records match the current filters.' }) => (
    <div className="business-admin-empty">{message}</div>
);

const Loading = () => (
    <div className="business-admin-loading"><span className="business-admin-spinner" /> Loading Back Office data…</div>
);

const WorkspaceLoading = ({ label = 'Loading Back Office data…' }) => (
    <div className="business-admin-loading business-admin-workspace-loading" role="status" aria-live="polite">
        <span className="business-admin-spinner" aria-hidden="true" />
        <span>{label}</span>
    </div>
);

const DataTable = ({ columns, rows = [], rowKey, onRowClick, emptyMessage }) => {
    if (!rows.length) return <Empty message={emptyMessage} />;
    return (
        <div className="business-admin-table-wrap">
            <table className="business-admin-table">
                <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={rowKey ? rowKey(row, index) : index} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                            {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : (row[column.key] ?? '—')}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

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

const formatCell = (value, key = '') => {
    if (value === null || value === undefined || value === '') return '—';
    if (/(amount|sales|spend|price|cost|value|discount|refund|cogs|profit|fee|tax|total)/i.test(key)) return money(value);
    if (/(count|quantity|qty|visits|orders|units|shortage)/i.test(key) && Number.isFinite(Number(value))) return number(value);
    if (/(created|updated|date|time|at)$/i.test(key) && (typeof value === 'string' || value instanceof Date)) return dateTime(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

const dynamicColumns = (rows = [], preferred = []) => {
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
    const ordered = [...preferred.filter((key) => keys.includes(key)), ...keys.filter((key) => !preferred.includes(key))];
    return ordered.filter((key) => !['payload', 'metadata', 'filters'].includes(key)).slice(0, 10).map((key) => ({
        key,
        label: humanize(key),
        render: (row) => formatCell(row[key], key)
    }));
};

const buildQuery = ({ dateFrom, dateTo, branchId, search }) => ({
    date_from: dateFrom,
    date_to: dateTo,
    ...(branchId ? { branch_id: branchId } : {}),
    ...(search ? { search } : {})
});

const historicalEmptyMessage = (message, dateFrom, dateTo) => (
    `${message} Date range: ${formatDateRangeLabel(dateFrom, dateTo)}. Choose a wider date range to view older records.`
);

function OverviewWorkspace({ data, onOrderClick }) {
    const summary = data?.summary || {};
    return (
        <>
            <div className="business-admin-metric-grid">
                <Metric label="Sales in range" value={money(summary.total_sales)} hint={`${number(summary.today_transactions)} transactions`} />
                <Metric label="Active branches" value={number(summary.branch_count)} hint={`${number(summary.active_registers)} active registers`} />
                <Metric label="Open shifts" value={number(summary.open_shifts)} hint={`${number(summary.overdue_shifts)} over 12 hours`} />
                <Metric label="Active cashiers" value={number(summary.active_cashiers)} hint="Open POS shifts" />
                <Metric label="Low stock" value={summary.low_stock_items == null ? '—' : number(summary.low_stock_items)} hint="At or below threshold" />
                <Metric label="Cash difference" value={money(summary.cash_difference_amount)} hint={summary.pending_approvals == null ? 'Closed shift variance' : `${number(summary.pending_approvals)} pending approvals`} />
            </div>
            <div className="business-admin-grid">
                <SectionCard title="Branch performance" subtitle="Canonical POS transaction totals">
                    <DataTable
                        rows={data?.branches || []}
                        rowKey={(row) => row.branch_id}
                        emptyMessage="No active branches are configured."
                        columns={[
                            { key: 'name', label: 'Branch', render: (row) => <strong>{row.name}</strong> },
                            { key: 'sales', label: 'Sales', render: (row) => money(row.sales) },
                            { key: 'transaction_count', label: 'Transactions', render: (row) => number(row.transaction_count) },
                            { key: 'active_cashiers', label: 'Cashiers', render: (row) => number(row.active_cashiers) },
                            { key: 'active_registers', label: 'Registers', render: (row) => number(row.active_registers) }
                        ]}
                    />
                </SectionCard>
                <SectionCard title="Operational alerts" subtitle="Conditions requiring attention">
                    <div className="business-admin-card-body">
                        {(data?.alerts || []).length === 0 && (data?.scheduled_alerts || []).length === 0 ? <Empty message="No active operational alerts." /> : (
                            <div className="business-admin-list">
                                {[...(data?.alerts || []), ...(data?.scheduled_alerts || [])].slice(0, 8).map((alert, index) => (
                                    <div className="business-admin-list-item" key={alert.alert_key || alert.code || index}>
                                        <div>
                                            <div className="business-admin-list-title">{alert.message}</div>
                                            <div className="business-admin-list-detail">{humanize(alert.alert_type || alert.code)} · {alert.target_route || alert.target?.type || 'operations'}</div>
                                        </div>
                                        <StatusPill value={alert.severity} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </SectionCard>
            </div>
            <div className="business-admin-grid">
                <SectionCard title="Registers" subtitle="Terminal registry and optional heartbeat state">
                    <DataTable
                        rows={data?.registers || []}
                        rowKey={(row) => row.terminal_id}
                        emptyMessage="No POS registers are configured."
                        columns={[
                            { key: 'terminal_id', label: 'Register', render: (row) => <strong>{row.label || row.terminal_id}</strong> },
                            { key: 'branch_name', label: 'Branch' },
                            { key: 'terminal_status', label: 'Status', render: (row) => <StatusPill value={row.terminal_status} /> },
                            { key: 'current_cashier', label: 'Cashier' },
                            { key: 'offline_queue_count', label: 'Offline queue', render: (row) => row.offline_queue_count == null ? '—' : number(row.offline_queue_count) }
                        ]}
                    />
                </SectionCard>
                <SectionCard title="Recent orders" subtitle="Click an order to inspect its receipt-safe timeline">
                    <DataTable
                        rows={data?.recent_transactions || []}
                        rowKey={(row) => row.transaction_id}
                        onRowClick={onOrderClick}
                        emptyMessage="No completed or voided orders in this range."
                        columns={[
                            { key: 'invoice_number', label: 'Invoice', render: (row) => <button className="business-admin-link" type="button">{row.invoice_number || `#${row.transaction_id}`}</button> },
                            { key: 'branch_name', label: 'Branch' },
                            { key: 'order_source', label: 'Source', render: (row) => humanize(row.order_source) },
                            { key: 'transaction_status', label: 'Status', render: (row) => <StatusPill value={row.transaction_status} /> },
                            { key: 'total_amount', label: 'Total', render: (row) => money(row.total_amount) }
                        ]}
                    />
                </SectionCard>
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

function BranchLocationEditorModal({ bootstrap, onClose, onSaved }) {
    const [settingsDirty, setSettingsDirty] = useState(false);
    const rawCapabilities = bootstrap?.access?.settings_sections || bootstrap?.access?.capabilities?.settings_sections;
    const canEditBranches = bootstrap?.user?.is_master_admin === true
        || canAccessBusinessAdminSettingsSection(rawCapabilities, 'branches', 'edit');
    const terminalUser = useMemo(() => buildBusinessAdminSettingsEditorUser({
        baseUser: bootstrap?.user || {},
        sectionKey: 'branches',
        rawCapabilities
    }), [bootstrap?.user, rawCapabilities]);
    const requestClose = useCallback(() => {
        if (settingsDirty && typeof window !== 'undefined' && typeof window.confirm === 'function') {
            if (!window.confirm('You have unsaved branch changes. Close and discard them?')) return;
        }
        onClose?.();
    }, [onClose, settingsDirty]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') requestClose();
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [requestClose]);

    const modal = (
        <div className="business-admin-branch-editor-backdrop">
            <section
                className="business-admin-branch-editor-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="business-admin-branch-editor-title"
            >
                <header className="business-admin-branch-editor-header">
                    <div className="business-admin-branch-editor-heading">
                        <div className="business-admin-branch-editor-icon"><Building2 size={19} aria-hidden="true" /></div>
                        <div>
                            <div className="business-admin-kicker">Branch setup</div>
                            <h2 id="business-admin-branch-editor-title">Add a branch</h2>
                            <p>Create a business location and configure the settings used by Storefront and POS.</p>
                        </div>
                    </div>
                    <button type="button" className="business-admin-branch-editor-close" onClick={requestClose} aria-label="Close branch editor" title="Close branch editor">
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>
                <div className="business-admin-branch-editor-notice">
                    <MapPin size={16} aria-hidden="true" />
                    <span>Save the branch identity and map pin first. You can assign terminals, cashiers, and branch-specific settings afterward.</span>
                </div>
                <div className="business-admin-branch-editor-body">
                    <SettingsWorkspace
                        terminalUser={terminalUser}
                        terminalMeta={{ pettyCashAmount: 0, pettyCashSymbol: 'PHP', locationBindingReadiness: null }}
                        locationsState={{ loading: false, locations: bootstrap?.business?.branches || [] }}
                        queueLocationScopeId={null}
                        incomingOrdersState={{ loading: false, orders: [] }}
                        locked={false}
                        sectionId="business-admin-branch-editor"
                        initialTab="storefront"
                        allowedTabIds={['storefront']}
                        readOnly={!canEditBranches}
                        showTerminalOnlyControls={false}
                        settingsSurface="business-admin"
                        editorSection="branches"
                        startWithNewLocation
                        locationEditorOnly
                        onSettingsSaved={onSaved}
                        onDirtyChange={setSettingsDirty}
                    />
                </div>
            </section>
        </div>
    );
    return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}

function BranchWorkspace({ data, bootstrap, onSaved }) {
    const [branchEditorOpen, setBranchEditorOpen] = useState(false);
    const branches = Array.isArray(data?.branches) ? data.branches : [];
    const rawCapabilities = bootstrap?.access?.settings_sections || bootstrap?.access?.capabilities?.settings_sections;
    const canEditBranches = bootstrap?.user?.is_master_admin === true
        || canAccessBusinessAdminSettingsSection(rawCapabilities, 'branches', 'edit');
    const totals = branches.reduce((summary, branch) => ({
        sales: summary.sales + (Number(branch.sales) || 0),
        cashiers: summary.cashiers + (Number(branch.active_cashiers) || 0),
        registers: summary.registers + (Number(branch.active_registers) || 0)
    }), { sales: 0, cashiers: 0, registers: 0 });
    const handleBranchSaved = useCallback((details) => {
        setBranchEditorOpen(false);
        onSaved?.(details);
    }, [onSaved]);

    return (
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
                        {canEditBranches ? (
                            <button type="button" className="business-admin-button primary" onClick={() => setBranchEditorOpen(true)}>
                                <Plus size={14} aria-hidden="true" /> Add branch
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

            {branchEditorOpen ? (
                <BranchLocationEditorModal
                    bootstrap={bootstrap}
                    onClose={() => setBranchEditorOpen(false)}
                    onSaved={handleBranchSaved}
                />
            ) : null}
        </div>
    );
}

function RegistersWorkspace({ data }) {
    return (
        <SectionCard title="Register health" subtitle="Terminal registry is authoritative; heartbeat is optional telemetry">
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
                    <span>Completed, voided, and storefront orders are shown from canonical POS records. Select an order for receipt-safe detail.</span>
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
            {selected ? <OrderDetailPanel order={selected} onClose={onClose} /> : null}
        </div>
    );
}

function OrderDetailPanel({ order, onClose }) {
    return (
        <div className="business-admin-detail-panel">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="business-admin-kicker">Order detail</div>
                    <h2 className="mt-1 text-lg font-black text-[#173e58]">{order.invoice_number || `Transaction #${order.transaction_id}`}</h2>
                    <p className="mt-1 text-xs text-slate-500">{dateTime(order.created_at)} · {order.branch?.name || order.branch_name || 'Branch not recorded'}</p>
                </div>
                <button type="button" className="business-admin-button" onClick={onClose}>Close</button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div><div className="business-admin-kicker">Customer</div><div className="mt-1 text-sm text-slate-700">{order.customer?.name || order.customer_name || 'Walk-in'}</div></div>
                <div><div className="business-admin-kicker">Payment</div><div className="mt-1 text-sm text-slate-700">{humanize(order.payment?.method || order.payment_type)} · {humanize(order.payment?.status || order.payment_status)}</div></div>
                <div><div className="business-admin-kicker">Total</div><div className="mt-1 text-sm font-black text-slate-800">{money(order.totals?.total ?? order.total_amount)}</div></div>
            </div>
            {(order.lines || []).length ? <div className="mt-4"><div className="business-admin-kicker mb-1">Lines</div><DataTable rows={order.lines} columns={[{ key: 'item_name', label: 'Item' }, { key: 'quantity', label: 'Qty', render: (row) => number(row.quantity) }, { key: 'unit_price', label: 'Unit', render: (row) => money(row.unit_price) }, { key: 'subtotal', label: 'Subtotal', render: (row) => money(row.subtotal) }]} /></div> : null}
            {(order.status_history || []).length ? <div className="mt-4"><div className="business-admin-kicker mb-1">Timeline</div><DataTable rows={order.status_history} columns={[{ key: 'event', label: 'Event', render: (row) => humanize(row.event) }, { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) }, { key: 'actor_name', label: 'Actor' }]} /></div> : null}
            {(order.refunds || []).length ? <div className="mt-4"><div className="business-admin-kicker mb-1">Refund adjustments</div><DataTable rows={order.refunds} columns={[{ key: 'refund_id', label: 'Adjustment' }, { key: 'amount', label: 'Amount', render: (row) => money(row.amount) }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> }, { key: 'reason', label: 'Reason' }]} /></div> : null}
        </div>
    );
}

function CustomersWorkspace({ data, onSelect, selected, onClose }) {
    return (
        <>
            <SectionCard title="Customer analytics" subtitle={`${number(data?.pagination?.total)} customer profiles`}>
                <DataTable
                    rows={data?.rows || []}
                    rowKey={(row) => row.profile_ref}
                    onRowClick={onSelect}
                    emptyMessage="No customer activity matches the selected period."
                    columns={[
                        { key: 'name', label: 'Customer', render: (row) => <button className="business-admin-link" type="button">{row.name}</button> },
                        { key: 'identity_source', label: 'Identity source', render: (row) => humanize(row.identity_source) },
                        { key: 'visit_count', label: 'Visits', render: (row) => number(row.visit_count) },
                        { key: 'total_spend', label: 'Total spend', render: (row) => money(row.total_spend) },
                        { key: 'average_order', label: 'Average order', render: (row) => money(row.average_order) },
                        { key: 'last_purchase_at', label: 'Last purchase', render: (row) => dateTime(row.last_purchase_at) }
                    ]}
                />
            </SectionCard>
            {selected ? <CustomerDetailPanel customer={selected} onClose={onClose} /> : null}
        </>
    );
}

function CustomerDetailPanel({ customer, onClose }) {
    return (
        <div className="business-admin-detail-panel">
            <div className="flex items-start justify-between gap-3">
                <div><div className="business-admin-kicker">Customer profile</div><h2 className="mt-1 text-lg font-black text-[#173e58]">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{customer.email || customer.phone || 'No contact snapshot'} · {humanize(customer.identity_source)}</p></div>
                <button type="button" className="business-admin-button" onClick={onClose}>Close</button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3"><div><div className="business-admin-kicker">Visits</div><div className="mt-1 text-sm font-black text-slate-800">{number(customer.visit_count)}</div></div><div><div className="business-admin-kicker">Spend</div><div className="mt-1 text-sm font-black text-slate-800">{money(customer.total_spend)}</div></div><div><div className="business-admin-kicker">Frequency</div><div className="mt-1 text-sm text-slate-700">{customer.purchase_frequency_days == null ? 'Not enough history' : `${number(customer.purchase_frequency_days)} days`}</div></div></div>
            {(customer.favorite_products || []).length ? <div className="mt-4"><div className="business-admin-kicker mb-1">Favorite products</div><DataTable rows={customer.favorite_products} columns={[{ key: 'item_name', label: 'Item' }, { key: 'quantity', label: 'Quantity', render: (row) => number(row.quantity) }, { key: 'net_spend', label: 'Spend', render: (row) => money(row.net_spend) }]} /></div> : null}
            {(customer.orders || []).length ? <div className="mt-4"><div className="business-admin-kicker mb-1">Recent orders</div><DataTable rows={customer.orders} columns={[{ key: 'invoice_number', label: 'Invoice' }, { key: 'created_at', label: 'When', render: (row) => dateTime(row.created_at) }, { key: 'payment_type', label: 'Payment', render: (row) => humanize(row.payment_type) }, { key: 'total_amount', label: 'Total', render: (row) => money(row.total_amount) }]} /></div> : null}
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
            <span className="business-admin-inventory-record-tag warning">Below threshold</span>
        </div>
        <div className="business-admin-inventory-record-facts">
            <div><span>On hand</span><strong>{number(row.quantity_on_hand)}</strong></div>
            <div><span>Threshold</span><strong>{number(row.min_threshold)}</strong></div>
            <div><span>Shortage</span><strong>{number(row.shortage_quantity)}</strong></div>
        </div>
    </article>
);

function InventoryWorkspace({ data }) {
    const valuation = data?.valuation?.valuation || data?.valuation || {};
    const locations = Array.isArray(valuation.locations) ? valuation.locations : [];
    const lowStock = Array.isArray(data?.lowStock?.rows) ? data.lowStock.rows : [];
    const costHidden = data?.valuation?.meta?.cost_visibility === false;
    const lowStockTotal = data?.lowStock?.pagination?.total ?? lowStock.length;
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
                <InventorySummaryMetric icon={AlertTriangle} label="Low-stock items" value={number(lowStockTotal)} detail="Current branch thresholds" tone={lowStockTotal ? 'warning' : 'teal'} />
                <InventorySummaryMetric icon={RefreshCw} label="FIFO drift" value={number(fifoDriftTotal)} detail="Items needing review" tone={fifoDriftTotal ? 'critical' : 'teal'} />
            </div>

            <div className="business-admin-inventory-context">
                <Database size={16} />
                <div><strong>Read-only inventory view</strong><span>Use Catalog Editor and Stock movements for inventory changes.</span></div>
            </div>

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
                    title="Low-stock queue"
                    subtitle="Items at or below their branch threshold"
                    action={<span className="business-admin-inventory-count">{number(lowStockTotal)} items</span>}
                >
                    <div className="business-admin-inventory-table-view">
                        <DataTable rows={lowStock} rowKey={(row, index) => `${row.sku_code || row.item}-${index}`} emptyMessage="No low-stock items in this scope." columns={lowStockColumns} />
                    </div>
                    <div className="business-admin-inventory-mobile-view">
                        {lowStock.length ? <div className="business-admin-inventory-record-list">{lowStock.map((row, index) => <InventoryLowStockCard key={`${row.sku_code || row.item}-${index}`} row={row} />)}</div> : <Empty message="No low-stock items in this scope." />}
                    </div>
                </SectionCard>
            </div>
        </div>
    );
}

function ReportsWorkspace({ data, selectedReport, onReportChange, onExport }) {
    const definitions = data?.definitions || [];
    const dataset = data?.dataset || {};
    const rows = dataset.rows || [];
    return (
        <>
            <div className="business-admin-toolbar">
                <select className="business-admin-search" value={selectedReport} onChange={(event) => onReportChange(event.target.value)} aria-label="Report">
                    {definitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}
                </select>
                <button type="button" className="business-admin-button" onClick={() => onExport('csv')} disabled={!selectedReport}><Download size={14} /> Export CSV</button>
                <button type="button" className="business-admin-button" onClick={() => onExport('xls')} disabled={!selectedReport}><Download size={14} /> Export XLS</button>
            </div>
            <SectionCard title={dataset.definition?.label || 'Report dataset'} subtitle={`${number(dataset.pagination?.total)} rows · ${dataset.meta?.source || 'read model'}`}>
                <DataTable rows={rows} columns={dynamicColumns(rows, ['period', 'branch', 'employee', 'item_name', 'category', 'net_sales', 'transaction_count', 'refunds_voids'])} emptyMessage="No finalized rows match the report filters." />
            </SectionCard>
        </>
    );
}

function WorkforceWorkspace({ data, bootstrap, teamCapability, onInviteSaved }) {
    const [memberInviteOpen, setMemberInviteOpen] = useState(false);
    const employees = data?.employees || [];
    const canEditUsers = bootstrap?.user?.is_master_admin === true || teamCapability?.user_edit === true;
    const branchId = data?.filters?.branch_id || '';
    const handleMemberSaved = useCallback((details = {}) => {
        setMemberInviteOpen(false);
        onInviteSaved?.(details);
    }, [onInviteSaved]);

    return (
        <SectionCard
            title="Workforce activity"
            subtitle={`${number(employees.length)} employees in the selected scope`}
            action={canEditUsers ? (
                <div className="business-admin-workforce-header-actions">
                    <button type="button" className="business-admin-button primary" onClick={() => setMemberInviteOpen(true)}>
                        <UserPlus size={14} aria-hidden="true" /> Add member
                    </button>
                </div>
            ) : null}
        >
            <DataTable
                rows={employees}
                rowKey={(row) => row.user_id}
                emptyMessage="No employees match this branch scope."
                columns={[
                    { key: 'username', label: 'Employee', render: (row) => <strong>{row.username}</strong> },
                    { key: 'role', label: 'Role', render: (row) => humanize(row.role) },
                    { key: 'is_active', label: 'Account', render: (row) => <StatusPill value={row.is_active ? 'active' : 'inactive'} /> },
                    { key: 'orders_processed', label: 'Orders', render: (row) => number(row.performance?.orders_processed) },
                    { key: 'completed_sales_amount', label: 'Sales', render: (row) => money(row.performance?.completed_sales_amount) },
                    { key: 'void_count', label: 'Voids', render: (row) => number(row.performance?.void_count) },
                    { key: 'cash_difference_amount', label: 'Cash variance', render: (row) => money(row.performance?.cash_difference_amount) }
                ]}
            />
            {canEditUsers ? (
                <BusinessAdminMemberInviteModal
                    bootstrap={bootstrap}
                    branchId={branchId}
                    open={memberInviteOpen}
                    onOpenChange={setMemberInviteOpen}
                    onSuccess={handleMemberSaved}
                />
            ) : null}
        </SectionCard>
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

function AttendanceWorkspace({ data, branches = [] }) {
    const attendanceRows = data?.attendance?.rows || [];
    const operatorRows = data?.operators?.rows || [];
    const activeAttendance = attendanceRows.filter((row) => !row.ended_at).length;
    const branchNames = new Map((Array.isArray(branches) ? branches : []).map((branch) => [
        String(branch.branch_id ?? branch.location_id),
        branch.name
    ]));
    const branchLabel = (row) => row?.location_id
        ? (branchNames.get(String(row.location_id)) || `Branch #${row.location_id}`)
        : 'Branch not recorded';

    return (
        <div className="business-admin-attendance-workspace">
            <div className="business-admin-attendance-contract" role="note">
                <ShieldCheck size={17} />
                <div className="business-admin-attendance-contract-copy">
                    <strong>Read-only POS attendance</strong>
                    <span>Canonical POS records only. Biometric capture, payroll, and schedule management are not part of this workspace.</span>
                </div>
            </div>
            <div className="business-admin-attendance-summary" aria-label="Attendance summary">
                <AttendanceSummaryMetric icon={CalendarDays} label="Attendance sessions" value={number(data?.attendance?.pagination?.total)} detail="POS duty records" />
                <AttendanceSummaryMetric icon={Clock3} label="Active attendance" value={number(activeAttendance)} detail="No recorded time-out" />
                <AttendanceSummaryMetric icon={Monitor} label="Operator sessions" value={number(data?.operators?.pagination?.total)} detail="Terminal activity records" />
            </div>
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

const ShiftHistoryCard = ({ row }) => (
    <article className="business-admin-shift-card">
        <div className="business-admin-shift-card-heading">
            <div className="business-admin-shift-card-identity">
                <div className="business-admin-shift-card-icon"><Clock3 size={16} /></div>
                <div className="business-admin-shift-card-copy">
                    <strong>Shift #{row.shift_id ?? '—'}</strong>
                    <span>{row.branch_name || 'Branch not recorded'} · {row.cashier_name || 'Cashier not recorded'}</span>
                </div>
            </div>
            <StatusPill value={row.status} />
        </div>
        <div className="business-admin-shift-card-facts">
            <div><span>Register</span><strong>{row.terminal_id || '—'}</strong></div>
            <div><span>Branch</span><strong>{row.branch_name || '—'}</strong></div>
            <div><span>Cashier</span><strong>{row.cashier_name || '—'}</strong></div>
            <div><span>Opened</span><strong>{dateTime(row.opened_at)}</strong></div>
            <div><span>Orders</span><strong>{number(row.orders_processed)}</strong></div>
            <div><span>Variance</span><strong>{money(row.cash_variance_amount)}</strong></div>
        </div>
    </article>
);

const ShiftsPagination = ({ pagination = {}, onPageChange, refreshing = false }) => {
    const total = Math.max(Number(pagination.total) || 0, 0);
    const limit = Math.max(Number(pagination.limit) || BUSINESS_ADMIN_SHIFTS_PAGE_SIZE, 1);
    const totalPages = Math.max(Number(pagination.total_pages) || Math.ceil(total / limit), 1);
    const page = Math.min(Math.max(Number(pagination.page) || 1, 1), totalPages);
    if (!total) return null;
    const start = ((page - 1) * limit) + 1;
    const end = Math.min(page * limit, total);

    return (
        <nav className="business-admin-shifts-pagination" aria-label="Shifts pagination">
            <div className="business-admin-shifts-pagination-summary">
                <strong>{number(start)}–{number(end)}</strong>
                <span>of {number(total)} shifts</span>
            </div>
            <div className="business-admin-shifts-pagination-actions">
                <button type="button" className="business-admin-button" onClick={() => onPageChange(page - 1)} disabled={refreshing || page <= 1} aria-label="Previous shifts page">
                    <ChevronLeft size={14} /> Previous
                </button>
                <span className="business-admin-shifts-pagination-page">Page {number(page)} of {number(totalPages)}</span>
                <button type="button" className="business-admin-button" onClick={() => onPageChange(page + 1)} disabled={refreshing || page >= totalPages} aria-label="Next shifts page">
                    Next <ChevronRight size={14} />
                </button>
            </div>
        </nav>
    );
};

function ShiftsWorkspace({ data, dateFrom, dateTo, onPageChange, refreshing = false, refreshError = '' }) {
    const summary = data?.summary || {};
    const shifts = Array.isArray(data?.shifts) ? data.shifts.slice(0, BUSINESS_ADMIN_SHIFTS_PAGE_SIZE) : [];
    const pagination = data?.pagination || {};
    const shiftsRecordsRef = useBusinessAdminPaginatedPanelTransition({ page: pagination.page, refreshing });
    const emptyMessage = historicalEmptyMessage('No shifts match the selected filters.', dateFrom, dateTo);
    const columns = [
        { key: 'shift_id', label: 'Shift' },
        { key: 'terminal_id', label: 'Register' },
        { key: 'branch_name', label: 'Branch' },
        { key: 'cashier_name', label: 'Cashier' },
        { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
        { key: 'opened_at', label: 'Opened', render: (row) => dateTime(row.opened_at) },
        { key: 'orders_processed', label: 'Orders', render: (row) => number(row.orders_processed) },
        { key: 'cash_variance_amount', label: 'Variance', render: (row) => money(row.cash_variance_amount) }
    ];

    return (
        <div className="business-admin-shifts-workspace">
            <div className="business-admin-shifts-contract" role="note">
                <ShieldCheck size={17} />
                <div className="business-admin-shifts-contract-copy">
                    <strong>Read-only POS shift history</strong>
                    <span>Canonical drawer and variance records only. Shift open, close, and force-close actions remain in the POS terminal.</span>
                </div>
            </div>
            <div className="business-admin-shifts-summary" aria-label="Shift summary">
                <ShiftSummaryMetric icon={Clock3} label="Total shifts" value={number(summary.total_shifts)} detail="POS shift records" />
                <ShiftSummaryMetric icon={CheckCircle2} label="Closed" value={number(summary.closed_shifts)} detail="Finalized drawer records" />
                <ShiftSummaryMetric icon={CalendarDays} label="Open" value={number(summary.open_shifts)} detail="Currently active shifts" />
                <ShiftSummaryMetric icon={AlertTriangle} label="Overdue" value={number(summary.overdue_shifts)} detail="Open beyond threshold" />
                <ShiftSummaryMetric icon={ShieldCheck} label="Force-close requests" value={number(summary.force_close_requests)} detail="Canonical POS command pending" />
            </div>
            <SectionCard
                className="business-admin-shifts-section-card"
                title="Shift history"
                subtitle="Drawer events and finalized variance values"
                action={<span className="business-admin-shifts-count">{number(shifts.length)} visible</span>}
            >
                <div
                    ref={shiftsRecordsRef}
                    className={`business-admin-shifts-results ${refreshing ? 'is-refreshing' : ''}`}
                    data-testid="business-admin-shifts-results"
                    aria-busy={refreshing ? 'true' : 'false'}
                >
                    <div className="business-admin-shifts-results-content">
                        {shifts.length ? (
                            <>
                                <div className="business-admin-shifts-table-view">
                                    <DataTable rows={shifts} rowKey={(row) => row.shift_id} columns={columns} />
                                </div>
                                <div className="business-admin-shifts-mobile-view">
                                    <div className="business-admin-shifts-card-list">
                                        {shifts.map((row) => <ShiftHistoryCard key={row.shift_id} row={row} />)}
                                    </div>
                                </div>
                            </>
                        ) : <Empty message={emptyMessage} />}
                    </div>
                    {refreshing ? (
                        <div className="business-admin-shifts-refreshing" role="status" aria-live="polite">
                            <span className="business-admin-spinner" aria-hidden="true" /> Updating shift history…
                        </div>
                    ) : null}
                </div>
                {refreshError ? (
                    <div className="business-admin-alert error business-admin-shifts-panel-error">
                        <AlertTriangle size={17} />
                        <div><strong>Shift history could not be refreshed.</strong><div>{refreshError}</div></div>
                    </div>
                ) : null}
                <ShiftsPagination pagination={pagination} onPageChange={onPageChange} refreshing={refreshing} />
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
function ApprovalsWorkspace({ data, onDecision, actionLoading }) {
    return <SectionCard title="Approval queue" subtitle="High-risk requests are visible here; mutation remains with POS"><DataTable rows={data?.approvals || []} rowKey={(row) => row.approval_request_id} emptyMessage="No approval requests are pending." columns={[{ key: 'action_type', label: 'Action', render: (row) => humanize(row.action_type) }, { key: 'entity_id', label: 'Entity' }, { key: 'requested_by', label: 'Requested by' }, { key: 'requested_at', label: 'Requested', render: (row) => dateTime(row.requested_at) }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> }, { key: 'actions', label: 'Decision', render: (row) => row.status === 'pending' ? <div className="flex flex-wrap gap-1"><button type="button" className="business-admin-button primary" disabled={actionLoading === row.approval_request_id} onClick={(event) => { event.stopPropagation(); onDecision(row.approval_request_id, 'approve'); }}>Approve</button><button type="button" className="business-admin-button danger" disabled={actionLoading === row.approval_request_id} onClick={(event) => { event.stopPropagation(); onDecision(row.approval_request_id, 'reject'); }}>Reject</button></div> : <span className="business-admin-muted">No action</span> }]} /></SectionCard>;
}

function AuditWorkspace({ data, activity = false, dateFrom, dateTo }) {
    const rows = activity ? (data?.activities || []) : (data?.logs || []);
    return <SectionCard title={activity ? 'Business activity' : 'Audit log'} subtitle="Sensitive values are redacted at the API boundary"><DataTable rows={rows} rowKey={(row, index) => row.audit_log_id || `${row.activity_type}-${row.occurred_at}-${index}`} emptyMessage={activity ? 'No audit activity is available for this scope.' : historicalEmptyMessage('No audit activity is available for this scope.', dateFrom, dateTo)} columns={activity ? [{ key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) }, { key: 'title', label: 'Activity', render: (row) => <strong>{row.title}</strong> }, { key: 'detail', label: 'Detail' }, { key: 'actor_name', label: 'Actor' }] : [{ key: 'timestamp', label: 'When', render: (row) => dateTime(row.timestamp) }, { key: 'action', label: 'Action' }, { key: 'entity_type', label: 'Entity' }, { key: 'entity_id', label: 'ID' }, { key: 'actor_name', label: 'Actor' }, { key: 'outcome', label: 'Outcome', render: (row) => <StatusPill value={row.outcome} /> }]} /></SectionCard>;
}

function FiscalWorkspace({ data }) {
    return <><div className="business-admin-alert info"><Database size={17} /><div><strong>Immutable fiscal read model.</strong><div>Z-readings and eSales evidence are shown from POS records. BIR accreditation, CAS/POS registration, and legal filing remain external owner gates.</div></div></div><div className="business-admin-grid"><SectionCard title="X readings" subtitle="Current, non-persisted read summaries"><DataTable rows={data?.current_x_readings || []} columns={[{ key: 'business_date', label: 'Business date' }, { key: 'location_name', label: 'Branch' }, { key: 'terminal_id', label: 'Register' }, { key: 'reading_identifier', label: 'Reading' }, { key: 'source', label: 'Source' }]} emptyMessage="No X-reading summary is available." /></SectionCard><SectionCard title="Z readings & eSales" subtitle="Persisted evidence snapshots"><DataTable rows={[...(data?.z_readings || []), ...(data?.esales_reports || [])]} columns={dynamicColumns([...(data?.z_readings || []), ...(data?.esales_reports || [])], ['business_date', 'report_month', 'status', 'reading_identifier', 'evidence_ref'])} emptyMessage="No fiscal evidence is recorded for this period." /></SectionCard></div></>;
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

function PaymentsWorkspace({ data }) {
    const account = data?.payment_account;
    const reconciliation = data?.reconciliation || {};
    const sessions = (data?.payment_sessions || []).map((session) => ({
        ...session,
        refund_amount_centavos: (session.refunds || []).reduce((total, refund) => total + Number(refund.amount_centavos || 0), 0)
    }));
    const paymentSessionTotal = data?.payment_sessions_page?.total ?? sessions.length;
    const exceptionCount = Number(reconciliation.exception_count || 0);

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
    storefront: ['storefront'],
    delivery: ['delivery_pricing'],
    branches: ['storefront'],
    attendance: ['pos_setup'],
    payments: ['payments'],
    registers: ['pos_setup']
});

function BusinessAdminMemberInviteModal({ bootstrap, branchId = '', open, onOpenChange, onSuccess }) {
    const [roleCatalog, setRoleCatalog] = useState(null);
    const branchLocations = (
        (Array.isArray(bootstrap?.business?.branches) ? bootstrap.business.branches : []).map((branch) => ({
            location_id: Number(branch?.branch_id),
            name: branch?.name || `Branch ${branch?.branch_id}`
        }))
    );
    const invitationLocations = (() => {
        const normalizedBranchId = Number(branchId);
        if (Number.isInteger(normalizedBranchId) && normalizedBranchId > 0) {
            const scopedLocations = branchLocations.filter((branch) => Number(branch.location_id) === normalizedBranchId);
            if (scopedLocations.length) return scopedLocations;
        }
        return branchLocations;
    })();

    useEffect(() => {
        if (!open) return undefined;
        let active = true;
        getRoleCatalog()
            .then((catalog) => {
                if (active) setRoleCatalog(catalog || null);
            })
            .catch(() => {
                // UserInvitationModal has a safe legacy-role fallback when the catalog is unavailable.
                if (active) setRoleCatalog(null);
            });

        return () => {
            active = false;
        };
    }, [open]);

    return (
        <UserInvitationModal
            open={open}
            onOpenChange={onOpenChange}
            roleCatalog={roleCatalog}
            locationOptions={invitationLocations}
            title="Add team member"
            submitLabel="Send invitation"
            onSuccess={() => onSuccess?.({ action: 'member_invited', branchId: branchId || '' })}
        />
    );
}

function BusinessAdminSettingsEditor({
    bootstrap,
    definition,
    sectionCapability,
    settingsBranchId,
    onDirtyChange,
    onReload,
    onSettingsSaved,
    settingsRefreshKey = 0
}) {
    const [userManagementOpen, setUserManagementOpen] = useState(false);
    const [memberInviteOpen, setMemberInviteOpen] = useState(false);
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
    const allowedTabIds = BUSINESS_ADMIN_EDITOR_TABS[definition?.key] || [];
    const isMasterAdmin = bootstrap?.user?.is_master_admin === true;
    const canViewUsers = isMasterAdmin || sectionCapability?.user_view === true || sectionCapability?.user_edit === true;
    const canEditUsers = isMasterAdmin || sectionCapability?.user_edit === true;
    const hasEmployeeEditor = sectionCapability?.employee_edit === true
        || sectionCapability?.employee_credit_edit === true;
    const hasTeamAccessEditor = canEditUsers;
    const teamEditorTabs = hasTeamAccessEditor ? ['pos_setup', 'employees'] : ['employees'];
    const handleReload = useCallback(async () => {
        await onReload?.();
    }, [onReload]);
    const notifySettingsSaved = useCallback((details = {}) => {
        onSettingsSaved?.({
            section: definition?.key,
            branchId: definition?.scope === 'branch' ? settingsBranchId : '',
            ...details
        });
    }, [definition?.key, definition?.scope, onSettingsSaved, settingsBranchId]);

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
                                {canEditUsers ? (
                                    <button
                                        type="button"
                                        className="business-admin-button primary"
                                        onClick={() => setMemberInviteOpen(true)}
                                    >
                                        <UserPlus size={14} /> Add member
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="business-admin-button"
                                    onClick={() => setUserManagementOpen(true)}
                                >
                                    <Users size={14} /> Manage users &amp; roles
                                </button>
                            </div>
                        ) : (
                            <span className="business-admin-muted shrink-0">User access is not assigned.</span>
                        )}
                    </div>
                </div>
                {hasEmployeeEditor || hasTeamAccessEditor ? (
                    <SettingsWorkspace
                        terminalUser={editorUser}
                        terminalMeta={{ pettyCashAmount: 0, pettyCashSymbol: 'PHP', locationBindingReadiness: null }}
                        locationsState={{ loading: false, locations: branchLocations }}
                        queueLocationScopeId={settingsBranchId || null}
                        incomingOrdersState={{ loading: false, orders: [] }}
                        locked={false}
                        sectionId="business-admin-settings-team-employees"
                        initialTab={hasTeamAccessEditor ? 'pos_setup' : 'employees'}
                        allowedTabIds={teamEditorTabs}
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
                {canViewUsers ? (
                    <UserManagementModal
                        open={userManagementOpen}
                        onOpenChange={setUserManagementOpen}
                        readOnly={!canEditUsers}
                        onSettingsSaved={notifySettingsSaved}
                    />
                ) : null}
                {canEditUsers ? (
                    <BusinessAdminMemberInviteModal
                        bootstrap={bootstrap}
                        branchId={settingsBranchId}
                        open={memberInviteOpen}
                        onOpenChange={setMemberInviteOpen}
                        onSuccess={async (details) => {
                            notifySettingsSaved(details);
                            await handleReload();
                        }}
                    />
                ) : null}
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
                onRefreshTerminalUser={handleReload}
                onRefreshTerminalMeta={async () => {}}
                onPosSetupSaved={handleReload}
                onStorefrontSetupSaved={handleReload}
                onSettingsSaved={notifySettingsSaved}
                settingsRefreshKey={settingsRefreshKey}
                onDirtyChange={onDirtyChange}
                locationScopeId={definition?.key === 'branches' ? settingsBranchId : null}
            />
        </div>
    );
}

function BusinessAdminSettingsWorkspace({
    bootstrap,
    settingsSection,
    settingsBranchId,
    onBranchChange,
    onSelectSection,
    settingsDirty = false,
    onLeaveSettings = () => {},
    onDirtyChange = () => {},
    onReload = async () => {},
    onSettingsSaved = () => {},
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
                                        onDirtyChange={onDirtyChange}
                                        onReload={onReload}
                                        onSettingsSaved={onSettingsSaved}
                                        settingsRefreshKey={settingsRefreshKey}
                                    />
                                </div>
                                <div className="business-admin-settings-terminal-link">
                                    <GuardedLink
                                        to={buildPosSettingsOwnerPath('terminal_setup')}
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
    const canView = capabilities?.view_expenses !== false;
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
    return <><div className="business-admin-alert info"><CheckCircle2 size={17} /><div><strong>Read-model boundary.</strong><div>This business Back Office keeps POS, Storefront, catalog, inventory, identity, and fiscal ownership boundaries intact.</div></div></div><div className="business-admin-feature-grid">{cards}</div><div className="mt-5 flex flex-wrap gap-3"><Link to="/terminal" className="business-admin-button primary"><ExternalLink size={14} /> Open POS terminal</Link>{section === 'fnb' ? <Link to="/terminal" className="business-admin-button"><ChefHat size={14} /> Open F&B operations</Link> : null}</div></>;
}

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
    const rootPath = location.pathname.startsWith('/backoffice') ? '/backoffice' : '/business-admin';
    const pathInfo = useMemo(() => parseBusinessAdminPath(location.pathname, rootPath), [location.pathname, rootPath]);
    const pathSegment = pathInfo.activeSection;
    const knownSections = useMemo(() => new Set(Object.keys(SECTION_META)), []);
    const activeSection = knownSections.has(pathSegment) ? pathSegment : 'overview';
    const settingsSection = activeSection === 'settings' ? pathInfo.settingsSection : '';
    const [bootstrap, setBootstrap] = useState(null);
    const [bootstrapLoading, setBootstrapLoading] = useState(true);
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
    const [branchId, setBranchId] = useState('');
    const [search, setSearch] = useState('');
    const [ordersPage, setOrdersPage] = useState(1);
    const [expensesPage, setExpensesPage] = useState(1);
    const [shiftsPage, setShiftsPage] = useState(1);
    const [selectedReport, setSelectedReport] = useState('sales_by_branch');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [actionError, setActionError] = useState('');
    const [reloadNonce, setReloadNonce] = useState(0);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(readBusinessAdminSidebarCollapsed);
    const [settingsBranchId, setSettingsBranchId] = useState(() => (
        String(new URLSearchParams(location.search).get('branch_id') || '').trim()
    ));
    const [settingsDirty, setSettingsDirty] = useState(false);
    const requestRef = useRef(0);
    const previousSectionRef = useRef(activeSection);

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
        if (activeSection === 'shifts') setShiftsPage(1);
    }, [activeSection, activeDateRange.dateFrom, activeDateRange.dateTo, branchId, search]);

    const settingsCapabilities = useMemo(() => normalizeBusinessAdminSettingsCapabilities(
        bootstrap?.access?.settings_sections || bootstrap?.access?.capabilities?.settings_sections
    ), [bootstrap]);
    const visibleSettingsSections = useMemo(() => getVisibleBusinessAdminSettingsSections(settingsCapabilities), [settingsCapabilities]);
    const settingsDefinition = useMemo(
        () => getBusinessAdminSettingsSectionDefinition(settingsSection),
        [settingsSection]
    );
    const branches = useMemo(() => bootstrap?.business?.branches || [], [bootstrap]);

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

    const handleSettingsBranchChange = useCallback((nextBranchId) => {
        const normalizedBranchId = String(nextBranchId || '').trim();
        setSettingsBranchId(normalizedBranchId);
        const searchParams = new URLSearchParams(location.search);
        if (normalizedBranchId) searchParams.set('branch_id', normalizedBranchId);
        else searchParams.delete('branch_id');
        const nextSearch = searchParams.toString();
        navigate({
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : ''
        }, { replace: true });
    }, [location.pathname, location.search, navigate]);

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

    const loadBootstrap = useCallback(async () => {
        const requestId = bootstrapRequestRef.current + 1;
        bootstrapRequestRef.current = requestId;
        setBootstrapLoading(true);
        setBootstrapError('');
        setBootstrapAuthRequired(false);
        setBootstrapAccessDenied(false);
        try {
            const nextBootstrap = await businessAdminApi.bootstrap();
            if (bootstrapRequestRef.current !== requestId) return;
            setBootstrap(nextBootstrap);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (bootstrapRequestRef.current !== requestId) return;
            const sessionRequired = status === 401 || status === 419;
            setBootstrapAuthRequired(sessionRequired);
            setBootstrapAccessDenied(status === 403);
            setBootstrap(null);
            setBootstrapError(sessionRequired
                ? BUSINESS_ADMIN_SESSION_REQUIRED_MESSAGE
                : (status === 403 ? BUSINESS_ADMIN_ACCESS_DENIED_MESSAGE : getBusinessAdminErrorMessage(error)));
        } finally {
            if (bootstrapRequestRef.current === requestId) setBootstrapLoading(false);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const handleSessionInvalidation = () => {
            bootstrapRequestRef.current += 1;
            setBootstrap(null);
            setBootstrapLoading(false);
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
            setBootstrap(null);
            setBootstrapLoading(false);
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

    const handleBranchEditorSaved = useCallback((details = {}) => {
        handleSettingsSaved({ section: 'branches', ...details });
        setReloadNonce((value) => value + 1);
        void loadBootstrap();
    }, [handleSettingsSaved, loadBootstrap]);

    const handleWorkforceMemberSaved = useCallback((details = {}) => {
        handleSettingsSaved({ section: 'team', ...details });
        setReloadNonce((value) => value + 1);
        void loadBootstrap();
    }, [handleSettingsSaved, loadBootstrap]);

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

    const params = useMemo(() => buildQuery({
        dateFrom: activeDateRange.dateFrom,
        dateTo: activeDateRange.dateTo,
        branchId: activeSection === 'audit' ? '' : branchId,
        search
    }), [activeDateRange.dateFrom, activeDateRange.dateTo, activeSection, branchId, search]);

    const loadSection = useCallback(async () => {
        if (!bootstrap) return;
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;
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
            if (activeSection === 'branches') {
                payload = { overview: await businessAdminApi.overview(params) };
            } else if (['overview', 'registers'].includes(activeSection)) payload = { overview: await businessAdminApi.overview(params) };
            else if (activeSection === 'orders') payload = await businessAdminApi.orders({ ...params, page: ordersPage, limit: BUSINESS_ADMIN_ORDERS_PAGE_SIZE });
            else if (activeSection === 'expenses') payload = await businessAdminApi.expenses({ ...params, page: expensesPage, limit: BUSINESS_ADMIN_ORDERS_PAGE_SIZE });
            else if (activeSection === 'customers') payload = await businessAdminApi.customers({ ...params, page: 1, limit: 50 });
            else if (activeSection === 'team') payload = await businessAdminApi.workforce(params);
            else if (activeSection === 'attendance') payload = await businessAdminApi.attendance({ ...params, page: 1, limit: 100 });
            else if (activeSection === 'shifts') payload = await businessAdminApi.shifts({ ...params, page: shiftsPage, limit: BUSINESS_ADMIN_SHIFTS_PAGE_SIZE });
            else if (activeSection === 'inventory') {
                const [valuation, lowStock] = await Promise.all([
                    businessAdminApi.inventoryValuation(branchId ? { branch_id: branchId } : {}),
                    businessAdminApi.reportDataset('low_stock', { ...params, page: 1, limit: 50 })
                ]);
                payload = { valuation, lowStock };
            } else if (activeSection === 'recipes') payload = await businessAdminApi.recipes({ ...params, page: 1, limit: 50 });
            else if (activeSection === 'reports') {
                const definitionResult = await businessAdminApi.reportDefinitions();
                const definitions = definitionResult.reports || [];
                const key = definitions.some((definition) => definition.key === selectedReport) ? selectedReport : (definitions[0]?.key || 'sales_by_branch');
                if (key !== selectedReport) setSelectedReport(key);
                payload = { definitions, dataset: await businessAdminApi.reportDataset(key, { ...params, page: 1, limit: 50 }) };
            } else if (activeSection === 'fiscal') payload = await businessAdminApi.fiscal(params);
            else if (activeSection === 'notifications') payload = await businessAdminApi.notifications({ ...(branchId ? { branch_id: branchId } : {}), status: 'open', limit: 100 });
            else if (activeSection === 'audit') payload = await businessAdminApi.audit({ ...params, limit: 100, page: 1 });
            else if (activeSection === 'approvals') payload = { approvals: (await businessAdminApi.approvals({ status: 'pending', limit: 100 })).approvals || [] };
            else if (activeSection === 'payments') payload = await businessAdminApi.payments(params);
            else if (activeSection === 'activity') payload = await businessAdminApi.activity({ limit: 100 });
            else payload = { bootstrap };
            if (requestRef.current === requestId) {
                setSectionData(payload);
                setLoadedSection(activeSection);
            }
        } catch (error) {
            if (requestRef.current === requestId) {
                setSectionAccessDenied(Number(error?.response?.status || 0) === 403);
                setSectionError(getBusinessAdminErrorMessage(error));
                setLoadedSection(activeSection);
            }
        } finally {
            if (requestRef.current === requestId) setSectionLoading(false);
        }
    }, [activeSection, bootstrap, expensesPage, ordersPage, params, selectedReport, shiftsPage, branchId]);

    useEffect(() => {
        setSelectedOrder(null);
        setSelectedCustomer(null);
        loadSection();
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

    const handleReportExport = useCallback(async (format) => {
        if (!selectedReport) return;
        setActionLoading(`export-${format}`);
        setActionError('');
        try {
            const response = await businessAdminApi.exportReport(selectedReport, { ...params, format });
            const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: format === 'xls' ? 'application/vnd.ms-excel' : 'text/csv' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `business-admin-${selectedReport}.${format === 'xls' ? 'xls' : 'csv'}`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch (error) { setActionError(getBusinessAdminErrorMessage(error)); } finally { setActionLoading(null); }
    }, [params, selectedReport]);

    const showDateFilters = [
        'overview', 'branches', 'registers', 'orders', 'customers', 'team',
        'attendance', 'shifts', 'expenses', 'inventory', 'recipes', 'fiscal', 'audit'
    ].includes(activeSection);
    const showHistoricalRangePreset = isHistoricalBusinessAdminSection(activeSection);
    const showBranchFilter = activeSection !== 'audit';

    if (bootstrapLoading) return <Loading />;
    if (bootstrapError || !bootstrap) {
        return <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] p-6"><section className="business-admin-card w-full max-w-lg p-7 text-center" data-testid={bootstrapAuthRequired ? 'business-admin-session-required' : (bootstrapAccessDenied ? 'business-admin-access-denied' : 'business-admin-unavailable')}><ShieldCheck className="mx-auto text-[#159891]" size={32} /><h1 className="mt-3 text-2xl font-black text-[#173e58]">{bootstrapAuthRequired ? 'Back Office sign-in required' : (bootstrapAccessDenied ? 'Back Office access denied' : 'Back Office unavailable')}</h1><p className="mt-2 text-sm text-slate-600">{bootstrapAuthRequired ? (bootstrapError || BUSINESS_ADMIN_SESSION_REQUIRED_MESSAGE) : (bootstrapAccessDenied ? BUSINESS_ADMIN_ACCESS_DENIED_MESSAGE : (bootstrapError || 'Your account does not have Back Office access.'))}</p><Link to="/terminal" className="business-admin-button primary mt-5"><ExternalLink size={14} /> {bootstrapAuthRequired ? 'Open POS sign-in' : 'Open POS terminal'}</Link></section></main>;
    }

    const meta = activeSection === 'settings' && settingsDefinition
        ? { title: settingsDefinition.label, description: settingsDefinition.description }
        : (SECTION_META[activeSection] || SECTION_META.overview);
    const overviewData = sectionData?.overview || (activeSection === 'overview' ? sectionData : null);
    const workflowPageName = getBusinessAdminWorkflowPageName(activeSection);
    const workflowVisibilityReady = workflowModeResolved && !workflowModeLoading;
    const workflowSectionVisible = isBusinessAdminWorkflowSectionVisible(
        activeSection,
        workflowMode,
        enabledCapabilities,
        disabledCapabilities
    );
    const notificationWorkspaceHasData = activeSection === 'notifications'
        && Array.isArray(sectionData?.notifications);
    const workspaceTransitionKey = activeSection === 'settings'
        ? `${activeSection}:${settingsSection || 'profile'}`
        : activeSection;
    const workspaceBusy = Boolean(
        (workflowPageName && workflowModeLoading)
        || sectionLoading
        || loadedSection !== activeSection
    );
    const renderWorkspace = () => {
        const canKeepPaginatedWorkspace = ['orders', 'expenses', 'shifts'].includes(activeSection)
            && Boolean(sectionData)
            && loadedSection === activeSection;
        if (workflowPageName && workflowModeLoading) return <WorkspaceLoading label={`Loading ${meta.title}…`} />;
        if (workflowPageName && !workflowModeResolved) {
            return <Navigate to={`${rootPath}/overview`} replace />;
        }
        if (workflowPageName && !workflowSectionVisible) {
            return <Navigate to={`${rootPath}/overview`} replace />;
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
                return <OrdersWorkspace data={sectionData} selected={selectedOrder} onSelect={handleOrderSelect} onClose={() => setSelectedOrder(null)} dateFrom={activeDateRange.dateFrom} dateTo={activeDateRange.dateTo} page={ordersPage} onPageChange={setOrdersPage} refreshing={sectionLoading} refreshError={sectionError} />;
            }
            if (activeSection === 'expenses') {
                return <ExpensesWorkspace data={sectionData} branches={branches} capabilities={bootstrap.access?.capabilities || {}} accessScope={bootstrap.access?.scope} onCreate={handleExpenseCreate} onVoid={handleExpenseVoid} actionLoading={actionLoading} onPageChange={setExpensesPage} refreshing={sectionLoading} refreshError={sectionError} />;
            }
            return <ShiftsWorkspace data={sectionData} dateFrom={activeDateRange.dateFrom} dateTo={activeDateRange.dateTo} onPageChange={setShiftsPage} refreshing={sectionLoading} refreshError={sectionError} />;
        }
        if (sectionLoading) return <WorkspaceLoading label={`Refreshing ${meta.title}…`} />;
        if (sectionError) return <div className="business-admin-alert error" data-testid={sectionAccessDenied ? 'business-admin-section-access-denied' : 'business-admin-section-error'}><AlertTriangle size={17} /><div><strong>{sectionAccessDenied ? 'Back Office access denied.' : 'Back Office data unavailable.'}</strong><div>{sectionError}</div></div></div>;
        if (activeSection === 'settings') {
            return (
                <BusinessAdminSettingsWorkspace
                    bootstrap={bootstrap}
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
                />
            );
        }
        if (MIGRATED_BACKOFFICE_MODULE_KEYS.has(activeSection)) {
            return <MigratedBackOfficeModule section={activeSection} />;
        }
        if (activeSection === 'overview') return <OverviewWorkspace data={overviewData} onOrderClick={handleOrderSelect} />;
        if (activeSection === 'branches') return <BranchWorkspace data={sectionData?.overview} bootstrap={bootstrap} onSaved={handleBranchEditorSaved} />;
        if (activeSection === 'registers') return <RegistersWorkspace data={sectionData?.overview} />;
        if (activeSection === 'orders') return <OrdersWorkspace data={sectionData} selected={selectedOrder} onSelect={handleOrderSelect} onClose={() => setSelectedOrder(null)} dateFrom={activeDateRange.dateFrom} dateTo={activeDateRange.dateTo} page={ordersPage} onPageChange={setOrdersPage} />;
        if (activeSection === 'expenses') return <ExpensesWorkspace data={sectionData} branches={branches} capabilities={bootstrap.access?.capabilities || {}} accessScope={bootstrap.access?.scope} onCreate={handleExpenseCreate} onVoid={handleExpenseVoid} actionLoading={actionLoading} onPageChange={setExpensesPage} />;
        if (activeSection === 'customers') return <CustomersWorkspace data={sectionData} selected={selectedCustomer} onSelect={handleCustomerSelect} onClose={() => setSelectedCustomer(null)} />;
        if (activeSection === 'team') return <WorkforceWorkspace data={sectionData} bootstrap={bootstrap} teamCapability={settingsCapabilities.team} onInviteSaved={handleWorkforceMemberSaved} />;
        if (activeSection === 'attendance') return <AttendanceWorkspace data={sectionData} branches={branches} />;
        if (activeSection === 'shifts') return <ShiftsWorkspace data={sectionData} dateFrom={activeDateRange.dateFrom} dateTo={activeDateRange.dateTo} onPageChange={setShiftsPage} />;
        if (activeSection === 'inventory') return <InventoryWorkspace data={sectionData} />;
        if (activeSection === 'recipes') return <RecipesWorkspace data={sectionData} />;
        if (activeSection === 'reports') return <ReportsWorkspace data={sectionData} selectedReport={selectedReport} onReportChange={setSelectedReport} onExport={handleReportExport} />;
        if (activeSection === 'fiscal') return <FiscalWorkspace data={sectionData} />;
        if (activeSection === 'notifications') return <NotificationsWorkspace data={sectionData} onAction={handleNotificationAction} actionLoading={actionLoading} />;
        if (activeSection === 'approvals') return <ApprovalsWorkspace data={sectionData} onDecision={handleApprovalDecision} actionLoading={actionLoading} />;
        if (activeSection === 'audit') return <AuditWorkspace data={sectionData} dateFrom={activeDateRange.dateFrom} dateTo={activeDateRange.dateTo} />;
        if (activeSection === 'payments') return <PaymentsWorkspace data={sectionData} />;
        return <SimpleWorkspace section={activeSection} bootstrap={bootstrap} />;
    };

    return (
        <div className={`business-admin-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
            <aside
                id="business-admin-sidebar"
                data-testid="business-admin-sidebar"
                className={`business-admin-sidebar ${mobileNavOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`.trim()}
            >
                <div className="business-admin-brand">
                    <img className="business-admin-brand-logo" src={DGFY_BUSINESS_ADMIN_LOGO} alt="DGFY" />
                    <div>
                        <div className="business-admin-brand-title">{bootstrap.business?.name || 'Your business'}</div>
                        <div className="business-admin-brand-subtitle">Business back office</div>
                    </div>
                </div>
                {mobileNavOpen ? <button type="button" className="business-admin-mobile-sidebar-close" data-testid="business-admin-mobile-sidebar-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={16} /> Close menu</button> : null}
                {NAV_GROUPS.map((group) => {
                    const items = group.items.filter((item) => {
                        if (item.key === 'settings' && visibleSettingsSections.length === 0) return false;
                        if (!getBusinessAdminWorkflowPageName(item.key)) return true;
                        if (!workflowVisibilityReady) return false;
                        return isBusinessAdminWorkflowSectionVisible(
                            item.key,
                            workflowMode,
                            enabledCapabilities,
                            disabledCapabilities
                        );
                    });
                    if (!items.length) return null;
                    return <div className="business-admin-nav-group" key={group.label}><div className="business-admin-nav-label">{group.label}</div>{items.map((item) => { const Icon = item.icon; return <button type="button" key={item.key} className={`business-admin-nav-item ${activeSection === item.key ? 'active' : ''}`} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined} aria-current={activeSection === item.key ? 'page' : undefined} onClick={() => navigateBusinessAdmin(item.key === 'settings' ? buildBusinessAdminSettingsPath(rootPath, visibleSettingsSections[0]?.key || 'profile') : `${rootPath}/${item.key}`)}><Icon size={16} /> <span className="business-admin-nav-item-label">{item.label}</span>{item.key === 'approvals' && overviewData?.summary?.pending_approvals ? <span className="business-admin-nav-item-badge ml-auto rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] text-amber-800">{overviewData.summary.pending_approvals}</span> : null}</button>; })}</div>;
                })}
                <div className="business-admin-terminal-link mt-6 border-t border-white/15 pt-4"><GuardedLink to="/terminal" isDirty={settingsDirty} onLeave={() => setSettingsDirty(false)} className="business-admin-nav-item" aria-label="Open POS terminal" title={sidebarCollapsed ? 'Open POS terminal' : undefined}><ExternalLink size={16} /> <span className="business-admin-nav-item-label">Open POS terminal</span></GuardedLink></div>
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
                        <div>
                            <div className="business-admin-eyebrow">{bootstrap.business?.name || 'Business'} · {humanize(bootstrap.access?.scope)} scope</div>
                            <h1 className="business-admin-heading">{meta.title}</h1>
                            {activeSection !== 'settings' ? <p className="business-admin-description">{meta.description}</p> : null}
                        </div>
                    </div>
                    <div className="business-admin-top-actions"><span className="business-admin-chip"><UserRound size={13} /> {bootstrap.user?.username || bootstrap.user?.email || 'User'}</span><button type="button" className="business-admin-button" onClick={handleBusinessAdminRefresh} disabled={sectionLoading || bootstrapLoading}><RefreshCw size={14} /> Refresh</button><GuardedLink to="/terminal" isDirty={settingsDirty} onLeave={() => setSettingsDirty(false)} className="business-admin-button primary"><ExternalLink size={14} /> POS terminal</GuardedLink></div>
                </div>
                {showDateFilters ? (
                    <div className={`business-admin-filter-card ${activeSection === 'branches' ? 'business-admin-branches-filter-card' : ''}`}>
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
                                <select id="ba-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                                    <option value="">All visible branches</option>
                                    {branches.map((branch) => <option value={branch.branch_id} key={branch.branch_id}>{branch.name}</option>)}
                                </select>
                            </div>
                        ) : null}
                        {['orders', 'customers', 'expenses'].includes(activeSection) ? (
                            <div className="business-admin-field flex-1">
                                <label htmlFor="ba-search"><Search size={12} className="inline mr-1" /> Search</label>
                                <input id="ba-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeSection === 'orders' ? 'Invoice, customer, tracking PIN' : (activeSection === 'customers' ? 'Name, email, or phone' : 'Description, vendor, reference')} />
                            </div>
                        ) : null}
                        <div className="business-admin-filter-spacer" />
                        <div className="business-admin-scope">Timezone: Asia/Manila · Currency: PHP</div>
                    </div>
                ) : null}
                {actionError ? <div className="business-admin-alert error"><AlertTriangle size={17} /><div>{actionError}</div></div> : null}
                <div
                    key={workspaceTransitionKey}
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
