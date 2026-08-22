import { describe, expect, it } from 'vitest';
import {
  buildDownpaymentRefundableNote,
  buildDownpaymentTotalsRows,
  buildPaymentModeStorePatch,
  isDownpaymentRequiredStore,
  resolveDownpaymentBalanceLabel,
  resolveDownpaymentDisplay
} from '../shared/model/storefrontDownpaymentPresentation.js';

describe('buildPaymentModeStorePatch', () => {
  it('patches through a downpayment_required catalog response', () => {
    expect(buildPaymentModeStorePatch({ payment_mode: 'downpayment_required' })).toEqual({ payment_mode: 'downpayment_required' });
  });

  it('defaults to full_payment when the field is missing, null, or the response itself is missing', () => {
    expect(buildPaymentModeStorePatch({ items: [] })).toEqual({ payment_mode: 'full_payment' });
    expect(buildPaymentModeStorePatch({ payment_mode: null })).toEqual({ payment_mode: 'full_payment' });
    expect(buildPaymentModeStorePatch(null)).toEqual({ payment_mode: 'full_payment' });
    expect(buildPaymentModeStorePatch(undefined)).toEqual({ payment_mode: 'full_payment' });
  });

  it('never passes through an unrecognized value verbatim', () => {
    expect(buildPaymentModeStorePatch({ payment_mode: 'customer_choice' })).toEqual({ payment_mode: 'full_payment' });
  });
});

describe('isDownpaymentRequiredStore', () => {
  it('is true only for payment_mode=downpayment_required', () => {
    expect(isDownpaymentRequiredStore({ payment_mode: 'downpayment_required' })).toBe(true);
    expect(isDownpaymentRequiredStore({ payment_mode: 'full_payment' })).toBe(false);
    expect(isDownpaymentRequiredStore({})).toBe(false);
    expect(isDownpaymentRequiredStore(null)).toBe(false);
  });
});

describe('resolveDownpaymentBalanceLabel', () => {
  it('uses delivery wording only for delivery orders', () => {
    expect(resolveDownpaymentBalanceLabel('delivery')).toBe('Balance due on delivery');
    expect(resolveDownpaymentBalanceLabel('pickup')).toBe('Balance due at pickup');
    expect(resolveDownpaymentBalanceLabel('dine_in')).toBe('Balance due at pickup');
  });
});

describe('resolveDownpaymentDisplay', () => {
  it('returns an inactive null-shape when nothing is passed', () => {
    expect(resolveDownpaymentDisplay()).toEqual({
      active: false,
      downpaymentAmount: null,
      balanceDueAmount: null,
      orderTotalAmount: null,
      refundable: null
    });
  });

  it('returns an inactive shape for a full_payment quote', () => {
    const display = resolveDownpaymentDisplay({
      quoteResult: { payment_mode: 'full_payment', downpayment_amount: null, balance_due_amount: null, downpayment_refundable: null }
    });
    expect(display.active).toBe(false);
  });

  it('reads the quote as the lowest-precedence active source', () => {
    const display = resolveDownpaymentDisplay({
      quoteResult: {
        payment_mode: 'downpayment_required',
        downpayment_amount: 101,
        balance_due_amount: 404,
        downpayment_refundable: true,
        total_amount: 505
      }
    });
    expect(display).toEqual({
      active: true,
      downpaymentAmount: 101,
      balanceDueAmount: 404,
      orderTotalAmount: 505,
      refundable: true
    });
  });

  it('reads the payment session over the quote', () => {
    const display = resolveDownpaymentDisplay({
      quoteResult: { payment_mode: 'downpayment_required', downpayment_amount: 999, balance_due_amount: 1, downpayment_refundable: true, total_amount: 1000 },
      paymentSession: {
        capture_kind: 'downpayment',
        total_amount: 101,
        order_total_amount: 505,
        balance_due_amount: 404,
        downpayment_refundable: false
      }
    });
    expect(display).toEqual({
      active: true,
      downpaymentAmount: 101,
      balanceDueAmount: 404,
      orderTotalAmount: 505,
      refundable: false
    });
  });

  it('a full-capture session is inactive even when a downpayment quote is also passed', () => {
    const display = resolveDownpaymentDisplay({
      quoteResult: { payment_mode: 'downpayment_required', downpayment_amount: 101, balance_due_amount: 404, total_amount: 505 },
      paymentSession: { capture_kind: 'full', total_amount: 505, order_total_amount: null, balance_due_amount: null, downpayment_refundable: null }
    });
    expect(display.active).toBe(false);
  });

  it('reads the order over the session and the quote (highest precedence)', () => {
    const display = resolveDownpaymentDisplay({
      quoteResult: { payment_mode: 'downpayment_required', downpayment_amount: 1, balance_due_amount: 1, total_amount: 2 },
      paymentSession: { capture_kind: 'downpayment', total_amount: 1, order_total_amount: 2, balance_due_amount: 1, downpayment_refundable: true },
      order: { payment_status: 'partially_paid', amount_paid: 101, balance_due: 404, total_amount: 505 }
    });
    expect(display).toEqual({
      active: true,
      downpaymentAmount: 101,
      balanceDueAmount: 404,
      orderTotalAmount: 505,
      refundable: null
    });
  });

  it('derives orderTotalAmount from amount_paid + balance_due when the order carries no total_amount', () => {
    const display = resolveDownpaymentDisplay({ order: { payment_status: 'partially_paid', amount_paid: 101, balance_due: 404 } });
    expect(display.orderTotalAmount).toBe(505);
  });

  it('an unpaid/full-payment order is inactive', () => {
    expect(resolveDownpaymentDisplay({ order: { payment_status: 'paid', amount_paid: null, balance_due: null } }).active).toBe(false);
    expect(resolveDownpaymentDisplay({ order: { payment_status: 'unpaid' } }).active).toBe(false);
  });
});

describe('buildDownpaymentTotalsRows', () => {
  const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

  it('returns [] when the display is inactive', () => {
    expect(buildDownpaymentTotalsRows({ display: { active: false }, money, orderMethod: 'delivery' })).toEqual([]);
    expect(buildDownpaymentTotalsRows({ display: null, money, orderMethod: 'delivery' })).toEqual([]);
  });

  it('returns [] when money is not a function (never throw on a missing formatter)', () => {
    expect(buildDownpaymentTotalsRows({ display: { active: true, downpaymentAmount: 101, balanceDueAmount: 404 }, orderMethod: 'delivery' })).toEqual([]);
  });

  it('builds the two rows with order-method-aware balance wording', () => {
    const display = { active: true, downpaymentAmount: 101, balanceDueAmount: 404, orderTotalAmount: 505, refundable: true };
    expect(buildDownpaymentTotalsRows({ display, money, orderMethod: 'delivery' })).toEqual([
      { label: 'Downpayment due now', value: 'PHP 101.00', emphasis: true },
      { label: 'Balance due on delivery', value: 'PHP 404.00' }
    ]);
    expect(buildDownpaymentTotalsRows({ display, money, orderMethod: 'pickup' })[1].label).toBe('Balance due at pickup');
  });
});

describe('buildDownpaymentRefundableNote', () => {
  it('returns null unless refundable is explicitly false', () => {
    expect(buildDownpaymentRefundableNote(true)).toBeNull();
    expect(buildDownpaymentRefundableNote(null)).toBeNull();
    expect(buildDownpaymentRefundableNote(undefined)).toBeNull();
  });

  it('returns a neutral note when refundable is false', () => {
    const note = buildDownpaymentRefundableNote(false);
    expect(typeof note).toBe('string');
    expect(note.length).toBeGreaterThan(0);
  });
});
