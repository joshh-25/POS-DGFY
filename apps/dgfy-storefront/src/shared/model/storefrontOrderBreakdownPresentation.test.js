import { describe, expect, it } from 'vitest';
import { buildStorefrontOrderBreakdownRows } from './storefrontOrderBreakdownPresentation.js';

const money = (value) => `₱${Number(value).toFixed(2)}`;

describe('buildStorefrontOrderBreakdownRows', () => {
  it('uses one canonical delivery breakdown order without recomputing amounts', () => {
    const rows = buildStorefrontOrderBreakdownRows({
      discountRows: [{ label: 'Weekend promo', value: '- ₱10.00' }],
      money,
      orderMethod: 'delivery',
      totals: {
        subtotal_amount: 100,
        delivery_fee: 20,
        service_fee_amount: 1,
        service_fee_label: 'DGFY convenience fee',
        vat_amount: 10.71,
        total_amount: 111,
      },
    });

    expect(rows.map(({ label }) => label)).toEqual([
      'Subtotal',
      'Weekend promo',
      'Delivery fee',
      'DGFY convenience fee',
      'VAT (included in item prices)',
      'Total',
    ]);
    expect(rows.map(({ value }) => value)).toEqual([
      '₱100.00',
      '- ₱10.00',
      '₱20.00',
      '₱1.00',
      '₱10.71',
      '₱111.00',
    ]);
    expect(rows.at(-1)).toMatchObject({ emphasis: true, borderTop: true });
  });

  it('omits delivery fees for pickup and omits a zero convenience fee', () => {
    const rows = buildStorefrontOrderBreakdownRows({
      money,
      orderMethod: 'pickup',
      totals: {
        subtotal_amount: 100,
        delivery_fee: 0,
        service_fee_amount: 0,
        vat_amount: 0,
        total_amount: 100,
      },
    });

    expect(rows.map(({ label }) => label)).toEqual([
      'Subtotal',
      'VAT (included in item prices)',
      'Total',
    ]);
  });

  it('uses the canonical convenience-fee label when the saved label is absent', () => {
    const rows = buildStorefrontOrderBreakdownRows({
      money,
      orderMethod: 'dine-in',
      totals: { service_fee_amount: 1, total_amount: 1 },
    });

    expect(rows.map(({ label }) => label)).toEqual(['DGFY convenience fee', 'Total']);
  });
});
