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

  it('normalizes customer contact values before checkout submission', () => {
    const payload = buildFnbCheckoutPayload({
      customerName: '  Bob Harris  ',
      customerPhone: '  +639171234567  ',
      customerEmail: '  bob@example.com  ',
      cart: []
    });

    expect(payload.customer_name).toBe('Bob Harris');
    expect(payload.customer_phone).toBe('+639171234567');
    expect(payload.customer_email).toBe('bob@example.com');
  });
});
