import { dgfyAffiliateRepository } from '../repositories/dgfyAffiliateRepository.js';
import { storefrontDomainRepository } from '../../storefrontDomains/index.js';

const normalizeHttpOrigin = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return url.origin;
    } catch {
        return null;
    }
};

const appendTrackingPin = (origin, pathname, trackingPin) => {
    const url = new URL(pathname, origin);
    url.search = `?pin=${encodeURIComponent(trackingPin)}`;
    return url.toString();
};

/** Resolve the customer-facing tracking URL without making order confirmation depend on it. */
export const buildStorefrontTrackingUrl = async ({ tenantId, trackingPin } = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    const normalizedPin = String(trackingPin || '').trim();
    if (!normalizedTenantId || !normalizedPin) return null;

    try {
        const origins = await storefrontDomainRepository.listActiveCanonicalOriginsByTenantIds([normalizedTenantId]);
        const customOrigin = normalizeHttpOrigin(origins?.get(normalizedTenantId));
        if (customOrigin) return appendTrackingPin(customOrigin, '/track', normalizedPin);
    } catch {
        // A domain lookup failure should still allow the canonical slug URL below.
    }

    try {
        const slug = String(await dgfyAffiliateRepository.getStorefrontSlug(normalizedTenantId) || '').trim();
        const publicOrigin = normalizeHttpOrigin(process.env.STOREFRONT_PUBLIC_ORIGIN);
        if (!slug || !publicOrigin) return null;
        const encodedSlug = encodeURIComponent(slug);
        return appendTrackingPin(publicOrigin, `/tenant-store/${encodedSlug}/track`, normalizedPin);
    } catch {
        return null;
    }
};

export default buildStorefrontTrackingUrl;
