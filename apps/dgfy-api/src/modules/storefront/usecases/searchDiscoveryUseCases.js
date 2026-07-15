import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// searchDiscoveryUseCases.js — Clean Architecture Application layer for the
// PUBLIC storefront discovery search (STF-01), mirroring
// ../../products/usecases/productUseCases.js's self-contained convention
// (validation + delegate-to-repository + always return ApplicationResult,
// no HTTP concerns, no direct model imports).

const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 50;
const MIN_RADIUS_KM = 0.1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const validationError = (message) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400 }
);

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const clampNumber = (value, { fallback, min, max }) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return Math.min(Math.max(num, min), max);
};

const clampInt = (value, { fallback, min, max }) => {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(Math.max(num, min), max);
};

/**
 * Distance-ranked storefront discovery search. Returns ONLY opaque store
 * references (handle/display_name/distance_km) — never a raw sequential
 * `storefront_discovery_index.id`/`business_id` (T-10-03-02, IDOR guard).
 *
 * @param {{repository}} deps
 */
export function buildSearchDiscoveryUseCase({ repository }) {
    return async (input = {}) => {
        const lat = Number(input.lat);
        const lng = Number(input.lng);

        if (input.lat === undefined || input.lat === null || !isFiniteNumber(lat) || lat < -90 || lat > 90) {
            return ApplicationResult.failure(validationError('lat must be a valid latitude between -90 and 90.'));
        }
        if (input.lng === undefined || input.lng === null || !isFiniteNumber(lng) || lng < -180 || lng > 180) {
            return ApplicationResult.failure(validationError('lng must be a valid longitude between -180 and 180.'));
        }

        const radiusKm = clampNumber(input.radiusKm, { fallback: DEFAULT_RADIUS_KM, min: MIN_RADIUS_KM, max: MAX_RADIUS_KM });
        const limit = clampInt(input.limit, { fallback: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
        const offset = clampInt(input.offset, { fallback: 0, min: 0, max: Number.MAX_SAFE_INTEGER });

        const query = typeof input.query === 'string' ? input.query.trim() : '';
        const category = typeof input.category === 'string' && input.category.trim() ? input.category.trim() : null;
        const openNow = input.openNow === true || input.openNow === 'true';

        const rows = await repository.searchNearby({
            lat,
            lng,
            radiusKm,
            query: query || null,
            category,
            openNow,
            limit,
            offset
        });

        const stores = (rows || []).map((row) => ({
            handle: row.handle,
            display_name: row.display_name,
            distance_km: row.distance_km != null ? Math.round(Number(row.distance_km) * 100) / 100 : null
        }));

        return ApplicationResult.success({ stores, radius_km: radiusKm, limit, offset });
    };
}

export default buildSearchDiscoveryUseCase;
