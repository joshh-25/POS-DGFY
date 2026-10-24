import { describe, expect, it } from 'vitest';
import { normalizeAdminRouteLabel } from './adminRouteLabel.js';

describe('normalizeAdminRouteLabel', () => {
    it('removes tenant identifiers while preserving the detail route and descendants', () => {
        expect(normalizeAdminRouteLabel('/admin/tenants/tenant-secret-id'))
            .toBe('/admin/tenants/:id');
        expect(normalizeAdminRouteLabel('/admin/tenants/tenant-secret-id/compliance'))
            .toBe('/admin/tenants/:id/compliance');
    });

    it('keeps static and unrelated routes distinct', () => {
        expect(normalizeAdminRouteLabel('/admin/tenants/new')).toBe('/admin/tenants/new');
        expect(normalizeAdminRouteLabel('/admin/tenants')).toBe('/admin/tenants');
        expect(normalizeAdminRouteLabel('/admin/tenants-archive')).toBe('/admin/tenants-archive');
    });
});
