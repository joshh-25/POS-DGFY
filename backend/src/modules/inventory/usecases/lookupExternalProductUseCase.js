import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { hasValidGtinCheckDigit, normalizeGtin } from '../../shared/utils/barcodePolicy.js';

export const buildLookupExternalProductUseCase = ({ productRegistry, cache = null }) => {
  return async ({ code }) => {
    const gtin = normalizeGtin(code);
    if (!hasValidGtinCheckDigit(gtin)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Enter a valid UPC, EAN, or GTIN barcode with a correct check digit.',
        { statusCode: 422 }
      );
    }

    const cacheKey = `external-product:${productRegistry.name}:${gtin}`;
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
      const normalizedResult = {
        ...result,
        code: gtin
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
