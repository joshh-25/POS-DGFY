import { describe, expect, it } from 'vitest';
import { resolveStorefrontImageSources } from '../shared/utils/storefrontImageSources.js';

describe('resolveStorefrontImageSources', () => {
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
