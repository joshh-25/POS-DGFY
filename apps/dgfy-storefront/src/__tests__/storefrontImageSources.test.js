import { describe, expect, it } from 'vitest';
import { resolveStorefrontImageSources } from '../shared/utils/storefrontImageSources.js';

describe('resolveStorefrontImageSources', () => {
  it('normalizes the ordered image gallery and keeps the primary image first', () => {
    const sources = resolveStorefrontImageSources({
      image_url: '/uploads/catalog/primary-large.webp',
      image_gallery: [
        {
          url: '/uploads/catalog/secondary-large.webp',
          variants: {
            thumbnail_url: '/uploads/catalog/secondary-thumbnail.webp',
            large_url: '/uploads/catalog/secondary-large.webp'
          },
          is_primary: false,
          sort_order: 1
        },
        {
          url: '/uploads/catalog/primary-large.webp',
          variants: {
            thumbnail_url: '/uploads/catalog/primary-thumbnail.webp',
            large_url: '/uploads/catalog/primary-large.webp'
          },
          is_primary: true,
          sort_order: 0
        },
        {
          url: '/uploads/catalog/third-large.webp',
          is_primary: false,
          sort_order: 2
        }
      ]
    }, { preferred: 'large' });

    expect(sources.gallery).toHaveLength(3);
    expect(sources.gallery.map((entry) => entry.url)).toEqual([
      '/uploads/catalog/primary-large.webp',
      '/uploads/catalog/secondary-large.webp',
      '/uploads/catalog/third-large.webp'
    ]);
    expect(sources.gallery[0].isPrimary).toBe(true);
    expect(sources.gallery[1].thumbnailUrl).toContain('/uploads/catalog/secondary-thumbnail.webp');
    expect(sources.gallery[2].largeUrl).toContain('/uploads/catalog/third-large.webp');
    expect(sources.src).toContain('/uploads/catalog/primary-large.webp');
  });

  it('adds the legacy primary URL when it is missing from the gallery and removes duplicates', () => {
    const sources = resolveStorefrontImageSources({
      image_url: '/uploads/catalog/primary.webp',
      image_gallery: [
        { url: '/uploads/catalog/secondary.webp', sort_order: 1 },
        { url: '/uploads/catalog/secondary.webp', sort_order: 2 }
      ]
    });

    expect(sources.gallery.map((entry) => entry.url)).toEqual([
      '/uploads/catalog/primary.webp',
      '/uploads/catalog/secondary.webp'
    ]);
    expect(sources.gallery[0].sortOrder).toBe(0);
    expect(sources.gallery[0].isPrimary).toBe(true);
  });

  it('builds a responsive source set from optimized variants', () => {
    const sources = resolveStorefrontImageSources({
      image_url: '/uploads/catalog/item-large.webp',
      image_variants: {
        thumbnail_url: '/uploads/catalog/item-thumbnail.webp',
        medium_url: '/uploads/catalog/item-medium.webp',
        large_url: '/uploads/catalog/item-large.webp'
      }
    }, { preferred: 'thumbnail' });

    expect(sources.src).toContain('/uploads/catalog/item-thumbnail.webp');
    expect(sources.thumbnailUrl).toContain('/uploads/catalog/item-thumbnail.webp');
    expect(sources.mediumUrl).toContain('/uploads/catalog/item-medium.webp');
    expect(sources.largeUrl).toContain('/uploads/catalog/item-large.webp');
    expect(sources.srcSet).toContain('/uploads/catalog/item-thumbnail.webp 400w');
    expect(sources.srcSet).toContain('/uploads/catalog/item-medium.webp 1024w');
    expect(sources.srcSet).toContain('/uploads/catalog/item-large.webp 1920w');
  });

  it('exposes AVIF, WebP, and placeholder sources for v2 assets', () => {
    const sources = resolveStorefrontImageSources({
      image_url: '/uploads/catalog/item-large.webp',
      image_variants: {
        version: 2,
        placeholder_url: '/uploads/catalog/placeholder.webp',
        thumbnail_url: '/uploads/catalog/item-thumbnail.webp',
        medium_url: '/uploads/catalog/item-medium.webp',
        large_url: '/uploads/catalog/item-large.webp',
        avif: {
          thumbnail_url: '/uploads/catalog/item-thumbnail.avif',
          medium_url: '/uploads/catalog/item-medium.avif',
          large_url: '/uploads/catalog/item-large.avif'
        },
        webp: {
          thumbnail_url: '/uploads/catalog/item-thumbnail.webp',
          medium_url: '/uploads/catalog/item-medium.webp',
          large_url: '/uploads/catalog/item-large.webp'
        }
      }
    });

    expect(sources.version).toBe(2);
    expect(sources.placeholderUrl).toContain('/uploads/catalog/placeholder.webp');
    expect(sources.avifSrcSet).toContain('/uploads/catalog/item-thumbnail.avif 400w');
    expect(sources.avifSrcSet).toContain('/uploads/catalog/item-large.avif 1920w');
    expect(sources.webpSrcSet).toContain('/uploads/catalog/item-medium.webp 1024w');
  });

  it('keeps legacy single-image records backward compatible', () => {
    const sources = resolveStorefrontImageSources({
      image_url: '/uploads/catalog/legacy-item.png'
    });

    expect(sources.src).toContain('/uploads/catalog/legacy-item.png');
    expect(sources.thumbnailUrl).toBe(sources.src);
    expect(sources.mediumUrl).toBe(sources.src);
    expect(sources.largeUrl).toBe(sources.src);
    expect(sources.srcSet).toBeUndefined();
  });

  it('uses the original image URL for missing variants', () => {
    const sources = resolveStorefrontImageSources({
      image_url: '/uploads/catalog/item-large.webp',
      image_variants: {
        thumbnail_url: '/uploads/catalog/item-thumbnail.webp'
      }
    });

    expect(sources.thumbnailUrl).toContain('/uploads/catalog/item-thumbnail.webp');
    expect(sources.mediumUrl).toContain('/uploads/catalog/item-large.webp');
    expect(sources.largeUrl).toContain('/uploads/catalog/item-large.webp');
    expect(sources.srcSet).toContain('/uploads/catalog/item-thumbnail.webp 400w');
    expect(sources.srcSet).toContain('/uploads/catalog/item-large.webp 1024w');
  });
});
