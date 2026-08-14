import { withAssetOrigin } from '../../app/runtime/storefrontRuntime.js';

const VARIANT_WIDTHS = {
  thumbnail: 400,
  medium: 1024,
  large: 1920
};

const resolveUrl = (value) => withAssetOrigin(
  typeof value === 'string' ? value.trim() : ''
) || '';

const buildVariantSources = (variants = {}, fallbackUrl = '') => {
  const thumbnailUrl = resolveUrl(variants.thumbnail_url) || fallbackUrl;
  const mediumUrl = resolveUrl(variants.medium_url) || fallbackUrl;
  const largeUrl = resolveUrl(variants.large_url) || fallbackUrl;
  const candidates = new Map();

  [
    [thumbnailUrl, VARIANT_WIDTHS.thumbnail],
    [mediumUrl, VARIANT_WIDTHS.medium],
    [largeUrl, VARIANT_WIDTHS.large]
  ].forEach(([url, width]) => {
    if (url && !candidates.has(url)) candidates.set(url, width);
  });

  return {
    thumbnailUrl,
    mediumUrl,
    largeUrl,
    srcSet: candidates.size > 1
      ? Array.from(candidates, ([url, width]) => `${url} ${width}w`).join(', ')
      : undefined
  };
};

export const resolveStorefrontImageSources = (
  item,
  { preferred = 'medium' } = {}
) => {
  const fallbackUrl = resolveUrl(item?.image_url);
  const variants = item?.image_variants && typeof item.image_variants === 'object'
    ? item.image_variants
    : {};
  const fallbackSources = buildVariantSources(variants, fallbackUrl);
  const avifSources = variants.avif && typeof variants.avif === 'object'
    ? buildVariantSources(variants.avif)
    : null;
  const webpSources = variants.webp && typeof variants.webp === 'object'
    ? buildVariantSources(variants.webp)
    : null;
  const { thumbnailUrl, mediumUrl, largeUrl } = fallbackSources;
  const preferredUrls = { thumbnail: thumbnailUrl, medium: mediumUrl, large: largeUrl };

  return {
    src: preferredUrls[preferred] || mediumUrl || fallbackUrl,
    thumbnailUrl,
    mediumUrl,
    largeUrl,
    srcSet: fallbackSources.srcSet,
    avifSrcSet: avifSources?.srcSet,
    webpSrcSet: webpSources?.srcSet,
    placeholderUrl: resolveUrl(variants.placeholder_url),
    version: Number(variants.version || 1)
  };
};
