import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function freshRequestJson() {
  vi.resetModules();
  vi.doMock('../../../../src/observability/sentryClient.js', () => ({
    tagRequestFailureContext: vi.fn(),
    captureRequestFailure: vi.fn()
  }));
  const sentryClient = await import('../../../../src/observability/sentryClient.js');
  const mod = await import('../services/requestJson.js');
  return { requestJson: mod.requestJson, sentryClient };
}

describe('Storefront requestJson -- AbortSignal + opt-in retry', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      cookie: 'sku_csrf_token=csrf-store-retry'
    });
    vi.stubGlobal('window', {
      location: { origin: 'https://dgfy.ph' }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('../../../../src/observability/sentryClient.js');
    vi.restoreAllMocks();
  });

  it('forwards a provided signal to the fetch init', async () => {
    const { requestJson } = await freshRequestJson();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ok: true } })
    }));
    const controller = new AbortController();

    await requestJson('/api/v1/storefront/discovery', { signal: controller.signal });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/storefront/discovery'),
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('omits the signal key entirely when none is provided', async () => {
    const { requestJson } = await freshRequestJson();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ok: true } })
    }));

    await requestJson('/api/v1/storefront/discovery');

    const init = fetch.mock.calls[0][1];
    expect('signal' in init).toBe(false);
  });

  it('rejects with the platform AbortError verbatim and does not report it', async () => {
    const { requestJson, sentryClient } = await freshRequestJson();
    const controller = new AbortController();
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const error = await requestJson('/api/v1/storefront/discovery', { signal: controller.signal }).catch((err) => err);

    expect(error).toBe(abortError);
    expect(error.name).toBe('AbortError');
    expect(sentryClient.captureRequestFailure).not.toHaveBeenCalled();
  });

  it('retries a 503 GET when retry:true and resolves once it recovers, capturing nothing', async () => {
    const { requestJson, sentryClient } = await freshRequestJson();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { stores: [] } }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestJson('/api/v1/storefront/discovery', { retry: true });

    expect(result).toEqual({ stores: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentryClient.captureRequestFailure).not.toHaveBeenCalled();
  });

  it('reports and rejects once when retries are exhausted, not once per attempt', async () => {
    const { requestJson, sentryClient } = await freshRequestJson();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, headers: { get: () => null }, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson('/api/v1/storefront/discovery', { retry: true })).rejects.toMatchObject({ status: 502 });

    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 original + 2 retries
    expect(sentryClient.captureRequestFailure).toHaveBeenCalledTimes(1);
  });

  it('honours skipRequestFailureCapture on an HTTP failure (parity with api.js)', async () => {
    const { requestJson, sentryClient } = await freshRequestJson();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson('/api/v1/storefront/discovery', { skipRequestFailureCapture: true }))
      .rejects.toMatchObject({ status: 503 });

    expect(sentryClient.captureRequestFailure).not.toHaveBeenCalled();
  });

  it('honours skipRequestFailureCapture on a network failure (parity with api.js)', async () => {
    const { requestJson, sentryClient } = await freshRequestJson();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(requestJson('/api/v1/storefront/discovery', { skipRequestFailureCapture: true }))
      .rejects.toBeTruthy();

    expect(sentryClient.captureRequestFailure).not.toHaveBeenCalled();
  });

  it('still reports an HTTP failure that does not opt out (the regression that matters)', async () => {
    const { requestJson, sentryClient } = await freshRequestJson();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson('/api/v1/storefront/discovery')).rejects.toMatchObject({ status: 503 });

    expect(sentryClient.captureRequestFailure).toHaveBeenCalledTimes(1);
  });

  it('does not retry a POST even with retry:true', async () => {
    const { requestJson } = await freshRequestJson();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, headers: { get: () => null }, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson('/api/v1/store/orders', {
      method: 'POST',
      retry: true,
      body: { total: 100 }
    })).rejects.toMatchObject({ status: 502 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a domain failure (200 with success:false) even with retry:true', async () => {
    const { requestJson } = await freshRequestJson();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ success: false, message: 'Invalid coupon.' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson('/api/v1/store/checkout', { method: 'POST', retry: true })).rejects.toMatchObject({
      status: undefined
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry when retry is left at its default (false)', async () => {
    const { requestJson } = await freshRequestJson();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson('/api/v1/storefront/discovery')).rejects.toMatchObject({ status: 503 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes the real error (not a synthesized one) to captureRequestFailure on HTTP failure', async () => {
    const { requestJson, sentryClient } = await freshRequestJson();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: async () => ({ message: 'Upstream exploded' })
    }));

    await requestJson('/api/v1/storefront/discovery').catch(() => {});

    expect(sentryClient.captureRequestFailure).toHaveBeenCalledTimes(1);
    const [args] = sentryClient.captureRequestFailure.mock.calls[0];
    expect(args.error).toBeInstanceOf(Error);
    expect(args.error.message).toBe('Upstream exploded');
  });
});
