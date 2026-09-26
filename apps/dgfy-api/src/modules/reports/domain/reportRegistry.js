/**
 * Canonical report metadata registry.
 *
 * This registry describes report contracts; it is deliberately not a report
 * calculator.  Each owner keeps its existing read model and transport until
 * that report is migrated and its result has been compared with the canonical
 * contract.  In particular, terminal reports remain POS-owned so their local
 * and offline behavior is not routed through Business Admin.
 */

const freeze = (value) => Object.freeze(value);

const createDefinition = ({
    filters = [],
    sort_fields = [],
    sort_column_map = null,
    export_formats = [],
    pagination = null,
    permissions = {},
    aggregation = {},
    formatting = {},
    compatibility = {},
    ...metadata
}) => freeze({
    ...metadata,
    filters: freeze([...filters]),
    sort_fields: freeze([...sort_fields]),
    ...(sort_column_map ? { sort_column_map: freeze({ ...sort_column_map }) } : {}),
    export_formats: freeze([...export_formats]),
    ...(pagination ? { pagination: freeze({ ...pagination }) } : {}),
    permissions: freeze({ ...permissions }),
    aggregation: freeze({ ...aggregation }),
    formatting: freeze({ ...formatting }),
    compatibility: freeze({
        ...compatibility,
        ...(Array.isArray(compatibility.read_endpoints)
            ? { read_endpoints: freeze([...compatibility.read_endpoints]) }
            : {}),
        ...(Array.isArray(compatibility.export_endpoints)
            ? { export_endpoints: freeze([...compatibility.export_endpoints]) }
            : {})
    })
});

const BUSINESS_ADMIN_PERMISSION = 'business_admin:access';
const BUSINESS_ADMIN_COST_PERMISSION = 'business_admin:costs:view';
const POS_VIEW_PERMISSION = 'pos:view';
const REPORTS_VIEW_PERMISSION = 'reports:view';
const REPORTS_EXPORT_PERMISSION = 'reports:export';

const BUSINESS_ADMIN_FILTERS = ['date_from', 'date_to', 'branch_id'];
const BUSINESS_ADMIN_FORMATTING = {
    timezone: 'Asia/Manila',
    numeric: 'decimal',
    export_headers: 'title_case'
};
const BUSINESS_ADMIN_AGGREGATION = {
    type: 'grouped_read_model',
    money_source: 'finalized_transaction_snapshot'
};
const BUSINESS_ADMIN_COMPATIBILITY = {
    read_endpoints: ['/api/v1/business-admin/reports/datasets/:reportKey'],
    export_endpoints: ['/api/v1/business-admin/reports/datasets/:reportKey/export']
};

const BUSINESS_ADMIN_SORT_FIELDS = Object.freeze({
    sales_trend: ['period', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    sales_by_terminal: ['terminal_id', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    sales_by_branch: ['branch_id', 'branch', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    sales_by_source: ['source', 'label', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    sales_by_employee: ['cashier_id', 'employee', 'shift_count', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    sales_by_item: ['item_id', 'item_name', 'sku_code', 'category', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    sales_and_stock_by_item: ['item_id', 'item_name', 'sku_code', 'category', 'branch_id', 'branch', 'units_sold', 'quantity_on_hand', 'min_threshold', 'stock_status'],
    sales_by_category: ['category', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    sales_by_payment: ['payment_method', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    discounts: ['discount_label', 'discount_type', 'promo_code', 'transaction_count', 'discount_amount', 'vat_removed'],
    fulfillment: ['order_method', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    shifts: ['shift_id', 'terminal_id', 'business_date', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    tax_and_fees: ['label', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    refunds_and_voids: ['label', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss'],
    customer_activity: ['customer', 'gross_sales', 'net_sales', 'transaction_count', 'quantity', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss']
});

const businessAdminReport = ({
    label,
    default_sort,
    sort_fields,
    source = 'pos',
    formula = 'Persisted finalized POS transaction snapshots, grouped without recalculating money values.',
    filters = BUSINESS_ADMIN_FILTERS,
    aggregation = BUSINESS_ADMIN_AGGREGATION,
    sort_column_map = null
}) => createDefinition({
    label,
    default_sort,
    source,
    surface: 'business_admin',
    audience: 'back_office',
    report_family: source === 'inventory_valuation' || source === 'inventory_ledger' ? 'inventory' : 'sales_financial',
    owner: source === 'inventory_valuation' || source === 'inventory_ledger' ? 'inventory' : 'pos',
    migration_status: 'canonical_registry',
    filters,
    formula,
    sort_fields,
    sort_column_map,
    permissions: {
        view: BUSINESS_ADMIN_PERMISSION,
        cost_visibility: BUSINESS_ADMIN_COST_PERMISSION
    },
    permission: BUSINESS_ADMIN_PERMISSION,
    pagination: { max_limit: 5000 },
    export_formats: ['csv', 'xls'],
    aggregation,
    formatting: BUSINESS_ADMIN_FORMATTING,
    compatibility: BUSINESS_ADMIN_COMPATIBILITY
});

const inventoryMovementSortFields = ['timestamp', 'item', 'movement_type', 'quantity', 'reference'];
const lowStockSortFields = ['item', 'quantity_on_hand', 'min_threshold'];
const inventoryValuationSortFields = ['branch_id', 'branch', 'available_quantity', 'inventory_value', 'fifo_drift_items', 'stock_bearing_item_count'];

export const BUSINESS_ADMIN_REPORT_DEFINITIONS = freeze({
    sales_trend: businessAdminReport({ label: 'Sales trend', default_sort: 'period', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.sales_trend }),
    sales_by_terminal: businessAdminReport({ label: 'Sales by terminal', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.sales_by_terminal }),
    sales_by_branch: businessAdminReport({ label: 'Sales by branch', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.sales_by_branch }),
    sales_by_source: businessAdminReport({ label: 'POS versus Storefront', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.sales_by_source }),
    sales_by_employee: businessAdminReport({ label: 'Sales by employee', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.sales_by_employee }),
    sales_by_item: businessAdminReport({ label: 'Sales by item', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.sales_by_item }),
    sales_and_stock_by_item: businessAdminReport({
        label: 'Sales & stock by item',
        default_sort: 'units_sold',
        sort_fields: BUSINESS_ADMIN_SORT_FIELDS.sales_and_stock_by_item,
        formula: 'Finalized stock-bearing item sales joined to the current authoritative branch stock balance.'
    }),
    sales_by_category: businessAdminReport({ label: 'Sales by category', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.sales_by_category }),
    sales_by_payment: businessAdminReport({ label: 'Sales by payment method', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.sales_by_payment }),
    discounts: businessAdminReport({ label: 'Discounts', default_sort: 'discount_amount', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.discounts }),
    fulfillment: businessAdminReport({ label: 'Sales by fulfillment method', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.fulfillment }),
    shifts: businessAdminReport({ label: 'Shift sales', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.shifts }),
    tax_and_fees: businessAdminReport({ label: 'Taxes and fees', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.tax_and_fees }),
    refunds_and_voids: businessAdminReport({ label: 'Refunds and voids', default_sort: 'refunds_voids', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.refunds_and_voids }),
    customer_activity: businessAdminReport({ label: 'Customer activity', default_sort: 'net_sales', sort_fields: BUSINESS_ADMIN_SORT_FIELDS.customer_activity }),
    inventory_valuation: businessAdminReport({
        label: 'FIFO inventory valuation',
        default_sort: 'inventory_value',
        source: 'inventory_valuation',
        sort_fields: inventoryValuationSortFields,
        filters: ['branch_id'],
        formula: 'FIFO batch value reconciled against the authoritative branch stock ledger.',
        aggregation: { type: 'location_valuation', money_source: 'weighted_average_cost_read_model' }
    }),
    inventory_movements: businessAdminReport({
        label: 'Inventory movements',
        default_sort: 'timestamp',
        source: 'inventory_ledger',
        sort_fields: inventoryMovementSortFields,
        sort_column_map: {
            timestamp: 'timestamp',
            item: 'item_id',
            movement_type: 'movement_type',
            quantity: 'quantity',
            reference: 'reference_id'
        },
        formula: 'Immutable inventory movements recorded by the inventory command owner.',
        aggregation: { type: 'inventory_ledger', money_source: 'not_applicable' }
    }),
    low_stock: businessAdminReport({
        label: 'Low-stock items',
        default_sort: 'quantity_on_hand',
        source: 'inventory_ledger',
        sort_fields: lowStockSortFields,
        sort_column_map: {
            item: 'item_id',
            quantity_on_hand: 'quantity_on_hand',
            min_threshold: 'item.min_threshold'
        },
        filters: ['branch_id'],
        formula: 'Current branch stock at or below the item low-stock threshold.',
        aggregation: { type: 'threshold_projection', money_source: 'not_applicable' }
    })
});

const legacyBackOfficeReport = ({
    label,
    report_family,
    read_endpoint,
    export_endpoint = '/api/v1/reports/export',
    filters = ['startDate', 'endDate', 'location_id'],
    export_formats = ['csv'],
    default_sort = null
}) => createDefinition({
    label,
    default_sort,
    source: 'legacy_report_service',
    surface: 'legacy_reports',
    audience: 'back_office',
    report_family,
    owner: 'reports_legacy_service',
    migration_status: 'compatibility_only',
    filters,
    filter_aliases: { startDate: 'date_from', endDate: 'date_to', location_id: 'branch_id' },
    sort_fields: [],
    permission: REPORTS_VIEW_PERMISSION,
    permissions: { view: REPORTS_VIEW_PERMISSION, export: REPORTS_EXPORT_PERMISSION },
    export_formats,
    aggregation: { type: 'legacy_service_result', money_source: 'owner_defined' },
    formatting: { timezone: 'Asia/Manila', export_headers: 'owner_defined' },
    compatibility: {
        read_endpoints: [read_endpoint],
        ...(export_endpoint ? { export_endpoints: [export_endpoint] } : {})
    }
});

export const LEGACY_BACK_OFFICE_REPORT_DEFINITIONS = freeze({
    stock_aging: legacyBackOfficeReport({ label: 'Stock aging', report_family: 'inventory', read_endpoint: '/api/v1/reports/stock-aging' }),
    surplus_shortage: legacyBackOfficeReport({ label: 'Surplus and shortage', report_family: 'inventory', read_endpoint: '/api/v1/reports/surplus-shortage' }),
    financial_summary: legacyBackOfficeReport({ label: 'Financial summary', report_family: 'financial', read_endpoint: '/api/v1/reports/financial-summary' }),
    supplier_performance: legacyBackOfficeReport({ label: 'Supplier performance', report_family: 'operations', read_endpoint: '/api/v1/reports/supplier-performance' }),
    expiry: legacyBackOfficeReport({ label: 'Expiry risk', report_family: 'inventory', read_endpoint: '/api/v1/reports/expiry' }),
    stock_aging_enhanced: legacyBackOfficeReport({ label: 'Enhanced stock aging', report_family: 'inventory', read_endpoint: '/api/v1/reports/stock-aging-enhanced', export_endpoint: '/api/v1/reports/export?type=stock_aging' }),
    production: legacyBackOfficeReport({ label: 'Production', report_family: 'operations', read_endpoint: '/api/v1/reports/production', export_endpoint: '/api/v1/reports/export?type=production' }),
    po_analysis: legacyBackOfficeReport({ label: 'Purchase order analysis', report_family: 'operations', read_endpoint: '/api/v1/reports/po-analysis', export_endpoint: '/api/v1/reports/export?type=po_analysis' }),
    executive_summary: legacyBackOfficeReport({ label: 'Executive summary', report_family: 'historical', read_endpoint: '/api/v1/reports/executive-summary', export_endpoint: '/api/v1/reports/export?type=executive_summary' }),
    compliance_package: legacyBackOfficeReport({ label: 'Compliance books package', report_family: 'financial', read_endpoint: '/api/v1/reports/compliance-package', export_endpoint: '/api/v1/reports/compliance-package/export' }),
    saved_report_snapshots: legacyBackOfficeReport({
        label: 'Saved report snapshots',
        report_family: 'historical',
        read_endpoint: '/api/v1/reports/snapshots',
        export_endpoint: null,
        filters: ['type', 'limit'],
        export_formats: []
    })
});

const TERMINAL_REPORT_FILTERS = [
    'date_from',
    'date_to',
    'granularity',
    'cashier_id',
    'location_id',
    'terminal_id',
    'payment_type',
    'source',
    'category_id',
    'category'
];
const TERMINAL_REPORT_FORMATTING = {
    timezone: 'Asia/Manila',
    numeric: 'decimal',
    export_headers: 'terminal_owner'
};
const TERMINAL_REPORT_COMPATIBILITY = {
    read_endpoints: ['/api/v1/pos/reports/overview'],
    export_endpoints: ['/api/v1/pos/reports/export']
};

const terminalReport = ({ key, label, section, report_family = 'terminal_operations', offline_supported = true }) => ({
    [key]: createDefinition({
        label,
        default_sort: null,
        source: 'pos_terminal_report_read_model',
        surface: 'terminal',
        audience: 'terminal',
        report_family,
        owner: 'pos_terminal',
        migration_status: 'canonical_registry',
        section,
        offline_supported,
        filters: TERMINAL_REPORT_FILTERS,
        sort_fields: [],
        permissions: { view: POS_VIEW_PERMISSION, export: POS_VIEW_PERMISSION },
        permission: POS_VIEW_PERMISSION,
        export_formats: ['csv'],
        pagination: { max_limit: 200 },
        aggregation: { type: 'terminal_operational_read_model', money_source: 'finalized_pos_transaction_snapshot' },
        formatting: TERMINAL_REPORT_FORMATTING,
        compatibility: TERMINAL_REPORT_COMPATIBILITY
    })
});

export const TERMINAL_REPORT_DEFINITIONS = freeze({
    ...terminalReport({ key: 'terminal_daily', label: 'Active shift daily report', section: 'daily' }),
    ...terminalReport({ key: 'terminal_monthly', label: 'Terminal monthly report', section: 'monthly' }),
    ...terminalReport({ key: 'terminal_yearly', label: 'Terminal yearly report', section: 'yearly' }),
    ...terminalReport({ key: 'terminal_comparison', label: 'Terminal comparison report', section: 'comparison' }),
    ...terminalReport({ key: 'terminal_profit_loss', label: 'Terminal profit and loss report', section: 'profit_loss' }),
    ...terminalReport({ key: 'terminal_attendance', label: 'Terminal attendance report', section: 'attendance' }),
    ...terminalReport({ key: 'terminal_cashiers', label: 'Terminal cashier report', section: 'cashiers' }),
    ...terminalReport({ key: 'terminal_registers', label: 'Register reconciliation report', section: 'registers' }),
    ...terminalReport({ key: 'terminal_handoffs', label: 'Register handoff report', section: 'handoffs' })
});

export const REPORT_REGISTRY = freeze({
    ...BUSINESS_ADMIN_REPORT_DEFINITIONS,
    ...LEGACY_BACK_OFFICE_REPORT_DEFINITIONS,
    ...TERMINAL_REPORT_DEFINITIONS
});

export const getReportDefinition = (reportKey) => REPORT_REGISTRY[String(reportKey || '').trim().toLowerCase()] || null;

const toPublicDefinition = (key, definition) => {
    const publicDefinition = { ...definition };
    delete publicDefinition.sort_column_map;
    return { key, ...publicDefinition };
};

export const listReportDefinitions = ({ surface = null, audience = null } = {}) => Object.entries(REPORT_REGISTRY)
    .filter(([, definition]) => (!surface || definition.surface === surface) && (!audience || definition.audience === audience))
    .map(([key, definition]) => toPublicDefinition(key, definition));

export const listBusinessAdminReportDefinitions = () => Object.entries(BUSINESS_ADMIN_REPORT_DEFINITIONS)
    .map(([key, definition]) => toPublicDefinition(key, definition));

export const listTerminalReportDefinitions = () => Object.entries(TERMINAL_REPORT_DEFINITIONS)
    .map(([key, definition]) => toPublicDefinition(key, definition));

export const getReportSortFields = (reportKey) => getReportDefinition(reportKey)?.sort_fields || [];

export const getReportSortColumnMap = (reportKey) => {
    const definition = getReportDefinition(reportKey);
    if (!definition?.sort_column_map) return {};
    return definition.sort_column_map;
};
