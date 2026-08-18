import { resolvePosItemDiscount } from '../src/modules/pos/domain/posItemDiscountPolicy.js';

const line = {
    item_id: 1,
    item_name: 'Coffee',
    quantity: 1,
    sale_price: 100,
    line_subtotal: 100,
    vat_type_snapshot: 'vatable',
    senior_pwd_discount_eligible: true
};

const rules = {
    senior: { id: 10, name: 'Senior Citizen', type: 'senior', rate: 20, is_active: true },
    manual: { id: 11, name: 'Other Discount', type: 'manual', rate: null, is_active: true }
};

describe('POS item discount policy', () => {
    test('resolves Other without requiring a customer name or reason', async () => {
        const result = await resolvePosItemDiscount({
            draft: { discount_type: 'manual', method: 'percentage', rate: 15 },
            itemId: 1,
            itemName: 'Coffee',
            preparedLine: line,
            findActiveRule: async (type) => rules[type]
        });

        expect(result).toMatchObject({
            type: 'item',
            discount_type: 'manual',
            label: 'Other Discount',
            method: 'percentage',
            rate: 15,
            reason: null
        });
    });

    test('resolves Senior only for the selected eligible item', async () => {
        const result = await resolvePosItemDiscount({
            draft: { discount_type: 'senior', customer_name: 'Juan', id_number: 'SC-1' },
            itemId: 1,
            itemName: 'Coffee',
            preparedLine: line,
            findActiveRule: async (type) => rules[type]
        });

        expect(result).toMatchObject({
            type: 'item',
            discount_type: 'senior',
            method: 'percentage',
            rate: 20
        });
        expect(result.lines).toEqual([{ item_id: 1, eligible_quantity: 1 }]);
    });
});
