import { describe, expect, it } from 'vitest';
import {
    buildDefaultLineModifiers,
    buildKitchenStationSnapshot,
    getActiveModifierOptions,
    getModifierGroupMin,
    resolveModifierDelta,
    resolveModifierSnapshot
} from '../posCheckoutTerminalModifiers.js';

describe('POS checkout terminal modifier utilities', () => {
    const item = {
        fnbModifierGroups: [{
            modifier_group_id: 10,
            name: 'Size',
            required: true,
            min_select: 1,
            options: [
                { modifier_option_id: 100, name: 'Large', price_delta: 10, is_default: true },
                { modifier_option_id: 101, name: 'Small', price_delta: 0, is_active: false }
            ]
        }]
    };

    it('selects required active defaults and honors required overrides', () => {
        expect(getModifierGroupMin(item.fnbModifierGroups[0])).toBe(1);
        expect(getActiveModifierOptions(item.fnbModifierGroups[0])).toHaveLength(1);
        expect(buildDefaultLineModifiers(item)).toEqual([
            { modifier_group_id: 10, modifier_option_id: 100 }
        ]);
        expect(getModifierGroupMin({ required: false, min_select: 3, FnbItemModifierGroup: { is_required_override: true } })).toBe(3);
    });

    it('creates validated snapshots, computes deltas, and ignores missing groups', () => {
        const line = {
            modifier_groups: item.fnbModifierGroups,
            line_modifiers: [
                { modifier_group_id: 10, modifier_option_id: 100, quantity: 2 },
                { modifier_group_id: 999, modifier_option_id: 1, quantity: 1 }
            ]
        };
        expect(resolveModifierSnapshot(line)).toEqual([{
            modifier_group_id: 10,
            modifier_option_id: 100,
            group_name: 'Size',
            option_name: 'Large',
            price_delta: 10,
            quantity: 2
        }]);
        expect(resolveModifierDelta(line)).toBe(20);
        expect(resolveModifierSnapshot({ modifier_groups: [] }, [{ modifier_group_id: 1, modifier_option_id: 2 }])).toEqual([]);
    });

    it('uses the primary kitchen route and safely handles empty catalog data', () => {
        expect(buildKitchenStationSnapshot({
            fnbKitchenRoutes: [
                { is_primary: false, kitchen_station_id: 1 },
                { kitchen_station_id: 2, default_course: 'main' }
            ]
        })).toEqual({ kitchen_station_id: 2, course: 'main' });
        expect(buildKitchenStationSnapshot({})).toEqual({ kitchen_station_id: null, course: null });
        expect(getActiveModifierOptions(null)).toEqual([]);
    });
});
