import { describe, expect, it } from 'vitest';
import {
    BACKOFFICE_MANIFEST,
    BACKOFFICE_NAV_GROUPS,
    BACKOFFICE_SETTINGS_SECTION_MANIFEST,
    buildBackOfficeLocationsPath,
    buildBackOfficeModulePath,
    getBackOfficeModuleDefinition,
    MERCHANT_BACKOFFICE_MODULE_META
} from '../../src/features/businessAdmin/businessAdminManifest.js';
import { BUSINESS_ADMIN_WORKFLOW_PAGE_BY_SECTION } from '../../src/features/businessAdmin/businessAdminWorkflowVisibility.js';

describe('Back Office canonical manifest contract', () => {
    it('derives the existing navigation order and membership from module metadata', () => {
        expect(BACKOFFICE_NAV_GROUPS.map((group) => group.label)).toEqual([
            'Overview',
            'Sales',
            'Customers',
            'Inventory',
            'Operations',
            'Team & Access',
            'Reports',
            'Settings'
        ]);

        const navKeys = BACKOFFICE_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));
        expect(navKeys).toEqual(Object.keys(BACKOFFICE_MANIFEST));
        for (const item of BACKOFFICE_NAV_GROUPS.flatMap((group) => group.items)) {
            expect(item.group).toBe(BACKOFFICE_NAV_GROUPS.find((group) => group.items.includes(item))?.label);
            expect(item.route).toBe(item.id === 'overview' ? '/' : `/${item.id}`);
            expect(item.permission).toBe('business_admin:access');
            expect(item.visibility).toBeTruthy();
            expect(item.metadata.owner).toBe('pos-backoffice');
        }
    });

    it('keeps the Overview header free of a descriptive subtitle', () => {
        expect(BACKOFFICE_MANIFEST.overview).toMatchObject({
            label: 'Overview',
            title: 'Overview',
            description: ''
        });
    });

    it('groups every existing destination under a business domain without hiding any route', () => {
        const itemsByGroup = Object.fromEntries(BACKOFFICE_NAV_GROUPS.map((group) => [
            group.label,
            group.items.map((item) => item.id)
        ]));

        expect(itemsByGroup.Overview).toEqual(['overview']);
        expect(itemsByGroup.Sales).toEqual(['sales', 'orders', 'payments', 'vouchers']);
        expect(itemsByGroup.Customers).toEqual(['customers']);
        expect(itemsByGroup.Inventory).toEqual(['catalog', 'inventory', 'suppliers', 'purchase-orders', 'stock-movements', 'recipes']);
        expect(itemsByGroup.Operations).toEqual(['locations', 'shifts', 'attendance', 'expenses', 'fnb', 'services', 'hospitality', 'job-orders', 'dispatch-orders']);
        expect(itemsByGroup['Team & Access']).toEqual(['team']);
        expect(itemsByGroup.Reports).toEqual(['reports']);
        expect(itemsByGroup.Settings).toEqual(['notifications', 'fiscal', 'audit', 'approvals', 'onboarding', 'storefront', 'company', 'settings', 'ai-chat']);
        expect(BACKOFFICE_NAV_GROUPS.find((group) => group.label === 'Overview')?.standalone).toBe(true);
        expect(BACKOFFICE_NAV_GROUPS.filter((group) => group.items.length > 0)).toHaveLength(8);
    });

    it('uses distinct navigation labels for the Sales timeline and Order center', () => {
        expect(BACKOFFICE_MANIFEST.sales).toMatchObject({
            group: 'Sales',
            label: 'Sales timeline',
            title: 'Sales timeline'
        });
        expect(BACKOFFICE_MANIFEST.orders).toMatchObject({
            group: 'Sales',
            label: 'Order center',
            title: 'Order center'
        });
    });

    it('derives migrated component ownership without a second component registry', () => {
        const migratedKeys = Object.keys(MERCHANT_BACKOFFICE_MODULE_META);
        expect(migratedKeys.sort()).toEqual([
            'catalog',
            'suppliers',
            'purchase-orders',
            'job-orders',
            'stock-movements',
            'dispatch-orders',
            'fnb',
            'services',
            'hospitality',
            'sales',
            'reports',
            'ai-chat',
            'vouchers'
        ].sort());
        for (const key of migratedKeys) {
            expect(getBackOfficeModuleDefinition(key)?.component).toBeTruthy();
        }
    });

    it('preserves both Back Office route aliases from one route definition', () => {
        expect(buildBackOfficeModulePath('/business-admin', 'reports')).toBe('/business-admin/reports');
        expect(buildBackOfficeModulePath('/backoffice', 'reports')).toBe('/backoffice/reports');
        expect(buildBackOfficeModulePath('/backoffice', 'settings')).toBe('/backoffice/settings');
        expect(buildBackOfficeLocationsPath('/business-admin', 'branches')).toBe('/business-admin/locations/branches');
        expect(buildBackOfficeLocationsPath('/backoffice', 'registers')).toBe('/backoffice/locations/registers');
    });

    it('uses one Locations module for branch and register monitoring', () => {
        expect(getBackOfficeModuleDefinition('locations')).toMatchObject({
            id: 'locations',
            label: 'Locations',
            route: '/locations'
        });
        expect(BACKOFFICE_MANIFEST.branches).toBeUndefined();
        expect(BACKOFFICE_MANIFEST.registers).toBeUndefined();
    });

    it('derives workflow visibility and settings metadata from the manifest', () => {
        expect(BUSINESS_ADMIN_WORKFLOW_PAGE_BY_SECTION).toEqual({
            'job-orders': 'JobOrders',
            'dispatch-orders': 'DispatchOrders',
            'stock-movements': 'StockMovements',
            fnb: 'Fnb',
            services: 'Services',
            hospitality: 'Hospitality'
        });
        expect(BACKOFFICE_SETTINGS_SECTION_MANIFEST.map((section) => section.key)).toEqual([
            'profile',
            'pos',
            'taxes',
            'discounts',
            'storefront',
            'delivery',
            'branches',
            'team',
            'attendance',
            'payments',
            'registers'
        ]);
    });
});
