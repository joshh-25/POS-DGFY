import {
    AVAILABILITY_SOURCE,
    buildStockBearingItemWhere,
    isStockBearingItem,
    isStockExemptServiceItem,
    normalizeModeItemPreset,
    normalizeItemCategory,
    resolveStockBearingDescriptor
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

    describe('resolveStockBearingDescriptor', () => {
        it('describes a normal counted physical product', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', fifo_enabled: true })).toEqual({
                tracks_quantity: true,
                uses_batches: true,
                blocks_on_shortfall: true,
                emits_movements: true,
                carries_cost: true,
                valuation_participant: true,
                availability_source: AVAILABILITY_SOURCE.COUNTED
            });
        });

        it('describes a simple-count product (fifo disabled) as counted without batches', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', fifo_enabled: false })).toMatchObject({
                tracks_quantity: true,
                uses_batches: false,
                availability_source: AVAILABILITY_SOURCE.COUNTED
            });
        });

        it('describes a service as capacity-scheduled, not inventoried or costed', () => {
            expect(resolveStockBearingDescriptor({ category: 'service' })).toEqual({
                tracks_quantity: false,
                uses_batches: false,
                blocks_on_shortfall: false,
                emits_movements: false,
                carries_cost: false,
                valuation_participant: false,
                availability_source: AVAILABILITY_SOURCE.CAPACITY
            });
        });

        it('describes an always-available physical product as movement-exempt but still costed and valuation-participant', () => {
            // Mirrors the real split between checkout's stock-effect exemption
            // (posUseCases.js, which treats pos_always_available as exempt)
            // and today's valuation/report queries (buildStockBearingItemWhere,
            // which only excludes services) -- this is a real, existing gap
            // named by the resolver, not one it resolves.
            expect(resolveStockBearingDescriptor({ category: 'product', pos_always_available: true })).toEqual({
                tracks_quantity: false,
                uses_batches: false,
                blocks_on_shortfall: false,
                emits_movements: false,
                carries_cost: true,
                valuation_participant: true,
                availability_source: AVAILABILITY_SOURCE.DECLARED
            });
        });
    });
});
