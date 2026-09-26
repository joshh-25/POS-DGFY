import { describe, expect, it } from 'vitest';
import {
    POS_DISCOUNT_FALLBACK_OPTIONS,
    buildPosDiscountTypeOptions,
    getDiscountRuleSelectionKey,
    normalizeAvailablePosDiscountRules
} from '../posDiscountOptions.js';

describe('POS configurable discount options', () => {
    it('keeps only enabled, approved, and valid configured rules', () => {
        const rules = normalizeAvailablePosDiscountRules([
            {
                discount_rule_id: 1,
                name: 'Employee Discount',
                type: 'custom',
                method: 'percentage',
                percentage: '12',
                is_enabled: true,
                is_approved: true
            },
            {
                discount_rule_id: 2,
                name: 'Disabled Discount',
                type: 'custom',
                method: 'percentage',
                percentage: 10,
                is_enabled: false,
                is_approved: true
            },
            {
                discount_rule_id: 3,
                name: 'Pending Discount',
                type: 'custom',
                method: 'percentage',
                percentage: 10,
                is_enabled: true,
                is_approved: false
            },
            {
                discount_rule_id: 4,
                name: 'Invalid Discount',
                type: 'custom',
                method: 'percentage',
                percentage: 0,
                is_enabled: true,
                is_approved: true
            },
            {
                discount_rule_id: 5,
                name: 'Fixed Discount',
                type: 'custom',
                method: 'fixed',
                fixed_amount: '25',
                is_enabled: true,
                is_approved: true
            }
        ]);

        expect(rules).toEqual(expect.arrayContaining([
            expect.objectContaining({ discount_rule_id: 1, percentage: 12 }),
            expect.objectContaining({ discount_rule_id: 5, fixed_amount: 25, method: 'fixed' })
        ]));
        expect(rules).toHaveLength(2);
    });

    it('uses only specialized compatibility options until the directory request is ready', () => {
        expect(buildPosDiscountTypeOptions([], POS_DISCOUNT_FALLBACK_OPTIONS).map((option) => option.value)).toEqual([
            'promo',
            'voucher'
        ]);
    });

    it('keeps specialized compatibility options after configured rules load', () => {
        const options = buildPosDiscountTypeOptions([{
            discount_rule_id: 1,
            name: 'Employee Discount',
            type: 'employee',
            method: 'percentage',
            percentage: 12,
            is_enabled: true,
            is_approved: true
        }], POS_DISCOUNT_FALLBACK_OPTIONS, { rulesReady: true });

        expect(options.map((option) => option.value)).toEqual(['employee', 'promo', 'voucher']);
    });

    it('builds one option per configured standard type and keeps custom rules distinct', () => {
        const options = buildPosDiscountTypeOptions([
            {
                discount_rule_id: 11,
                name: 'Senior Citizen',
                type: 'senior',
                method: 'percentage',
                percentage: 20,
                is_enabled: true,
                is_approved: true
            },
            {
                discount_rule_id: 12,
                name: 'Senior Citizen Duplicate',
                type: 'senior',
                method: 'percentage',
                percentage: 15,
                is_enabled: true,
                is_approved: true
            },
            {
                discount_rule_id: 21,
                name: 'Staff Discount',
                type: 'custom',
                method: 'percentage',
                percentage: 12,
                is_enabled: true,
                is_approved: true
            },
            {
                discount_rule_id: 22,
                name: 'Manager Discount',
                type: 'custom',
                method: 'percentage',
                percentage: 8,
                is_enabled: true,
                is_approved: true
            }
        ], POS_DISCOUNT_FALLBACK_OPTIONS, { rulesReady: true });

        expect(options.map((option) => option.value)).toEqual([
            'senior',
            'custom:21',
            'custom:22',
            'promo',
            'voucher'
        ]);
        expect(options[0]).toMatchObject({ label: 'Senior Citizen', rule: { percentage: 20 } });
        expect(options[1]).toMatchObject({ type: 'custom', label: 'Staff Discount' });
    });

    it('uses the configured rule identity for custom selection and snapshots', () => {
        expect(getDiscountRuleSelectionKey({ type: 'custom', rule_id: 21 })).toBe('custom:21');
        expect(getDiscountRuleSelectionKey({ type: 'senior', discount_rule_id: 11 })).toBe('senior');
    });
});
