const DEFAULT_BASE_URL = 'https://world.openfoodfacts.org';
const DEFAULT_TIMEOUT_MS = 5000;

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

const firstCategory = (product = {}) => {
  const categories = String(product.categories || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (categories.length > 0) return categories[0];

  const tag = Array.isArray(product.categories_tags) ? product.categories_tags[0] : null;
  return tag ? String(tag).replace(/^[a-z]{2}:/i, '').replace(/-/g, ' ') : null;
};

export const buildOpenFoodFactsProductRegistry = ({
  fetchImpl = globalThis.fetch,
  baseUrl = process.env.OPEN_FOOD_FACTS_BASE_URL || DEFAULT_BASE_URL,
  userAgent = process.env.OPEN_FOOD_FACTS_USER_AGENT || 'DGFY-POS/1.0 (support@dgfy.ph)',
  timeoutMs = Number(process.env.OPEN_FOOD_FACTS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
} = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for Open Food Facts lookup');
  }

  const normalizedBaseUrl = trimTrailingSlash(baseUrl) || DEFAULT_BASE_URL;

  return {
    name: 'open_food_facts',
    async lookupByGtin(code) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const fields = [
        'code',
        'product_name',
        'brands',
        'categories',
        'categories_tags',
        'image_front_url',
        'quantity'
      ].join(',');
      const url = `${normalizedBaseUrl}/api/v3/product/${encodeURIComponent(code)}.json?fields=${fields}&product_type=all`;

      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': userAgent
          },
          signal: controller.signal
        });

        if (response.status === 404) return { found: false, provider: this.name };
        if (!response.ok) {
          const error = new Error(`Open Food Facts lookup failed with status ${response.status}`);
          error.statusCode = response.status;
          throw error;
        }

        const payload = await response.json();
        const product = payload?.product;
        if (!product || payload?.status === 'failure') {
          return { found: false, provider: this.name };
        }

        return {
          found: true,
          provider: this.name,
          product: {
            barcode: String(product.code || code),
            name: String(product.product_name || '').trim() || null,
            brand: String(product.brands || '').trim() || null,
            category_suggestion: firstCategory(product),
            quantity: String(product.quantity || '').trim() || null,
            image_url: String(product.image_front_url || '').trim() || null,
            provider_product_url: `${normalizedBaseUrl}/product/${encodeURIComponent(code)}`
          },
          attribution: {
            label: 'Product data from Open Food Facts',
            url: 'https://world.openfoodfacts.org/',
            database_license: 'ODbL',
            image_license: 'CC BY-SA'
          }
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
};

export default buildOpenFoodFactsProductRegistry;
