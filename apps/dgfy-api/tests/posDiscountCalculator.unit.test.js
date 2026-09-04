import { calculatePosDiscount } from '../src/modules/pos/domain/posDiscountCalculator.js';

const lines = [
    { item_id: 1, quantity: 1, sale_price: 112, vat_type_snapshot: 'vatable', senior_pwd_discount_eligible: true },
    { item_id: 2, quantity: 1, sale_price: 100, vat_type_snapshot: 'vatable', senior_pwd_discount_eligible: true },
    { item_id: 3, quantity: 1, sale_price: 80, vat_type_snapshot: 'vatable', senior_pwd_discount_eligible: false }
];

describe('POS governed discount calculator', () => {
    test('applies Senior/PWD discount only to explicitly selected eligible items', () => {
        const result = calculatePosDiscount({
            lines,
            application: { type: 'senior', method: 'percentage', rate: 99, lines: [{ item_id: 1 }] }
        });

        expect(result.rate).toBe(20);
        expect(result.lines[0].vat_removed).toBe(12);
        expect(result.lines[0].discount_amount).toBe(20);
        expect(result.lines[1].discount_amount).toBe(0);
        expect(result.lines[2].discount_amount).toBe(0);
        expect(result.discount_amount).toBe(20);
    });

    test('does not discount a selected item that is not statutory eligible', () => {
        const result = calculatePosDiscount({
            lines,
            application: { type: 'pwd', method: 'percentage', lines: [{ item_id: 3 }] }
        });

        expect(result.discount_amount).toBe(0);
        expect(result.vat_removed).toBe(0);
    });

    test('calculates and reconciles multiple beneficiary allocations', () => {
        const result = calculatePosDiscount({
            lines: [{ item_id: 1, quantity: 2, sale_price: 112, vat_type_snapshot: 'vatable', senior_pwd_discount_eligible: true }],
            application: {
                type: 'senior',
                beneficiaries: [
                    { category: 'senior', lines: [{ item_id: 1, eligible_quantity: 1 }] },
                    { category: 'senior', lines: [{ item_id: 1, eligible_quantity: 1 }] }
                ]
            }
        });

        expect(result.beneficiaries).toHaveLength(2);
        expect(result.lines[0].eligible_quantity).toBe(2);
        expect(result.vat_removed).toBe(24);
        expect(result.discount_amount).toBe(40);
        expect(result.total_amount).toBe(160);
    });

    test('treats the MySQL boolean value 1 as Senior/PWD eligible', () => {
        const result = calculatePosDiscount({
            lines: [{ item_id: 1, quantity: 1, sale_price: 112, vat_type_snapshot: 'vatable', senior_pwd_discount_eligible: 1 }],
            application: { type: 'senior', method: 'percentage', lines: [{ item_id: 1 }] }
        });

        expect(result.discount_amount).toBe(20);
        expect(result.vat_removed).toBe(12);
    });

    test('applies commercial promo only to configured target lines', () => {
        const result = calculatePosDiscount({
            lines,
            application: { type: 'promo', method: 'percentage', rate: 10, lines: [{ item_id: 2 }] }
        });

        expect(result.discount_amount).toBe(10);
        expect(result.lines.map((line) => line.discount_amount)).toEqual([0, 10, 0]);
    });

    test('caps a fixed targeted discount at the eligible subtotal', () => {
        const result = calculatePosDiscount({
            lines,
            application: { type: 'promo', method: 'fixed', amount: 150, lines: [{ item_id: 2 }] }
        });

        expect(result.discount_amount).toBe(100);
        expect(result.lines[1].final_line_amount).toBe(0);
    });
});
