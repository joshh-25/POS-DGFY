import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { hasValidGtinCheckDigit, normalizeGtin } from '../../shared/utils/barcodePolicy.js';

export const buildLookupExternalProductUseCase = ({ productRegistry, priceRegistry = null, cache = null }) => {
  return async ({ code, includeSuggestedPrice = true }) => {
    const gtin = normalizeGtin(code);
    if (!hasValidGtinCheckDigit(gtin)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Invalid GTIN check digit. Scan a real package barcode or enter item details manually.',
        { statusCode: 422 }
      );
    }

    const shouldIncludeSuggestedPrice = includeSuggestedPrice !== false && Boolean(priceRegistry?.lookupSuggestedPriceByGtin);
    const providerKey = shouldIncludeSuggestedPrice ? `${productRegistry.name}:${priceRegistry.name}` : productRegistry.name;
    const cacheKey = `external-product:v2:${providerKey}:${gtin}`;
    const cached = cache ? await cache.get(cacheKey) : null;
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Ignore malformed cache entries and refresh from the provider.
      }
    }

    try {
      const result = await productRegistry.lookupByGtin(gtin);
      let suggestedPrice = null;
      if (result?.found && shouldIncludeSuggestedPrice) {
        try {
          suggestedPrice = await priceRegistry.lookupSuggestedPriceByGtin(gtin);
        } catch {
          // Price enrichment is advisory and must never block product lookup or manual item creation.
        }
      }
      const normalizedResult = {
        ...result,
        code: gtin,
        ...(suggestedPrice ? { suggested_price: suggestedPrice } : {})
      };
      if (cache) {
        await cache.set(cacheKey, JSON.stringify(normalizedResult), result.found ? 86400 : 900);
      }
      return normalizedResult;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new DomainError(
          DomainErrorCode.SERVICE_UNAVAILABLE,
          'The product registry timed out. Enter the item manually or try again.',
          { details: { reason_code: 'PRODUCT_REGISTRY_TIMEOUT' } }
        );
      }
      throw new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        'The product registry is temporarily unavailable. Enter the item manually or try again.',
        { details: { reason_code: 'PRODUCT_REGISTRY_UNAVAILABLE' } }
      );
    }
  };
};

export default buildLookupExternalProductUseCase;
