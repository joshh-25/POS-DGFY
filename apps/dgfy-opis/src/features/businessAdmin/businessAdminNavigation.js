import {
    BACKOFFICE_MANIFEST,
    buildBackOfficeModulePath,
    buildBackOfficeOverviewPath
} from './businessAdminManifest.js';

const sidebarItem = (key, {
    routeKey = key,
    accessKey = routeKey,
    label = BACKOFFICE_MANIFEST[accessKey]?.label,
    description = BACKOFFICE_MANIFEST[accessKey]?.description,
    icon = BACKOFFICE_MANIFEST[accessKey]?.icon
} = {}) => Object.freeze({
    key,
    routeKey,
    accessKey,
    label,
    description,
    icon
});

// Presentation-only navigation. The manifest remains the source of truth for
// canonical route IDs, icons, metadata, and server-projected access selectors.
// These groups intentionally do not create new destinations or permissions.
export const BUSINESS_ADMIN_CLEAN_SIDEBAR_GROUPS = Object.freeze([
    Object.freeze({
        key: 'general',
        label: 'General',
        items: Object.freeze([
            sidebarItem('overview')
        ])
    }),
    Object.freeze({
        key: 'sales',
        label: 'Sales',
        items: Object.freeze([
            sidebarItem('orders'),
            sidebarItem('payments'),
            sidebarItem('customers')
        ])
    }),
    Object.freeze({
        key: 'inventory',
        label: 'Inventory',
        items: Object.freeze([
            sidebarItem('catalog'),
            sidebarItem('inventory'),
            sidebarItem('purchasing', {
                routeKey: 'purchase-orders',
                accessKey: 'purchase-orders',
                label: 'Purchasing'
            }),
            sidebarItem('recipes')
        ])
    }),
    Object.freeze({
        key: 'operations',
        label: 'Operations',
        items: Object.freeze([
            sidebarItem('locations'),
            sidebarItem('shifts'),
            sidebarItem('expenses'),
            sidebarItem('fnb')
        ])
    }),
    Object.freeze({
        key: 'management',
        label: 'Management',
        items: Object.freeze([
            sidebarItem('users-roles'),
            sidebarItem('reports'),
            sidebarItem('qr-codes'),
            sidebarItem('settings')
        ])
    })
]);

// Workflow-specific tools stay discoverable when the server-projected
// workflow capability makes them relevant, without expanding the default
// sidebar for every business.
export const BUSINESS_ADMIN_OPTIONAL_SIDEBAR_GROUP = Object.freeze({
    key: 'additional-tools',
    label: 'Additional tools',
    items: Object.freeze([
        sidebarItem('services'),
        sidebarItem('hospitality'),
        sidebarItem('job-orders'),
        sidebarItem('dispatch-orders'),
        sidebarItem('vouchers'),
        sidebarItem('attendance')
    ])
});

export const BUSINESS_ADMIN_SIDEBAR_GROUPS = Object.freeze([
    ...BUSINESS_ADMIN_CLEAN_SIDEBAR_GROUPS,
    BUSINESS_ADMIN_OPTIONAL_SIDEBAR_GROUP
]);

export const BUSINESS_ADMIN_WORKSPACE_TABS = Object.freeze({
    orders: Object.freeze([
        sidebarItem('orders', { label: 'Orders' }),
        sidebarItem('sales', { label: 'Sales timeline' })
    ]),
    inventory: Object.freeze([
        sidebarItem('inventory', { label: 'Inventory overview' }),
        sidebarItem('stock-movements', { label: 'Stock movements' })
    ]),
    purchasing: Object.freeze([
        sidebarItem('purchase-orders', { label: 'Purchase orders' }),
        sidebarItem('suppliers', { label: 'Suppliers' })
    ]),
    'users-roles': Object.freeze([
        sidebarItem('users-roles', { label: 'Accounts & roles' }),
        sidebarItem('team', { label: 'Workforce' })
    ]),
    reports: Object.freeze([
        sidebarItem('reports', { label: 'Business reports' }),
        sidebarItem('pos-activity', { label: 'POS activity' })
    ])
});

const SIDEBAR_PARENT_BY_SECTION = Object.freeze({
    overview: 'overview',
    sales: 'orders',
    orders: 'orders',
    payments: 'payments',
    customers: 'customers',
    catalog: 'catalog',
    inventory: 'inventory',
    'stock-movements': 'inventory',
    suppliers: 'purchasing',
    'purchase-orders': 'purchasing',
    recipes: 'recipes',
    locations: 'locations',
    shifts: 'shifts',
    expenses: 'expenses',
    fnb: 'fnb',
    services: 'services',
    hospitality: 'hospitality',
    'job-orders': 'job-orders',
    'dispatch-orders': 'dispatch-orders',
    team: 'users-roles',
    'users-roles': 'users-roles',
    reports: 'reports',
    'pos-activity': 'reports',
    attendance: 'attendance',
    vouchers: 'vouchers',
    'qr-codes': 'qr-codes',
    settings: 'settings',
    notifications: 'settings',
    fiscal: 'settings',
    audit: 'settings',
    approvals: 'settings',
    company: 'settings',
    storefront: 'settings',
    onboarding: 'settings',
    'ai-chat': 'settings'
});

export const getBusinessAdminSidebarActiveKey = ({
    activeSection = 'overview',
    settingsSection = '',
    usersRolesShortcut = false
} = {}) => {
    if (usersRolesShortcut || (activeSection === 'settings' && settingsSection === 'team')) {
        return 'users-roles';
    }
    return SIDEBAR_PARENT_BY_SECTION[String(activeSection || '').trim()] || 'overview';
};

export const getBusinessAdminWorkspaceTabs = ({
    activeSection = 'overview',
    settingsSection = '',
    usersRolesShortcut = false
} = {}) => {
    const parentKey = getBusinessAdminSidebarActiveKey({ activeSection, settingsSection, usersRolesShortcut });
    return BUSINESS_ADMIN_WORKSPACE_TABS[parentKey] || [];
};

export const buildBusinessAdminSidebarItemPath = (rootPath, item) => {
    if (item?.routeKey === 'overview') return buildBackOfficeOverviewPath(rootPath);
    return buildBackOfficeModulePath(rootPath, item?.routeKey || item?.key);
};
