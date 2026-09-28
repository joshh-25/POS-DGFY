import { describe, expect, it } from 'vitest';
import { buildFnbCheckCartLines } from '../fnbCheckoutCart.js';

const catalogItem = {
    item_id: 11,
    name: 'Burger',
    category: 'Meals',
    default_sale_price: 150,
    unit_of_measure: 'serving',
    vat_type: 'vatable',
    senior_pwd_discount_eligible: true,
    fnbKitchenRoutes: [{ kitchen_station_id: 4, default_course: 'main', is_primary: true }],
    fnbModifierGroups: [{
        modifier_group_id: 7,
        name: 'Add-ons',
        options: [{ modifier_option_id: 8, name: 'Cheese', price_delta: 25, is_active: true }]
    }]
};

describe('buildFnbCheckCartLines', () => {
    it('hydrates quantities, modifiers, notes, and kitchen routing from an active check', () => {
        const result = buildFnbCheckCartLines({
            catalog: [catalogItem],
            check: {
                check_id: 42,
                lines: [{
                    check_line_id: 101,
                    item_id: 11,
                    quantity: 2,
                    course: 'main',
                    kitchen_station_id: 5,
                    special_instructions: 'No onions',
                    modifiers_snapshot: [{ modifier_group_id: 7, modifier_option_id: 8, quantity: 1 }]
                }]
            }
        });

        expect(result.missingItemIds).toEqual([]);
        expect(result.invalidPriceItemIds).toEqual([]);
        expect(result.lines).toHaveLength(1);
        expect(result.lines[0]).toMatchObject({
            line_key: 'fnb-check-42-101',
            item_id: 11,
            quantity: 2,
            base_sale_price: 150,
            sale_price: 175,
            kitchen_station_id: 5,
            special_instructions: 'No onions',
            line_modifiers: [{ modifier_group_id: 7, modifier_option_id: 8, quantity: 1 }]
        });
    });

    it('does not create a partial cart when a checked item is not in the POS catalog', () => {
        const result = buildFnbCheckCartLines({
            catalog: [catalogItem],
            check: {
                check_id: 42,
                lines: [
                    { check_line_id: 101, item_id: 11, quantity: 1 },
                    { check_line_id: 102, item_id: 99, quantity: 1 }
                ]
            }
        });

        expect(result.lines).toHaveLength(1);
        expect(result.missingItemIds).toEqual([99]);
    });

    it('skips voided check lines', () => {
        const result = buildFnbCheckCartLines({
            catalog: [catalogItem],
            check: {
                check_id: 42,
                lines: [{ check_line_id: 101, item_id: 11, quantity: 1, status: 'voided' }]
            }
        });

        expect(result.lines).toEqual([]);
    });
});
