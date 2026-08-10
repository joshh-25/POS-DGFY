import { storefrontDomainRepository } from '../repositories/storefrontDomainRepository.js';
import { storefrontDomainFeaturePolicy } from './storefrontDomainFeaturePolicy.js';
import { normalizeStorefrontHostname } from '../utils/hostnamePolicy.js';

const CACHE_TTL_MS = 30_000;
const cache = new Map();

export const clearStorefrontDomainResolverCache = (hostname = '') => {
    if (hostname) cache.delete(String(hostname).toLowerCase());
    else cache.clear();
};

export const resolveActiveStorefrontDomain = async (hostname) => {
    let normalized;
    try { normalized = normalizeStorefrontHostname(hostname); } catch { return null; }
    const cached = cache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await storefrontDomainRepository.resolveActiveByHostname(normalized);
    if (value && !storefrontDomainFeaturePolicy.isTenantAllowed(value.tenant?.id)) {
        cache.set(normalized, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
        return null;
    }
    cache.set(normalized, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
};
