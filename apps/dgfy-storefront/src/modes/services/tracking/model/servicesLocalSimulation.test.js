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

  it('creates a local appointment simulation with the appointment profile', async () => {
    const record = createServicesLocalSimulation({
      routeSlug: 'local-appointment-business',
      selectedStore: { name: 'Local Appointment Business', slug: 'local-appointment-business' },
      serviceAppointmentAt: '2026-08-10T09:00:00',
      serviceBookingLine: {
        item_id: 77,
        name: 'Consultation',
        price: 500,
        category: 'service',
        service_detail: {
          service_category: 'consultation',
          service_area_type: 'in_store'
        }
      },
      serviceOrderMethod: 'appointment'
    });

    expect(record.local_simulation).toBe(true);
    expect(record.profile_key).toBe('appointment_at_business');
    expect(record.booking.start_at).toBe('2026-08-10T09:00:00');

    const adapterRequest = vi.fn();
    const payload = await serviceTrackingAdapter.fetch({
      mode: 'services',
      rawReference: record.tracking_pin,
      storeSlug: 'local-appointment-business'
    }, { requestJson: adapterRequest });

    expect(adapterRequest).not.toHaveBeenCalled();
    expect(payload.profile_key).toBe('appointment_at_business');
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

  it('keeps every service cart line available to tracking', async () => {
    const record = createServicesLocalSimulation({
      routeSlug: 'ralphs-ac-solutions',
      selectedStore: { name: "Ralph's AC Solutions", slug: 'ralphs-ac-solutions' },
      serviceCartLines: [
        { item_id: 101, name: 'Aircon Check-up', price: 1000, quantity: 1 },
        { item_id: 102, name: 'Aircon Cleaning · Split Type', price: 1200, quantity: 1 },
        { item_id: 103, name: 'Aircon Cleaning · Window Type', price: 1500, quantity: 1 },
        { item_id: 104, name: 'Repair Assessment', price: 1050, quantity: 1 }
      ],
      serviceOrderMethod: 'on_site'
    });

    const adapterRequest = vi.fn();
    const payload = await serviceTrackingAdapter.fetch({
      mode: 'services',
      rawReference: record.tracking_pin,
      storeSlug: 'ralphs-ac-solutions'
    }, { requestJson: adapterRequest });

    expect(adapterRequest).not.toHaveBeenCalled();
    expect(payload.items.map((item) => item.name)).toEqual([
      'Aircon Check-up',
      'Aircon Cleaning · Split Type',
      'Aircon Cleaning · Window Type',
      'Repair Assessment'
    ]);
    expect(payload.total_amount).toBe(4750);
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

  it('creates an on-site service simulation with the customer-address profile', () => {
    const record = createServicesLocalSimulation({
      customerAddress: 'Unit 4, Iloilo City',
      routeSlug: 'ralphs-ac-solutions',
      selectedStore: { name: "Ralph's AC Solutions", slug: 'ralphs-ac-solutions' },
      serviceAppointmentAt: '2026-08-20T10:00:00',
      serviceBookingLine: {
        item_id: 101,
        name: 'Aircon Check-up',
        price: 500,
        quantity: 1,
        service_detail: {
          service_category: 'Aircon service',
          service_area_type: 'customer_location'
        }
      },
      serviceOrderMethod: 'on_site'
    });

    expect(record.profile_key).toBe('service_at_customer_address');
    expect(record.booking.notes).toContain('Service address: Unit 4, Iloilo City');
    expect(record.booking.start_at).toBe('2026-08-20T10:00:00');
    expect(advanceServicesLocalSimulation('ralphs-ac-solutions', record.tracking_pin).status).toBe('confirmed');
  });
});
