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
const buildResolvedImageSources = (fallbackUrl, variants = {}, preferred = 'medium') => {
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
    url: fallbackUrl,
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

const normalizeGalleryEntry = (entry, index, preferred) => {
  const rawEntry = typeof entry === 'string' ? { url: entry } : entry;
  if (!rawEntry || typeof rawEntry !== 'object') return null;

  const fallbackUrl = resolveUrl(rawEntry.url || rawEntry.image_url || rawEntry.src);
  if (!fallbackUrl) return null;

  const variants = rawEntry.variants && typeof rawEntry.variants === 'object'
    ? rawEntry.variants
    : rawEntry.image_variants && typeof rawEntry.image_variants === 'object'
      ? rawEntry.image_variants
      : {};

  return {
    ...buildResolvedImageSources(fallbackUrl, variants, preferred),
    isPrimary: rawEntry.is_primary === true,
    sortOrder: Number.isFinite(Number(rawEntry.sort_order)) ? Number(rawEntry.sort_order) : index
  };
};

export const resolveStorefrontImageGallery = (
  item,
  { preferred = 'medium' } = {}
) => {
  const fallbackUrl = resolveUrl(item?.image_url);
  const fallbackVariants = item?.image_variants && typeof item.image_variants === 'object'
    ? item.image_variants
    : {};
  const rawGallery = Array.isArray(item?.image_gallery) ? item.image_gallery : [];
  const seenUrls = new Set();
  const gallery = rawGallery
    .map((entry, index) => normalizeGalleryEntry(entry, index, preferred))
    .filter((entry) => {
      if (!entry || seenUrls.has(entry.url)) return false;
      seenUrls.add(entry.url);
      return true;
    });

  const fallbackIsPresent = fallbackUrl && gallery.some((entry) => (
    entry.url === fallbackUrl
      || entry.thumbnailUrl === fallbackUrl
      || entry.mediumUrl === fallbackUrl
      || entry.largeUrl === fallbackUrl
  ));

  if (fallbackUrl && !fallbackIsPresent) {
    gallery.unshift({
      ...buildResolvedImageSources(fallbackUrl, fallbackVariants, preferred),
      isPrimary: true,
      sortOrder: -1
    });
  }

  return gallery
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      return left.sortOrder - right.sortOrder;
    })
    .map((entry, index) => ({
      ...entry,
      isPrimary: index === 0,
      sortOrder: index
    }));
};

export const resolveStorefrontImageSources = (
  item,
  { preferred = 'medium' } = {}
) => {
  const fallbackUrl = resolveUrl(item?.image_url);
  const variants = item?.image_variants && typeof item.image_variants === 'object'
    ? item.image_variants
    : {};
  const gallery = resolveStorefrontImageGallery(item, { preferred });
  const primarySources = gallery[0] || buildResolvedImageSources(fallbackUrl, variants, preferred);

  return {
    ...primarySources,
    gallery
  };
};
