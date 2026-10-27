import { describe, expect, it } from 'vitest';
import {
    buildBusinessAdminDetailScopeKey,
    buildBusinessAdminSectionScopeKey,
    isBusinessAdminSectionResultCurrent
} from '../../src/features/businessAdmin/businessAdminSectionScope.js';

const bootstrap = (overrides = {}) => ({
    user: { user_id: 7, role: 'manager', role_preset_key: 'msme_manager', is_master_admin: false },
    business: { tenant_id: 12 },
    access: {
        scope: 'assigned',
        location_ids: [101],
        capabilities: { view_audit: true },
        settings_sections: { team: { user_view: true } },
        tenant_capabilities: { pos_enabled: true }
    },
    workflow: { mode: 'retail', capabilities: { catalog: true } },
    ...overrides
});
describe('OPIS Business Admin request scope', () => {
    it('changes when the tenant, authorization projection, or request inputs change', () => {
        const base = buildBusinessAdminSectionScopeKey({
            bootstrap: bootstrap(),
            activeSection: 'orders',
            requestInputs: { query: { branch_id: '101' }, page: 1 }
        });

        expect(buildBusinessAdminSectionScopeKey({
            bootstrap: bootstrap(),
            activeSection: 'orders',
            requestInputs: { query: { branch_id: '101' }, page: 1 }
        })).toBe(base);
        expect(buildBusinessAdminSectionScopeKey({
            bootstrap: bootstrap(),
            activeSection: 'orders',
            requestInputs: { query: { branch_id: '202' }, page: 1 }
        })).not.toBe(base);
        expect(buildBusinessAdminSectionScopeKey({
            bootstrap: bootstrap({ business: { tenant_id: 99 } }),
            activeSection: 'orders',
            requestInputs: { query: { branch_id: '101' }, page: 1 }
        })).not.toBe(base);
        expect(buildBusinessAdminSectionScopeKey({
            bootstrap: bootstrap({ access: { ...bootstrap().access, capabilities: { view_audit: false } } }),
            activeSection: 'orders',
            requestInputs: { query: { branch_id: '101' }, page: 1 }
        })).not.toBe(base);
    });

    it('does not allow a result from another branch or authorization scope to render', () => {
        const currentScopeKey = buildBusinessAdminSectionScopeKey({
            bootstrap: bootstrap(),
            activeSection: 'orders',
            requestInputs: { query: { branch_id: '202' }, page: 1 }
        });
        const oldScopeKey = buildBusinessAdminSectionScopeKey({
            bootstrap: bootstrap(),
            activeSection: 'orders',
            requestInputs: { query: { branch_id: '101' }, page: 1 }
        });

        expect(isBusinessAdminSectionResultCurrent({
            result: { section: 'orders', scopeKey: oldScopeKey, data: { orders: [{ id: 1 }] } },
            activeSection: 'orders',
            currentScopeKey
        })).toBe(false);
        expect(isBusinessAdminSectionResultCurrent({
            result: { section: 'orders', scopeKey: currentScopeKey, data: { orders: [] } },
            activeSection: 'orders',
            currentScopeKey,
            authorized: false
        })).toBe(false);
    });

    it('keys selected details to the list request scope and record identity', () => {
        const sectionScopeKey = buildBusinessAdminSectionScopeKey({
            bootstrap: bootstrap(),
            activeSection: 'orders',
            requestInputs: { query: { branch_id: '101' }, page: 1 }
        });
        expect(buildBusinessAdminDetailScopeKey({ sectionScopeKey, recordType: 'order', recordId: 44 }))
            .not.toBe(buildBusinessAdminDetailScopeKey({ sectionScopeKey, recordType: 'order', recordId: 45 }));
    });
});
