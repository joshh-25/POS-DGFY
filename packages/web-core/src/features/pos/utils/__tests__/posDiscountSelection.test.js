import { describe, expect, it } from 'vitest';
import {
    buildDiscountItemSelection,
    getSelectableDiscountLines
} from '../posDiscountSelection.js';

describe('POS discount whole-unit selection', () => {
    it('excludes cart lines that do not contain a whole unit', () => {
        const cart = [
            { item_id: 1, line_key: 'fractional', quantity: 0.5 },
            { item_id: 2, line_key: 'whole', quantity: 1.5 }
        ];

        expect(getSelectableDiscountLines(cart, 'employee')).toEqual(cart);
        expect(buildDiscountItemSelection({ cart, type: 'employee' })).toEqual({
            eligible_item_ids: [2],
            eligible_items: [{ line_ref: 'whole', item_id: 2, eligible_quantity: 1 }]
        });
    });

    it('floors and clamps a requested quantity to available whole units', () => {
        const cart = [{ item_id: 3, line_key: 'mixed', quantity: 2.75 }];

        expect(buildDiscountItemSelection({
            cart,
            type: 'employee',
            draft: {
                eligible_items: [{ line_ref: 'mixed', item_id: 3, eligible_quantity: 9.5 }]
            }
        })).toEqual({
            eligible_item_ids: [3],
            eligible_items: [{ line_ref: 'mixed', item_id: 3, eligible_quantity: 2 }]
        });
    });
});
