import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildStorefrontCartStorageKey,
  clearStorefrontCartSnapshot,
  normalizeStorefrontCartLine,
  normalizeStorefrontCartSnapshot,
  readStorefrontCartSnapshot,
  STOREFRONT_CART_STORAGE_TTL_MS,
  writeStorefrontCartSnapshot
} from '../shared/model/storefrontCartStorage.js';

const installLocalStorage = () => {
  const storage = new Map();
  const localStorage = {
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
  vi.stubGlobal('window', { localStorage });
  return { localStorage, storage };
};

describe('storefront cart storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds store-scoped keys', () => {
    expect(buildStorefrontCartStorageKey('Kusina-Caf-E36B28')).toBe('dgfy_storefront_cart_v1:kusina-caf-e36b28');
    expect(buildStorefrontCartStorageKey('')).toBe('');
  });

  it('normalizes valid cart lines and rejects empty quantities', () => {
    expect(normalizeStorefrontCartLine({
      item_id: 12,
      name: 'Inasal',
      quantity: 2,
      price: '120',
      line_modifiers: [{ modifier_group_id: 1, modifier_option_id: 2, option_name: 'Extra rice', price_delta: '15', quantity: 3 }]
    })).toMatchObject({
      item_id: 12,
      cart_line_id: '12:default',
      name: 'Inasal',
      quantity: 2,
      price: 120,
      line_modifiers: [{ modifier_group_id: 1, modifier_option_id: 2, option_name: 'Extra rice', price_delta: 15, quantity: 3 }]
    });
    expect(normalizeStorefrontCartLine({ item_id: 12, quantity: 0 })).toBeNull();
  });

  it('preserves optimized cart thumbnails while remaining compatible with legacy image URLs', () => {
    expect(normalizeStorefrontCartLine({
      item_id: 12,
      quantity: 1,
      image_url: '/uploads/optimized/catalog/item-large.webp',
      thumbnail_url: '/uploads/optimized/catalog/item-thumbnail.webp',
      image_variants: {
        thumbnail_url: '/uploads/optimized/catalog/item-thumbnail.webp',
        medium_url: '/uploads/optimized/catalog/item-medium.webp',
        large_url: '/uploads/optimized/catalog/item-large.webp',
        placeholder_url: '/uploads/optimized/catalog/placeholder.webp',
        avif: {
          thumbnail_url: '/uploads/optimized/catalog/item-thumbnail.avif',
          medium_url: '/uploads/optimized/catalog/item-medium.avif',
          large_url: '/uploads/optimized/catalog/item-large.avif'
        },
        webp: {
          thumbnail_url: '/uploads/optimized/catalog/item-thumbnail.webp',
          medium_url: '/uploads/optimized/catalog/item-medium.webp',
          large_url: '/uploads/optimized/catalog/item-large.webp'
        },
        version: 2
      }
    })).toMatchObject({
      image_url: '/uploads/optimized/catalog/item-large.webp',
      thumbnail_url: '/uploads/optimized/catalog/item-thumbnail.webp',
      image_variants: {
        placeholder_url: '/uploads/optimized/catalog/placeholder.webp',
        avif: {
          thumbnail_url: '/uploads/optimized/catalog/item-thumbnail.avif'
        },
        webp: {
          thumbnail_url: '/uploads/optimized/catalog/item-thumbnail.webp'
        },
        version: 2
      }
    });

    expect(normalizeStorefrontCartLine({
      item_id: 13,
      quantity: 1,
      image_url: '/uploads/catalog/legacy-item.png'
    })).toMatchObject({
      image_url: '/uploads/catalog/legacy-item.png',
      thumbnail_url: '/uploads/catalog/legacy-item.png'
    });

    expect(normalizeStorefrontCartLine({
      item_id: 14,
      quantity: 1,
      image_variants: { avif: 'invalid', arbitrary_payload: { ignored: true } }
    })).toMatchObject({ image_variants: null });
  });

  it('rejects expired, cross-store, and cross-mode snapshots', () => {
    const now = Date.now();
    expect(normalizeStorefrontCartSnapshot({
      storeSlug: 'kusina',
      mode: 'fnb',
      cart: [{ item_id: 1, quantity: 1 }],
      savedAt: now - (STOREFRONT_CART_STORAGE_TTL_MS + 1),
      expiresAt: now - 1
    }, { storeSlug: 'kusina', mode: 'fnb', now })).toBeNull();
    expect(normalizeStorefrontCartSnapshot({
      storeSlug: 'other',
      mode: 'fnb',
      cart: [{ item_id: 1, quantity: 1 }],
      savedAt: now,
      expiresAt: now + 1000
    }, { storeSlug: 'kusina', mode: 'fnb', now })).toBeNull();
    expect(normalizeStorefrontCartSnapshot({
      storeSlug: 'kusina',
      mode: 'simple',
      cart: [{ item_id: 1, quantity: 1 }],
      savedAt: now,
      expiresAt: now + 1000
    }, { storeSlug: 'kusina', mode: 'fnb', now })).toBeNull();
  });

  it('writes, reads, and clears a valid cart snapshot', () => {
    const { localStorage, storage } = installLocalStorage();
    const written = writeStorefrontCartSnapshot({
      storeSlug: 'Kusina',
      mode: 'fnb',
      cart: [{ item_id: 10, cart_line_id: '10:default', name: 'Americano', quantity: 1, price: 110 }]
    });

    expect(written).toMatchObject({
      storeSlug: 'kusina',
      mode: 'fnb',
      cart: [{ item_id: 10, name: 'Americano', quantity: 1, price: 110 }]
    });
    expect(storage.has(buildStorefrontCartStorageKey('kusina'))).toBe(true);
    expect(readStorefrontCartSnapshot('kusina', { mode: 'fnb' })).toMatchObject({
      storeSlug: 'kusina',
      mode: 'fnb',
      cart: [{ item_id: 10, name: 'Americano' }]
    });

    clearStorefrontCartSnapshot('kusina');
    expect(localStorage.removeItem).toHaveBeenCalledWith(buildStorefrontCartStorageKey('kusina'));
    expect(storage.has(buildStorefrontCartStorageKey('kusina'))).toBe(false);
  });

  it('preserves services booking cart fields for refresh restore', () => {
    installLocalStorage();
    const written = writeStorefrontCartSnapshot({
      storeSlug: 'abeezee-bb983b',
      mode: 'services',
      cart: [{
        item_id: 22,
        cart_line_id: 'service-line-22',
        name: 'Deep cleaning',
        category: 'service',
        quantity: 1,
        price: 500,
        service_detail: { duration_minutes: 90 },
        serviceAreaLabel: 'Iloilo City',
        durationLabel: '1 hr 30 min',
        service_notes: 'Bring own supplies',
        service_schedule_at: '2026-07-22T09:00:00.000Z',
        payment_timing: 'after_service',
        intake_responses: { rooms: '2' }
      }]
    });

    expect(written).toMatchObject({
      storeSlug: 'abeezee-bb983b',
      mode: 'services',
      cart: [{
        item_id: 22,
        cart_line_id: 'service-line-22',
        category: 'service',
        service_detail: { duration_minutes: 90 },
        serviceAreaLabel: 'Iloilo City',
        durationLabel: '1 hr 30 min',
        service_notes: 'Bring own supplies',
        service_schedule_at: '2026-07-22T09:00:00.000Z',
        payment_timing: 'after_service',
        intake_responses: { rooms: '2' }
      }]
    });
    expect(readStorefrontCartSnapshot('abeezee-bb983b', { mode: 'services' })).toMatchObject({
      cart: [{ category: 'service', serviceAreaLabel: 'Iloilo City' }]
    });
    expect(readStorefrontCartSnapshot('abeezee-bb983b', { mode: 'fnb' })).toBeNull();
  });
});
