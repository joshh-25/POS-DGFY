import {
  isVersionedOptimizedUpload,
  resolveUploadCacheControl
} from '../src/modules/shared/utils/uploadCachePolicy.js';

describe('upload cache policy', () => {
  it('uses immutable caching for versioned optimized image variants', () => {
    const imagePath = 'C:\\app\\uploads\\pos-catalog\\tenant-a\\item-42-1784770200000-acde1234\\thumb.webp';
    const responsiveImagePath = 'C:\\app\\uploads\\pos-catalog\\tenant-a\\item-42-1784770200000-v2-acde1234\\thumb.avif';
    const placeholderPath = 'C:\\app\\uploads\\pos-catalog\\tenant-a\\item-42-1784770200000-v2-acde1234\\placeholder.webp';

    expect(isVersionedOptimizedUpload(imagePath)).toBe(true);
    expect(resolveUploadCacheControl(imagePath)).toBe('public, max-age=31536000, immutable');
    expect(isVersionedOptimizedUpload(responsiveImagePath)).toBe(true);
    expect(resolveUploadCacheControl(responsiveImagePath)).toBe('public, max-age=31536000, immutable');
    expect(isVersionedOptimizedUpload(placeholderPath)).toBe(true);
    expect(resolveUploadCacheControl(placeholderPath)).toBe('public, max-age=31536000, immutable');
  });

  it('uses bounded revalidation for legacy raster image URLs', () => {
    expect(resolveUploadCacheControl('/app/uploads/legacy/catalog-item.png'))
      .toBe('public, max-age=300, stale-while-revalidate=86400');
  });

  it('does not apply long-lived caching to mutable or non-image uploads', () => {
    expect(isVersionedOptimizedUpload('/app/uploads/pos-catalog/tenant-a/item-42/thumb.webp')).toBe(false);
    expect(resolveUploadCacheControl('/app/uploads/pos-catalog/tenant-a/item-42/asset.json')).toBe('no-cache');
    expect(resolveUploadCacheControl('/app/uploads/legacy/logo.svg')).toBe('no-cache');
  });
});
