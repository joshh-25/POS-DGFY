import { describe, expect, it } from 'vitest';
import { normalizePosTerminalDraftState } from '../posTerminalDraftState.js';

describe('POS terminal draft state', () => {
    it('does not expose legacy profile rates as employee discount choices', () => {
        const state = normalizePosTerminalDraftState({
            discountProfiles: [{ name: 'Legacy Employee', percentage: 15, active: true }],
            discountRules: [{
                discount_rule_id: 7,
                name: 'Configured Employee',
                type: 'employee',
                method: 'percentage',
                percentage: 12,
                is_enabled: true,
                is_approved: true
            }],
            discountDraft: {}
        });

        expect(state.employeeDiscountRateOptions).toEqual([12]);
    });

    it('keeps only enabled and approved configured employee rates', () => {
        const state = normalizePosTerminalDraftState({
            discountRules: [
                {
                    discount_rule_id: 7,
                    name: 'Enabled Employee',
                    type: 'employee',
                    method: 'percentage',
                    percentage: 12,
                    is_enabled: true,
                    is_approved: true
                },
                {
                    discount_rule_id: 8,
                    name: 'Disabled Employee',
                    type: 'employee',
                    method: 'percentage',
                    percentage: 15,
                    is_enabled: false,
                    is_approved: true
                },
                {
                    discount_rule_id: 9,
                    name: 'Pending Employee',
                    type: 'employee',
                    method: 'percentage',
                    percentage: 18,
                    is_enabled: true,
                    is_approved: false
                }
            ],
            discountDraft: { rate: 10 }
        });

        expect(state.employeeDiscountRateOptions).toEqual([10, 12]);
    });
});
