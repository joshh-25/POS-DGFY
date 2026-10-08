// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPosLocationContextForTenant,
  publishPosLocationContext,
  subscribeToPosLocationContext
} from '../utils/posLocationContext.js';

afterEach(() => {
  window.localStorage.clear();
});

describe('POS location context synchronization', () => {
  it('publishes a normalized location context to the current POS window', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToPosLocationContext(handler);

    const published = publishPosLocationContext({
      tenantId: 'tenant-1',
      operatingLocationId: '7',
      viewingLocationId: 8,
      queueLocationScopeId: 7,
      contextVersion: 4
    });

    expect(published).toMatchObject({
      tenantId: 'tenant-1',
      operatingLocationId: 7,
      viewingLocationId: 8,
      queueLocationScopeId: 7,
      contextVersion: 4
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      operatingLocationId: 7
    }));
    expect(JSON.parse(window.localStorage.getItem('dgfy_pos_location_context_v1'))).toMatchObject({
      tenantId: 'tenant-1',
      operatingLocationId: 7
    });

    unsubscribe();
  });

  it('rejects missing or cross-tenant context before applying a branch scope', () => {
    expect(isPosLocationContextForTenant({}, 'tenant-1')).toBe(false);
    expect(isPosLocationContextForTenant({ tenantId: 'tenant-2' }, 'tenant-1')).toBe(false);
    expect(isPosLocationContextForTenant({ tenantId: 'tenant-1' }, 'tenant-1')).toBe(true);
  });
});
