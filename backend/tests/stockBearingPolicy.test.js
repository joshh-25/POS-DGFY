import {
    AVAILABILITY_SOURCE,
    TRACKING_MODE,
    buildStockBearingItemWhere,
    isStockBearingItem,
    isStockExemptServiceItem,
    normalizeModeItemPreset,
    normalizeItemCategory,
    resolveStockBearingDescriptor,
    resolveStockExemptReason
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
            }),
            expect.objectContaining({
                [Op.or]: expect.arrayContaining([
                    { tracking_mode: { [Op.notIn]: [TRACKING_MODE.UNTRACKED, TRACKING_MODE.TOGGLE, TRACKING_MODE.CAPACITY] } },
                    { tracking_mode: null }
                ])
            })
        ]));
    });

    describe('resolveStockBearingDescriptor - legacy fallback (tracking_mode unset)', () => {
        it('describes a normal counted physical product', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', fifo_enabled: true })).toEqual({
                tracks_quantity: true,
                uses_batches: true,
                blocks_on_shortfall: true,
                emits_movements: true,
                carries_cost: true,
                valuation_participant: true,
                availability_source: AVAILABILITY_SOURCE.COUNTED,
                is_toggle_available: null
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
                availability_source: AVAILABILITY_SOURCE.CAPACITY,
                is_toggle_available: null
            });
        });

        it('describes an always-available physical product as movement-exempt but still costed and valuation-participant', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', pos_always_available: true })).toEqual({
                tracks_quantity: false,
                uses_batches: false,
                blocks_on_shortfall: false,
                emits_movements: false,
                carries_cost: true,
                valuation_participant: true,
                availability_source: AVAILABILITY_SOURCE.DECLARED,
                is_toggle_available: null
            });
        });

        it('ignores a service category entirely, even if pos_always_available or fifo_enabled is also set', () => {
            expect(resolveStockBearingDescriptor({ category: 'service', pos_always_available: true, fifo_enabled: true }))
                .toMatchObject({ availability_source: AVAILABILITY_SOURCE.CAPACITY, carries_cost: false });
        });
    });

    describe('resolveStockBearingDescriptor - persisted tracking_mode (authoritative)', () => {
        it('treats count_ledger as tracked, no batches', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', tracking_mode: 'count_ledger', fifo_enabled: true }))
                .toMatchObject({ tracks_quantity: true, uses_batches: false, blocks_on_shortfall: true, availability_source: AVAILABILITY_SOURCE.COUNTED });
        });

        it('treats full_fifo as tracked with batches', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', tracking_mode: 'full_fifo' }))
                .toMatchObject({ tracks_quantity: true, uses_batches: true, availability_source: AVAILABILITY_SOURCE.COUNTED });
        });

        it('treats untracked as movement-exempt, always available, but still costed', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', tracking_mode: 'untracked' })).toEqual({
                tracks_quantity: false,
                uses_batches: false,
                blocks_on_shortfall: false,
                emits_movements: false,
                carries_cost: true,
                valuation_participant: true,
                availability_source: AVAILABILITY_SOURCE.DECLARED,
                is_toggle_available: null
            });
        });

        it('treats toggle as movement-exempt and gates on tracking_toggle_available', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', tracking_mode: 'toggle', tracking_toggle_available: true }))
                .toMatchObject({ tracks_quantity: false, availability_source: AVAILABILITY_SOURCE.DECLARED, is_toggle_available: true });
            expect(resolveStockBearingDescriptor({ category: 'product', tracking_mode: 'toggle', tracking_toggle_available: false }))
                .toMatchObject({ is_toggle_available: false });
            // Unset (undefined) tracking_toggle_available defaults to available, matching the column's DEFAULT 1.
            expect(resolveStockBearingDescriptor({ category: 'product', tracking_mode: 'toggle' }))
                .toMatchObject({ is_toggle_available: true });
        });

        it('treats an explicit capacity tracking_mode like a service for stock purposes, without requiring category=service', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', tracking_mode: 'capacity' })).toEqual({
                tracks_quantity: false,
                uses_batches: false,
                blocks_on_shortfall: false,
                emits_movements: false,
                carries_cost: false,
                valuation_participant: false,
                availability_source: AVAILABILITY_SOURCE.CAPACITY,
                is_toggle_available: null
            });
        });

        it('lets a real service category win over any stray tracking_mode value', () => {
            expect(resolveStockBearingDescriptor({ category: 'service', tracking_mode: 'count_ledger' }))
                .toMatchObject({ availability_source: AVAILABILITY_SOURCE.CAPACITY, carries_cost: false, tracks_quantity: false });
        });

        it('ignores an unrecognized tracking_mode string and falls back to legacy derivation', () => {
            expect(resolveStockBearingDescriptor({ category: 'product', tracking_mode: 'not_a_real_mode', fifo_enabled: true }))
                .toMatchObject({ tracks_quantity: true, uses_batches: true, availability_source: AVAILABILITY_SOURCE.COUNTED });
        });
    });

    describe('resolveStockExemptReason', () => {
        it('returns null for a tracked item', () => {
            expect(resolveStockExemptReason({ category: 'product', tracking_mode: 'count_ledger' })).toBeNull();
        });

        it('labels a real service', () => {
            expect(resolveStockExemptReason({ category: 'service' })).toBe('service_item');
        });

        it('labels untracked and legacy pos_always_available as pos_always_available for continuity', () => {
            expect(resolveStockExemptReason({ category: 'product', tracking_mode: 'untracked' })).toBe('pos_always_available');
            expect(resolveStockExemptReason({ category: 'product', pos_always_available: true })).toBe('pos_always_available');
        });

        it('labels a toggle-mode line as toggle', () => {
            expect(resolveStockExemptReason({ category: 'product', tracking_mode: 'toggle' })).toBe('toggle');
        });

        it('labels a non-service capacity item as capacity_item', () => {
            expect(resolveStockExemptReason({ category: 'product', tracking_mode: 'capacity' })).toBe('capacity_item');
        });
    });
});
