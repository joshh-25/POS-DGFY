import { describe, expect, it, vi } from 'vitest';
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet
} from '../posTerminalStorage.js';

const createStorage = () => {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return Array.from(values.keys())[index] || null;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
};

describe('POS terminal storage', () => {
  it('recovers from a quota error by clearing only non-critical preferences', () => {
    const storage = createStorage();
    storage.setItem('pos_terminal_last_view_v1:company:user:terminal', 'checkout');
    storage.setItem('pos_split_payment_session:terminal', '{"session_id":12}');

    const originalSetItem = storage.setItem.bind(storage);
    let firstReasonWrite = true;
    storage.setItem = vi.fn((key, value) => {
      if (key === 'pos_terminal_lock_reason_v1' && firstReasonWrite) {
        firstReasonWrite = false;
        throw { code: 22, name: 'QuotaExceededError' };
      }
      originalSetItem(key, value);
    });

    expect(safeLocalStorageSet('pos_terminal_lock_reason_v1', 'shift_start_required', { storage })).toBe(true);
    expect(storage.getItem('pos_terminal_last_view_v1:company:user:terminal')).toBeNull();
    expect(storage.getItem('pos_split_payment_session:terminal')).toBe('{"session_id":12}');
    expect(storage.getItem('pos_terminal_lock_reason_v1')).toBe('shift_start_required');
  });

  it('does not throw when browser storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      removeItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
      key: vi.fn(() => null),
      length: 0
    };

    expect(safeLocalStorageGet('key', { storage })).toBeNull();
    expect(safeLocalStorageRemove('key', { storage })).toBe(false);
    expect(safeLocalStorageSet('key', 'value', { storage })).toBe(false);
  });
});
