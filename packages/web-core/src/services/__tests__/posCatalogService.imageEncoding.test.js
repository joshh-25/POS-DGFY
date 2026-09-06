import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = { post: vi.fn() };
vi.mock('../api.js', () => ({ default: apiMock }));

// Phase 298 (#265): posCatalogService.js now checks the per-scope getter, not the bare global
// flag -- see rolloutFlag.js's own Open Item 1 resolution (kept `getImageClientConversionFlag()`
// argument-free for index.js's global fail-fast check; added this scoped export for the two real
// client-wiring call sites). This mock intentionally drops `getImageClientConversionFlag` since
// posCatalogService.js no longer imports it.
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

const loadService = async () => import('../posCatalogService.js');

describe('posCatalogService.uploadPosCatalogImage x client image encoder wiring', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    prepareImageVariantsMock.mockReset();
    trackEventMock.mockReset();
    scopeEnabledMock.mockReset();
    scopeEnabledMock.mockReturnValue(false);
  });

  it('sends the original file untouched while the scope is disabled (fail-safe default)', async () => {
    const { uploadPosCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });

    await uploadPosCatalogImage('item-1', file);

    expect(scopeEnabledMock).toHaveBeenCalledWith('pos_catalog_single');
    expect(prepareImageVariantsMock).not.toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [path, formData] = apiMock.post.mock.calls[0];
    expect(path).toBe('/pos/catalog-overrides/item-1/image');
    expect(formData.get('image')).toBe(file);
  });

  it('sends only the "large" variant when the scope is enabled', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadPosCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const largeVariant = new File(['resized'], 'photo-large.jpg', { type: 'image/jpeg' });
    prepareImageVariantsMock.mockResolvedValue({
      variants: { large: largeVariant },
      manifest: { variants: { large: {} } },
      degraded: [],
    });

    await uploadPosCatalogImage('item-1', file);

    expect(prepareImageVariantsMock).toHaveBeenCalledWith(file);
    const [, formData] = apiMock.post.mock.calls[0];
    expect(formData.get('image')).toBe(largeVariant);
    // Single-variant only -- image_medium/image_thumbnail/client_image_manifest are a
    // separate, already-shipped phase's job (unaffected by this one).
    expect(formData.get('image_medium')).toBeNull();
    expect(formData.get('client_image_manifest')).toBeNull();
    // Clean encode, no degradation -- no metric fired.
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it('falls back to the original file if the enabled branch produces no large variant', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadPosCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    prepareImageVariantsMock.mockResolvedValue({
      variants: {},
      manifest: {},
      degraded: ['orientation_unknown'],
    });

    await uploadPosCatalogImage('item-1', file);

    const [, formData] = apiMock.post.mock.calls[0];
    expect(formData.get('image')).toBe(file);
  });

  it('reports a degradation metric for a non-flag_off degraded code', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadPosCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    prepareImageVariantsMock.mockResolvedValue({
      variants: { large: file },
      manifest: { variants: { large: {} } },
      degraded: ['probe_failed'],
    });

    await uploadPosCatalogImage('item-1', file);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith('image_client_conversion_degraded', expect.objectContaining({
      scope: 'pos_catalog_single',
      reason: 'probe_failed',
      degraded_codes: ['probe_failed'],
    }));
  });
});

// #1643 (epic #265, 298d) -- bulk client wiring. bulkCatalogUpload.js's orchestration is shared
// between posCatalogService.js and storefrontCatalogService.js; the mocks above (`rolloutFlag.js`,
// `index.js`, `analyticsClient.js`) are intercepted the same way regardless of whether
// posCatalogService.js imports them directly or, as here, indirectly through
// bulkCatalogUpload.js -- Vitest mocks by resolved module path, not by importer.
describe('posCatalogService.uploadBulkPosCatalogImages x client image encoder wiring', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    prepareImageVariantsMock.mockReset();
    trackEventMock.mockReset();
    scopeEnabledMock.mockReset();
    scopeEnabledMock.mockReturnValue(false);
  });

  it('sends every file unchanged in one request while the scope is disabled (fail-safe default)', async () => {
    const { uploadBulkPosCatalogImages } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { summary: { uploaded: 2 }, results: [] } } });
    const fileA = new File(['a'], 'SKU-A.png', { type: 'image/png' });
    const fileB = new File(['b'], 'SKU-B.png', { type: 'image/png' });

    const result = await uploadBulkPosCatalogImages([fileA, fileB]);

    expect(scopeEnabledMock).toHaveBeenCalledWith('pos_catalog_bulk');
    expect(prepareImageVariantsMock).not.toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [path, formData] = apiMock.post.mock.calls[0];
    expect(path).toBe('/pos/catalog-overrides/images/bulk');
    expect(formData.getAll('images')).toEqual([fileA, fileB]);
    expect(result).toEqual({ summary: { uploaded: 2 }, results: [] });
  });

  it('converts and renames each file, sending one request when the total stays under the byte target', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadBulkPosCatalogImages } = await loadService();
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

    const result = await uploadBulkPosCatalogImages([fileA]);

    expect(prepareImageVariantsMock).toHaveBeenCalledWith(fileA);
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [, formData] = apiMock.post.mock.calls[0];
    const sent = formData.getAll('images');
    expect(sent).toHaveLength(1);
    // Renamed to the <SKU>__large.<ext> convention regardless of the variant File's own name.
    expect(sent[0].name).toBe('SKU-A__large.png');
    expect(result).toEqual({ summary: { uploaded: 1 }, results: [{ filename: 'SKU-A__large.png' }] });
  });

  it('sends multiple sequential requests, in order, when the total exceeds the byte target', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadBulkPosCatalogImages } = await loadService();
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

    const result = await uploadBulkPosCatalogImages([fileA, fileB]);

    // Each group is ~4 MB; together they exceed the 6 MB default target, forcing a second request.
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
    const { uploadBulkPosCatalogImages } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { summary: {}, results: [] } } });
    const fileA = new File(['a'], 'SKU-A.png', { type: 'image/png' });
    prepareImageVariantsMock.mockResolvedValue({ variants: {}, manifest: {}, degraded: ['orientation_unknown'] });

    await uploadBulkPosCatalogImages([fileA]);

    const [, formData] = apiMock.post.mock.calls[0];
    expect(formData.getAll('images')).toEqual([fileA]);
  });

  it('fires one degradation metric per affected file for a non-flag_off degraded code, scoped to pos_catalog_bulk', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadBulkPosCatalogImages } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { summary: {}, results: [] } } });
    const fileA = new File(['a'], 'SKU-A.png', { type: 'image/png' });
    const fileB = new File(['b'], 'SKU-B.png', { type: 'image/png' });
    prepareImageVariantsMock
      .mockResolvedValueOnce({ variants: { large: fileA }, manifest: {}, degraded: ['probe_failed'] })
      .mockResolvedValueOnce({ variants: { large: fileB }, manifest: {}, degraded: [] });

    await uploadBulkPosCatalogImages([fileA, fileB]);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith('image_client_conversion_degraded', expect.objectContaining({
      scope: 'pos_catalog_bulk',
      reason: 'probe_failed',
      degraded_codes: ['probe_failed'],
    }));
  });

  it('awaits prepareImageVariants one file at a time -- never invokes it again before the prior call resolves', async () => {
    scopeEnabledMock.mockReturnValue(true);
    const { uploadBulkPosCatalogImages } = await loadService();
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

    const uploadPromise = uploadBulkPosCatalogImages([fileA, fileB]);
    await vi.waitFor(() => expect(prepareImageVariantsMock).toHaveBeenCalledTimes(1));
    // The second file's encode must not start until the first one's promise resolves.
    expect(prepareImageVariantsMock).toHaveBeenCalledTimes(1);

    pendingResolvers[0]();
    await vi.waitFor(() => expect(prepareImageVariantsMock).toHaveBeenCalledTimes(2));

    pendingResolvers[1]();
    await uploadPromise;

    expect(maxInFlight).toBe(1);
  });
});
