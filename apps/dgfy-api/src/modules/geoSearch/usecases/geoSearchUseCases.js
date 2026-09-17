import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { localGeocodeProvider } from '../providers/localGeocodeProvider.js';

export const buildGeoSearchUseCase = ({ geoSearchRepository }) => {
    return async ({ query, latitude, longitude, radius, stockFilter, page, limit }) => {
        try {
            const result = await geoSearchRepository.searchNearbyStores({
                query, latitude, longitude, radius, stockFilter, page, limit
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

export const buildReverseGeocodeUseCase = () => {
    return async ({ latitude, longitude }) => {
        const lat = Number(latitude);
        const lon = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return validationFailure('Latitude and longitude are required.');
        }

        const local = await localGeocodeProvider.reverseGeocode({ latitude: lat, longitude: lon });
        return ok({ ...local, latitude: lat, longitude: lon });
    };
};

export const buildAddressSearchUseCase = () => {
    return async ({ query, limit = 8 }) => {
        const normalizedQuery = String(query || '').trim();
        if (normalizedQuery.length < 2) {
            return validationFailure('Enter at least 2 characters to search for an address.');
        }

        return ok(await localGeocodeProvider.searchAddresses({ query: normalizedQuery, limit }));
    };
};
