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
    // #1490: min_spend_centavos/max_order_value_centavos deadlock guard (both set, max < min).
    VOUCHER_ORDER_VALUE_RANGE_INVALID: 'VOUCHER_ORDER_VALUE_RANGE_INVALID',
    // #1494: create/update requires an authenticated actor to stamp created_by/updated_by --
    // matches deliveryRunUseCases.js's stricter hard-fail-401 behavior for a missing req.user.
    VOUCHER_ACTOR_REQUIRED: 'VOUCHER_ACTOR_REQUIRED',
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

    // #667 / ADR 0066 decision 8: storefront had no equivalent of POS's single-governed-discount-
    // slot rule -- voucher_code and promo_code both applied and summed at storefront checkout, with
    // no cap and no mutual-exclusivity check. Reuses the same reason code decision 8 already
    // documents for POS (a voucher yields to an already-occupied discount slot) rather than
    // inventing a storefront-specific code -- see storeUseCases.js's resolveCheckoutContext, the
    // first actual caller of this code (POS voucher redemption itself is not built yet).
    VOUCHER_DISCOUNT_SLOT_OCCUPIED: 'VOUCHER_DISCOUNT_SLOT_OCCUPIED',

    // #1331 (Phase 240): a code entered into the wrong axis-specific field -- an item-targeted
    // voucher submitted via `delivery_voucher_code`, or a delivery-targeted voucher submitted via
    // `voucher_code`. Raised by storeUseCases.js's resolveCheckoutContext for both directions,
    // rather than letting the second direction fall through to the domain layer's
    // INVALID_DELIVERY_FEE_CENTAVOS (correct but a misleading, internal-error-shaped reason).
    VOUCHER_BENEFIT_TARGET_MISMATCH: 'VOUCHER_BENEFIT_TARGET_MISMATCH',

    // #604: tenant-wide POS voucher redemption master switch, default off. Distinct from a voucher's
    // own `channels` mask (VOUCHER_CHANNEL_BITS.pos, evaluated in voucherEligibilityPolicy.js) --
    // this can disable POS redemption tenant-wide even for a voucher whose channels already include
    // `pos`. No live caller exists yet (POS redemption itself is not built); this reason code exists
    // so the gate is ready and fails closed the moment a POS caller does exist.
    VOUCHER_POS_REDEMPTION_DISABLED: 'VOUCHER_POS_REDEMPTION_DISABLED',

    // #696: pricelist entity (per-item fixed prices, extends #584). A fixed_price voucher carries
    // EITHER fixed_unit_price_centavos OR pricelist_id, never both -- enforced in
    // voucherUseCases.js's applyBenefitConfig, the same choke point that already re-runs on create,
    // update, and activation.
    VOUCHER_PRICELIST_CONFLICT: 'VOUCHER_PRICELIST_CONFLICT',
    VOUCHER_PRICELIST_REF_NOT_FOUND: 'VOUCHER_PRICELIST_REF_NOT_FOUND',
    // A voucher may only attach an `active` pricelist -- a `draft` pricelist's rows are still being
    // edited (and may be mid-autosave), and an `archived` one is retired. `assertPricelistRef`
    // (voucherUseCases.js) checks this at attach-time. #717: status is now ALSO re-checked at use
    // time (redemption and display), not attach-time only -- see voucherRedemptionUseCases.js and
    // voucherDisplayUseCases.js. This code is raised by both checks.
    VOUCHER_PRICELIST_NOT_ACTIVE: 'VOUCHER_PRICELIST_NOT_ACTIVE',

    // Pricelist lifecycle codes, mirroring the equivalent voucher codes above one for one.
    PRICELIST_NOT_FOUND: 'PRICELIST_NOT_FOUND',
    PRICELIST_VERSION_CONFLICT: 'PRICELIST_VERSION_CONFLICT',
    PRICELIST_ARCHIVED_IMMUTABLE: 'PRICELIST_ARCHIVED_IMMUTABLE',
    // #717: raised by POST /:id/archive when at least one voucher still references this pricelist
    // (`countVouchersUsingPricelist`, checked inside the same lock as the archive itself) -- without
    // this, archiving a pricelist a live voucher attached silently left that voucher pricing every
    // future redemption against a retired price list (VOUCHER_PRICELIST_NOT_ACTIVE closes that gap
    // at use-time; this code is the earlier, better UX -- catch it before the archive commits).
    PRICELIST_IN_USE_BY_VOUCHER: 'PRICELIST_IN_USE_BY_VOUCHER',
    PRICELIST_ITEM_REF_NOT_FOUND: 'PRICELIST_ITEM_REF_NOT_FOUND',
    // Raised by POST /:id/publish when the target is neither a draft revision
    // (`draft_of_pricelist_id` set) nor a first-time-publishable draft (`status: 'draft'` with no
    // parent) -- i.e. publishing an already-active, non-revision pricelist, which is a no-op the
    // caller almost certainly did not intend.
    PRICELIST_NOT_PUBLISHABLE: 'PRICELIST_NOT_PUBLISHABLE'
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

// #1494: create/update must know who the actor is to stamp created_by/updated_by. The voucher
// admin routes already require `authenticate` ahead of the controller, so this should never
// actually trigger in practice -- hard-fail rather than silently persisting a null actor, matching
// deliveryRunUseCases.js's stricter behavior for the equivalent case.
export const voucherUnauthorized = (message = 'Authenticated user is required', details = {}) => {
    throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, message, {
        statusCode: 401,
        details: { reason_code: VoucherReasonCode.VOUCHER_ACTOR_REQUIRED, ...details }
    });
};

export const pricelistNotFound = (message = 'Pricelist not found', details = {}) => {
    throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, message, {
        statusCode: 404,
        details: { reason_code: VoucherReasonCode.PRICELIST_NOT_FOUND, ...details }
    });
};
