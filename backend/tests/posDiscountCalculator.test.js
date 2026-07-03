import { calculatePosDiscount } from '../src/modules/pos/domain/posDiscountCalculator.js';

describe('POS governed discount calculator', () => {
  test('removes VAT and applies 20% only to eligible Senior lines', () => {
    const result = calculatePosDiscount({
      lines: [
        { item_id: 1, quantity: 1, sale_price: 112, vat_type: 'vatable', senior_pwd_discount_eligible: true },
        { item_id: 2, quantity: 1, sale_price: 112, vat_type: 'vatable', senior_pwd_discount_eligible: false }
      ],
      application: { type: 'senior', lines: [] }
    });
    expect(result.subtotal_amount).toBe(224);
    expect(result.vat_removed).toBe(12);
    expect(result.vat_exempt_amount).toBe(100);
    expect(result.discount_amount).toBe(20);
    expect(result.total_amount).toBe(192);
    expect(result.lines[1].discount_amount).toBe(0);
  });

  test('supports an eligible quantity review', () => {
    const result = calculatePosDiscount({
      lines: [{ item_id: 1, quantity: 2, sale_price: 112, vat_type: 'vatable', senior_pwd_discount_eligible: true }],
      application: { type: 'pwd', lines: [{ item_id: 1, eligible_quantity: 1 }] }
    });
    expect(result.vat_removed).toBe(12);
    expect(result.discount_amount).toBe(20);
    expect(result.total_amount).toBe(192);
  });
});
