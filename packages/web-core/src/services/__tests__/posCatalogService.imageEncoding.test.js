import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = { post: vi.fn() };
vi.mock('../api.js', () => ({ default: apiMock }));

const rolloutFlagMock = vi.fn(() => 'off');
vi.mock('../../utils/imageEncoding/rolloutFlag.js', () => ({
  getImageClientConversionFlag: () => rolloutFlagMock(),
}));

const prepareImageVariantsMock = vi.fn();
vi.mock('../../utils/imageEncoding/index.js', () => ({
  prepareImageVariants: (...args) => prepareImageVariantsMock(...args),
}));

const loadService = async () => import('../posCatalogService.js');

describe('posCatalogService.uploadPosCatalogImage x client image encoder wiring', () => {
  beforeEach(() => {
    apiMock.post.mockReset();
    prepareImageVariantsMock.mockReset();
    rolloutFlagMock.mockReturnValue('off');
  });

  it('sends the original file untouched while rolloutFlag.js stays "off" (Phase 296 default)', async () => {
    const { uploadPosCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });

    await uploadPosCatalogImage('item-1', file);

    expect(prepareImageVariantsMock).not.toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [path, formData] = apiMock.post.mock.calls[0];
    expect(path).toBe('/pos/catalog-overrides/item-1/image');
    expect(formData.get('image')).toBe(file);
  });

  it('sends only the "large" variant when the flag is "on" -- proving the dead-code branch compiles and works', async () => {
    rolloutFlagMock.mockReturnValue('on');
    const { uploadPosCatalogImage } = await loadService();
    apiMock.post.mockResolvedValue({ data: { data: { id: 'item-1' } } });

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const largeVariant = new File(['resized'], 'photo-large.jpg', { type: 'image/jpeg' });
    prepareImageVariantsMock.mockResolvedValue({
      variants: { large: largeVariant },
      manifest: {},
      degraded: [],
    });

    await uploadPosCatalogImage('item-1', file);

    expect(prepareImageVariantsMock).toHaveBeenCalledWith(file);
    const [, formData] = apiMock.post.mock.calls[0];
    expect(formData.get('image')).toBe(largeVariant);
    // Single-variant only -- image_medium/image_thumbnail/client_image_manifest are Phase 297's job.
    expect(formData.get('image_medium')).toBeNull();
    expect(formData.get('client_image_manifest')).toBeNull();
  });

  it('falls back to the original file if the "on" branch produces no large variant', async () => {
    rolloutFlagMock.mockReturnValue('on');
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
});
