import { describe, expect, it } from 'vitest';
import {
    buildBusinessAdminSettingsPath,
    buildPosSettingsOwnerPath,
    buildBusinessAdminSettingsEditorUser,
    canAccessBusinessAdminSettingsSection,
    getVisibleBusinessAdminSettingsSections,
    parseBusinessAdminPath,
    resolveSettingsBranchId,
    settingsScopeLabel,
    shouldBlockSettingsNavigation
} from '../../src/features/businessAdmin/businessAdminSettingsModel.js';

describe('Business Admin settings navigation model', () => {
    const capabilities = {
        profile: { view: true, edit: true, scope: 'tenant' },
        pos: { view: true, edit: false, scope: 'tenant' },
        storefront: { view: false, edit: false, scope: 'tenant' },
        delivery: { view: true, edit: false, scope: 'tenant' },
        branches: { view: true, edit: false, scope: 'branch' },
        team: { view: true, edit: true, scope: 'branch' },
        attendance: { view: false, edit: false, scope: 'branch' },
        payments: { view: true, edit: false, scope: 'tenant' },
        registers: { view: false, edit: false, scope: 'branch' }
    };

    it('parses both Business Admin route aliases and builds canonical nested settings paths', () => {
        expect(parseBusinessAdminPath('/backoffice/settings/team', '/backoffice')).toMatchObject({
            activeSection: 'settings',
            settingsSection: 'team'
        });
        expect(buildBusinessAdminSettingsPath('/business-admin', 'payments')).toBe('/business-admin/settings/payments');
        expect(buildPosSettingsOwnerPath('settings_pos')).toBe('/terminal?view=settings_pos');
        expect(buildPosSettingsOwnerPath('terminal_setup')).toBe('/terminal?view=terminal_setup');
    });

    it('keeps server-projected view/edit capabilities separate', () => {
        expect(getVisibleBusinessAdminSettingsSections(capabilities).map((section) => section.key)).toEqual([
            'profile', 'pos', 'delivery', 'branches', 'team', 'payments'
        ]);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'pos', 'view')).toBe(true);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'pos', 'edit')).toBe(false);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'storefront', 'view')).toBe(false);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'delivery', 'view')).toBe(true);
    });

    it('normalizes branch context to the authenticated visible scope', () => {
        const branches = [{ branch_id: 11, name: 'Main' }, { branch_id: 12, name: 'Mall' }];
        expect(resolveSettingsBranchId({ requestedId: '12', scope: 'assigned', branches, allowedLocationIds: [11] })).toBe('11');
        expect(resolveSettingsBranchId({ requestedId: '12', scope: 'assigned', branches, allowedLocationIds: [12] })).toBe('12');
        expect(resolveSettingsBranchId({ requestedId: '99', scope: 'all', branches })).toBe('11');
        expect(settingsScopeLabel('assigned', 'tenant')).toBe('Tenant-wide setting');
        expect(settingsScopeLabel('assigned', 'branch')).toBe('Assigned branch scope');
    });

    it('blocks navigation only while an editor reports a dirty draft', () => {
        expect(shouldBlockSettingsNavigation(false)).toBe(false);
        expect(shouldBlockSettingsNavigation(true)).toBe(true);
    });

    it('builds a narrow editor-user projection for the selected section', () => {
        const user = buildBusinessAdminSettingsEditorUser({
            baseUser: { user_id: 9, role: 'manager', is_master_admin: false },
            sectionKey: 'payments',
            rawCapabilities: {
                payments: { view: true, edit: true, scope: 'tenant' },
                pos: { view: true, edit: false, scope: 'tenant' }
            }
        });

        expect(user.permissions).toEqual(['downpayment:view', 'downpayment:settings']);
        expect(user.permissions).not.toContain('settings:edit');
        expect(user.is_master_admin).toBe(false);
    });

    it('keeps team employee permissions separate from user-management grants', () => {
        const user = buildBusinessAdminSettingsEditorUser({
            baseUser: { role: 'manager' },
            sectionKey: 'team',
            rawCapabilities: {
                team: {
                    view: true,
                    edit: true,
                    user_view: true,
                    user_edit: false,
                    employee_edit: true,
                    employee_credit_edit: true,
                    scope: 'branch'
                }
            }
        });

        expect(user.permissions).toEqual(['users:view', 'pos:employees:manage', 'pos:employee_credit:manage']);
        expect(user.permissions).not.toContain('users:manage');
    });
});
