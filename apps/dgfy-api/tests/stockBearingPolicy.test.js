import {
    buildStockBearingItemWhere,
    isStockBearingItem,
    isStockExemptServiceItem,
    normalizeModeItemPreset,
    normalizeItemCategory
} from '../src/modules/shared/utils/stockBearingPolicy.js';
import { Op } from 'sequelize';

describe('stock bearing policy', () => {
    it('treats pure service items as stock-exempt', () => {
        expect(normalizeItemCategory({ category: ' Service ' })).toBe('service');
        expect(normalizeModeItemPreset({ mode_item_preset: ' Service ' })).toBe('service');
        expect(isStockExemptServiceItem({ category: ' Service ' })).toBe(true);
        expect(isStockExemptServiceItem({ mode_item_preset: ' Service ' })).toBe(true);
        expect(isStockBearingItem({ category: ' Service ' })).toBe(false);
        expect(isStockBearingItem({ mode_item_preset: ' Service ' })).toBe(false);
    });

    it('treats every non-service item line as stock-bearing', () => {
        for (const category of ['product', 'raw_material', 'finished_goods', 'kit', '', null]) {
            expect(isStockExemptServiceItem({ category })).toBe(false);
            expect(isStockBearingItem({ category })).toBe(true);
        }
    });

    it('builds a reusable stock-bearing where clause for valuation and reports', () => {
        const where = buildStockBearingItemWhere({
            status: 'active',
            [Op.and]: [{ current_stock: { [Op.gt]: 0 } }]
        });

        expect(where.status).toBe('active');
        expect(where[Op.and]).toEqual(expect.arrayContaining([
            { current_stock: { [Op.gt]: 0 } },
            expect.objectContaining({
                [Op.or]: expect.arrayContaining([
                    { category: { [Op.ne]: 'service' } },
                    { category: null }
                ])
            }),
            expect.objectContaining({
                [Op.or]: expect.arrayContaining([
                    { mode_item_preset: { [Op.ne]: 'service' } },
                    { mode_item_preset: null }
                ])
            })
        ]));
    });
});
