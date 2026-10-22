import { describe, expect, it } from 'vitest';
import { PERMISSION_GROUPS } from '../../../../packages/web-core/src/config/permissions_frontend.js';
import {
    POS_NAVIGATION_DEFINITIONS,
    POS_PERMISSION_EDITOR_DEFINITIONS,
    getPosNavigationDefinition
} from '../../../../packages/web-core/src/features/pos/config/posNavigationDefinitions.js';

const configuredPermissions = new Set(
    Object.values(PERMISSION_GROUPS).flatMap((group) => (
        Array.isArray(group.permissions) ? group.permissions : Object.values(group.permissions || {})
    ))
);

describe('POS navigation and permission registry contract', () => {
    it('maps every active POS destination to a unique canonical navigation id', () => {
        const navigationIds = POS_PERMISSION_EDITOR_DEFINITIONS.flatMap((definition) => definition.navIds);

        expect(new Set(navigationIds).size).toBe(navigationIds.length);
        expect(navigationIds).toEqual(expect.arrayContaining([
            'sell', 'history', 'orders', 'shift', 'items', 'reports', 'services',
            'vouchers', 'pricelists', 'affiliates', 'settings', 'terminal-setup',
            'audit', 'approvals'
        ]));
        expect(getPosNavigationDefinition('fnb-service')?.active).toBe(false);
    });

    it('keeps mapped permission keys inside the shared permission catalog', () => {
        const mappedPermissions = POS_PERMISSION_EDITOR_DEFINITIONS.flatMap((definition) => [
            definition.accessPermission,
            ...definition.permissionGroups.flatMap((group) => group.permissions)
        ]).filter(Boolean);

        expect(mappedPermissions.filter((permission) => !configuredPermissions.has(permission))).toEqual([]);
    });

    it('makes composite and shared destinations explicit instead of inventing parent grants', () => {
        const shift = getPosNavigationDefinition('shift');
        const vouchers = getPosNavigationDefinition('vouchers');
        const pricelists = getPosNavigationDefinition('pricelists');

        expect(shift).toMatchObject({ accessModel: 'composite' });
        expect(shift).not.toHaveProperty('accessPermission');
        expect(shift.permissionGroups.flatMap((group) => group.permissions)).toContain('pos:shift_access');
        expect(vouchers).toBe(pricelists);
        expect(vouchers.navLabels).toEqual({ vouchers: 'Vouchers', pricelists: 'Pricelists' });
        expect(vouchers.sharedPermissionLabel).toContain('share vouchers:view');
    });

    it('keeps all registry definitions available for parity checks, including intentionally hidden F&B', () => {
        expect(POS_NAVIGATION_DEFINITIONS.map((definition) => definition.id)).toEqual(expect.arrayContaining([
            'fnb-service', 'onboarding'
        ]));
        expect(POS_NAVIGATION_DEFINITIONS.find((definition) => definition.id === 'fnb-service')).toMatchObject({
            active: false,
            accessModel: 'feature_flag'
        });
    });
});
