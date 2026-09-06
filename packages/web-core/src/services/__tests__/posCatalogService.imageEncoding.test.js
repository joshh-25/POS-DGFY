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
