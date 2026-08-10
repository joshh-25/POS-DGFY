import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const normalizeSkuCode = (value) => String(value || '').trim();

/**
 * Read-side port for a tenant's delegated external IMS (Phase 9, ADR 0038
 * port pattern - mirrors buildLookupExternalProductUseCase's exact
 * resilience shape: validate locally before calling out, cache-aside with a
 * TTL, map provider failures to typed DomainErrors with an operator-facing
 * "fall back to the local mirror" message).
 *
 * This does not replace the local mirror/ledger - stockBearingPolicy.js's
 * TRACKING_MODE.EXTERNAL_IMS branch keeps tracks_quantity/emits_movements
 * true unconditionally, so POS/Storefront checkout always has a local
 * number to block on even if this lookup fails or is never called. This use
 * case exists for callers (a future reconciliation job, an operator-facing
 * "compare local vs. external" view) that want the *authoritative* remote
 * count for a delegated item.
 */
export const buildLookupDelegatedInventoryLevelUseCase = ({ delegatedInventoryProvider, cache = null, cacheTtlSeconds = 60 }) => {
    return async ({ skuCode }) => {
        const normalizedSku = normalizeSkuCode(skuCode);
        if (!normalizedSku) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'skuCode is required to look up a delegated inventory level.',
                { statusCode: 422 }
            );
        }

        const cacheKey = `delegated-inventory-level:${delegatedInventoryProvider.name}:${normalizedSku}`;
        const cached = cache ? await cache.get(cacheKey) : null;
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch {
                // Ignore malformed cache entries and refresh from the provider.
            }
        }

        try {
            const result = await delegatedInventoryProvider.lookupStockLevel(normalizedSku);
            const normalizedResult = {
                ...result,
                sku_code: normalizedSku
            };
            if (cache) {
                await cache.set(cacheKey, JSON.stringify(normalizedResult), cacheTtlSeconds);
            }
            return normalizedResult;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new DomainError(
                    DomainErrorCode.SERVICE_UNAVAILABLE,
                    'The delegated inventory provider timed out. Falling back to the local mirror count.',
                    { details: { reason_code: 'DELEGATED_INVENTORY_PROVIDER_TIMEOUT' } }
                );
            }
            throw new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'The delegated inventory provider is temporarily unavailable. Falling back to the local mirror count.',
                { details: { reason_code: 'DELEGATED_INVENTORY_PROVIDER_UNAVAILABLE' } }
            );
        }
    };
};

export default buildLookupDelegatedInventoryLevelUseCase;
