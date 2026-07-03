const DEFAULT_STOREFRONT_SLUG = String(import.meta.env.VITE_DEFAULT_STOREFRONT_SLUG || 'dgfy-cafe-demo')
  .trim()
  .toLowerCase();

export const DEFAULT_STOREFRONT_PATH = `/tenant-store/${encodeURIComponent(DEFAULT_STOREFRONT_SLUG)}`;

export const getDefaultStorefrontPath = (query = '') => `${DEFAULT_STOREFRONT_PATH}${query || ''}`;

export { DEFAULT_STOREFRONT_SLUG };
