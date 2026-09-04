import { calculatePosDiscount } from '../src/modules/pos/domain/posDiscountCalculator.js';
import { calculatePosItemDiscounts } from '../src/modules/pos/domain/posItemDiscountCalculator.js';

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

    test('treats a null maximum as uncapped for governed employee and manual discounts', () => {
        const discountLine = [{ item_id: 1, quantity: 1, sale_price: 100, vat_type_snapshot: 'vatable' }];

        for (const type of ['employee', 'manual']) {
            const result = calculatePosDiscount({
                lines: discountLine,
                application: {
                    type,
                    method: 'percentage',
                    rate: 15,
                    max_discount_amount: null,
                    lines: []
                }
            });

            expect(result.discount_amount).toBe(15);
            expect(result.total_amount).toBe(85);
        }
    });

    test('allocates an employee discount only to selected cart lines', () => {
        const result = calculatePosDiscount({
            lines,
            application: {
                type: 'employee',
                method: 'percentage',
                rate: 15,
                lines: [{ item_id: 2 }]
            }
        });

        expect(result.discount_amount).toBe(15);
        expect(result.lines.map((line) => line.discount_amount)).toEqual([0, 15, 0]);
        expect(result.total_amount).toBe(277);
    });

    test('applies a non-statutory discount only to the selected quantity', () => {
        const result = calculatePosDiscount({
            lines: [{ item_id: 1, quantity: 2, sale_price: 100, vat_type_snapshot: 'vatable' }],
            application: {
                type: 'employee',
                method: 'percentage',
                rate: 15,
                lines: [{ item_id: 1, eligible_quantity: 0.5 }]
            }
        });

        expect(result.discount_amount).toBe(7.5);
        expect(result.lines[0].eligible_quantity).toBe(0.5);
        expect(result.total_amount).toBe(192.5);
    });

    test('uses line_ref to discount only one of two cart lines with the same item ID', () => {
        const result = calculatePosDiscount({
            lines: [
                { line_ref: 'coffee-hot', item_id: 1, quantity: 1, sale_price: 100 },
                { line_ref: 'coffee-cold', item_id: 1, quantity: 1, sale_price: 150 }
            ],
            application: {
                type: 'employee',
                method: 'percentage',
                rate: 10,
                lines: [{ line_ref: 'coffee-hot', item_id: 1, eligible_quantity: 1 }]
            }
        });

        expect(result.discount_amount).toBe(10);
        expect(result.lines.map((line) => line.discount_amount)).toEqual([10, 0]);
        expect(result.total_amount).toBe(240);
    });

    test('still applies an explicit maximum discount amount', () => {
        const result = calculatePosDiscount({
            lines: [{ item_id: 1, quantity: 1, sale_price: 100, vat_type_snapshot: 'vatable' }],
            application: {
                type: 'employee',
                method: 'percentage',
                rate: 20,
                max_discount_amount: 10,
                lines: []
            }
        });

        expect(result.discount_amount).toBe(10);
        expect(result.total_amount).toBe(90);
    });

    test('calculates a global discount from the item-discounted base', () => {
        const result = calculatePosDiscount({
            lines: [{
                item_id: 1,
                quantity: 1,
                sale_price: 100,
                global_discount_base_amount: 85,
                vat_type_snapshot: 'vatable'
            }],
            application: {
                type: 'employee',
                method: 'percentage',
                rate: 10,
                lines: []
            }
        });

        expect(result.discount_amount).toBe(8.5);
        expect(result.total_amount).toBe(76.5);
    });

    test('calculates an item-only discount and exposes the reduced global base', () => {
        const result = calculatePosItemDiscounts({
            lines: [{ item_id: 1, item_name: 'Coffee', quantity: 1, sale_price: 100 }],
            applications: [{ item_id: 1, method: 'percentage', rate: 15, label: 'Item Discount' }]
        });

        expect(result.discount_amount).toBe(15);
        expect(result.total_amount).toBe(85);
        expect(result.lines[0].item_discount_snapshot.discount_amount).toBe(15);
        expect(result.lines[0].global_discount_base_amount).toBe(85);
    });

    // Consolidated from tests/posDiscountCalculator.test.js (#1441)
    test('removes VAT and applies 20% only to eligible Senior lines (legacy vat_type alias)', () => {
        const result = calculatePosDiscount({
            lines: [
                { item_id: 1, quantity: 1, sale_price: 112, vat_type: 'vatable', senior_pwd_discount_eligible: true },
                { item_id: 2, quantity: 1, sale_price: 112, vat_type: 'vatable', senior_pwd_discount_eligible: false }
            ],
            application: { type: 'senior', lines: [] }
        });
        expect(result.subtotal_amount).toBe(224);
        expect(result.vat_removed).toBe(12);
        expect(result.vat_exempt_amount).toBe(100);
        expect(result.discount_amount).toBe(20);
        expect(result.total_amount).toBe(192);
        expect(result.lines[1].discount_amount).toBe(0);
    });

    // Consolidated from tests/posDiscountCalculator.test.js (#1441)
    test('lines: [] selects every statutory-eligible line', () => {
        const result = calculatePosDiscount({
            lines: [{ item_id: 1, quantity: 2, sale_price: 112, vat_type: 'vatable', senior_pwd_discount_eligible: true }],
            application: { type: 'pwd', lines: [{ item_id: 1, eligible_quantity: 1 }] }
        });
        expect(result.vat_removed).toBe(12);
        expect(result.discount_amount).toBe(20);
        expect(result.total_amount).toBe(192);
    });
});
