import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    BarChart3,
    Bell,
    BookOpen,
    Building2,
    CalendarDays,
    CheckCircle2,
    ChefHat,
    Clock3,
    Database,
    Download,
    ExternalLink,
    LayoutDashboard,
    Lock,
    MapPin,
    Monitor,
    Package,
    Receipt,
    RefreshCw,
    Search,
    Settings,
    ShoppingBag,
    ShieldCheck,
    Store,
    ScrollText,
    UserRound,
    Users,
    Utensils,
    Wallet
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
import { SettingsWorkspace } from '../../../../../packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx';
import { publishBusinessAdminSettingsUpdated } from '../../../../../packages/web-core/src/features/pos/utils/businessAdminSettingsSync.js';
import UserManagementModal from '../../../../../packages/web-core/Components/users/UserManagementModal.jsx';
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
            { key: 'inventory', label: 'Catalog & inventory', icon: Package },
            { key: 'recipes', label: 'Ingredients & recipes', icon: BookOpen },
            { key: 'fnb', label: 'F&B configuration', icon: Utensils }
        ]
    },
    {
        label: 'Governance',
        items: [
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
            { key: 'settings', label: 'Settings', icon: Settings }
        ]
    }
];

const SECTION_META = {
    overview: { title: 'Business overview', description: 'A tenant-scoped view of sales, branches, registers, shifts, and exceptions.' },
    branches: { title: 'Branches', description: 'Compare active locations and review branch-level operating activity.' },
    team: { title: 'Team & access', description: 'Review workforce activity and branch assignments without duplicating the User owner.' },
    attendance: { title: 'Attendance', description: 'Review POS operator sessions while keeping biometric attendance outside the current approved contract.' },
    registers: { title: 'Registers', description: 'See configured terminals, current shifts, sync state, and printer telemetry when available.' },
    shifts: { title: 'Shifts & cash', description: 'Inspect immutable POS shifts, drawer events, variances, and activity totals.' },
    orders: { title: 'Orders', description: 'Search completed, voided, and storefront orders with receipt-safe detail history.' },
    customers: { title: 'Customers', description: 'Understand tenant StoreCustomer links and transaction snapshots without merging global identity.' },
    payments: { title: 'Payment monitoring', description: 'Review payment readiness and provider-owned versus merchant-owned collection states.' },
    expenses: { title: 'Expenses', description: 'Expense capture and profit integration require an approved accounting owner and data contract.' },
    inventory: { title: 'Catalog & inventory', description: 'Read the canonical catalog and branch stock ledger, with FIFO valuation where cost access is granted.' },
    recipes: { title: 'Ingredients & recipes', description: 'Review product compositions, recipe cost, unit-of-measure review, and branch availability.' },
    fnb: { title: 'F&B configuration', description: 'Verify workflow capabilities for dining, tables, kitchen queues, and service charges.' },
    reports: { title: 'Reports & analytics', description: 'Use finalized POS financial snapshots and export bounded, auditable datasets.' },
    fiscal: { title: 'Fiscal & BIR', description: 'Inspect immutable Z-reading and eSales evidence. Accreditation remains an external gate.' },
    notifications: { title: 'Notifications', description: 'Triage inventory, terminal, payment, fulfillment, and governance conditions.' },
    audit: { title: 'Audit logs', description: 'Tenant-wide audit activity with sensitive values redacted at the read boundary.' },
    approvals: { title: 'Approvals', description: 'Review high-risk requests. Execution stays with the canonical POS command owner.' },
    onboarding: { title: 'POS onboarding', description: 'Track the current business, branch, and workflow readiness contract.' },
    storefront: { title: 'Storefront', description: 'Review storefront-facing readiness while keeping public commerce ownership in Storefront.' },
    settings: { title: 'Settings', description: 'Business Admin owns tenant and branch configuration; terminal-only controls remain in POS.' }
};

const todayManila = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date());

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

const statusClass = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

const StatusPill = ({ value, fallback = 'unknown' }) => (
    <span className={`business-admin-status ${statusClass(value)}`}>{humanize(value || fallback)}</span>
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
    <div className="business-admin-loading"><span className="business-admin-spinner" /> Loading Business Admin data…</div>
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

function BranchWorkspace({ data, multiCompany }) {
    return (
        <>
            <SectionCard title="Active branches" subtitle="Branch-level operating metrics for the selected period">
                <DataTable
                    rows={data?.branches || []}
                    rowKey={(row) => row.branch_id}
                    emptyMessage="No active branches are available in your scope."
                    columns={[
                        { key: 'name', label: 'Branch', render: (row) => <strong>{row.name}</strong> },
                        { key: 'sales', label: 'Sales', render: (row) => money(row.sales) },
                        { key: 'transaction_count', label: 'Transactions', render: (row) => number(row.transaction_count) },
                        { key: 'active_cashiers', label: 'Active cashiers', render: (row) => number(row.active_cashiers) },
                        { key: 'active_registers', label: 'Active registers', render: (row) => number(row.active_registers) }
                    ]}
                />
            </SectionCard>
            {multiCompany?.companies?.length ? <SectionCard title="All-company overview" subtitle="Accepted DGFY memberships with tenant-wide Business Admin access">
                <DataTable
                    rows={multiCompany.companies}
                    rowKey={(row) => row.tenant_id}
                    columns={[
                        { key: 'name', label: 'Company', render: (row) => <strong>{row.name}</strong> },
                        { key: 'total_sales', label: 'Sales', render: (row) => money(row.summary?.total_sales) },
                        { key: 'transactions', label: 'Transactions', render: (row) => number(row.summary?.transactions) },
                        { key: 'branch_count', label: 'Branches', render: (row) => number(row.summary?.branch_count) },
                        { key: 'open_shifts', label: 'Open shifts', render: (row) => number(row.summary?.open_shifts) }
                    ]}
                />
            </SectionCard> : null}
        </>
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

function OrdersWorkspace({ data, onSelect, selected, onClose }) {
    const orders = data?.orders || [];
    return (
        <>
            <SectionCard title="Order center" subtitle={`${number(data?.pagination?.total)} orders in scope`}>
                <DataTable
                    rows={orders}
                    rowKey={(row) => row.transaction_id}
                    onRowClick={onSelect}
                    emptyMessage="No orders match the selected filters."
                    columns={[
                        { key: 'invoice_number', label: 'Invoice', render: (row) => <button className="business-admin-link" type="button">{row.invoice_number || `#${row.transaction_id}`}</button> },
                        { key: 'created_at', label: 'Created', render: (row) => dateTime(row.created_at) },
                        { key: 'branch_name', label: 'Branch' },
                        { key: 'source', label: 'Source', render: (row) => humanize(row.source) },
                        { key: 'fulfillment_status', label: 'Fulfillment', render: (row) => <StatusPill value={row.fulfillment_status || row.transaction_status} /> },
                        { key: 'payment_status', label: 'Payment', render: (row) => <StatusPill value={row.payment_status} /> },
                        { key: 'total_amount', label: 'Total', render: (row) => money(row.total_amount) }
                    ]}
                />
            </SectionCard>
            {selected ? <OrderDetailPanel order={selected} onClose={onClose} /> : null}
        </>
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
            <SectionCard title="Customer analytics" subtitle={`${number(data?.pagination?.total)} tenant-scoped profiles`}>
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

function InventoryWorkspace({ data }) {
    const valuation = data?.valuation?.valuation || data?.valuation || {};
    const lowStock = data?.lowStock?.rows || [];
    return (
        <>
            <div className="business-admin-metric-grid">
                <Metric label="Available quantity" value={number(valuation.weighted_total_available_qty)} hint="FIFO or ledger scoped" />
                <Metric label="Inventory value" value={data?.valuation?.meta?.cost_visibility === false ? 'Hidden' : money(valuation.weighted_total_inventory_value)} hint={data?.valuation?.meta?.cost_visibility === false ? 'Cost permission required' : 'Weighted FIFO value'} />
                <Metric label="Low-stock items" value={number(data?.lowStock?.pagination?.total)} hint="Current branch thresholds" />
            </div>
            <div className="business-admin-grid">
                <SectionCard title="Branch valuation" subtitle="Read-only projection of the inventory cost service">
                    <DataTable rows={valuation.locations || []} rowKey={(row) => row.location_id || row.location_name} emptyMessage="No branch valuation rows are available." columns={[{ key: 'location_name', label: 'Branch', render: (row) => <strong>{row.location_name}</strong> }, { key: 'available_qty', label: 'Available', render: (row) => number(row.available_qty) }, { key: 'inventory_value', label: 'Value', render: (row) => row.inventory_value == null ? 'Hidden' : money(row.inventory_value) }, { key: 'drift_item_count', label: 'FIFO drift', render: (row) => number(row.drift_item_count) }]} />
                </SectionCard>
                <SectionCard title="Low-stock queue" subtitle="Item stock at or below its threshold">
                    <DataTable rows={lowStock} rowKey={(row, index) => `${row.sku_code || row.item}-${index}`} emptyMessage="No low-stock items in this scope." columns={[{ key: 'item', label: 'Item', render: (row) => <strong>{row.item}</strong> }, { key: 'branch', label: 'Branch' }, { key: 'quantity_on_hand', label: 'On hand', render: (row) => number(row.quantity_on_hand) }, { key: 'min_threshold', label: 'Threshold', render: (row) => number(row.min_threshold) }, { key: 'shortage_quantity', label: 'Shortage', render: (row) => number(row.shortage_quantity) }]} />
                </SectionCard>
            </div>
        </>
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

function WorkforceWorkspace({ data }) {
    const employees = data?.employees || [];
    return <SectionCard title="Workforce activity" subtitle={`${number(employees.length)} employees in the selected scope`}><DataTable rows={employees} rowKey={(row) => row.user_id} emptyMessage="No employees match this branch scope." columns={[{ key: 'username', label: 'Employee', render: (row) => <strong>{row.username}</strong> }, { key: 'role', label: 'Role', render: (row) => humanize(row.role) }, { key: 'is_active', label: 'Account', render: (row) => <StatusPill value={row.is_active ? 'active' : 'inactive'} /> }, { key: 'orders_processed', label: 'Orders', render: (row) => number(row.performance?.orders_processed) }, { key: 'completed_sales_amount', label: 'Sales', render: (row) => money(row.performance?.completed_sales_amount) }, { key: 'void_count', label: 'Voids', render: (row) => number(row.performance?.void_count) }, { key: 'cash_difference_amount', label: 'Cash variance', render: (row) => money(row.performance?.cash_difference_amount) }]} /></SectionCard>;
}

function ShiftsWorkspace({ data }) {
    const summary = data?.summary || {};
    return (
        <>
            <div className="business-admin-metric-grid"><Metric label="Total shifts" value={number(summary.total_shifts)} /><Metric label="Closed" value={number(summary.closed_shifts)} /><Metric label="Open" value={number(summary.open_shifts)} /><Metric label="Overdue" value={number(summary.overdue_shifts)} /><Metric label="Force-close requests" value={number(summary.force_close_requests)} hint="Canonical POS command pending" /></div>
            <SectionCard title="Shift history" subtitle="Drawer events and finalized variance values"><DataTable rows={data?.shifts || []} rowKey={(row) => row.shift_id} emptyMessage="No shifts match the selected filters." columns={[{ key: 'shift_id', label: 'Shift' }, { key: 'terminal_id', label: 'Register' }, { key: 'branch_name', label: 'Branch' }, { key: 'cashier_name', label: 'Cashier' }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> }, { key: 'opened_at', label: 'Opened', render: (row) => dateTime(row.opened_at) }, { key: 'orders_processed', label: 'Orders', render: (row) => number(row.orders_processed) }, { key: 'cash_variance_amount', label: 'Variance', render: (row) => money(row.cash_variance_amount) }]} /></SectionCard>
        </>
    );
}

function NotificationsWorkspace({ data, onAction, actionLoading }) {
    const notifications = data?.notifications || [];
    return <SectionCard title="Notification inbox" subtitle={`${number(data?.unread_count)} unread · ${humanize(data?.scope)} scope`}><div className="business-admin-card-body"><div className="business-admin-list">{notifications.length ? notifications.map((notification) => { const id = extractId(notification, ['business_admin_alert_snapshot_id', 'notification_id', 'id']); return <div className="business-admin-list-item" key={id || notification.alert_key}><div className="min-w-0"><div className="business-admin-list-title">{notification.message}</div><div className="business-admin-list-detail">{humanize(notification.alert_type)} · {notification.source_domain || 'operations'} · {dateTime(notification.last_seen_at || notification.created_at)}</div><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="business-admin-button" disabled={actionLoading === id} onClick={() => onAction('read', id)}>Mark read</button><button type="button" className="business-admin-button" disabled={actionLoading === id} onClick={() => onAction('dismiss', id)}>Dismiss</button>{data?.scope === 'all' ? <button type="button" className="business-admin-button" disabled={actionLoading === id} onClick={() => onAction('acknowledge', id)}>Acknowledge</button> : null}</div></div><StatusPill value={notification.severity} /></div>; }) : <Empty message="No active notifications." />}</div></div></SectionCard>;
}

function ApprovalsWorkspace({ data, onDecision, actionLoading }) {
    return <SectionCard title="Approval queue" subtitle="High-risk requests are visible here; mutation remains with POS"><DataTable rows={data?.approvals || []} rowKey={(row) => row.approval_request_id} emptyMessage="No approval requests are pending." columns={[{ key: 'action_type', label: 'Action', render: (row) => humanize(row.action_type) }, { key: 'entity_id', label: 'Entity' }, { key: 'requested_by', label: 'Requested by' }, { key: 'requested_at', label: 'Requested', render: (row) => dateTime(row.requested_at) }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> }, { key: 'actions', label: 'Decision', render: (row) => row.status === 'pending' ? <div className="flex flex-wrap gap-1"><button type="button" className="business-admin-button primary" disabled={actionLoading === row.approval_request_id} onClick={(event) => { event.stopPropagation(); onDecision(row.approval_request_id, 'approve'); }}>Approve</button><button type="button" className="business-admin-button danger" disabled={actionLoading === row.approval_request_id} onClick={(event) => { event.stopPropagation(); onDecision(row.approval_request_id, 'reject'); }}>Reject</button></div> : <span className="business-admin-muted">No action</span> }]} /></SectionCard>;
}

function AuditWorkspace({ data, activity = false }) {
    const rows = activity ? (data?.activities || []) : (data?.logs || []);
    return <SectionCard title={activity ? 'Business activity' : 'Audit log'} subtitle="Sensitive values are redacted at the API boundary"><DataTable rows={rows} rowKey={(row, index) => row.audit_log_id || `${row.activity_type}-${row.occurred_at}-${index}`} emptyMessage="No audit activity is available for this scope." columns={activity ? [{ key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) }, { key: 'title', label: 'Activity', render: (row) => <strong>{row.title}</strong> }, { key: 'detail', label: 'Detail' }, { key: 'actor_name', label: 'Actor' }] : [{ key: 'timestamp', label: 'When', render: (row) => dateTime(row.timestamp) }, { key: 'action', label: 'Action' }, { key: 'entity_type', label: 'Entity' }, { key: 'entity_id', label: 'ID' }, { key: 'actor_name', label: 'Actor' }, { key: 'outcome', label: 'Outcome', render: (row) => <StatusPill value={row.outcome} /> }]} /></SectionCard>;
}

function FiscalWorkspace({ data }) {
    return <><div className="business-admin-alert info"><Database size={17} /><div><strong>Immutable fiscal read model.</strong><div>Z-readings and eSales evidence are shown from POS records. BIR accreditation, CAS/POS registration, and legal filing remain external owner gates.</div></div></div><div className="business-admin-grid"><SectionCard title="X readings" subtitle="Current, non-persisted read summaries"><DataTable rows={data?.current_x_readings || []} columns={[{ key: 'business_date', label: 'Business date' }, { key: 'location_name', label: 'Branch' }, { key: 'terminal_id', label: 'Register' }, { key: 'reading_identifier', label: 'Reading' }, { key: 'source', label: 'Source' }]} emptyMessage="No X-reading summary is available." /></SectionCard><SectionCard title="Z readings & eSales" subtitle="Persisted evidence snapshots"><DataTable rows={[...(data?.z_readings || []), ...(data?.esales_reports || [])]} columns={dynamicColumns([...(data?.z_readings || []), ...(data?.esales_reports || [])], ['business_date', 'report_month', 'status', 'reading_identifier', 'evidence_ref'])} emptyMessage="No fiscal evidence is recorded for this period." /></SectionCard></div></>;
}

function RecipesWorkspace({ data }) {
    const recipes = data?.rows || [];
    return <SectionCard title="Recipe visibility" subtitle={`${number(data?.pagination?.total)} products · source ${humanize(data?.meta?.stock_source)}`}><DataTable rows={recipes} rowKey={(row) => row.item_id} emptyMessage="No recipes are configured for this scope." columns={[{ key: 'name', label: 'Product', render: (row) => <strong>{row.name}</strong> }, { key: 'sku_code', label: 'SKU' }, { key: 'product_type', label: 'Type', render: (row) => humanize(row.product_type) }, { key: 'recipe_cost', label: 'Recipe cost', render: (row) => money(row.recipe_cost) }, { key: 'availability', label: 'Availability', render: (row) => <StatusPill value={row.availability?.status} /> }, { key: 'possible_units', label: 'Possible units', render: (row) => row.availability?.possible_units == null ? '—' : number(row.availability.possible_units) }]} /></SectionCard>;
}

function PaymentsWorkspace({ data }) {
    const account = data?.payment_account;
    const reconciliation = data?.reconciliation || {};
    const sessions = (data?.payment_sessions || []).map((session) => ({
        ...session,
        refund_amount_centavos: (session.refunds || []).reduce((total, refund) => total + Number(refund.amount_centavos || 0), 0)
    }));
    return (
        <>
            <div className="business-admin-metric-grid">
                <Metric label="Collected" value={money(Number(reconciliation.collected_amount_centavos || 0) / 100)} hint="Stored payment-session evidence" />
                <Metric label="Merchant net" value={money(Number(reconciliation.merchant_net_before_provider_fees_centavos || 0) / 100)} hint="Before provider fees" />
                <Metric label="Refunded" value={money(Number(reconciliation.succeeded_refund_centavos || 0) / 100)} hint={`${number(reconciliation.pending_refund_centavos || 0) / 100} pending PHP`} />
                <Metric label="Exceptions" value={number(reconciliation.exception_count)} hint={`${number(reconciliation.paid_unfinalized_count)} paid but unfinalized`} tone={reconciliation.exception_count ? 'warning' : ''} />
            </div>
            <div className="business-admin-alert info"><Wallet size={17} /><div><strong>Provider evidence boundary.</strong><div>{reconciliation.scope || 'Payment monitoring is based on stored payment-session evidence and does not confirm provider payout or bank settlement.'}</div></div></div>
            <div className="business-admin-grid">
                <SectionCard title="PayMongo readiness" subtitle="Tenant payment account status">
                    <DataTable
                        rows={account ? [account] : []}
                        emptyMessage="PayMongo is not configured for this tenant."
                        columns={[
                            { key: 'provider', label: 'Provider', render: (row) => <strong>{humanize(row.provider)}</strong> },
                            { key: 'wallet_status', label: 'Wallet', render: (row) => <StatusPill value={row.wallet_status} /> },
                            { key: 'onboarding_status', label: 'Onboarding', render: (row) => <StatusPill value={row.onboarding_status} /> },
                            { key: 'qrph_enabled', label: 'QR Ph', render: (row) => row.qrph_enabled ? <StatusPill value="enabled" /> : <StatusPill value="disabled" /> },
                            { key: 'split_enabled', label: 'Split', render: (row) => row.split_enabled ? <StatusPill value="enabled" /> : <StatusPill value="disabled" /> },
                            { key: 'last_synced_at', label: 'Last sync', render: (row) => dateTime(row.last_synced_at) }
                        ]}
                    />
                </SectionCard>
                <SectionCard title="Session exceptions" subtitle="Paid, failed, expired, and manual-settlement conditions">
                    <div className="business-admin-card-body">
                        <div className="business-admin-list">
                            <div className="business-admin-list-item"><div><div className="business-admin-list-title">Paid but unfinalized</div><div className="business-admin-list-detail">Webhook finalization follow-up</div></div><strong>{number(reconciliation.paid_unfinalized_count)}</strong></div>
                            <div className="business-admin-list-item"><div><div className="business-admin-list-title">Manual settlement</div><div className="business-admin-list-detail">Requires provider/merchant reconciliation</div></div><strong>{number(reconciliation.manual_settlement_count)}</strong></div>
                            <div className="business-admin-list-item"><div><div className="business-admin-list-title">Pending refunds</div><div className="business-admin-list-detail">Provider refund status not terminal</div></div><strong>{number(reconciliation.pending_refund_centavos || 0) / 100} PHP</strong></div>
                        </div>
                    </div>
                </SectionCard>
            </div>
            <SectionCard title="Recent payment sessions" subtitle={`${number(data?.payment_sessions_page?.total || sessions.length)} sessions in scope`}>
                <DataTable
                    rows={sessions}
                    rowKey={(row) => row.payment_session_id}
                    emptyMessage="No payment sessions match the selected filters."
                    columns={[
                        { key: 'payment_session_id', label: 'Session', render: (row) => <strong>{row.payment_session_id}</strong> },
                        { key: 'target_type', label: 'Target', render: (row) => humanize(row.target_type) },
                        { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
                        { key: 'total_amount_centavos', label: 'Amount', render: (row) => money(Number(row.total_amount_centavos || 0) / 100) },
                        { key: 'refund_amount_centavos', label: 'Refunds', render: (row) => money(Number(row.refund_amount_centavos || 0) / 100) },
                        { key: 'paid_at', label: 'Paid', render: (row) => dateTime(row.paid_at || row.created_at) }
                    ]}
                />
            </SectionCard>
        </>
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

function BusinessAdminSettingsEditor({
    bootstrap,
    definition,
    sectionCapability,
    settingsBranchId,
    onDirtyChange,
    onReload,
    onSettingsSaved
}) {
    const [userManagementOpen, setUserManagementOpen] = useState(false);
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
    const canViewUsers = sectionCapability?.user_view === true || sectionCapability?.user_edit === true;
    const canEditUsers = sectionCapability?.user_edit === true;
    const hasEmployeeEditor = sectionCapability?.employee_edit === true
        || sectionCapability?.employee_credit_edit === true;
    const hasTeamAccessEditor = canEditUsers || bootstrap?.user?.is_master_admin === true;
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
                                This opens the existing User owner. Invitations, permission changes, role scopes,
                                cashier access and location grants are saved immediately through the canonical API.
                            </p>
                            {!canEditUsers ? (
                                <p className="mt-2 text-[11px] font-semibold text-amber-700">View-only access: account mutations are disabled.</p>
                            ) : null}
                        </div>
                        {canViewUsers ? (
                            <button
                                type="button"
                                className="business-admin-button primary shrink-0"
                                onClick={() => setUserManagementOpen(true)}
                            >
                                <Users size={14} /> Open User Management
                            </button>
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
                        editorSection={definition.key}
                        onRefreshTerminalUser={handleReload}
                        onRefreshTerminalMeta={async () => {}}
                        onPosSetupSaved={handleReload}
                        onStorefrontSetupSaved={handleReload}
                        onSettingsSaved={notifySettingsSaved}
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
                editorSection={definition?.key}
                onRefreshTerminalUser={handleReload}
                onRefreshTerminalMeta={async () => {}}
                onPosSetupSaved={handleReload}
                onStorefrontSetupSaved={handleReload}
                onSettingsSaved={notifySettingsSaved}
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
    onSettingsSaved = () => {}
}) {
    const access = bootstrap?.access || {};
    const branches = Array.isArray(bootstrap?.business?.branches) ? bootstrap.business.branches : [];
    const rawCapabilities = access.settings_sections || access.capabilities?.settings_sections;
    const capabilities = normalizeBusinessAdminSettingsCapabilities(rawCapabilities);
    const visibleSections = getVisibleBusinessAdminSettingsSections(rawCapabilities);
    const definition = getBusinessAdminSettingsSectionDefinition(settingsSection);
    const sectionCapability = definition ? capabilities[definition.key] : null;
    const isVisible = definition ? canAccessBusinessAdminSettingsSection(rawCapabilities, definition.key, 'view') : false;
    const selectedBranch = branches.find((branch) => String(branch.branch_id) === String(settingsBranchId));
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
                    <div>Your Business Admin access does not include a view permission for any settings section.</div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="business-admin-alert info" data-testid="business-admin-settings-context">
                <ShieldCheck size={17} />
                <div>
                    <strong>Authorized settings workspace.</strong>
                    <div>
                        Business Admin access is scoped to <strong>{humanize(access.scope || 'assigned')}</strong> branches.
                        Editing remains controlled by each owning API; Business Admin access never grants a new edit permission.
                    </div>
                </div>
            </div>
            <div className="business-admin-settings-layout">
                <section className="business-admin-card business-admin-settings-nav" aria-label="Settings sections">
                    <div className="business-admin-card-header">
                        <div>
                            <div className="business-admin-card-title">Settings sections</div>
                            <div className="business-admin-card-subtitle">Only sections allowed by the server are shown.</div>
                        </div>
                    </div>
                    <div className="business-admin-card-body">
                        <div className="business-admin-settings-section-list">
                            {visibleSections.map((section) => {
                                const sectionAccess = capabilities[section.key] || {};
                                return (
                                    <button
                                        type="button"
                                        key={section.key}
                                        className={`business-admin-settings-section ${section.key === definition?.key ? 'active' : ''}`}
                                        onClick={() => onSelectSection(section.key)}
                                    >
                                        <span>
                                            <strong>{section.label}</strong>
                                            <small>{settingsScopeLabel(access.scope, section.scope)}</small>
                                        </span>
                                        <span className={`business-admin-status ${sectionAccess.edit ? 'available' : ''}`}>
                                            {sectionAccess.edit ? 'Edit' : 'View'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </section>
                <section className="business-admin-card" data-testid="business-admin-settings-section">
                    {!definition || !isVisible ? (
                        <div className="business-admin-card-body">
                            <div className="business-admin-alert error mb-0">
                                <Lock size={17} />
                                <div>
                                    <strong>Settings section unavailable.</strong>
                                    <div>This section is not enabled for your current Business Admin permissions.</div>
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
                                        <p className="business-admin-muted">Tenant ID: {bootstrap?.business?.tenant_id || 'current tenant'}</p>
                                    </div>
                                    <div>
                                        <div className="business-admin-kicker">Scope</div>
                                        <strong>{settingsScopeLabel(access.scope, definition.scope)}</strong>
                                        <p className="business-admin-muted">
                                            {definition.scope === 'tenant'
                                                ? 'This setting applies to the whole tenant. A branch selection never narrows it.'
                                                : 'Branch-specific values must use a branch visible in the authenticated scope.'}
                                        </p>
                                    </div>
                                </div>
                                {definition.scope === 'branch' ? (
                                    <div className="business-admin-field mt-5 max-w-sm">
                                        <label htmlFor="ba-settings-branch"><MapPin size={12} className="inline mr-1" /> Branch context</label>
                                        <select id="ba-settings-branch" value={settingsBranchId} onChange={(event) => handleBranchChange(event.target.value)}>
                                            {!branches.length ? <option value="">No visible branches</option> : null}
                                            {branches.map((branch) => <option value={branch.branch_id} key={branch.branch_id}>{branch.name}</option>)}
                                        </select>
                                        <p className="business-admin-muted mt-2">
                                            {selectedBranch ? `Selected branch: ${selectedBranch.name}` : 'No branch is available in your current scope.'}
                                        </p>
                                    </div>
                                ) : null}
                                <div className="business-admin-alert info mt-5 mb-0">
                                    <ShieldCheck size={17} />
                                    <div>
                                        <strong>Canonical POS settings editor</strong>
                                        <div>This editor reuses the POS owner forms and APIs. Saves are validated server-side and read back from the persisted value.</div>
                                    </div>
                                </div>
                                <div className="mt-5">
                                    <BusinessAdminSettingsEditor
                                        bootstrap={bootstrap}
                                        definition={definition}
                                        sectionCapability={sectionCapability}
                                        settingsBranchId={settingsBranchId}
                                        onDirtyChange={onDirtyChange}
                                        onReload={onReload}
                                        onSettingsSaved={onSettingsSaved}
                                    />
                                </div>
                                <div className="business-admin-alert info mt-5 mb-0">
                                    <ExternalLink size={17} />
                                    <div>
                                        <strong>Terminal-only controls remain in POS</strong>
                                        <div>Printer/device setup, sound, terminal selection, shifts, cash drawer actions, cashier handoff and checkout stay in the terminal surface.</div>
                                        <GuardedLink
                                            to={buildPosSettingsOwnerPath('terminal_setup')}
                                            isDirty={settingsDirty}
                                            onLeave={onLeaveSettings}
                                            className="business-admin-button mt-3"
                                        >
                                            <ExternalLink size={14} /> Open POS terminal controls
                                        </GuardedLink>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>
            <div className="business-admin-alert info" data-settings-navigation-guard="enabled">
                <Lock size={17} />
                <div>
                    <strong>Unsaved-change protection is enabled.</strong>
                    <div>When an editor has pending changes, internal navigation and leaving the browser require confirmation before the draft is discarded.</div>
                </div>
            </div>
        </>
    );
}

function SimpleWorkspace({ section, bootstrap }) {
    const capabilities = bootstrap?.workflow?.capabilities || {};
    const access = bootstrap?.access || {};
    const business = bootstrap?.business || {};
    const features = {
        fnb: [
            <BlockedFeature key="dining" icon={Utensils} title="Dining mode" description="Workflow capability is resolved from the tenant's current mode contract." reason={capabilities.fnbDining ? 'Enabled' : 'Mode capability is disabled'} />,
            <BlockedFeature key="tables" icon={MapPin} title="Table service" description="Table and kitchen queue ownership stays in POS/F&B workflows." reason={capabilities.tableService ? 'Enabled' : 'Mode capability is disabled'} />,
            <BlockedFeature key="charges" icon={Wallet} title="Service charges" description="Restaurant service-charge settings are read from the shared workflow capability resolver." reason={capabilities.restaurantServiceCharge ? 'Enabled' : 'Mode capability is disabled'} />
        ],
        onboarding: [
            <BlockedFeature key="branch" icon={Building2} title="Branch readiness" description={`${number(business.branches?.length)} active branch(es) are visible to this account.`} reason={access.scope === 'all' ? 'Tenant-wide scope' : 'Assigned branch scope'} />,
            <BlockedFeature key="terminal" icon={Monitor} title="Terminal handoff" description="Open the POS terminal to pair hardware, open shifts, and perform checkout operations." reason="POS owns terminal mutations" />,
            <BlockedFeature key="fiscal" icon={Receipt} title="Fiscal readiness" description="Fiscal evidence is available in this workspace when the POS fiscal module has recorded it." reason="External accreditation is not inferred" />
        ],
        storefront: [
            <BlockedFeature key="catalog" icon={Store} title="Storefront catalog" description="Catalog publishing remains owned by the shared inventory/catalog workflow." reason="Use the POS catalog workspace for authoring" />,
            <BlockedFeature key="orders" icon={ShoppingBag} title="Online orders" description="Storefront orders are visible in Orders and routed through the canonical POS queue." reason="Storefront owns public commerce" />,
            <BlockedFeature key="delivery" icon={MapPin} title="Delivery operations" description="Delivery runs and provider handoffs remain in the POS operational flow." reason="No duplicate Business Admin mutation path" />
        ],
        settings: [
            <BlockedFeature key="scope" icon={ShieldCheck} title="Access scope" description="Business Admin applies tenant and branch scope from the authenticated session." reason={`${humanize(access.scope || 'unknown')} access`} />,
            <BlockedFeature key="catalog" icon={Package} title="Catalog settings" description="Use the POS terminal's catalog workspace for item and category authoring." reason="Canonical catalog owner: POS" />,
            <BlockedFeature key="policy" icon={Settings} title="Policy-gated features" description="Expenses, selfie attendance, and BIR accreditation are not enabled by inventing unapproved storage or biometric flows." reason="Owner/policy approval required" />
        ],
        expenses: [
            <BlockedFeature key="expense-ledger" icon={Receipt} title="Expense ledger" description="No accounting-owned expense ledger is currently approved for this tenant." reason="Accounting owner and tax treatment contract required" />,
            <BlockedFeature key="cash-movement" icon={Wallet} title="Cash added / cash-out" description="POS drawer events remain visible in Shifts & cash; Business Admin does not create a second expense mutation path." reason="Canonical POS drawer owner" />,
            <BlockedFeature key="profit" icon={BarChart3} title="Profit after expenses" description="POS sales and inventory cost reports are available, but profit after operating expenses is intentionally not inferred." reason="Accounting data contract required" />
        ],
        attendance: [
            <BlockedFeature key="operator-sessions" icon={Clock3} title="POS operator sessions" description="Workforce and shift activity are available from POS records, including operator session context where recorded." reason="Use Team & access and Shifts & cash" />,
            <BlockedFeature key="selfie" icon={UserRound} title="Selfie time-in / time-out" description="Biometric attendance is not enabled in this workspace." reason="ADR 0073 non-goal; privacy, consent, retention, and owner approval required" />,
            <BlockedFeature key="payroll" icon={Users} title="Payroll export" description="Payroll and statutory attendance exports are outside the current POS ownership contract." reason="HR/payroll owner required" />
        ]
    };
    const cards = features[section] || features.settings;
    return <><div className="business-admin-alert info"><CheckCircle2 size={17} /><div><strong>Read-model boundary.</strong><div>This surface makes the Business Admin capability present and usable while preserving POS, Storefront, catalog, inventory, identity, and fiscal ownership boundaries.</div></div></div><div className="business-admin-feature-grid">{cards}</div><div className="mt-5 flex flex-wrap gap-3"><Link to="/terminal" className="business-admin-button primary"><ExternalLink size={14} /> Open POS terminal</Link>{section === 'fnb' ? <Link to="/terminal" className="business-admin-button"><ChefHat size={14} /> Open F&B operations</Link> : null}</div></>;
}

export default function BusinessAdminPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const rootPath = location.pathname.startsWith('/backoffice') ? '/backoffice' : '/business-admin';
    const pathInfo = useMemo(() => parseBusinessAdminPath(location.pathname, rootPath), [location.pathname, rootPath]);
    const pathSegment = pathInfo.activeSection;
    const knownSections = useMemo(() => new Set(Object.keys(SECTION_META)), []);
    const activeSection = knownSections.has(pathSegment) ? pathSegment : 'overview';
    const settingsSection = activeSection === 'settings' ? pathInfo.settingsSection : '';
    const [bootstrap, setBootstrap] = useState(null);
    const [bootstrapLoading, setBootstrapLoading] = useState(true);
    const [bootstrapError, setBootstrapError] = useState('');
    const [sectionData, setSectionData] = useState(null);
    const [sectionLoading, setSectionLoading] = useState(false);
    const [sectionError, setSectionError] = useState('');
    const [dateFrom, setDateFrom] = useState(todayManila);
    const [dateTo, setDateTo] = useState(todayManila);
    const [branchId, setBranchId] = useState('');
    const [search, setSearch] = useState('');
    const [selectedReport, setSelectedReport] = useState('sales_by_branch');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [actionError, setActionError] = useState('');
    const [reloadNonce, setReloadNonce] = useState(0);
    const [settingsBranchId, setSettingsBranchId] = useState(() => (
        String(new URLSearchParams(location.search).get('branch_id') || '').trim()
    ));
    const [settingsDirty, setSettingsDirty] = useState(false);
    const requestRef = useRef(0);

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
        navigate(target, options);
        return true;
    }, [navigate, settingsDirty]);

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

    const loadBootstrap = useCallback(async () => {
        setBootstrapLoading(true);
        setBootstrapError('');
        try {
            setBootstrap(await businessAdminApi.bootstrap());
        } catch (error) {
            setBootstrapError(getBusinessAdminErrorMessage(error));
        } finally {
            setBootstrapLoading(false);
        }
    }, []);

    const handleSettingsSaved = useCallback(({ section = '', branchId = '' } = {}) => {
        publishBusinessAdminSettingsUpdated({
            tenantId: bootstrap?.business?.tenant_id || bootstrap?.user?.company?.id,
            branchId,
            section
        });
    }, [bootstrap?.business?.tenant_id, bootstrap?.user?.company?.id]);

    useEffect(() => { loadBootstrap(); }, [loadBootstrap]);

    const params = useMemo(() => buildQuery({ dateFrom, dateTo, branchId, search }), [dateFrom, dateTo, branchId, search]);

    const loadSection = useCallback(async () => {
        if (!bootstrap) return;
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;
        if (activeSection === 'settings') {
            setSectionData(null);
            setSectionError('');
            setSectionLoading(false);
            return;
        }
        setSectionLoading(true);
        setSectionError('');
        setActionError('');
        try {
            let payload;
            if (activeSection === 'branches') {
                const [overview, multiCompany] = await Promise.all([
                    businessAdminApi.overview(params),
                    businessAdminApi.multiCompanyOverview(params).catch(() => null)
                ]);
                payload = { overview, multiCompany };
            } else if (['overview', 'registers'].includes(activeSection)) payload = { overview: await businessAdminApi.overview(params) };
            else if (activeSection === 'orders') payload = await businessAdminApi.orders({ ...params, page: 1, limit: 50 });
            else if (activeSection === 'customers') payload = await businessAdminApi.customers({ ...params, page: 1, limit: 50 });
            else if (activeSection === 'team') payload = await businessAdminApi.workforce(params);
            else if (activeSection === 'shifts') payload = await businessAdminApi.shifts({ ...params, page: 1, limit: 50 });
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
            if (requestRef.current === requestId) setSectionData(payload);
        } catch (error) {
            if (requestRef.current === requestId) setSectionError(getBusinessAdminErrorMessage(error));
        } finally {
            if (requestRef.current === requestId) setSectionLoading(false);
        }
    }, [activeSection, bootstrap, params, selectedReport, branchId]);

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
            if (action === 'acknowledge') await businessAdminApi.acknowledgeNotification(id, 'Acknowledged from Business Admin.');
            setReloadNonce((value) => value + 1);
        } catch (error) { setActionError(getBusinessAdminErrorMessage(error)); } finally { setActionLoading(null); }
    }, []);

    const handleApprovalDecision = useCallback(async (id, decision) => {
        setActionLoading(id);
        setActionError('');
        try {
            await businessAdminApi.decideApproval(id, decision, `${decision} requested from Business Admin.`);
            setReloadNonce((value) => value + 1);
        } catch (error) { setActionError(getBusinessAdminErrorMessage(error)); } finally { setActionLoading(null); }
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

    if (bootstrapLoading) return <Loading />;
    if (bootstrapError || !bootstrap) {
        return <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] p-6"><section className="business-admin-card w-full max-w-lg p-7 text-center"><ShieldCheck className="mx-auto text-[#159891]" size={32} /><h1 className="mt-3 text-2xl font-black text-[#173e58]">Business Admin unavailable</h1><p className="mt-2 text-sm text-slate-600">{bootstrapError || 'Your account does not have Business Admin access.'}</p><Link to="/terminal" className="business-admin-button primary mt-5"><ExternalLink size={14} /> Open POS terminal</Link></section></main>;
    }

    const meta = activeSection === 'settings' && settingsDefinition
        ? { title: settingsDefinition.label, description: settingsDefinition.description }
        : (SECTION_META[activeSection] || SECTION_META.overview);
    const overviewData = sectionData?.overview || (activeSection === 'overview' ? sectionData : null);
    const renderWorkspace = () => {
        if (sectionLoading) return <Loading />;
        if (sectionError) return <div className="business-admin-alert error"><AlertTriangle size={17} /><div>{sectionError}</div></div>;
        if (activeSection === 'settings') {
            return (
                <BusinessAdminSettingsWorkspace
                    bootstrap={bootstrap}
                    settingsSection={settingsSection}
                    settingsBranchId={settingsBranchId}
                    onBranchChange={setSettingsBranchId}
                    onSelectSection={(sectionKey) => navigateBusinessAdmin(buildBusinessAdminSettingsPath(rootPath, sectionKey))}
                    settingsDirty={settingsDirty}
                    onLeaveSettings={() => setSettingsDirty(false)}
                    onDirtyChange={setSettingsDirty}
                    onReload={loadBootstrap}
                    onSettingsSaved={handleSettingsSaved}
                />
            );
        }
        if (activeSection === 'overview') return <OverviewWorkspace data={overviewData} onOrderClick={handleOrderSelect} />;
        if (activeSection === 'branches') return <BranchWorkspace data={sectionData?.overview} multiCompany={sectionData?.multiCompany} />;
        if (activeSection === 'registers') return <RegistersWorkspace data={sectionData?.overview} />;
        if (activeSection === 'orders') return <OrdersWorkspace data={sectionData} selected={selectedOrder} onSelect={handleOrderSelect} onClose={() => setSelectedOrder(null)} />;
        if (activeSection === 'customers') return <CustomersWorkspace data={sectionData} selected={selectedCustomer} onSelect={handleCustomerSelect} onClose={() => setSelectedCustomer(null)} />;
        if (activeSection === 'team') return <WorkforceWorkspace data={sectionData} />;
        if (activeSection === 'shifts') return <ShiftsWorkspace data={sectionData} />;
        if (activeSection === 'inventory') return <InventoryWorkspace data={sectionData} />;
        if (activeSection === 'recipes') return <RecipesWorkspace data={sectionData} />;
        if (activeSection === 'reports') return <ReportsWorkspace data={sectionData} selectedReport={selectedReport} onReportChange={setSelectedReport} onExport={handleReportExport} />;
        if (activeSection === 'fiscal') return <FiscalWorkspace data={sectionData} />;
        if (activeSection === 'notifications') return <NotificationsWorkspace data={sectionData} onAction={handleNotificationAction} actionLoading={actionLoading} />;
        if (activeSection === 'approvals') return <ApprovalsWorkspace data={sectionData} onDecision={handleApprovalDecision} actionLoading={actionLoading} />;
        if (activeSection === 'audit') return <AuditWorkspace data={sectionData} />;
        if (activeSection === 'payments') return <PaymentsWorkspace data={sectionData} />;
        return <SimpleWorkspace section={activeSection} bootstrap={bootstrap} />;
    };

    return (
        <div className="business-admin-shell">
            <aside className="business-admin-sidebar">
                <div className="business-admin-brand"><div className="business-admin-brand-mark">D</div><div><div className="business-admin-brand-title">DGFY Business Admin</div><div className="business-admin-brand-subtitle">POS-native back office</div></div></div>
                {NAV_GROUPS.map((group) => {
                    const items = group.items.filter((item) => item.key !== 'settings' || visibleSettingsSections.length > 0);
                    if (!items.length) return null;
                    return <div className="business-admin-nav-group" key={group.label}><div className="business-admin-nav-label">{group.label}</div>{items.map((item) => { const Icon = item.icon; return <button type="button" key={item.key} className={`business-admin-nav-item ${activeSection === item.key ? 'active' : ''}`} onClick={() => navigateBusinessAdmin(item.key === 'settings' ? buildBusinessAdminSettingsPath(rootPath, visibleSettingsSections[0]?.key || 'profile') : `${rootPath}/${item.key}`)}><Icon size={16} /> <span>{item.label}</span>{item.key === 'approvals' && overviewData?.summary?.pending_approvals ? <span className="ml-auto rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] text-amber-800">{overviewData.summary.pending_approvals}</span> : null}</button>; })}</div>;
                })}
                <div className="mt-6 border-t border-white/15 pt-4"><GuardedLink to="/terminal" isDirty={settingsDirty} onLeave={() => setSettingsDirty(false)} className="business-admin-nav-item"><ExternalLink size={16} /> Open POS terminal</GuardedLink></div>
            </aside>
            <main className="business-admin-main">
                <div className="business-admin-topbar"><div><div className="business-admin-eyebrow">{bootstrap.business?.name || 'Business'} · {humanize(bootstrap.access?.scope)} scope</div><h1 className="business-admin-heading">{meta.title}</h1><p className="business-admin-description">{meta.description}</p></div><div className="business-admin-top-actions"><span className="business-admin-chip"><UserRound size={13} /> {bootstrap.user?.username || bootstrap.user?.email || 'User'}</span><button type="button" className="business-admin-button" onClick={() => setReloadNonce((value) => value + 1)} disabled={sectionLoading}><RefreshCw size={14} /> Refresh</button><GuardedLink to="/terminal" isDirty={settingsDirty} onLeave={() => setSettingsDirty(false)} className="business-admin-button primary"><ExternalLink size={14} /> POS terminal</GuardedLink></div></div>
                {['overview', 'branches', 'registers', 'orders', 'customers', 'team', 'shifts', 'inventory', 'recipes', 'reports', 'fiscal'].includes(activeSection) ? <div className="business-admin-filter-card"><div className="business-admin-field"><label htmlFor="ba-date-from"><CalendarDays size={12} className="inline mr-1" /> From</label><input id="ba-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="business-admin-field"><label htmlFor="ba-date-to"><CalendarDays size={12} className="inline mr-1" /> To</label><input id="ba-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div><div className="business-admin-field"><label htmlFor="ba-branch"><MapPin size={12} className="inline mr-1" /> Branch</label><select id="ba-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">All visible branches</option>{branches.map((branch) => <option value={branch.branch_id} key={branch.branch_id}>{branch.name}</option>)}</select></div>{['orders', 'customers'].includes(activeSection) ? <div className="business-admin-field flex-1"><label htmlFor="ba-search"><Search size={12} className="inline mr-1" /> Search</label><input id="ba-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeSection === 'orders' ? 'Invoice, customer, tracking PIN' : 'Name, email, or phone'} /></div> : null}<div className="business-admin-filter-spacer" /><div className="business-admin-scope">Timezone: Asia/Manila · Currency: PHP</div></div> : null}
                {actionError ? <div className="business-admin-alert error"><AlertTriangle size={17} /><div>{actionError}</div></div> : null}
                {renderWorkspace()}
            </main>
        </div>
    );
}
