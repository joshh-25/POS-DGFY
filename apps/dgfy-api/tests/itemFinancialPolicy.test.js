import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import {
    getExplicitSalePrice,
    hasExplicitSalePrice,
    isPureServiceItem,
    requireExplicitSalePrice,
    resolveItemFinancialPolicy
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

    it('mirrors mode-aware financial display/readiness rules used by IMS', () => {
        expect(resolveItemFinancialPolicy({
            workflowMode: 'services',
            item: { category: 'service', mode_item_preset: 'service', cost_per_unit: 0 }
        })).toEqual(expect.objectContaining({
            is_pure_service: true,
            show_sale_price: true,
            show_cost: false,
            requires_sale_price: false
        }));

        expect(resolveItemFinancialPolicy({
            workflowMode: 'services',
            item: {
                category: 'product',
                product_type: 'finished_goods',
                mode_item_preset: 'physical_add_on',
                unit_of_measure: 'pcs'
            },
            storefrontVisible: true
        })).toEqual(expect.objectContaining({
            show_cost: true,
            show_sale_price: true,
            requires_sale_price: true
        }));

        expect(resolveItemFinancialPolicy({
            workflowMode: 'fnb',
            item: {
                category: 'raw_material',
                mode_item_preset: 'ingredient',
                unit_of_measure: 'kg'
            }
        })).toEqual(expect.objectContaining({
            show_cost: true,
            show_sale_price: false,
            requires_sale_price: false
        }));
    });
});
