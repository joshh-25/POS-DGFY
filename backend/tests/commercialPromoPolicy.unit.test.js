import { parsePublicCommercialPromos, resolveCommercialPromoApplication } from '../src/modules/shared/utils/commercialPromoPolicy.js';

describe('public commercial promo projection', () => {
    test('exposes all active redeemable promos without internal item targeting data', () => {
        expect(parsePublicCommercialPromos([
            { active: true, promo_code: 'SAVE10', title: '10% off', discount_percent: 10, target_item_ids: [1] },
            { active: true, promo_code: 'SAVE20', title: '20% off', discount_percent: 20, target_item_ids: [2] },
            { active: false, promo_code: 'HIDDEN', discount_percent: 50 }
        ])).toEqual([
            expect.objectContaining({ promo_code: 'SAVE10', discount_percent: 10 }),
            expect.objectContaining({ promo_code: 'SAVE20', discount_percent: 20 })
        ]);
        expect(parsePublicCommercialPromos([{ active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1] }])[0])
            .not.toHaveProperty('target_item_ids');
    });
});

describe('commercial promo authoritative allocations', () => {
    test('rejects an active promo after its configured end date', () => {
        expect(() => resolveCommercialPromoApplication({
            settings: {
                storefront_promos: {
                    value: [{ active: true, promo_code: 'OLD20', discount_percent: 20, valid_until: '2026-07-09' }]
                }
            },
            promoCode: 'OLD20',
            prepared: { subtotalAmount: 100, preparedLines: [{ item_id: 1, quantity: 1, sale_price: 100, line_subtotal: 100 }] },
            now: new Date('2026-07-10T12:00:00+08:00')
        })).toThrow('Promo code has expired.');
    });

    test('allocates only eligible lines and reconciles rounding to the header discount', () => {
        const result = resolveCommercialPromoApplication({
            settings: {
                storefront_promos: {
                    value: [{
                        active: true,
                        promo_code: 'MEAL15',
                        discount_percent: 15,
                        target_item_ids: [10]
                    }]
                }
            },
            promoCode: 'meal15',
            prepared: {
                subtotalAmount: 133.33,
                preparedLines: [
                    { item_id: 10, quantity: 1, sale_price: 33.33, line_subtotal: 33.33 },
                    { item_id: 10, quantity: 1, sale_price: 50, line_subtotal: 50 },
                    { item_id: 20, quantity: 1, sale_price: 50, line_subtotal: 50 }
                ]
            }
        });

        expect(result).toEqual(expect.objectContaining({
            applied: true,
            enteredPromoCode: 'MEAL15',
            discountAmount: 12.4995,
            discountRate: 15
        }));
        expect(result.lineAllocations).toEqual([
            expect.objectContaining({ item_id: 10, discount_amount: 4.9995, final_line_amount: 28.3305 }),
            expect.objectContaining({ item_id: 10, discount_amount: 7.5, final_line_amount: 42.5 }),
            expect.objectContaining({ item_id: 20, discount_amount: 0, final_line_amount: 50 })
        ]);
        expect(result.lineAllocations.reduce((sum, line) => sum + line.discount_amount, 0)).toBeCloseTo(result.discountAmount, 4);
    });
});
