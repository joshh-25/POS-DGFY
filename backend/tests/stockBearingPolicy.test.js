import {
    isStockBearingItem,
    isStockExemptServiceItem,
    normalizeItemCategory
} from '../src/modules/shared/utils/stockBearingPolicy.js';

describe('stock bearing policy', () => {
    it('treats pure service items as stock-exempt', () => {
        expect(normalizeItemCategory({ category: ' Service ' })).toBe('service');
        expect(isStockExemptServiceItem({ category: ' Service ' })).toBe(true);
        expect(isStockBearingItem({ category: ' Service ' })).toBe(false);
    });

    it('treats every non-service item line as stock-bearing', () => {
        for (const category of ['product', 'raw_material', 'finished_goods', 'kit', '', null]) {
            expect(isStockExemptServiceItem({ category })).toBe(false);
            expect(isStockBearingItem({ category })).toBe(true);
        }
    });
});
