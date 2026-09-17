import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { quadruperGeocodeProvider } from '../providers/quadruperGeocodeProvider.js';
import { localGeocodeProvider } from '../providers/localGeocodeProvider.js';
import { geocodeCircuitBreaker } from '../providers/geocodeCircuitBreaker.js';
import { geocodeConfig } from '../../../config/geocodeConfig.js';
import {
    buildForwardCacheKey,
    buildReverseCacheKey,
    readCache,
    resolveImportDate,
    writeCache
} from '../providers/geocodeCache.js';

export const buildGeoSearchUseCase = ({ geoSearchRepository }) => {
    return async ({ query, latitude, longitude, radius, stockFilter, page, limit }) => {
        try {
            const result = await geoSearchRepository.searchNearbyStores({
                query,
                latitude,
                longitude,
                radius,
                stockFilter,
                page,
                limit
            });
            return ok(result);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Geo search failed',
                { statusCode: 500 }
            ));
        }
    };
};

const validationFailure = (message) => fail(new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 422 }
));

/**
 * When the kill switch is off we swap in a no-op remote provider rather than short-circuiting
 * inside callRemote. Gating the call path instead would make `geocodeConfig.enabled` override
 * an explicitly injected provider -- and since it defaults to false under NODE_ENV=test, every
 * injected fake would be silently unreachable. Production behaviour is identical either way:
 * disabled -> null -> fall through to the local provider.
 */
const disabledRemoteProvider = {
    reverseGeocode: async () => null,
    searchAddresses: async () => null
};

const defaultRemoteProvider = () => (
    geocodeConfig.enabled ? quadruperGeocodeProvider : disabledRemoteProvider
);

/**
 * Calls the remote provider through the breaker. Returns null on any failure so the caller
 * falls through to the local provider. Never throws.
 */
const callRemote = async (circuitBreaker, invoke) => {
    if (circuitBreaker.isOpen()) return null;

    try {
        const value = await invoke();
        // `undefined` is the provider's transport-failure sentinel. `null` is a genuine miss
        // (HTTP 200, no match) and must NOT trip the breaker, or a run of unmatched searches
        // would degrade every user to the bundled dataset for 60 seconds.
        if (value === undefined) {
            circuitBreaker.recordFailure();
            return null;
        }
        circuitBreaker.recordSuccess();
        return value;
    } catch (error) {
        circuitBreaker.recordFailure();
        return null;
    }
};

export const buildReverseGeocodeUseCase = ({
    remoteProvider = defaultRemoteProvider(),
    localProvider = localGeocodeProvider,
    circuitBreaker = geocodeCircuitBreaker
} = {}) => {
    return async ({ latitude, longitude }) => {
        const lat = Number(latitude);
        const lon = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return validationFailure('Latitude and longitude are required.');
        }

        const importDate = geocodeConfig.enabled ? await resolveImportDate() : 'local';
        const cacheKey = buildReverseCacheKey(importDate, lat, lon);

        const cached = await readCache(cacheKey);
        if (cached) return ok({ ...cached, latitude: lat, longitude: lon });

        const remote = await callRemote(circuitBreaker, () => remoteProvider.reverseGeocode({ latitude: lat, longitude: lon }));
        if (remote) {
            // Only successful remote answers are cached, so an outage cannot pin a degraded
            // result for the full TTL.
            await writeCache(cacheKey, remote);
            return ok({ ...remote, latitude: lat, longitude: lon });
        }

        const local = await localProvider.reverseGeocode({ latitude: lat, longitude: lon });
        return ok({ ...local, latitude: lat, longitude: lon });
    };
};

export const buildAddressSearchUseCase = ({
    remoteProvider = defaultRemoteProvider(),
    localProvider = localGeocodeProvider,
    circuitBreaker = geocodeCircuitBreaker
} = {}) => {
    return async ({ query, limit = 8, biasLatitude, biasLongitude }) => {
        const normalizedQuery = String(query || '').trim();
        if (normalizedQuery.length < 2) {
            return validationFailure('Enter at least 2 characters to search for an address.');
        }

        const importDate = geocodeConfig.enabled ? await resolveImportDate() : 'local';
        const cacheKey = buildForwardCacheKey(importDate, normalizedQuery, limit, biasLatitude, biasLongitude);

        const cached = await readCache(cacheKey);
        if (cached) return ok(cached);

        const remote = await callRemote(circuitBreaker, () => remoteProvider.searchAddresses({
            query: normalizedQuery, limit, biasLatitude, biasLongitude
        }));
        if (remote) {
            await writeCache(cacheKey, remote);
            return ok(remote);
        }

        return ok(await localProvider.searchAddresses({ query: normalizedQuery, limit }));
    };
};
