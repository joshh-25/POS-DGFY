const DEFAULT_BASE_URL = 'https://prices.openfoodfacts.org';
const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_MAX_AGE_DAYS = 365;

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

const toPositiveMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : null;
};

const isoDateDaysAgo = (days, now) => {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

const locationLabel = (location = {}) => (
  String(location.osm_display_name || location.osm_name || '').trim() || null
);

export const buildOpenPricesProductPriceRegistry = ({
  fetchImpl = globalThis.fetch,
  baseUrl = process.env.OPEN_PRICES_BASE_URL || DEFAULT_BASE_URL,
  userAgent = process.env.OPEN_FOOD_FACTS_USER_AGENT || 'DGFY-POS/1.0 (support@dgfy.ph)',
  timeoutMs = Number(process.env.OPEN_PRICES_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  maxAgeDays = Number(process.env.OPEN_PRICES_MAX_AGE_DAYS || DEFAULT_MAX_AGE_DAYS),
  now = () => new Date()
} = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for Open Prices lookup');
  }

  const normalizedBaseUrl = trimTrailingSlash(baseUrl) || DEFAULT_BASE_URL;
  const normalizedMaxAgeDays = Number.isFinite(maxAgeDays) && maxAgeDays > 0
    ? Math.floor(maxAgeDays)
    : DEFAULT_MAX_AGE_DAYS;

  return {
    name: 'open_prices',
    async lookupSuggestedPriceByGtin(code) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const query = new URLSearchParams({
        product_code: code,
        currency: 'PHP',
        date__gte: isoDateDaysAgo(normalizedMaxAgeDays, now()),
        duplicate_of__isnull: 'true',
        order_by: '-date',
        size: '20'
      });
      const url = `${normalizedBaseUrl}/api/v1/prices?${query.toString()}`;

      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': userAgent
          },
          signal: controller.signal
        });

        if (!response.ok) {
          const error = new Error(`Open Prices lookup failed with status ${response.status}`);
          error.statusCode = response.status;
          throw error;
        }

        const payload = await response.json();
        const records = Array.isArray(payload?.items) ? payload.items : [];
        const record = records.find((entry) => (
          String(entry?.currency || '').toUpperCase() === 'PHP'
          && String(entry?.location?.osm_address_country_code || '').toUpperCase() === 'PH'
          && toPositiveMoney(entry?.price_without_discount ?? entry?.price) !== null
        ));

        if (!record) return null;

        const regularPrice = toPositiveMoney(record.price_without_discount);
        const observedPrice = toPositiveMoney(record.price);
        return {
          amount: regularPrice ?? observedPrice,
          observed_amount: observedPrice,
          currency: 'PHP',
          observed_at: record.date || null,
          location: locationLabel(record.location),
          discounted: record.price_is_discounted === true,
          provider: this.name,
          provider_price_url: url,
          label: regularPrice ? 'Observed regular price' : 'Observed price',
          disclaimer: 'Crowdsourced Philippine price reference. Review before using; this is not a verified manufacturer SRP.'
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
};

export default buildOpenPricesProductPriceRegistry;
