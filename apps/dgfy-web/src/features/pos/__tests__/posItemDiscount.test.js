import { describe, expect, it } from 'vitest';
import { calculatePosItemDiscounts } from '../utils/posItemDiscount.js';

describe('POS item discount calculations', () => {
  it('discounts only the selected item and leaves the global base for later', () => {
    const result = calculatePosItemDiscounts([
      { line_key: 'coffee', item_id: 1, quantity: 1, sale_price: 100, item_discount: { method: 'percentage', rate: 15 } },
      { line_key: 'cake', item_id: 2, quantity: 1, sale_price: 50 },
    ]);

    expect(result.discountAmount).toBe(15);
    expect(result.totalAmount).toBe(135);
    expect(result.lines[0].global_discount_base_amount).toBe(85);
    expect(result.lines[1].global_discount_base_amount).toBe(50);
  });
});
