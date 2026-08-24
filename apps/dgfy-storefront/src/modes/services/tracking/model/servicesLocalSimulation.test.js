/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advanceServicesLocalSimulation,
  createServicesLocalSimulation,
  readServicesLocalSimulation
} from './servicesLocalSimulation.js';
import { serviceTrackingAdapter } from './serviceTrackingAdapter.js';

describe('Services local planned-flow simulation', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores and advances a pickup-and-return timeline without an API request', async () => {
    const record = createServicesLocalSimulation({
      customerAddress: 'Iloilo City',
      routeSlug: 'ralphs-laundry',
      selectedStore: { name: "Ralph's Laundry", slug: 'ralphs-laundry' },
      serviceBookingLine: { image_url: '/uploads/storefront-assets/wash-fold.webp', item_id: 42, name: 'Wash, Dry & Fold', price: 300, quantity: 1 },
      serviceOrderMethod: 'delivery'
    });

    expect(record.local_simulation).toBe(true);
    expect(record.profile_key).toBe('item_pickup_return');
    expect(record.status).toBe('requested');

    const adapterRequest = vi.fn();
    const payload = await serviceTrackingAdapter.fetch({
      mode: 'services',
      rawReference: record.tracking_pin,
      storeSlug: 'ralphs-laundry'
    }, { requestJson: adapterRequest });
    expect(adapterRequest).not.toHaveBeenCalled();
    expect(payload.tracking_pin).toBe(record.tracking_pin);
    expect(payload.booking.service_item_id).toBe(42);
    expect(payload.items[0].image_url).toBe('/uploads/storefront-assets/wash-fold.webp');
    const normalized = serviceTrackingAdapter.normalize(payload);
    expect(normalized.serviceItemId).toBe(42);
    expect(normalized.items[0].image_url).toBe('/uploads/storefront-assets/wash-fold.webp');

    const advanced = advanceServicesLocalSimulation('ralphs-laundry', record.tracking_pin);
    expect(advanced.status).toBe('for_pickup');
    expect(readServicesLocalSimulation('ralphs-laundry', record.tracking_pin).status).toBe('for_pickup');
  });

  it('creates a quote request with no simulated amount and the quote profile', () => {
    const record = createServicesLocalSimulation({
      routeSlug: 'ralphs-laundry',
      selectedStore: { slug: 'ralphs-laundry' },
      serviceBookingLine: { item_id: 99, name: 'Custom repair assessment', price: 500, quantity: 1 },
      serviceOrderMethod: 'quote'
    });

    expect(record.profile_key).toBe('quote_request');
    expect(record.total_amount).toBeNull();
    expect(record.booking.total_amount).toBeNull();
  });
});
