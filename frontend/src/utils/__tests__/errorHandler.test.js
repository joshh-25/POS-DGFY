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

  it('normalizes IMS tenant capability blocks with platform-admin copy', () => {
    const normalized = normalizeApiError({
      response: {
        status: 403,
        data: {
          code: 'TENANT_CAPABILITY_DISABLED',
          capability: 'tenant_ims_enabled',
          message: 'IMS is disabled for this tenant by platform admin.'
        }
      }
    });

    expect(normalized).toMatchObject({
      status: 403,
      title: 'Platform admin changed your permissions',
      code: 'TENANT_CAPABILITY_DISABLED',
      capability: 'tenant_ims_enabled',
      isCapabilityBlock: true,
      isGlobalCandidate: false
    });
    expect(normalized.message).toContain('IMS access is disabled');
    expect(normalized.message).toContain('Inventory, purchases, settings, reports');
  });

  it('normalizes tenant capability blocks from legacy error_code payloads', () => {
    const normalized = normalizeApiError({
      response: {
        status: 403,
        data: {
          error_code: 'TENANT_CAPABILITY_DISABLED',
          capability: 'tenant_ims_enabled',
          message: 'IMS is disabled for this tenant by platform admin.'
        }
      }
    });

    expect(normalized).toMatchObject({
      title: 'Platform admin changed your permissions',
      code: 'TENANT_CAPABILITY_DISABLED',
      capability: 'tenant_ims_enabled',
      isCapabilityBlock: true
    });
    expect(normalized.message).toContain('IMS access is disabled');
  });

  it('normalizes POS tenant capability blocks with platform-admin copy', () => {
    const normalized = normalizeApiError({
      response: {
        status: 403,
        data: {
          code: 'TENANT_CAPABILITY_DISABLED',
          capability: 'tenant_pos_enabled',
          message: 'POS is disabled for this tenant by platform admin.'
        }
      }
    });

    expect(normalized).toMatchObject({
      title: 'Platform admin changed your permissions',
      code: 'TENANT_CAPABILITY_DISABLED',
      capability: 'tenant_pos_enabled',
      isCapabilityBlock: true
    });
    expect(normalized.message).toContain('POS access is disabled');
    expect(normalized.message).toContain('Catalog, checkout, scanning');
  });

  it('normalizes Storefront customer access mode blocks with mode-specific copy', () => {
    const normalized = normalizeApiError({
      response: {
        status: 403,
        data: {
          code: 'CUSTOMER_ACCESS_MODE_BLOCKED',
          message: 'Customer access mode does not allow quote_checkout',
          details: {
            requested_action: 'quote_checkout',
            requested_mode: 'catalog',
            effective_mode: 'catalog'
          }
        }
      }
    });

    expect(normalized).toMatchObject({
      title: 'Platform admin changed your permissions',
      code: 'CUSTOMER_ACCESS_MODE_BLOCKED',
      requestedAction: 'quote_checkout',
      requestedMode: 'catalog',
      effectiveMode: 'catalog',
      isCapabilityBlock: true
    });
    expect(normalized.message).toBe('Customers can browse your catalog, but cart, quote, booking, and checkout are disabled.');
  });

  it('keeps ordinary 403 errors on the existing generic path', () => {
    const normalized = normalizeApiError({
      response: {
        status: 403,
        data: {}
      }
    });

    expect(normalized.title).toBeNull();
    expect(normalized.code).toBeNull();
    expect(normalized.message).toBe('You do not have permission to perform this action.');
    expect(normalized.isCapabilityBlock).toBe(false);
    expect(normalized.isGlobalCandidate).toBe(false);
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

  it('emits tenant:capability-blocked for capability 403 responses', () => {
    const capabilityHandler = vi.fn();
    const apiErrorHandler = vi.fn();
    window.addEventListener('tenant:capability-blocked', capabilityHandler);
    window.addEventListener('api:error', apiErrorHandler);

    const detail = emitGlobalApiError({
      source: 'tenant-api',
      error: {
        config: { url: '/pos/catalog', method: 'get' },
        response: {
          status: 403,
          data: {
            code: 'TENANT_CAPABILITY_DISABLED',
            capability: 'tenant_pos_enabled'
          }
        }
      }
    });

    expect(capabilityHandler).toHaveBeenCalledTimes(1);
    expect(capabilityHandler.mock.calls[0][0].detail).toMatchObject({
      title: 'Platform admin changed your permissions',
      code: 'TENANT_CAPABILITY_DISABLED',
      capability: 'tenant_pos_enabled',
      source: 'tenant-api',
      url: '/pos/catalog',
      method: 'GET'
    });
    expect(detail).toMatchObject({ kind: 'capability' });
    expect(apiErrorHandler).not.toHaveBeenCalled();
  });

  it('marks capability events from skipped requests so listeners can suppress toast popups', () => {
    const capabilityHandler = vi.fn();
    window.addEventListener('tenant:capability-blocked', capabilityHandler);

    const detail = emitGlobalApiError({
      source: 'tenant-api',
      error: {
        config: { url: '/pos/orders/incoming', method: 'get', skipGlobalErrorToast: true },
        response: {
          status: 403,
          data: {
            error_code: 'TENANT_CAPABILITY_DISABLED',
            capability: 'tenant_pos_enabled'
          }
        }
      }
    });

    expect(capabilityHandler).toHaveBeenCalledTimes(1);
    expect(detail).toMatchObject({
      code: 'TENANT_CAPABILITY_DISABLED',
      suppressToast: true
    });
  });
});
