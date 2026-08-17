import { describe, expect, it } from 'vitest';

import {
  getSimpleCompletedTrackingLabel,
  getSimpleTrackingFlowForOrderMethod,
  simpleTrackingAdapter
} from '../modes/simple/tracking/model/simpleTrackingAdapter.js';

describe('Simple tracking adapter', () => {
  it('handles only Simple tracking inputs', () => {
    expect(simpleTrackingAdapter.canHandle({ mode: 'simple', rawReference: 'SK-AB12CD', storeSlug: 'small-shop' })).toBe(true);
    expect(simpleTrackingAdapter.canHandle({ mode: 'fnb', rawReference: 'SK-AB12CD', storeSlug: 'small-shop' })).toBe(false);
    expect(simpleTrackingAdapter.canHandle({ mode: 'simple', rawReference: 'ORDER-AB12', storeSlug: 'small-shop' })).toBe(false);
  });

  it('normalizes product order details, promo deductions, and delivery state', () => {
    const normalized = simpleTrackingAdapter.normalize({
      data: {
        tracking_pin: 'SK-AB12CD',
        status: 'out_for_delivery',
        status_label: 'Out for delivery',
        order_method: 'delivery',
        subtotal_amount: 120,
        discount_amount: 10,
        discount_label: 'WELCOME10',
        delivery_fee: 20,
        total_amount: 130,
        order: {
          items: [{ item_id: 42, name: 'Canvas Tote', quantity: 2, line_subtotal: 120 }],
          delivery_address: 'Jaro, Iloilo City'
        },
        location: { name: 'Simple Store', full_address: 'Iloilo City' }
      }
    });

    expect(normalized).toMatchObject({
      mode: 'simple',
      reference: 'SK-AB12CD',
      statusCode: 'out_for_delivery',
      orderMethod: 'delivery',
      subtotalAmount: 120,
      discountAmount: 10,
      discountLabel: 'WELCOME10',
      deliveryFee: 20,
      totalAmount: 130,
      branchName: 'Simple Store',
      deliveryAddress: 'Jaro, Iloilo City'
    });
    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]).toMatchObject({ name: 'Canvas Tote', qty: 2, amount: 120 });
  });

  it('uses product order terminology for pickup and delivery flows', () => {
    expect(getSimpleTrackingFlowForOrderMethod('pickup').at(-1)).toEqual({ id: 'completed', label: 'Picked up' });
    expect(getSimpleTrackingFlowForOrderMethod('delivery').at(-1)).toEqual({ id: 'completed', label: 'Delivered' });
    expect(getSimpleCompletedTrackingLabel('pickup')).toBe('Picked up');
    expect(getSimpleCompletedTrackingLabel('delivery')).toBe('Delivered');
  });
});
