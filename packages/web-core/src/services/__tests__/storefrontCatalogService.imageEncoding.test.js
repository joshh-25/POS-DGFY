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
