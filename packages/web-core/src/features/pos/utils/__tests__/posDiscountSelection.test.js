import { describe, expect, it } from 'vitest';
import {
    buildDiscountAllocationTotals,
    buildDiscountItemSelection,
    getAvailableDiscountQuantity,
    isStatutoryBeneficiaryComplete,
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

describe('POS statutory beneficiary allocation', () => {
    it('limits the primary beneficiary to quantity not assigned to additional beneficiaries', () => {
        const totals = buildDiscountAllocationTotals([[
            { line_ref: 'line-1', item_id: 1, eligible_quantity: 1 }
        ]]);

        expect(getAvailableDiscountQuantity({
            allocationTotals: totals,
            lineRef: 'line-1',
            wholeCartQuantity: 2
        })).toBe(1);
    });

    it('allows a beneficiary to retain its own quantity while preventing combined over-allocation', () => {
        const totals = buildDiscountAllocationTotals([
            [{ line_ref: 'line-1', item_id: 1, eligible_quantity: 1 }],
            [{ line_ref: 'line-1', item_id: 1, eligible_quantity: 1 }]
        ]);

        expect(getAvailableDiscountQuantity({
            allocationTotals: totals,
            currentQuantity: 1,
            lineRef: 'line-1',
            wholeCartQuantity: 2
        })).toBe(1);
    });

    it('restores available quantity when an additional beneficiary allocation is removed', () => {
        const allocated = buildDiscountAllocationTotals([[
            { line_ref: 'line-1', item_id: 1, eligible_quantity: 1 }
        ]]);
        const afterRemoval = buildDiscountAllocationTotals([]);

        expect(getAvailableDiscountQuantity({ allocationTotals: allocated, lineRef: 'line-1', wholeCartQuantity: 2 })).toBe(1);
        expect(getAvailableDiscountQuantity({ allocationTotals: afterRemoval, lineRef: 'line-1', wholeCartQuantity: 2 })).toBe(2);
    });

    it('requires identity and an allocated quantity before another beneficiary can be added', () => {
        expect(isStatutoryBeneficiaryComplete({ name: 'Ana', id_number: 'SC-1', eligible_items: [] })).toBe(false);
        expect(isStatutoryBeneficiaryComplete({
            name: 'Ana',
            id_number: 'SC-1',
            eligible_items: [{ line_ref: 'line-1', item_id: 1, eligible_quantity: 1 }]
        })).toBe(true);
    });
});
