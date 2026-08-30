import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearGuestDeliveryAddress,
  normalizeGuestDeliveryAddress,
  readGuestDeliveryAddress,
  writeGuestDeliveryAddress
} from '../shared/model/storefrontGuestDeliveryAddressStorage.js';

const STORAGE_KEY = 'dgfy_store_guest_delivery_address_v1';

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
  return { storage, localStorage };
};

describe('guest delivery address storage (#1219)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a blank addressLine', () => {
    expect(normalizeGuestDeliveryAddress({ addressLine: '   ', latitude: 10.72, longitude: 122.56 })).toBeNull();
    expect(normalizeGuestDeliveryAddress(null)).toBeNull();
    expect(normalizeGuestDeliveryAddress({})).toBeNull();
  });

  it('normalizes non-finite coordinates to null rather than rejecting the record', () => {
    const normalized = normalizeGuestDeliveryAddress({ addressLine: 'Blue gate, Purok 3', latitude: 'abc', longitude: undefined });
    expect(normalized).toEqual({
      version: 1,
      addressLine: 'Blue gate, Purok 3',
      latitude: null,
      longitude: null,
      savedAt: normalized.savedAt
    });
  });

  it('round-trips a valid record through write/read', () => {
    installLocalStorage();
    const written = writeGuestDeliveryAddress({ addressLine: 'Blue gate, Purok 3', latitude: 10.72, longitude: 122.56 });
    expect(written.addressLine).toBe('Blue gate, Purok 3');
    const read = readGuestDeliveryAddress();
    expect(read).toEqual(written);
  });

  it('tolerates corrupt JSON already in storage', () => {
    const { storage } = installLocalStorage();
    storage.set(STORAGE_KEY, '{not-json');
    expect(readGuestDeliveryAddress()).toBeNull();
  });

  it('clear removes the stored record', () => {
    const { storage } = installLocalStorage();
    writeGuestDeliveryAddress({ addressLine: 'Blue gate, Purok 3', latitude: 10.72, longitude: 122.56 });
    clearGuestDeliveryAddress();
    expect(storage.has(STORAGE_KEY)).toBe(false);
    expect(readGuestDeliveryAddress()).toBeNull();
  });

  it('no-ops without window', () => {
    expect(readGuestDeliveryAddress()).toBeNull();
    expect(writeGuestDeliveryAddress({ addressLine: 'Blue gate, Purok 3' })).toBeNull();
    expect(() => clearGuestDeliveryAddress()).not.toThrow();
  });
});
