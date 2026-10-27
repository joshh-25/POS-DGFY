import { describe, expect, it } from 'vitest';
import { ADMIN_ROUTE_POLICIES, canAccessAdminRoute, resolveAdminRoute } from './adminRoutePolicy.js';

describe('Admin route policy', () => {
    it('resolves every existing destination and its slash-delimited descendants', () => {
        for (const route of ADMIN_ROUTE_POLICIES) {
            expect(resolveAdminRoute(route.path)).toEqual(route);
            expect(resolveAdminRoute(`${route.path}/nested`)).toEqual(route);
        }
    });

    it('requires exact grant ownership and master status for master-only destinations', () => {
        for (const route of ADMIN_ROUTE_POLICIES) {
            expect(canAccessAdminRoute(route, { is_master: true })).toBe(true);
            if (route.masterOnly) {
                expect(canAccessAdminRoute(route, { permissions: [] })).toBe(false);
            } else {
                expect(canAccessAdminRoute(route, { permissions: [route.permission] })).toBe(true);
                expect(canAccessAdminRoute(route, { permissions: [] })).toBe(false);
            }
        }
    });

    it('keeps the global Billing path distinct from tenant ids and requires Platform Master access', () => {
        const globalBilling = resolveAdminRoute('/admin/tenants/billing');
        const tenantBilling = resolveAdminRoute('/admin/tenants/tenant-42/billing');
        expect(globalBilling).toMatchObject({ path: '/admin/tenants/billing', masterOnly: true });
        expect(tenantBilling).toMatchObject({ path: '/admin/tenants/:id/billing', masterOnly: true });
        expect(canAccessAdminRoute(globalBilling, { permissions: ['admin.tenants'] })).toBe(false);
        expect(canAccessAdminRoute(tenantBilling, { permissions: ['admin.tenants'] })).toBe(false);
        expect(canAccessAdminRoute(globalBilling, { is_master: true })).toBe(true);
        expect(canAccessAdminRoute(tenantBilling, { is_master: true })).toBe(true);
    });

    it('does not match prefix lookalikes or unknown routes', () => {
        expect(resolveAdminRoute('/admin/tenants-lookalike')).toBeNull();
        expect(resolveAdminRoute('/admin/tenants-new')).toBeNull();
        expect(resolveAdminRoute('/admin/tenant/123')).toBeNull();
        expect(resolveAdminRoute('/admin/not-a-page')).toBeNull();
    });
});
