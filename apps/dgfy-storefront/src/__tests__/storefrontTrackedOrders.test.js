import { describe, expect, it } from 'vitest';

import { normalizeTrackedOrderEntry } from '../tracking/storage.js';
import { mapAccountActivityToTrackedOrderEntry } from '../tracking/accountActivity.js';

describe('storefront tracked order normalization', () => {
  it('preserves detailed item rows when normalizing tracked order entries', () => {
    const normalized = normalizeTrackedOrderEntry({
      tracking_pin: 'sk-abcd12',
      status: 'placed',
      subtotal_amount: 250,
      delivery_fee: 20,
      total_amount: 270,
      items: [
        { item_id: 10, item_name: 'Burger', quantity: 2, line_subtotal: 250 }
      ]
    });

    expect(normalized).toMatchObject({
      tracking_pin: 'SK-ABCD12',
      subtotal: 250,
      delivery_fee: 20,
      total_amount: 270,
      items: [
        { item_id: 10, name: 'Burger', qty: 2, amount: 250 }
      ]
    });
  });

  it('maps account activity display lines into drawer-ready tracked order items', () => {
    const mapped = mapAccountActivityToTrackedOrderEntry({
      reference: 'SK-ORDER01',
      status: 'preparing',
      total_amount: 111.1,
      store_name: 'Space Bar',
      display: {
        order_method: 'pickup',
        lines: [
          { item_id: 1, name: 'Latte', quantity: 1, price: 65 },
          { item_id: 2, name: 'Donut', quantity: 2, price: 23.05 }
        ]
      }
    });

    expect(mapped).toMatchObject({
      tracking_pin: 'SK-ORDER01',
      item_count: 2,
      items: [
        { item_id: 1, name: 'Latte', qty: 1, amount: 65 },
        { item_id: 2, name: 'Donut', qty: 2, amount: 46.1 }
      ]
    });
  });

  it('falls back to activity items and preserves service fee data for tracked account orders', () => {
    const mapped = mapAccountActivityToTrackedOrderEntry({
      reference: 'SK-ORDER02',
      status: 'confirmed',
      total_amount: 111.1,
      subtotal_amount: 110,
      service_fee_amount: 1.1,
      delivery_address: 'Atria Park District, Mandurriao, Iloilo City',
      items: [
        { item_id: 9, item_name: 'Americano', qty: 1, line_subtotal: 110 }
      ]
    });

    expect(mapped).toMatchObject({
      tracking_pin: 'SK-ORDER02',
      subtotal: 110,
      service_fee: 1.1,
      delivery_address: 'Atria Park District, Mandurriao, Iloilo City',
      items: [
        { item_id: 9, name: 'Americano', qty: 1, amount: 110 }
      ]
    });
  });
});
