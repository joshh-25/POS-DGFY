import { buildVoucherGovernedCalculation } from '../src/modules/pos/domain/posVoucherDiscountCalculator.js';

const lines = [
    { item_id: 1, quantity: 2, sale_price: 80, global_discount_base_amount: 160 },
    { item_id: 2, quantity: 1, sale_price: 50, global_discount_base_amount: 50 }
];

describe('POS voucher governed calculation (#712)', () => {
    test('builds discount lines directly from the voucher lineAllocations, not a proportional split', () => {
        // A fixed_price voucher's per-line discount is NOT a proportional share of one total -- it
        // is the exact per-item delta calculateVoucherBenefit already computed. This is the whole
        // reason this module exists instead of reusing calculatePosDiscount.
        const voucher = {
            benefitClass: 'fixed_price',
            percentOffBps: null,
            discountCentavos: 2600, // 1300 + 1300, deliberately NOT proportional to 160:50
            lineAllocations: [
                { item_id: 1, quantity: 2, discountCentavos: 1300, eligible: true },
                { item_id: 2, quantity: 1, discountCentavos: 1300, eligible: true }
            ]
        };

        const result = buildVoucherGovernedCalculation({ lines, voucher });

        expect(result.lines).toEqual([
            expect.objectContaining({ item_id: 1, discount_amount: 13, eligible_quantity: 2 }),
            expect.objectContaining({ item_id: 2, discount_amount: 13, eligible_quantity: 1 })
        ]);
        expect(result.discount_amount).toBe(26);
    });

    test('zeroes out an ineligible line rather than discounting it', () => {
        const voucher = {
            benefitClass: 'percent_off',
            percentOffBps: 1000,
            discountCentavos: 1600,
            lineAllocations: [
                { item_id: 1, quantity: 2, discountCentavos: 1600, eligible: true },
                { item_id: 2, quantity: 1, discountCentavos: 0, eligible: false }
            ]
        };

        const result = buildVoucherGovernedCalculation({ lines, voucher });

        expect(result.lines.find((line) => line.item_id === 2)).toMatchObject({
            discount_amount: 0,
            eligible_quantity: 0
        });
        expect(result.discount_amount).toBe(16);
    });

    test('never sets vat_removed or vat_exempt_amount -- a voucher is never statutory', () => {
        const voucher = {
            benefitClass: 'amount_off',
            percentOffBps: null,
            discountCentavos: 500,
            lineAllocations: [
                { item_id: 1, quantity: 2, discountCentavos: 500, eligible: true },
                { item_id: 2, quantity: 1, discountCentavos: 0, eligible: false }
            ]
        };

        const result = buildVoucherGovernedCalculation({ lines, voucher });

        expect(result.vat_removed).toBe(0);
        expect(result.vat_exempt_amount).toBe(0);
        result.lines.forEach((line) => {
            expect(line.vat_removed).toBe(0);
            expect(line.vat_exempt_amount).toBe(0);
        });
    });

    test('resolves method and rate from benefitClass, matching storeUseCases.js\'s own mapping', () => {
        const percentOff = buildVoucherGovernedCalculation({
            lines,
            voucher: { benefitClass: 'percent_off', percentOffBps: 1500, discountCentavos: 0, lineAllocations: [] }
        });
        expect(percentOff.method).toBe('percentage');
        expect(percentOff.rate).toBe(15);

        const fixedPrice = buildVoucherGovernedCalculation({
            lines,
            voucher: { benefitClass: 'fixed_price', percentOffBps: null, discountCentavos: 0, lineAllocations: [] }
        });
        expect(fixedPrice.method).toBe('fixed');
        expect(fixedPrice.rate).toBeNull();

        const amountOff = buildVoucherGovernedCalculation({
            lines,
            voucher: { benefitClass: 'amount_off', percentOffBps: null, discountCentavos: 0, lineAllocations: [] }
        });
        expect(amountOff.method).toBe('fixed');
        expect(amountOff.rate).toBeNull();
    });

    test('total_amount and final_line_amount reconcile against subtotal minus discount', () => {
        const voucher = {
            benefitClass: 'percent_off',
            percentOffBps: 1000,
            discountCentavos: 1600,
            lineAllocations: [
                { item_id: 1, quantity: 2, discountCentavos: 1600, eligible: true },
                { item_id: 2, quantity: 1, discountCentavos: 0, eligible: false }
            ]
        };

        const result = buildVoucherGovernedCalculation({ lines, voucher });

        expect(result.subtotal_amount).toBe(210);
        expect(result.total_amount).toBe(194);
        expect(result.lines.find((line) => line.item_id === 1).final_line_amount).toBe(144);
        expect(result.lines.find((line) => line.item_id === 2).final_line_amount).toBe(50);
    });

    test('uses line_ref so a voucher allocation cannot multiply across duplicate item lines', () => {
        const duplicateLines = [
            { line_ref: 'coffee-hot', item_id: 1, quantity: 1, sale_price: 100, global_discount_base_amount: 100 },
            { line_ref: 'coffee-cold', item_id: 1, quantity: 1, sale_price: 150, global_discount_base_amount: 150 }
        ];
        const result = buildVoucherGovernedCalculation({
            lines: duplicateLines,
            voucher: {
                benefitClass: 'amount_off',
                discountCentavos: 1000,
                lineAllocations: [
                    { line_ref: 'coffee-hot', item_id: 1, quantity: 1, discountCentavos: 1000, eligible: true }
                ]
            }
        });

        expect(result.discount_amount).toBe(10);
        expect(result.lines.map((line) => line.discount_amount)).toEqual([10, 0]);
    });
});
