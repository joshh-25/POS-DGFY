import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../services/requestJson.js';

describe('Storefront requestJson CSRF/session helper', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      cookie: 'sku_csrf_token=csrf-store-helper'
    });
    vi.stubGlobal('window', {
      location: { origin: 'https://dgfy.ph' }
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ok: true } })
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches credentials, Storefront context, auth, and CSRF headers for unsafe requests', async () => {
    const result = await requestJson('/api/v1/store/hospitality/bookings', {
      method: 'POST',
      authToken: 'storefront-account-token',
      selectedStore: {
        slug: 'space-bar',
        tenant_slug: 'dgfy-space',
        tenant_id: 42
      },
      selectedLocationId: 'LOC-7',
      body: { booking_reference: 'BK-1' }
    });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/store/hospitality/bookings'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ booking_reference: 'BK-1' })
      })
    );
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer storefront-account-token');
    expect(headers['x-store-slug']).toBe('space-bar');
    expect(headers['x-tenant-slug']).toBe('dgfy-space');
    expect(headers['x-tenant-id']).toBe('42');
    expect(headers['x-location-id']).toBe('LOC-7');
    expect(headers['x-csrf-token']).toBe('csrf-store-helper');
  });

  it('does not attach CSRF to safe read requests', async () => {
    await requestJson('/api/v1/store/hospitality/availability', {
      method: 'GET',
      storeSlug: 'space-bar'
    });

    const headers = fetch.mock.calls[0][1].headers;
    expect(headers['x-store-slug']).toBe('space-bar');
    expect(headers['x-csrf-token']).toBeUndefined();
  });

  it('exposes retry metadata from a 429 response for completion-based schedulers', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: vi.fn().mockReturnValue('120') },
      json: async () => ({
        success: false,
        message: 'Too many tracking refresh requests.',
        retryAfterSeconds: 878,
        limitScope: 'store_tracking_read'
      })
    });

    await expect(requestJson('/api/v1/store/track/SK-ORDER01', {
      storeSlug: 'space-bar'
    })).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 878,
      payload: expect.objectContaining({ limitScope: 'store_tracking_read' })
    });
  });
});
