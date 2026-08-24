import { readRecentStores } from '../../shared/model/storefrontCustomerStorage.js';

const DEFAULT_STOREFRONT_SLUG = String(import.meta.env.VITE_DEFAULT_STOREFRONT_SLUG || 'dgfy-cafe-demo')
  .trim()
  .toLowerCase();

const toSlug = (value) => String(value || '').trim().toLowerCase();

export const DEFAULT_STOREFRONT_PATH = `/tenant-store/${encodeURIComponent(DEFAULT_STOREFRONT_SLUG)}`;

export const getDefaultStorefrontPath = (query = '') => `${DEFAULT_STOREFRONT_PATH}${query || ''}`;

export const findCanonicalStorefrontSlug = (requestedSlug, stores = []) => {
  const normalizedRequestedSlug = toSlug(requestedSlug);
  if (!normalizedRequestedSlug) return '';

  const candidates = Array.isArray(stores) ? stores : [];
  const exactSlugMatch = candidates.find((store) => toSlug(store?.slug) === normalizedRequestedSlug);
  if (exactSlugMatch?.slug) return toSlug(exactSlugMatch.slug);

  const slugPrefixMatch = candidates.find((store) => toSlug(store?.slug).startsWith(`${normalizedRequestedSlug}-`));
  if (slugPrefixMatch?.slug) return toSlug(slugPrefixMatch.slug);

  const tenantNameMatch = candidates.find((store) => toSlug(store?.tenant_name) === normalizedRequestedSlug);
  if (tenantNameMatch?.slug) return toSlug(tenantNameMatch.slug);

  return '';
};

export const buildStorefrontSlugFallbackQueries = (requestedSlug) => {
  const normalizedRequestedSlug = toSlug(requestedSlug);
  if (!normalizedRequestedSlug) return [];

  const withoutHashSuffix = normalizedRequestedSlug
    .replace(/-[0-9a-f]{6,}$/i, '')
    .replace(/-[0-9]{4,}$/i, '');
  const candidates = [
    normalizedRequestedSlug,
    withoutHashSuffix,
    withoutHashSuffix.replace(/-/g, ' '),
    normalizedRequestedSlug.replace(/-/g, ' ')
  ];

  return Array.from(new Set(candidates.map((candidate) => String(candidate || '').trim()).filter(Boolean)));
};

export const buildKnownStoreRouteCandidates = (selectedStore, stores = []) => {
  const recentStores = readRecentStores();
  return [
    selectedStore,
    ...(Array.isArray(stores) ? stores : []),
    ...recentStores
  ].filter(Boolean);
};

export { DEFAULT_STOREFRONT_SLUG };
