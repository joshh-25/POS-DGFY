// #2159: transitional Legacy Promos policy. This is the only vouchers-module file that knows how a
// setting-backed legacy promo (ADR 0033's `storefront_promo` / `storefront_promos` compatibility
// path) maps to an operator-facing DTO. It is deliberately separate from the first-class voucher
// domain: #991 retires this whole path, and nothing here should be reused for voucher entities.
//
// Revocation mutates the stored entry in place (adds `revoked` / `revoked_at` / `revoked_by`)
// rather than deleting it, so `used_count`, sibling entries, and every historical redemption and
// transaction snapshot survive.

import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    STOREFRONT_PROMO_SETTING_KEY,
    STOREFRONT_PROMOS_SETTING_KEY,
    normalizePromoCode,
    parseCommercialPromoConfigs,
    resolveCommercialPromoEffectiveState,
    resolveCommercialPromoTimezone
} from '../../shared/utils/commercialPromoPolicy.js';

export const LEGACY_PROMO_SOURCE_KEYS = Object.freeze([
    STOREFRONT_PROMO_SETTING_KEY,
    STOREFRONT_PROMOS_SETTING_KEY
]);

// `storefront_hours` rides along only so the effective state's date boundary is evaluated in the
// same timezone the checkout evaluator uses -- it is never written by this feature.
export const LEGACY_PROMO_SETTING_KEYS = Object.freeze([
    ...LEGACY_PROMO_SOURCE_KEYS,
    'storefront_hours'
]);

export const toLegacyPromoDto = (config, { now = new Date(), timezone } = {}) => ({
    source_key: config.sourceKey,
    source_index: Number.isInteger(config.sourceIndex) ? config.sourceIndex : null,
    promo_id: config.promoId || null,
    promo_code: config.promoCode,
    title: config.title,
    badge: config.badge,
    discount_percent: config.discountPercent,
    valid_from: config.validFrom,
    valid_until: config.validUntil,
    valid_time_start: config.validTimeStart,
    valid_time_end: config.validTimeEnd,
    usage_limit: config.usageLimit,
    used_count: config.usedCount,
    active: config.active,
    revoked: config.revoked,
    revoked_by: config.revokedBy || null,
    revoked_at: config.revokedAt || null,
    effective_state: resolveCommercialPromoEffectiveState(config, { now, timezone })
});

export const listLegacyPromoDtos = (settings = {}, { now = new Date() } = {}) => {
    const timezone = resolveCommercialPromoTimezone(settings);
    return parseCommercialPromoConfigs(settings).map((config) => toLegacyPromoDto(config, { now, timezone }));
};

const matchesStableIdentity = (config, { promoId, promoCode }) => {
    if (promoId) return config.promoId === promoId;
    if (promoCode) return config.promoCode === normalizePromoCode(promoCode);
    return false;
};

// Identity precedence follows the handoff: stored promo id first, normalized code second, and the
// guarded array position (`source_index`) only ever narrows an otherwise-ambiguous duplicate-code
// match. A caller that supplies a stale index alongside a unique code gets a 404, not a revoke of
// whatever now sits at that position -- the row lock/re-read is what makes the position meaningful.
export const locateLegacyPromoConfig = (configs = [], { sourceKey, promoId = '', promoCode = '', sourceIndex = null } = {}) => {
    const matches = configs.filter((config) => (
        config.sourceKey === sourceKey
        && matchesStableIdentity(config, { promoId, promoCode })
        && (sourceIndex == null || config.sourceIndex === sourceIndex)
    ));
    if (matches.length === 0) {
        throw new DomainError(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            'Legacy promo entry was not found.',
            { statusCode: 404, details: { source_key: sourceKey } }
        );
    }
    if (matches.length > 1) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Multiple legacy promo entries share this code; retry with promo_id or source_index.',
            {
                statusCode: 409,
                details: {
                    source_key: sourceKey,
                    reason_code: 'LEGACY_PROMO_AMBIGUOUS'
                }
            }
        );
    }
    return matches[0];
};

export const buildRevokedLegacyPromoValue = ({
    sourceKey,
    sourceIndex,
    entryValue,
    actorUsername = '',
    revokedAt
}) => {
    const revocation = {
        revoked: true,
        revoked_at: revokedAt,
        revoked_by: actorUsername || null
    };
    if (sourceKey === STOREFRONT_PROMOS_SETTING_KEY) {
        const entries = Array.isArray(entryValue) ? entryValue : [];
        return entries.map((entry, index) => (
            index === sourceIndex
                ? { ...(entry && typeof entry === 'object' ? entry : {}), ...revocation }
                : entry
        ));
    }
    return {
        ...(entryValue && typeof entryValue === 'object' && !Array.isArray(entryValue) ? entryValue : {}),
        ...revocation
    };
};
