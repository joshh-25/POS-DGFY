import { resolveAssetUrl } from './assetUrl.js';

// Generic primitive for building `ResponsiveImage`'s `sources` prop from a
// single named variants object the caller already has in hand
// (`pos_image_variants` or `storefront_image_variants` -- picked by the
// caller, not by this util). Deliberately not a refactor of the two existing,
// feature-specific resolvers -- `resolvePosCatalogImageSources`
// (posCheckoutTerminalUtils.js) and `resolveStorefrontImageSources`
// (storefrontImageSources.js) each resolve asset origin through a different
// runtime and each hardcode their own pos-vs-storefront-fallback precedence;
// collapsing them into this util would conflate two different concerns. This
// exists for call sites that have no existing resolver of their own.
const DEFAULT_VARIANT_WIDTHS = Object.freeze({ thumbnail: 400, medium: 1024, large: 1920 });

const buildVariantSet = (variantSet = {}, widths = DEFAULT_VARIANT_WIDTHS) => {
  const thumbnailUrl = resolveAssetUrl(variantSet?.thumbnail_url || '');
  const mediumUrl = resolveAssetUrl(variantSet?.medium_url || '');
  const largeUrl = resolveAssetUrl(variantSet?.large_url || '');
  const candidates = new Map();
  [[thumbnailUrl, widths.thumbnail], [mediumUrl, widths.medium], [largeUrl, widths.large]]
    .forEach(([url, width]) => { if (url && !candidates.has(url)) candidates.set(url, width); });
  return {
    thumbnailUrl,
    mediumUrl,
    largeUrl,
    srcSet: candidates.size > 1
      ? Array.from(candidates, ([url, width]) => `${url} ${width}w`).join(', ')
      : undefined
  };
};

export const buildImageVariantSources = ({
  url = '',
  variants = {},
  preferred = 'large',
  widths = DEFAULT_VARIANT_WIDTHS
} = {}) => {
  const fallbackUrl = resolveAssetUrl(url);
  const fallbackSet = buildVariantSet(variants, widths);
  const avifSet = variants?.avif && typeof variants.avif === 'object' ? buildVariantSet(variants.avif, widths) : null;
  const webpSet = variants?.webp && typeof variants.webp === 'object' ? buildVariantSet(variants.webp, widths) : null;
  const preferredUrls = { thumbnail: fallbackSet.thumbnailUrl, medium: fallbackSet.mediumUrl, large: fallbackSet.largeUrl };

  return {
    src: preferredUrls[preferred] || fallbackUrl || '',
    thumbnailUrl: fallbackSet.thumbnailUrl,
    mediumUrl: fallbackSet.mediumUrl,
    largeUrl: fallbackSet.largeUrl,
    srcSet: fallbackSet.srcSet,
    avifSrcSet: avifSet?.srcSet,
    webpSrcSet: webpSet?.srcSet,
    placeholderSrc: resolveAssetUrl(variants?.placeholder_url || ''),
    placeholderUrl: resolveAssetUrl(variants?.placeholder_url || ''),
    version: Number(variants?.version || 1)
  };
};

export default buildImageVariantSources;
