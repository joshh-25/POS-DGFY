import { describe, expect, it, vi } from 'vitest';
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeSessionStorageGet,
  safeSessionStorageRemove,
  safeSessionStorageSet,
  readStoredCashierResumeContext,
  writeStoredCashierResumeContext
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

  it('persists only non-secret shift coordinates for same-tab resume after refresh', () => {
    const storage = createStorage();
    expect(writeStoredCashierResumeContext({
      shiftId: 81,
      cashierId: 12,
      terminalId: 'counter-02',
      locationId: 9,
      tenantId: 'tenant-42',
      cashierEmail: 'cashier@example.com',
      companyToken: 'must-not-persist',
      password: 'must-not-persist',
      shiftSnapshot: { cashSummary: { expected: 1234.5 } }
    }, { storage })).toBe(true);

    const serialized = storage.getItem('pos_cashier_resume_context_v1');
    expect(JSON.parse(serialized)).toEqual({
      version: 1,
      shiftId: 81,
      cashierId: 12,
      terminalId: 'COUNTER-02',
      locationId: 9,
      tenantId: 'tenant-42'
    });
    expect(serialized).not.toContain('cashier@example.com');
    expect(serialized).not.toContain('must-not-persist');
    expect(serialized).not.toContain('1234.5');
    expect(readStoredCashierResumeContext({ storage })).toEqual({
      version: 1,
      shiftId: 81,
      cashierId: 12,
      terminalId: 'COUNTER-02',
      locationId: 9,
      tenantId: 'tenant-42'
    });
  });

  it('removes malformed or incomplete cashier resume context instead of trusting it', () => {
    const storage = createStorage();
    storage.setItem('pos_cashier_resume_context_v1', '{invalid');
    expect(readStoredCashierResumeContext({ storage })).toBeNull();
    expect(storage.getItem('pos_cashier_resume_context_v1')).toBeNull();

    expect(writeStoredCashierResumeContext({ shiftId: 0 }, { storage })).toBe(false);
    expect(storage.getItem('pos_cashier_resume_context_v1')).toBeNull();
  });

  it('handles unavailable session storage without throwing', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      removeItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); })
    };

    expect(safeSessionStorageGet('key', { storage })).toBeNull();
    expect(safeSessionStorageRemove('key', { storage })).toBe(false);
    expect(safeSessionStorageSet('key', 'value', { storage })).toBe(false);
    expect(readStoredCashierResumeContext({ storage })).toBeNull();
    expect(writeStoredCashierResumeContext({ shiftId: 1 }, { storage })).toBe(false);
  });
});
