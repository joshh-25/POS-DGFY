import { describe, it, expect, vi } from 'vitest';
import { createErrorToastDeduper } from '../../../utils/errorToastDedupe.js';
import { setupGlobalApiErrorListeners } from '../GlobalApiErrorListener.jsx';

const createMockWindow = () => {
  const listeners = {};
  return {
    addEventListener: (type, fn) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    dispatchEvent: (event) => {
      (listeners[event.type] || []).forEach((fn) => fn(event));
    },
    listenerCount: (type) => (listeners[type] || []).length
  };
};

describe('GlobalApiErrorListener setup', () => {
  it('shows toast from canonical api:error events', () => {
    const mockWindow = createMockWindow();
    const toastApi = { error: vi.fn() };
    const cleanup = setupGlobalApiErrorListeners({ windowObj: mockWindow, toastApi });

    mockWindow.dispatchEvent({ type: 'api:error', detail: { message: 'Server exploded' } });
    expect(toastApi.error).toHaveBeenCalledTimes(1);
    expect(toastApi.error).toHaveBeenCalledWith('Server exploded', { duration: 5000 });

    cleanup();
  });

  it('dedupes duplicate messages across canonical + legacy events in cooldown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-03T00:00:00.000Z'));

    const mockWindow = createMockWindow();
    const toastApi = { error: vi.fn() };
    const cleanup = setupGlobalApiErrorListeners({
      windowObj: mockWindow,
      toastApi,
      deduper: createErrorToastDeduper(5000)
    });

    mockWindow.dispatchEvent({ type: 'api:error', detail: { message: 'Server exploded' } });
    mockWindow.dispatchEvent({ type: 'api:server-error', detail: { message: 'Server exploded' } });
    expect(toastApi.error).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-03-03T00:00:06.000Z'));
    mockWindow.dispatchEvent({ type: 'api:error', detail: { message: 'Server exploded' } });
    expect(toastApi.error).toHaveBeenCalledTimes(2);

    cleanup();
    vi.useRealTimers();
  });

  it('removes listeners on cleanup', () => {
    const mockWindow = createMockWindow();
    const cleanup = setupGlobalApiErrorListeners({ windowObj: mockWindow, toastApi: { error: vi.fn() } });

    expect(mockWindow.listenerCount('api:error')).toBe(1);
    expect(mockWindow.listenerCount('api:server-error')).toBe(1);
    cleanup();
    expect(mockWindow.listenerCount('api:error')).toBe(0);
    expect(mockWindow.listenerCount('api:server-error')).toBe(0);
  });
});
