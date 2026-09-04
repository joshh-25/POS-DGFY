import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearGuestCheckoutDraft,
  normalizeGuestCheckoutDraft,
  readGuestCheckoutDraft,
  STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY,
  writeGuestCheckoutDraft
} from '../checkout/guestCheckoutDraft.js';

const installSessionStorage = () => {
  const storage = new Map();
  const sessionStorage = {
    getItem: vi.fn((key) => storage.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      storage.set(key, String(value));
    }),
    removeItem: vi.fn((key) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    })
  };
  vi.stubGlobal('window', { sessionStorage });
  return { storage, sessionStorage };
};

describe('guest checkout draft storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects missing slugs and empty carts', () => {
    expect(normalizeGuestCheckoutDraft({ routeSlug: '', cart: [{ item_id: 1, quantity: 1 }] })).toBeNull();
    expect(normalizeGuestCheckoutDraft({ routeSlug: 'demo', cart: [] })).toBeNull();
    expect(normalizeGuestCheckoutDraft({
      routeSlug: 'demo',
      cart: [{ item_id: 0, quantity: 1 }, { item_id: 1, quantity: 0 }]
    })).toBeNull();
  });

  it('sanitizes invalid payment types back to cash', () => {
    const draft = normalizeGuestCheckoutDraft({
      routeSlug: 'Demo-Store',
      cart: [{ item_id: 1, quantity: 2 }],
      paymentType: 'online'
    });

    expect(draft).toMatchObject({
      routeSlug: 'demo-store',
      paymentType: 'cash'
    });
  });

  // #613: grab_pay/shopeepay are live storefront online rails
  // (storefrontCheckoutPaymentOptions.js) but were missing from this module's own allow-list,
  // so a restored draft with either selected silently coerced back to 'cash'.
  it.each(['grab_pay', 'shopeepay'])('preserves %s as a valid restored payment type', (paymentType) => {
    const draft = normalizeGuestCheckoutDraft({
      routeSlug: 'demo-store',
      cart: [{ item_id: 1, quantity: 2 }],
      paymentType
    });

    expect(draft).toMatchObject({ paymentType });
  });

  it('reads only matching store drafts and clears successful writes', () => {
    const { storage, sessionStorage } = installSessionStorage();

    const written = writeGuestCheckoutDraft({
      routeSlug: 'demo',
      cart: [{ item_id: 10, quantity: 1 }],
      customerFirstName: 'Ana',
      customerPhone: '09170000000',
      paymentType: 'gcash'
    });

    expect(written).toMatchObject({
      routeSlug: 'demo',
      paymentType: 'gcash',
      customerFirstName: 'Ana'
    });
    expect(storage.has(STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY)).toBe(true);
    expect(readGuestCheckoutDraft('other')).toBeNull();
    expect(readGuestCheckoutDraft('demo')).toMatchObject({
      routeSlug: 'demo',
      paymentType: 'gcash',
      cart: [{ item_id: 10, quantity: 1 }]
    });

    clearGuestCheckoutDraft();
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY);
    expect(storage.has(STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY)).toBe(false);
  });
});
