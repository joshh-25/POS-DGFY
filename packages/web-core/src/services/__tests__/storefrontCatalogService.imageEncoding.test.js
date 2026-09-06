import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() };
vi.mock('../api.js', () => ({ default: apiMock }));

// New client wiring for this phase (epic #265, Phase 298) -- mirrors
// posCatalogService.imageEncoding.test.js's mock shape exactly.
const scopeEnabledMock = vi.fn(() => false);
vi.mock('../../utils/imageEncoding/rolloutFlag.js', () => ({
  isImageClientConversionEnabledForScope: (...args) => scopeEnabledMock(...args),
}));

const prepareImageVariantsMock = vi.fn();
vi.mock('../../utils/imageEncoding/index.js', () => ({
  prepareImageVariants: (...args) => prepareImageVariantsMock(...args),
}));

const trackEventMock = vi.fn();
vi.mock('../../observability/analyticsClient.js', () => ({
  trackEvent: (...args) => trackEventMock(...args),
}));

const loadService = async () => import('../storefrontCatalogService.js');

describe('storefrontCatalogService.uploadStorefrontCatalogImage x client image encoder wiring', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    prepareImageVariantsMock.mockReset();
    trackEventMock.mockReset();
    scopeEnabledMock.mockReset();
    scopeEnabledMock.mockReturnValue(false);
  });

  it('sends the original file untouched while the scope is disabled (fail-safe default)', async () => {
    const { uploadStorefrontCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });

    await uploadStorefrontCatalogImage('item-1', file);

    expect(scopeEnabledMock).toHaveBeenCalledWith('storefront_catalog_single');
    expect(prepareImageVariantsMock).not.toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [path, formData] = apiMock.post.mock.calls[0];
    expect(path).toBe('/items/item-1/storefront-image');
    expect(formData.get('image')).toBe(file);
  });

  it('sends only the "large" variant when the scope is enabled', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadStorefrontCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const largeVariant = new File(['resized'], 'photo-large.jpg', { type: 'image/jpeg' });
    prepareImageVariantsMock.mockResolvedValue({
      variants: { large: largeVariant },
      manifest: { variants: { large: {} } },
      degraded: [],
    });

    await uploadStorefrontCatalogImage('item-1', file);

    expect(prepareImageVariantsMock).toHaveBeenCalledWith(file);
    const [, formData] = apiMock.post.mock.calls[0];
    expect(formData.get('image')).toBe(largeVariant);
    expect(formData.get('image_medium')).toBeNull();
    expect(formData.get('client_image_manifest')).toBeNull();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it('falls back to the original file if the enabled branch produces no large variant', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadStorefrontCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    prepareImageVariantsMock.mockResolvedValue({
      variants: {},
      manifest: {},
      degraded: ['orientation_unknown'],
    });

    await uploadStorefrontCatalogImage('item-1', file);

    const [, formData] = apiMock.post.mock.calls[0];
    expect(formData.get('image')).toBe(file);
  });

  it('reports a degradation metric for a non-flag_off degraded code', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadStorefrontCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    prepareImageVariantsMock.mockResolvedValue({
      variants: { large: file },
      manifest: { variants: { large: {} } },
      degraded: ['probe_failed'],
    });

    await uploadStorefrontCatalogImage('item-1', file);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith('image_client_conversion_degraded', expect.objectContaining({
      scope: 'storefront_catalog_single',
      reason: 'probe_failed',
      degraded_codes: ['probe_failed'],
    }));
  });
});

// #1643 (epic #265, 298d) -- bulk client wiring, targeting uploadBulkStorefrontCatalogImages (the
// cross-SKU bulk function, POST /items/storefront-images/bulk) -- NOT uploadStorefrontCatalogImages
// above (the per-item gallery function), which stays out of scope. Mirrors
// posCatalogService.imageEncoding.test.js's bulk block exactly; bulkCatalogUpload.js's
// orchestration is shared between both services.
describe('storefrontCatalogService.uploadBulkStorefrontCatalogImages x client image encoder wiring', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    prepareImageVariantsMock.mockReset();
    trackEventMock.mockReset();
    scopeEnabledMock.mockReset();
    scopeEnabledMock.mockReturnValue(false);
  });

  it('sends every file unchanged in one request while the scope is disabled (fail-safe default)', async () => {
    const { uploadBulkStorefrontCatalogImages } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { summary: { uploaded: 2 }, results: [] } } });
    const fileA = new File(['a'], 'SKU-A.png', { type: 'image/png' });
    const fileB = new File(['b'], 'SKU-B.png', { type: 'image/png' });

    const result = await uploadBulkStorefrontCatalogImages([fileA, fileB]);

    expect(scopeEnabledMock).toHaveBeenCalledWith('storefront_catalog_bulk');
    expect(prepareImageVariantsMock).not.toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [path, formData] = apiMock.post.mock.calls[0];
    expect(path).toBe('/items/storefront-images/bulk');
    expect(formData.getAll('images')).toEqual([fileA, fileB]);
    expect(result).toEqual({ summary: { uploaded: 2 }, results: [] });
  });

  it('converts and renames each file, sending one request when the total stays under the byte target', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadBulkStorefrontCatalogImages } = await loadService();
    apiMock.post.mockResolvedValue({
      data: { data: { summary: { uploaded: 1 }, results: [{ filename: 'SKU-A__large.png' }] } },
    });
    const fileA = new File(['a'], 'SKU-A.png', { type: 'image/png' });
    const largeVariant = new File(['resized'], 'ignored-name.png', { type: 'image/png' });
    prepareImageVariantsMock.mockResolvedValue({
      variants: { large: largeVariant },
      manifest: { variants: { large: {} } },
      degraded: [],
    });

    const result = await uploadBulkStorefrontCatalogImages([fileA]);

    expect(prepareImageVariantsMock).toHaveBeenCalledWith(fileA);
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [, formData] = apiMock.post.mock.calls[0];
    const sent = formData.getAll('images');
    expect(sent).toHaveLength(1);
    expect(sent[0].name).toBe('SKU-A__large.png');
    expect(result).toEqual({ summary: { uploaded: 1 }, results: [{ filename: 'SKU-A__large.png' }] });
  });

  it('sends multiple sequential requests, in order, when the total exceeds the byte target', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadBulkStorefrontCatalogImages } = await loadService();
    apiMock.post
      .mockResolvedValueOnce({ data: { data: { summary: { uploaded: 1, failed: 0 }, results: [{ filename: 'SKU-A__large.png' }] } } })
      .mockResolvedValueOnce({ data: { data: { summary: { uploaded: 1, failed: 1 }, results: [{ filename: 'SKU-B__large.png' }] } } });

    const bytesA = new Uint8Array(4 * 1024 * 1024);
    const bytesB = new Uint8Array(4 * 1024 * 1024);
    const fileA = new File(['a'], 'SKU-A.png', { type: 'image/png' });
    const fileB = new File(['b'], 'SKU-B.png', { type: 'image/png' });
    const largeVariantA = new File([bytesA], 'variant-a.png', { type: 'image/png' });
    const largeVariantB = new File([bytesB], 'variant-b.png', { type: 'image/png' });
    prepareImageVariantsMock
      .mockResolvedValueOnce({ variants: { large: largeVariantA }, manifest: {}, degraded: [] })
      .mockResolvedValueOnce({ variants: { large: largeVariantB }, manifest: {}, degraded: [] });

    const result = await uploadBulkStorefrontCatalogImages([fileA, fileB]);

    expect(apiMock.post).toHaveBeenCalledTimes(2);
    expect(apiMock.post.mock.calls[0][1].getAll('images')[0].name).toBe('SKU-A__large.png');
    expect(apiMock.post.mock.calls[1][1].getAll('images')[0].name).toBe('SKU-B__large.png');
    expect(result).toEqual({
      summary: { uploaded: 2, failed: 1 },
      results: [{ filename: 'SKU-A__large.png' }, { filename: 'SKU-B__large.png' }],
    });
  });

  it('falls back to that file\'s original bytes/name when prepareImageVariants produces no large variant', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadBulkStorefrontCatalogImages } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { summary: {}, results: [] } } });
    const fileA = new File(['a'], 'SKU-A.png', { type: 'image/png' });
    prepareImageVariantsMock.mockResolvedValue({ variants: {}, manifest: {}, degraded: ['orientation_unknown'] });

    await uploadBulkStorefrontCatalogImages([fileA]);

    const [, formData] = apiMock.post.mock.calls[0];
    expect(formData.getAll('images')).toEqual([fileA]);
  });

  it('fires one degradation metric per affected file for a non-flag_off degraded code, scoped to storefront_catalog_bulk', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadBulkStorefrontCatalogImages } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { summary: {}, results: [] } } });
    const fileA = new File(['a'], 'SKU-A.png', { type: 'image/png' });
    const fileB = new File(['b'], 'SKU-B.png', { type: 'image/png' });
    prepareImageVariantsMock
      .mockResolvedValueOnce({ variants: { large: fileA }, manifest: {}, degraded: ['probe_failed'] })
      .mockResolvedValueOnce({ variants: { large: fileB }, manifest: {}, degraded: [] });

    await uploadBulkStorefrontCatalogImages([fileA, fileB]);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith('image_client_conversion_degraded', expect.objectContaining({
      scope: 'storefront_catalog_bulk',
      reason: 'probe_failed',
      degraded_codes: ['probe_failed'],
    }));
  });

  it('awaits prepareImageVariants one file at a time -- never invokes it again before the prior call resolves', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadBulkStorefrontCatalogImages } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { summary: {}, results: [] } } });
    const fileA = new File(['a'], 'SKU-A.png', { type: 'image/png' });
    const fileB = new File(['b'], 'SKU-B.png', { type: 'image/png' });

    let inFlight = 0;
    let maxInFlight = 0;
    const pendingResolvers = [];
    prepareImageVariantsMock.mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        pendingResolvers.push(() => {
          inFlight -= 1;
          resolve({ variants: { large: fileA }, manifest: {}, degraded: [] });
        });
      });
    });

    const uploadPromise = uploadBulkStorefrontCatalogImages([fileA, fileB]);
    await vi.waitFor(() => expect(prepareImageVariantsMock).toHaveBeenCalledTimes(1));
    expect(prepareImageVariantsMock).toHaveBeenCalledTimes(1);

    pendingResolvers[0]();
    await vi.waitFor(() => expect(prepareImageVariantsMock).toHaveBeenCalledTimes(2));

    pendingResolvers[1]();
    await uploadPromise;

    expect(maxInFlight).toBe(1);
  });
});
