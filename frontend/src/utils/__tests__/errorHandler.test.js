import { describe, it, expect, beforeEach, vi } from 'vitest';
import { normalizeApiError, emitGlobalApiError } from '../errorHandler.js';

describe('errorHandler utilities', () => {
  const listeners = {};

  beforeEach(() => {
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    globalThis.window = {
      addEventListener: (type, fn) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener: (type, fn) => {
        listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
      },
      dispatchEvent: (event) => {
        (listeners[event.type] || []).forEach((fn) => fn(event));
      }
    };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    };
  });

  it('normalizes a 422 validation error', () => {
    const error = {
      response: {
        status: 422,
        data: {
          message: 'Validation failed',
          errors: [{ field: 'email', message: 'Invalid email format' }]
        }
      }
    };
    const normalized = normalizeApiError(error);

    expect(normalized.status).toBe(422);
    expect(normalized.kind).toBe('http');
    expect(normalized.message).toBe('Validation failed');
    expect(normalized.validationErrors).toHaveLength(1);
    expect(normalized.isGlobalCandidate).toBe(false);
  });

  it('normalizes a network/no-response error as global candidate', () => {
    const error = { request: {}, message: 'Network Error' };
    const normalized = normalizeApiError(error);

    expect(normalized.kind).toBe('network');
    expect(normalized.isGlobalCandidate).toBe(true);
  });

  it('emits api:error and legacy api:server-error for 5xx', () => {
    const apiErrorHandler = vi.fn();
    const legacyHandler = vi.fn();
    window.addEventListener('api:error', apiErrorHandler);
    window.addEventListener('api:server-error', legacyHandler);

    emitGlobalApiError({
      source: 'tenant-api',
      error: {
        config: { url: '/items', method: 'get' },
        response: { status: 500, data: { message: 'Server exploded' } }
      }
    });

    expect(apiErrorHandler).toHaveBeenCalledTimes(1);
    expect(apiErrorHandler.mock.calls[0][0].detail).toMatchObject({
      source: 'tenant-api',
      kind: 'server',
      status: 500,
      message: 'Server exploded'
    });
    expect(legacyHandler).toHaveBeenCalledTimes(1);
  });

  it('does not emit any event for non-global (4xx non-server) errors', () => {
    const apiErrorHandler = vi.fn();
    window.addEventListener('api:error', apiErrorHandler);

    emitGlobalApiError({
      source: 'tenant-api',
      error: { response: { status: 404, data: { message: 'Not found' } } }
    });

    expect(apiErrorHandler).not.toHaveBeenCalled();
  });
});

