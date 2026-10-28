import { describe, expect, it } from 'vitest';
import {
    filterBusinessAdminSettingsNavigationGroups,
    getBusinessAdminSettingsNavigationGroups
} from '../../src/features/businessAdmin/businessAdminSettingsGroups.js';

const visibleSections = [
    { key: 'profile', label: 'Business & receipts', description: 'Business identity' },
    { key: 'pos', label: 'POS configuration', description: 'Terminal configuration' },
    { key: 'taxes', label: 'Taxes', description: 'Tax settings' },
    { key: 'discounts', label: 'Discounts', description: 'Discount rules' },
    { key: 'storefront', label: 'Storefront settings', description: 'Online store' },
    { key: 'delivery', label: 'Delivery pricing', description: 'Delivery settings' },
    { key: 'branches', label: 'Branches', description: 'Branch settings' },
    { key: 'attendance', label: 'Attendance', description: 'Attendance settings' },
    { key: 'registers', label: 'Registers & terminal policy', description: 'Register settings' },
    { key: 'team', label: 'Team & access', description: 'Users and access' },
    { key: 'payments', label: 'Payments', description: 'Payment settings' }
];

const sectionCapabilities = Object.fromEntries(
    visibleSections.map((section) => [section.key, { edit: section.key !== 'taxes' }])
);

describe('Business Admin Settings navigation', () => {
    it('groups all visible settings and keeps administrative destinations reachable', () => {
        const groups = getBusinessAdminSettingsNavigationGroups({
            visibleSections,
            sectionCapabilities,
            administrativeTools: [
                { key: 'approvals', label: 'Approvals' },
                { key: 'fiscal', label: 'Fiscal & BIR' },
                { key: 'audit', label: 'Audit logs' }
            ]
        });

        expect(groups.map((group) => group.label)).toEqual([
            'Business',
            'Sales & POS',
            'Online Store',
            'Operations',
            'Access & administration'
        ]);
        expect(groups.flatMap((group) => group.items)).toHaveLength(14);
        expect(groups.find((group) => group.key === 'access-administration').items.map((item) => item.key)).toEqual([
            'team',
            'approvals',
            'fiscal',
            'audit'
        ]);
        expect(groups.flatMap((group) => group.items).some((item) => item.key === 'processing_fees')).toBe(false);
    });

    it('filters by setting name, description, and group name without exposing hidden entries', () => {
        const groups = getBusinessAdminSettingsNavigationGroups({
            visibleSections,
            sectionCapabilities,
            administrativeTools: [{ key: 'fiscal', label: 'Fiscal & BIR' }]
        });

        expect(filterBusinessAdminSettingsNavigationGroups(groups, 'delivery').flatMap((group) => group.items).map((item) => item.key)).toEqual(['delivery']);
        expect(filterBusinessAdminSettingsNavigationGroups(groups, 'business').flatMap((group) => group.items).map((item) => item.key)).toEqual(['profile', 'taxes']);
        expect(filterBusinessAdminSettingsNavigationGroups(groups, 'FISCAL').flatMap((group) => group.items).map((item) => item.key)).toEqual(['fiscal']);
        expect(filterBusinessAdminSettingsNavigationGroups(groups, 'missing')).toEqual([]);
    });
});
