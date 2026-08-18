// Voucher domain error constructors and the single reason-code registry.
//
// Two helpers, not one, because the promo engine's `promoError` only ever expresses 422 and a voucher
// admin API genuinely needs both halves of the split:
//
//   - `voucherError`   -> 422 VALIDATION_FAILED. The payload is wrong or the requested state change
//                         is semantically invalid.
//   - `voucherConflict` -> 409 CONFLICT. The payload is well-formed but conflicts with server state
//                         (duplicate code, stale version, illegal transition, archived voucher).
//
// A duplicate `code` is the clearest case: nothing about the request is malformed, it just lost a
// race with an existing row, which is exactly what `DomainErrorCode.CONFLICT` -> 409 already means in
// `shared/contracts/domainErrors.js`.

import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { VOUCHER_ELIGIBILITY_REASON_CODES } from './voucherEligibilityPolicy.js';

// Eligibility codes are re-exported from their owning policy rather than restated, so the registry
// cannot drift from what the evaluator actually emits.
export const VoucherReasonCode = Object.freeze({
    ...VOUCHER_ELIGIBILITY_REASON_CODES,

    // CRUD / lifecycle codes, owned here.
    VOUCHER_CODE_ALREADY_EXISTS: 'VOUCHER_CODE_ALREADY_EXISTS',
    VOUCHER_CODE_IMMUTABLE: 'VOUCHER_CODE_IMMUTABLE',
    VOUCHER_VERSION_CONFLICT: 'VOUCHER_VERSION_CONFLICT',
    VOUCHER_INVALID_STATUS_TRANSITION: 'VOUCHER_INVALID_STATUS_TRANSITION',
    VOUCHER_ARCHIVED_IMMUTABLE: 'VOUCHER_ARCHIVED_IMMUTABLE',
    VOUCHER_FIXED_PRICE_REQUIRES_SCOPE: 'VOUCHER_FIXED_PRICE_REQUIRES_SCOPE',
    VOUCHER_SCOPE_REF_NOT_FOUND: 'VOUCHER_SCOPE_REF_NOT_FOUND',
    VOUCHER_VALIDITY_WINDOW_ELAPSED: 'VOUCHER_VALIDITY_WINDOW_ELAPSED',
    VOUCHER_VALIDITY_WINDOW_INVALID: 'VOUCHER_VALIDITY_WINDOW_INVALID',
    VOUCHER_TIME_WINDOW_INCOMPLETE: 'VOUCHER_TIME_WINDOW_INCOMPLETE',
    VOUCHER_BENEFIT_CONFIG_INVALID: 'VOUCHER_BENEFIT_CONFIG_INVALID',

    // Redemption codes (Phase 105, #455). ADR 0066 decision 7: two parties both claiming the right
    // to set the final unit price is undefined, so a fixed-price voucher is refused outright under
    // an active affiliate attribution rather than resolved silently.
    VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT: 'VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT',
    // ADR 0066 decision 3: checkout fails closed. A scope that resolves to zero cart-eligible items
    // is not "no discount" -- it is a redemption attempt that cannot be honored, so it blocks.
    VOUCHER_SCOPE_NO_ELIGIBLE_ITEMS: 'VOUCHER_SCOPE_NO_ELIGIBLE_ITEMS',
    // #697: `allow_below_cost` (stored on the voucher since #455, never previously enforced). Fails
    // closed at redemption when the resolved voucher price on any eligible, discounted line would
    // undercut that line's `cost_per_unit` and the voucher does not explicitly permit it.
    VOUCHER_PRICE_BELOW_COST: 'VOUCHER_PRICE_BELOW_COST',

    // #604: tenant-wide POS voucher redemption master switch, default off. Distinct from a voucher's
    // own `channels` mask (VOUCHER_CHANNEL_BITS.pos, evaluated in voucherEligibilityPolicy.js) --
    // this can disable POS redemption tenant-wide even for a voucher whose channels already include
    // `pos`. No live caller exists yet (POS redemption itself is not built); this reason code exists
    // so the gate is ready and fails closed the moment a POS caller does exist.
    VOUCHER_POS_REDEMPTION_DISABLED: 'VOUCHER_POS_REDEMPTION_DISABLED'
});

export const voucherError = (message, reasonCode, details = {}) => {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, message, {
        statusCode: 422,
        details: { reason_code: reasonCode, ...details }
    });
};

export const voucherConflict = (message, reasonCode, details = {}) => {
    throw new DomainError(DomainErrorCode.CONFLICT, message, {
        statusCode: 409,
        details: { reason_code: reasonCode, ...details }
    });
};

export const voucherNotFound = (message = 'Voucher not found', details = {}) => {
    throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, message, {
        statusCode: 404,
        details: { reason_code: VoucherReasonCode.VOUCHER_NOT_FOUND, ...details }
    });
};
