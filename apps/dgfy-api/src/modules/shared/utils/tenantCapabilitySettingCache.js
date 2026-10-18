const CACHE_TTL_MS = 15_000;
const cache = new Map();
const inFlight = new Map();

const buildCacheKey = (tenantId, settingKey) => `${tenantId}:${settingKey}`;

/**
 * Cache parsed tenant capability flags in-process for 15 seconds. This matches
 * the workflow capability cache's short authorization-setting TTL while
 * avoiding a Redis/network hop on a request path already under pool pressure.
 *
 * Invalidating after a write updates this API process immediately. Other API
 * instances may serve the prior value for at most the 15-second TTL.
 */
export const getCachedCapabilityEnabled = async (tenantId, settingKey, loader) => {
    if (tenantId == null || String(tenantId).trim() === '') {
        return Boolean(await loader());
    }

    const cacheKey = buildCacheKey(tenantId, settingKey);
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.enabled;
    }
    if (cached) cache.delete(cacheKey);

    const pending = inFlight.get(cacheKey);
    if (pending) return pending.promise;

    const entry = { promise: null };
    entry.promise = Promise.resolve()
        .then(loader)
        .then((enabled) => {
            const parsedEnabled = Boolean(enabled);
            // A write may invalidate this load while it is in flight. Only the
            // current entry may repopulate the cache after it resolves.
            if (inFlight.get(cacheKey) === entry) {
                cache.set(cacheKey, {
                    enabled: parsedEnabled,
                    expiresAt: Date.now() + CACHE_TTL_MS
                });
            }
            return parsedEnabled;
        })
        .finally(() => {
            if (inFlight.get(cacheKey) === entry) inFlight.delete(cacheKey);
        });
    inFlight.set(cacheKey, entry);
    return entry.promise;
};

export const invalidateTenantCapabilityCache = (tenantId) => {
    if (tenantId == null) {
        cache.clear();
        inFlight.clear();
        return;
    }

    const prefix = `${tenantId}:`;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) cache.delete(key);
    }
    for (const key of inFlight.keys()) {
        if (key.startsWith(prefix)) inFlight.delete(key);
    }
};

// Test-only reset so cache state cannot leak between route-gate cases.
export const clearTenantCapabilityCache = () => {
    cache.clear();
    inFlight.clear();
};
