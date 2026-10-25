import {
  buildOrderConfirmationBreakdownRows,
  formatOrderConfirmationMoney,
  formatOrderQuantity,
  formatOrderTime,
  resolveBalanceLabel,
  resolveFulfillmentLabel,
  VAT_DISCLOSURE_NOTE
} from '../src/templates/storefrontOrderConfirmationPresentation.js';

describe('storefront order confirmation presentation', () => {
  it.each([
    ['1.000000000000', '1'],
    [2, '2'],
    ['1.55', '1.55'],
    ['1.2', '1.20'],
    ['abc', '0'],
    [0, '0'],
    [null, '0'],
    [1.004, '1'],
    [0.5, '0.50'],
    [1.999, '2'],
    [-2, '0'],
    [Infinity, '0']
  ])('formats quantity %p as %s', (value, expected) => {
    expect(formatOrderQuantity(value)).toBe(expected);
  });

  it('formats money with en-PH grouping, two decimals, and a safe non-finite fallback', () => {
    expect(formatOrderConfirmationMoney(1250)).toBe('₱1,250.00');
    expect(formatOrderConfirmationMoney(12.345)).toBe('₱12.35');
    expect(formatOrderConfirmationMoney('NaN')).toBe('₱0.00');
    expect(formatOrderConfirmationMoney(Infinity)).toBe('₱0.00');
  });

  it('mirrors storefront breakdown rules using persisted values only', () => {
    const rows = buildOrderConfirmationBreakdownRows({
      subtotal_amount: 100,
      discount_amount: '10',
      discount_label_snapshot: 'Voucher',
      customer_processing_fee_amount: 3,
      customer_processing_fee_label_snapshot: '',
      service_fee_amount: 999,
      service_fee_label_snapshot: 'DGFY convenience fee',
      order_method: 'delivery',
      delivery_fee: 0,
      delivery_fee_waiver_label_snapshot: 'Free delivery',
      vat_amount: '10.71',
      total_amount: 93
    });

    expect(rows).toEqual([
      { label: 'Subtotal', amount: 100, kind: 'subtotal' },
      { label: 'Voucher', amount: '10', kind: 'discount' },
      { label: 'Item processing fee', amount: 3, kind: 'fee' },
      { label: 'Delivery Fee', amount: 0, kind: 'fee' },
      { label: 'VAT (included in item prices)', amount: '10.71', kind: 'informational' },
      { label: 'Total', amount: 93, kind: 'total' }
    ]);
    expect(VAT_DISCLOSURE_NOTE).toBe('VAT shown above is already included in item prices and is calculated before any promo or voucher discount.');
  });

  it('omits zero discount and fee rows, and delivery fee outside delivery orders', () => {
    const pickupRows = buildOrderConfirmationBreakdownRows({
      order_method: 'pickup',
      subtotal_amount: 25,
      discount_amount: 0,
      discount_label_snapshot: 'Hidden discount',
      customer_processing_fee_amount: 0,
      customer_processing_fee_label_snapshot: 'Hidden fee',
      delivery_fee: 10,
      vat_amount: null,
      total_amount: 25
    });

    expect(pickupRows.map(({ label }) => label)).toEqual(['Subtotal', 'Total']);
    expect(buildOrderConfirmationBreakdownRows({ order_method: 'delivery', delivery_fee: null })[1])
      .toEqual({ label: 'Delivery Fee', amount: null, kind: 'fee' });
  });

  it('uses Manila time and the storefront fulfillment and balance wording', () => {
    expect(formatOrderTime('2026-10-25T00:00:00.000Z')).toBe('Oct 25, 2026, 08:00 AM');
    expect(formatOrderTime('invalid')).toBe('');
    expect(resolveFulfillmentLabel('delivery')).toBe('Delivery');
    expect(resolveFulfillmentLabel('pickup')).toBe('Pickup');
    expect(resolveFulfillmentLabel('dine_in')).toBe('Dine In');
    expect(resolveBalanceLabel('delivery')).toBe('Balance due on delivery');
    expect(resolveBalanceLabel('pickup')).toBe('Balance due at pickup');
    expect(resolveBalanceLabel('dine_in')).toBe('Balance due at dine-in');
  });
});
