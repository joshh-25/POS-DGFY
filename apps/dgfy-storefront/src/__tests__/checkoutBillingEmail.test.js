import { describe, expect, it } from 'vitest';

import {
  hasPrimaryContact,
  isValidCheckoutEmail,
  requiresBillingEmail
} from '../checkout/checkoutValidation.js';
import { isValidFnbCheckoutEmail } from '../modes/fnb/checkout/model/fnbCheckoutCustomerValidation.js';

// #963: PayMongo rejects a card payment_methods create without a billing email and surfaces its own
// "billing email required" to the customer. These helpers are the gate that stops that reaching them.
describe('checkout billing email requirement', () => {
  it('accepts a well-formed address and rejects the near-misses', () => {
    expect(isValidCheckoutEmail('customer@example.com')).toBe(true);
    expect(isValidCheckoutEmail('  customer@example.com  ')).toBe(true);
    expect(isValidCheckoutEmail('')).toBe(false);
    expect(isValidCheckoutEmail(null)).toBe(false);
    expect(isValidCheckoutEmail('customer@example')).toBe(false);
    expect(isValidCheckoutEmail('customer example.com')).toBe(false);
    expect(isValidCheckoutEmail('@example.com')).toBe(false);
  });

  it('shares one regex with F&B so the two cannot drift apart', () => {
    expect(isValidFnbCheckoutEmail).toBe(isValidCheckoutEmail);
  });

  it('requires an email for card and only for card', () => {
    expect(requiresBillingEmail({ paymentType: 'card', customerEmail: '' })).toBe(true);
    expect(requiresBillingEmail({ paymentType: 'card', customerEmail: 'not-an-email' })).toBe(true);
    expect(requiresBillingEmail({ paymentType: 'card', customerEmail: 'customer@example.com' })).toBe(false);

    // The direct-wallet and QR rails already receive real billing values and PayMongo does not
    // demand an email for them -- gating those would add friction for no defect.
    for (const paymentType of ['cash', 'qrph', 'gcash', 'maya', 'grab_pay', 'shopeepay']) {
      expect(requiresBillingEmail({ paymentType, customerEmail: '' })).toBe(false);
    }
  });

  it('closes the gap hasPrimaryContact leaves open for a phone-only signed-in customer', () => {
    const phoneOnly = { phone: '09171234567', email: '' };

    // The contact step is satisfied -- this is the state that reached PayMongo and failed.
    expect(hasPrimaryContact(phoneOnly)).toBe(true);
    expect(requiresBillingEmail({ paymentType: 'card', customerEmail: phoneOnly.email })).toBe(true);
  });

  it('defaults to no requirement when called with nothing', () => {
    expect(requiresBillingEmail()).toBe(false);
    expect(requiresBillingEmail({})).toBe(false);
  });
});
