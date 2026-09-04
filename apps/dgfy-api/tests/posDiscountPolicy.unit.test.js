import { resolvePosGovernedDiscount } from '../src/modules/pos/domain/posDiscountPolicy.js';

const preparedLines = [
    { item_id: 1, quantity: 1, sale_price: 100, line_subtotal: 100, senior_pwd_discount_eligible: true },
    { item_id: 2, quantity: 1, sale_price: 80, line_subtotal: 80, senior_pwd_discount_eligible: false }
];

const rules = {
    senior: { id: 10, name: 'Senior Citizen', type: 'senior', method: 'percentage', rate: 20, is_active: true },
    pwd: { id: 11, name: 'PWD', type: 'pwd', method: 'percentage', rate: 20, is_active: true },
    employee: { id: 12, name: 'Employee Discount', type: 'employee', method: 'percentage', rate: 15, is_active: true },
    manual: { id: 13, name: 'Manual Discount', type: 'manual', method: 'percentage', rate: null, is_active: true }
};

describe('POS governed discount policy', () => {
    test('preserves a selected statutory quantity for an eligible item', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'senior', customer_name: 'Juan', id_number: 'SC-1', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.senior
        });

        expect(result.application.lines).toEqual([{ item_id: 1, eligible_quantity: 1 }]);
    });

    test('rejects a statutory quantity above the cart quantity', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'pwd', customer_name: 'Maria', id_number: 'PWD-1', eligible_items: [{ item_id: 1, eligible_quantity: 3 }] },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.pwd
        })).rejects.toMatchObject({ details: { reason_code: 'STATUTORY_QUANTITY_INVALID' } });
    });

    test('accepts multiple statutory beneficiaries with non-overlapping quantities', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'senior',
                beneficiaries: [
                    { category: 'senior', name: 'Juan', id_number: 'SC-1', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] },
                    { category: 'senior', name: 'Pedro', id_number: 'SC-2', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] }
                ]
            },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.senior
        });

        expect(result.application.beneficiaries).toHaveLength(2);
        expect(result.application.customer_name).toBeNull();
    });

    test('rejects combined beneficiary quantities above the cart quantity', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: {
                type: 'senior',
                beneficiaries: [
                    { category: 'senior', name: 'Juan', id_number: 'SC-1', eligible_items: [{ item_id: 1, eligible_quantity: 2 }] },
                    { category: 'senior', name: 'Pedro', id_number: 'SC-2', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] }
                ]
            },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.senior
        })).rejects.toMatchObject({ details: { reason_code: 'STATUTORY_QUANTITY_INVALID' } });
    });

    test('rejects duplicate beneficiary IDs case-insensitively', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: {
                type: 'senior',
                beneficiaries: [
                    { category: 'senior', name: 'Juan', id_number: 'SC-1', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] },
                    { category: 'senior', name: 'Pedro', id_number: 'sc-1', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] }
                ]
            },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.senior
        })).rejects.toMatchObject({ details: { reason_code: 'STATUTORY_BENEFICIARY_DUPLICATE' } });
    });
    test('uses the active statutory rule and selected eligible items', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'senior',
                method: 'fixed',
                rate: 100,
                customer_name: 'Juan Dela Cruz',
                id_number: 'SC-123',
                eligible_item_ids: [1]
            },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type]
        });

        expect(result.application).toMatchObject({
            rule_id: 10,
            method: 'percentage',
            rate: 20,
            lines: [{ item_id: 1 }]
        });
    });

    test('rejects statutory selection for an ineligible item', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'pwd', customer_name: 'Maria', id_number: 'PWD-1', eligible_item_ids: [2] },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type]
        })).rejects.toMatchObject({ details: { reason_code: 'STATUTORY_ITEM_NOT_ELIGIBLE' } });
    });

    test('resolves promo rate and targets from commercial Storefront configuration', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'promo', promo_code: ' save10 ', method: 'fixed', rate: 99, customer_name: 'Promo Buyer' },
            preparedLines,
            subtotalAmount: 180,
            settings: {
                storefront_promo: {
                    value: { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [2] }
                }
            }
        });

        expect(result.application).toMatchObject({
            type: 'promo',
            method: 'percentage',
            rate: 10,
            promo_code: 'SAVE10',
            lines: [{ item_id: 2 }]
        });
        expect(result.promo.discountAmount).toBe(8);
    });

    test('resolves promo rate and targets from multiple Storefront promo configurations', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'promo', promo_code: ' meal15 ', method: 'fixed', rate: 99, customer_name: 'Promo Buyer' },
            preparedLines,
            subtotalAmount: 180,
            settings: {
                storefront_promos: {
                    value: [
                        { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1] },
                        { active: true, promo_code: 'MEAL15', discount_percent: 15, target_item_ids: [2] }
                    ]
                }
            }
        });

        expect(result.application).toMatchObject({
            type: 'promo',
            method: 'percentage',
            rate: 15,
            promo_code: 'MEAL15',
            lines: [{ item_id: 2 }]
        });
        expect(result.promo.config).toMatchObject({
            sourceKey: 'storefront_promos',
            sourceIndex: 1
        });
        expect(result.promo.discountAmount).toBe(12);
    });

    test('falls back to legacy single Storefront promo when multi-promo settings are absent', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'promo', promo_code: 'save10', customer_name: 'Promo Buyer' },
            preparedLines,
            subtotalAmount: 180,
            settings: {
                storefront_promo: {
                    value: { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1] }
                }
            }
        });

        expect(result.promo.config).toMatchObject({
            sourceKey: 'storefront_promo',
            promoCode: 'SAVE10'
        });
        expect(result.promo.discountAmount).toBe(10);
    });

    test('canonicalizes employee identity from an active user record', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'employee', customer_name: 'Employee Buyer', employee_id: '7', employee_name: 'Spoofed', method: 'percentage', rate: 50 },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type],
            findActiveEmployee: async () => ({ user_id: 7, username: 'cashier-seven' })
        });

        expect(result.application).toMatchObject({ employee_id: '7', employee_name: 'cashier-seven', rate: 15 });
    });

    test('allows employee discounts without an employee ID', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'employee', customer_name: 'Employee Buyer', method: 'percentage', rate: 50, employee_name: 'Optional display name' },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type]
        });

        expect(result.application).toMatchObject({ employee_id: null, employee_name: null, rate: 15 });
    });

    test('requires customer name for non-statutory promo discounts', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'promo', promo_code: 'SAVE10' },
            preparedLines,
            subtotalAmount: 180,
            settings: {
                storefront_promo: {
                    value: { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1] }
                }
            }
        })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_CUSTOMER_NAME_REQUIRED' } });
    });

    test('requires customer name for employee discounts before resolving the employee', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'employee', employee_id: '7' },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type],
            findActiveEmployee: async () => ({ user_id: 7, username: 'cashier-seven' })
        })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_CUSTOMER_NAME_REQUIRED' } });
    });

    test('requires customer name for manual discounts while preserving existing manual controls', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'manual', method: 'percentage', rate: 10, reason: 'Manager approved' },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type]
        })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_CUSTOMER_NAME_REQUIRED' } });
    });
});
