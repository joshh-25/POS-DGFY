import { resolveEffectivePermissions } from '../src/utils/userPermissions.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/config/permissions.js';
import { classifyCashierItemGrants } from '../scripts/audit-cashier-item-grants.js';

describe('Phase 355 cashier catalog authority', () => {
    test('saved edit grants are explicitly ambiguous, never automatically removed', () => {
        expect(classifyCashierItemGrants([{ user_id: 7, permissions: '["items:view","items:edit"]' }]))
            .toEqual([expect.objectContaining({ user_id: 7, status: 'review_required_ambiguous_edit', action: 'administrator_review_keep_or_revoke', item_permissions: ['items:view', 'items:edit'] })]);
    });
    test('defaults to view-only catalog maintenance', () => {
        const permissions = resolveEffectivePermissions({ role: 'cashier' });
        expect(permissions).toContain('items:view');
        for (const permission of ['items:edit', 'items:create', 'items:delete', 'items:import']) {
            expect(permissions).not.toContain(permission);
            expect(DEFAULT_ROLE_PERMISSIONS.cashier).not.toContain(permission);
        }
    });
    test('does not invent edit permission for an explicit restricted cashier', () => {
        expect(resolveEffectivePermissions({ role: 'cashier', permissions: ['items:view'] }))
            .toEqual(['items:view']);
    });
    test('preserves delegated editing and the existing deletion ceiling', () => {
        expect(resolveEffectivePermissions({ role: 'cashier', permissions: '["items:view","items:edit","items:delete"]' }))
            .toEqual(['items:view', 'items:edit']);
    });
});
