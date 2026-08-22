import { describe, expect, it } from 'vitest';
import { buildFnbCheckoutPayload } from '../checkout/buildFnbCheckoutPayload.js';

describe('buildFnbCheckoutPayload', () => {
  it('includes the normalized promo code in the storefront checkout payload', () => {
    const payload = buildFnbCheckoutPayload({
      selectedLocationId: 'branch-1',
      selectedStore: { slug: 'space-bar-2193ed', businessId: 'tenant-spacebar' },
      orderMethod: 'delivery',
      customerName: 'Bob Harris',
      customerPhone: '+639171234567',
      customerEmail: 'bob@example.com',
      isDeliveryOrder: true,
      deliveryAddress: 'Mandurriao, Iloilo City',
      customerPin: { latitude: 10.7, longitude: 122.5 },
      promoCode: ' save20 ',
      fnbScheduleMode: 'asap',
      fnbScheduledFor: '',
      fnbSpecialInstructions: 'No onions',
      cart: [
        {
          id: 'item-1',
          quantity: 2,
          price: 100,
          name: 'Americano'
        }
      ]
    });

    expect(payload.promo_code).toBe('SAVE20');
  });

  it('includes the normalized voucher code as a separate field from promo_code (#672)', () => {
    const payload = buildFnbCheckoutPayload({
      selectedLocationId: 'branch-1',
      selectedStore: { slug: 'space-bar-2193ed', businessId: 'tenant-spacebar' },
      orderMethod: 'delivery',
      customerName: 'Bob Harris',
      customerPhone: '+639171234567',
      customerEmail: 'bob@example.com',
      isDeliveryOrder: true,
      deliveryAddress: 'Mandurriao, Iloilo City',
      customerPin: { latitude: 10.7, longitude: 122.5 },
      promoCode: ' save20 ',
      voucherCode: ' fest2026 ',
      fnbScheduleMode: 'asap',
      fnbScheduledFor: '',
      fnbSpecialInstructions: '',
      cart: [{ item_id: 1, quantity: 2 }]
    });

    expect(payload.promo_code).toBe('SAVE20');
    expect(payload.voucher_code).toBe('FEST2026');
  });

  it('trims customer contact fields and retains readable address text for pickup orders', () => {
    const payload = buildFnbCheckoutPayload({
      selectedLocationId: 'branch-1',
      selectedStore: { slug: 'space-bar-2193ed', businessId: 'tenant-spacebar' },
      orderMethod: 'pickup',
      customerName: '  Bob Harris  ',
      customerPhone: '  +639171234567  ',
      customerEmail: '  bob@example.com  ',
      isDeliveryOrder: false,
      deliveryAddress: '  Main Branch, Iloilo City  ',
      customerPin: { latitude: 10.7, longitude: 122.5 },
      promoCode: '',
      fnbScheduleMode: 'asap',
      fnbScheduledFor: '',
      fnbSpecialInstructions: '',
      cart: [{ item_id: 1, quantity: 1 }]
    });

    expect(payload.customer_name).toBe('Bob Harris');
    expect(payload.customer_phone).toBe('+639171234567');
    expect(payload.customer_email).toBe('bob@example.com');
    expect(payload.delivery_address).toBe('Main Branch, Iloilo City');
    expect(payload.delivery_latitude).toBeNull();
    expect(payload.delivery_longitude).toBeNull();
  });

  it('includes a non-null scheduled_for when fnbScheduleMode is "schedule" and fnbScheduledFor is populated (MSME schedule-drop regression guard)', () => {
    const payload = buildFnbCheckoutPayload({
      selectedLocationId: 'branch-1',
      selectedStore: { slug: 'corner-store-9f21', businessId: 'tenant-cornerstore' },
      orderMethod: 'delivery',
      customerName: 'Ana Reyes',
      customerPhone: '+639181234567',
      customerEmail: 'ana@example.com',
      isDeliveryOrder: true,
      deliveryAddress: 'Jaro, Iloilo City',
      customerPin: { latitude: 10.72, longitude: 122.56 },
      promoCode: '',
      fnbScheduleMode: 'schedule',
      fnbScheduledFor: '2026-08-01T10:30',
      fnbSpecialInstructions: '',
      cart: [{ item_id: 2, quantity: 1, price: 250, name: 'Rice Bundle' }]
    });

    expect(payload.scheduled_for).not.toBeNull();
    expect(payload.scheduled_for).toBe(new Date('2026-08-01T10:30').toISOString());
  });

  it('keeps scheduled_for null when fnbScheduleMode is "asap" even if a stale fnbScheduledFor value is present', () => {
    const payload = buildFnbCheckoutPayload({
      selectedLocationId: 'branch-1',
      selectedStore: { slug: 'corner-store-9f21', businessId: 'tenant-cornerstore' },
      orderMethod: 'pickup',
      customerName: 'Ana Reyes',
      customerPhone: '+639181234567',
      customerEmail: 'ana@example.com',
      isDeliveryOrder: false,
      deliveryAddress: 'Jaro, Iloilo City',
      customerPin: { latitude: 10.72, longitude: 122.56 },
      promoCode: '',
      fnbScheduleMode: 'asap',
      fnbScheduledFor: '2026-08-01T10:30',
      fnbSpecialInstructions: '',
      cart: [{ item_id: 2, quantity: 1, price: 250, name: 'Rice Bundle' }]
    });

    expect(payload.scheduled_for).toBeNull();
  });

  // Phase 150 (#866).
  it('defaults payment_election to "full" when omitted -- every pre-#866 caller is unaffected', () => {
    const payload = buildFnbCheckoutPayload({
      selectedLocationId: 'branch-1',
      selectedStore: { slug: 'space-bar-2193ed' },
      orderMethod: 'pickup',
      cart: [{ item_id: 1, quantity: 1 }]
    });
    expect(payload.payment_election).toBe('full');
  });

  it('passes payment_election through as "downpayment" when the customer elected it, "full" for a garbage value', () => {
    const base = {
      selectedLocationId: 'branch-1',
      selectedStore: { slug: 'space-bar-2193ed' },
      orderMethod: 'pickup',
      cart: [{ item_id: 1, quantity: 1 }]
    };
    expect(buildFnbCheckoutPayload({ ...base, paymentElection: 'downpayment' }).payment_election).toBe('downpayment');
    expect(buildFnbCheckoutPayload({ ...base, paymentElection: 'not_a_real_choice' }).payment_election).toBe('full');
  });
});
