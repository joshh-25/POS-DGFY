import { describe, expect, it } from 'vitest';
import { buildIncomingDineInCheckoutCartLines } from '../incomingDineInCheckoutCart.js';

describe('buildIncomingDineInCheckoutCartLines', () => {
    it('preserves the incoming order snapshot price while enriching cart metadata from the catalog', () => {
        const lines = buildIncomingDineInCheckoutCartLines({
            order: {
                pos_transaction_id: 810,
                lines: [{
                    line_id: 12,
                    item_id: 7,
                    item_name_snapshot: 'Original Burger',
                    quantity: 2,
                    sale_price: 155
                }]
            },
            catalog: [{
                item_id: 7,
                name: 'Current Burger Name',
                default_sale_price: 175,
                unit_of_measure: 'pcs',
                category: 'Meals'
            }]
        });

        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({
            line_key: 'online-dine-in-810-12',
            item_id: 7,
            item_name: 'Original Burger',
            quantity: 2,
            base_sale_price: 155,
            sale_price: 155,
            category: 'Meals'
        });
    });

    it('skips malformed order lines instead of opening an empty checkout', () => {
        const lines = buildIncomingDineInCheckoutCartLines({
            order: {
                pos_transaction_id: 810,
                lines: [{ item_id: 7, quantity: 1, sale_price: 'not-a-price' }]
            }
        });

        expect(lines).toEqual([]);
    });
});
