import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import {
    getExplicitSalePrice,
    hasExplicitSalePrice,
    isPureServiceItem,
    requireExplicitSalePrice
} from '../src/modules/shared/utils/itemFinancialPolicy.js';

describe('item financial policy', () => {
    it('recognizes explicit positive sale prices only', () => {
        expect(hasExplicitSalePrice({ default_sale_price: 120 })).toBe(true);
        expect(hasExplicitSalePrice({ default_sale_price: '0' })).toBe(false);
        expect(hasExplicitSalePrice({ default_sale_price: null, cost_per_unit: 80 })).toBe(false);
        expect(getExplicitSalePrice({ default_sale_price: '99.50', cost_per_unit: 20 })).toBe(99.5);
    });

    it('identifies pure service rows from category or mode preset', () => {
        expect(isPureServiceItem({ category: 'service' })).toBe(true);
        expect(isPureServiceItem({ mode_item_preset: 'service' })).toBe(true);
        expect(isPureServiceItem({ category: 'supplies' })).toBe(false);
    });

    it('rejects missing sale price instead of falling back to cost', () => {
        expect(() => requireExplicitSalePrice({
            item_id: 42,
            name: 'Cost-only item',
            default_sale_price: null,
            cost_per_unit: 75
        }, 'POS checkout')).toThrow(/missing an explicit sale price/i);

        try {
            requireExplicitSalePrice({ item_id: 42, name: 'Cost-only item', cost_per_unit: 75 }, 'POS checkout');
        } catch (error) {
            expect(error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
            expect(error.details).toEqual(expect.objectContaining({
                reason_code: 'MISSING_PRICE',
                item_id: 42,
                context: 'POS checkout'
            }));
        }
    });
});
