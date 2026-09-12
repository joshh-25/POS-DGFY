import { calculateRouteUseCase as defaultCalculateRouteUseCase } from '../../routeCalculator/index.js';

// Phase 236 (#1328, epic #1321). Observation-only road-distance capture: wraps
// routeCalculator's existing calculateRouteUseCase (which already normalizes every failure --
// disabled, timeout, GraphHopper 4xx/5xx, unmapped -- into an ApplicationResult that never
// throws/rejects) with a per-call timeout and a small in-process cache, so checkout can fire this
// call without risking the checkout's own latency budget. Never feeds delivery fee math -- see
// this module's README and the Phase 236 compliance impact declaration for the boundary.

// 600ms, not the ticket's full 800ms budget -- self-hosted GraphHopper on the same infra should
// answer in tens-to-low-hundreds of ms normally, so this leaves real headroom before falling back.
// Explicitly provisional: a real production timeout for #237 should be sized off measured p95/p99
// latency, not this placeholder.
const ROAD_DISTANCE_TIMEOUT_MS = 600;

// 6h TTL, 500-entry FIFO cap -- a delivery destination is unlikely to move within a session, and
// GraphHopper is deterministic for the same coordinate tuple, so a long-lived cache meaningfully
// cuts repeat-call latency/load without sharing results between materially different routes.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

// Phase 328: the cache identity is the complete route input. Do not round coordinates into a grid:
// a nearby destination or a moved store origin can produce a materially different road distance.
// JSON encoding keeps tenant/location delimiters collision-safe, while canonicalizing numeric
// strings means equivalent API values share one entry. Missing identity/coordinates bypass caching
// rather than allowing an "undefined" key to join unrelated requests.
const toFiniteCoordinate = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Object.is(numeric, -0) ? 0 : numeric;
};

const buildCacheKey = ({ tenantId, locationId, originLat, originLng, destLat, destLng }) => {
    if (tenantId === null || tenantId === undefined || String(tenantId).trim() === '') return null;
    if (locationId === null || locationId === undefined || String(locationId).trim() === '') return null;

    const coordinates = [originLat, originLng, destLat, destLng].map(toFiniteCoordinate);
    if (coordinates.some((coordinate) => coordinate === null)) return null;

    return JSON.stringify([
        String(tenantId).trim(),
        String(locationId).trim(),
        ...coordinates
    ]);
};

const isCacheableDistance = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const readCache = (cache, key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    if (!isCacheableDistance(entry.value?.distanceMeters)) {
        cache.delete(key);
        return null;
    }
    return entry.value;
};

const writeCache = (cache, key) => (value) => {
    // Only successful results are cached -- a transient GraphHopper hiccup must never poison the
    // same address for the full TTL.
    if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }
    cache.set(key, { value, storedAt: Date.now() });
    return value;
};

export const buildRoadDistanceProvider = ({
    calculateRouteUseCase = defaultCalculateRouteUseCase,
    timeoutMs = ROAD_DISTANCE_TIMEOUT_MS
} = {}) => {
    const cache = new Map();

    const resolveRoadDistance = async ({ tenantId, locationId, originLat, originLng, destLat, destLng }) => {
        const cacheKey = buildCacheKey({ tenantId, locationId, originLat, originLng, destLat, destLng });
        const cached = cacheKey ? readCache(cache, cacheKey) : null;
        if (cached) return cached;

        try {
            const result = await calculateRouteUseCase({ originLat, originLng, destLat, destLng, timeoutMs });
            if (!result.success) {
                return { distanceMeters: null, source: 'unavailable' };
            }
            const distanceMeters = result.data?.distance_meters;
            if (!isCacheableDistance(distanceMeters)) {
                return { distanceMeters: null, source: 'unavailable' };
            }
            const normalized = { distanceMeters, source: 'road' };
            if (cacheKey) writeCache(cache, cacheKey)(normalized);
            return normalized;
        } catch {
            // Belt-and-suspenders only -- calculateRouteUseCase already collapses every failure
            // mode into a non-throwing ApplicationResult (see routeCalculatorUseCases.js). This
            // catch exists so a future change to that contract can never turn into an unhandled
            // rejection reaching checkout.
            return { distanceMeters: null, source: 'unavailable' };
        }
    };

    return { resolveRoadDistance };
};

export const roadDistanceProvider = buildRoadDistanceProvider();
