import { describe, expect, it } from 'vitest';
import {
    BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS,
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
        taxes: { view: true, edit: false, scope: 'tenant' },
        discounts: { view: true, edit: true, scope: 'tenant' },
        storefront: { view: false, edit: false, scope: 'tenant' },
        delivery: { view: true, edit: false, scope: 'tenant' },
        branches: { view: true, edit: false, scope: 'branch' },
        team: { view: true, edit: true, scope: 'branch' },
        attendance: { view: false, edit: false, scope: 'branch' },
        payments: { view: true, edit: false, scope: 'tenant' },
        processing_fees: { view: true, edit: false, scope: 'tenant' },
        registers: { view: false, edit: false, scope: 'branch' }
    };

    it('declares one canonical Business Admin owner and scope for every settings section', () => {
        expect(BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS.map((definition) => definition.key)).toEqual([
            'profile', 'pos', 'taxes', 'discounts', 'storefront', 'delivery', 'branches', 'team', 'attendance', 'payments', 'processing_fees', 'registers'
        ]);
        expect(Object.fromEntries(BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS.map((definition) => [definition.key, definition.scope]))).toEqual({
            profile: 'tenant',
            pos: 'tenant',
            taxes: 'tenant',
            discounts: 'tenant',
            storefront: 'tenant',
            delivery: 'tenant',
            branches: 'branch',
            team: 'branch',
            attendance: 'branch',
            payments: 'tenant',
            processing_fees: 'tenant',
            registers: 'branch'
        });
        expect(BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS.find((definition) => definition.key === 'pos').description).toContain('discount rules');
        expect(BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS.find((definition) => definition.key === 'processing_fees')).toMatchObject({
            hidden: true,
            redirectTo: 'pos'
        });
        expect(BUSINESS_ADMIN_SETTINGS_SECTION_DEFINITIONS.find((definition) => definition.key === 'registers').description).toContain('Device enrollment remains POS-owned');
    });

    it('parses both Business Admin route aliases and builds canonical nested settings paths', () => {
        expect(parseBusinessAdminPath('/backoffice/settings/team', '/backoffice')).toMatchObject({
            activeSection: 'settings',
            settingsSection: 'team'
        });
        expect(parseBusinessAdminPath('/backoffice/locations/registers', '/backoffice')).toMatchObject({
            activeSection: 'locations',
            locationView: 'registers'
        });
        expect(parseBusinessAdminPath('/backoffice/branches', '/backoffice')).toMatchObject({
            activeSection: 'locations',
            locationView: 'branches'
        });
        expect(parseBusinessAdminPath('/backoffice/registers', '/backoffice')).toMatchObject({
            activeSection: 'locations',
            locationView: 'registers'
        });
        expect(buildBusinessAdminSettingsPath('/business-admin', 'payments')).toBe('/business-admin/settings/payments');
        expect(buildPosSettingsOwnerPath('settings_pos')).toBe('/terminal?view=settings_pos');
        expect(buildPosSettingsOwnerPath('terminal_setup')).toBe('/terminal?view=terminal_setup');
    });

    it('keeps server-projected view/edit capabilities separate', () => {
        expect(getVisibleBusinessAdminSettingsSections(capabilities).map((section) => section.key)).toEqual([
            'profile', 'pos', 'taxes', 'discounts', 'delivery', 'branches', 'team', 'payments'
        ]);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'pos', 'view')).toBe(true);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'pos', 'edit')).toBe(false);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'taxes', 'edit')).toBe(false);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'discounts', 'edit')).toBe(true);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'storefront', 'view')).toBe(false);
        expect(canAccessBusinessAdminSettingsSection(capabilities, 'delivery', 'view')).toBe(true);
    });

    it('routes the legacy processing-fee settings path into POS configuration', () => {
        expect(parseBusinessAdminPath('/backoffice/settings/processing_fees', '/backoffice')).toMatchObject({
            activeSection: 'settings',
            settingsSection: 'pos'
        });
        expect(buildBusinessAdminSettingsPath('/backoffice', 'processing_fees')).toBe('/backoffice/settings/pos');
    });

    it('normalizes branch context to the authenticated visible scope', () => {
        const branches = [{ branch_id: 11, name: 'Main' }, { branch_id: 12, name: 'Mall' }];
        expect(resolveSettingsBranchId({ requestedId: '12', scope: 'assigned', branches, allowedLocationIds: [11] })).toBe('11');
        expect(resolveSettingsBranchId({ requestedId: '12', scope: 'assigned', branches, allowedLocationIds: [12] })).toBe('12');
        expect(resolveSettingsBranchId({ requestedId: '99', scope: 'all', branches })).toBe('11');
        expect(settingsScopeLabel('assigned', 'tenant')).toBe('Business-wide setting');
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
