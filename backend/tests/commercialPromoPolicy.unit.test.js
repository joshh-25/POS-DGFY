import { resolveCommercialPromoApplication } from '../src/modules/shared/utils/commercialPromoPolicy.js';

describe('commercial promo authoritative allocations', () => {
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
