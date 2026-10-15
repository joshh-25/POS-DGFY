import { describe, expect, it, vi } from 'vitest';
import {
  installCrossAppSettingsRefresh,
  installPosFocusSettingsRefresh
} from '../businessAdminSettingsSync.js';

const createFakeWindow = () => {
  const listeners = new Map();
  const documentListeners = new Map();
  const on = (store) => (event, handler) => {
    store.set(event, [...(store.get(event) || []), handler]);
  };
  const off = (store) => (event, handler) => {
    store.set(event, (store.get(event) || []).filter((candidate) => candidate !== handler));
  };
  return {
    document: {
      visibilityState: 'visible',
      addEventListener: vi.fn(on(documentListeners)),
      removeEventListener: vi.fn(off(documentListeners)),
      emit: (event, ...args) => {
        for (const handler of documentListeners.get(event) || []) handler(...args);
      }
    },
    addEventListener: vi.fn(on(listeners)),
    removeEventListener: vi.fn(off(listeners)),
    emit: (event, ...args) => {
      for (const handler of listeners.get(event) || []) handler(...args);
    }
  };
};

describe('installCrossAppSettingsRefresh (issue #2052)', () => {
  it('refreshes on focus and on becoming visible', () => {
    const windowObj = createFakeWindow();
    const refresh = vi.fn(() => Promise.resolve());
    installCrossAppSettingsRefresh(refresh, windowObj, { minIntervalMs: 0 });

    windowObj.emit('focus');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ reason: 'focus' });

    windowObj.document.visibilityState = 'visible';
    windowObj.document.emit('visibilitychange');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenLastCalledWith({ reason: 'visible' });
  });

  it('skips refresh while the document is hidden', () => {
    const windowObj = createFakeWindow();
    windowObj.document.visibilityState = 'hidden';
    const refresh = vi.fn(() => Promise.resolve());
    installCrossAppSettingsRefresh(refresh, windowObj, { minIntervalMs: 0 });

    windowObj.emit('focus');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('coalesces duplicate triggers behind the minimum interval', () => {
    const windowObj = createFakeWindow();
    const refresh = vi.fn(() => Promise.resolve());
    installCrossAppSettingsRefresh(refresh, windowObj, { minIntervalMs: 60_000 });

    windowObj.emit('focus');
    windowObj.emit('focus');
    windowObj.emit('focus');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes on reconnect only after an offline transition', () => {
    const windowObj = createFakeWindow();
    const refresh = vi.fn(() => Promise.resolve());
    installCrossAppSettingsRefresh(refresh, windowObj, { minIntervalMs: 0 });

    windowObj.emit('online');
    expect(refresh).not.toHaveBeenCalled();

    windowObj.emit('offline');
    windowObj.emit('online');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ reason: 'reconnect' });

    // The offline flag resets: a second online without an offline is a no-op.
    windowObj.emit('online');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('survives refresh failures and unsubscribes cleanly', async () => {
    const windowObj = createFakeWindow();
    const refresh = vi.fn(() => Promise.reject(new Error('offline snapshot')));
    const uninstall = installCrossAppSettingsRefresh(refresh, windowObj, { minIntervalMs: 0 });

    expect(() => windowObj.emit('focus')).not.toThrow();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);

    uninstall();
    windowObj.emit('focus');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(windowObj.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(windowObj.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(windowObj.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('is a no-op without a window or refresh callback', () => {
    expect(installCrossAppSettingsRefresh(null, createFakeWindow())).toBeTypeOf('function');
    expect(installCrossAppSettingsRefresh(vi.fn(), null)).toBeTypeOf('function');
  });

  it('keeps the legacy POS helper name as a compatibility alias', () => {
    expect(installPosFocusSettingsRefresh).toBe(installCrossAppSettingsRefresh);
  });
});
