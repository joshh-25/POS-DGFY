import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// inventoryEffectContracts.js — the reserved, UNWIRED sale/booking
// effect-type contracts (D-06). Nothing calls these this phase; they exist
// so Phase 9 (modules/availment, on checkout completion) and this phase's
// own modules/booking (on booking fulfillment) can plug into an already-
// agreed input shape later instead of the ledger's write contract being
// redesigned out from under them.
//
// modules/inventory remains the SOLE writer of inventory_movements even once
// these are wired (ADR 0029) — the intended future implementation of both
// functions is a thin wrapper around
// inventoryMovementRepository.recordMovementWithStockSync() with
// movement_type: 'sale' | 'booking' (both ENUM values already reserved on
// the InventoryMovement Tenant model and the 08-01 migration), exactly like
// the manual recordRestock/recordLoss/recordAdjustment usecases in
// ./inventoryMovementUseCases.js.
//
// Each function validates its input shape FIRST, then throws a reserved
// ("not yet wired") DomainError — so a Phase 9/booking caller integrating
// against this contract during planning/build gets a clear validation error
// for a malformed call, not just an opaque "not implemented".
//
// Documented input shape (both effects share it, differing only in
// referenceType and semantic meaning):
//   {
//     businessId: string,       // dgfy_core.businesses.id (opaque UUID)
//     productId: number,        // products.id (same tenant DB)
//     quantity: number,         // signed delta; negative = stock decrease
//     referenceType: 'availment' | 'booking',
//     referenceId: string,      // the availment/booking row's identifier
//     actorAccountId?: string   // optional, opaque dgfy_core.accounts.id
//   }

const reservedError = (effectName) => new DomainError(
    DomainErrorCode.INTERNAL_ERROR,
    `${effectName} is a reserved effect-type contract not yet wired in Phase 8 (D-06). ` +
        'Phase 9 (modules/availment) and modules/booking are the intended future callers.',
    { statusCode: 501, details: { error_code: 'RESERVED_EFFECT_NOT_IMPLEMENTED', effect: effectName } }
);

const validationError = (message) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400 }
);

/**
 * Validates the shared { businessId, productId, quantity, referenceType,
 * referenceId } shape both reserved effect contracts require. Throws a
 * DomainError (VALIDATION_FAILED, 400) on the first violation found.
 * @param {string} effectName
 * @param {Object} input
 */
function assertEffectShape(effectName, { businessId, productId, quantity, referenceType, referenceId } = {}) {
    if (!businessId) throw validationError(`${effectName} requires businessId.`);
    if (productId === undefined || productId === null) throw validationError(`${effectName} requires productId.`);
    if (!Number.isFinite(Number(quantity)) || Number(quantity) === 0) {
        throw validationError(`${effectName} requires a non-zero numeric quantity.`);
    }
    if (!referenceType) throw validationError(`${effectName} requires referenceType.`);
    if (!referenceId) throw validationError(`${effectName} requires referenceId.`);
}

/**
 * Reserved sale effect-type contract (D-06). Phase 9's modules/availment is
 * the intended future caller once checkout completion needs to deduct stock
 * for a basic_inventory product line. Input shape: { businessId, productId,
 * quantity, referenceType: 'availment', referenceId, actorAccountId? }.
 * @param {Object} [input]
 */
export function recordSaleEffect(input = {}) {
    assertEffectShape('recordSaleEffect', input);
    throw reservedError('recordSaleEffect');
}

/**
 * Reserved booking effect-type contract (D-06). This phase's own
 * modules/booking fulfillment path is the intended future caller once a
 * fulfilled Booking should deduct stock for a bookable, stock-tracked
 * Service product. Input shape: { businessId, productId, quantity,
 * referenceType: 'booking', referenceId, actorAccountId? }.
 * @param {Object} [input]
 */
export function recordBookingEffect(input = {}) {
    assertEffectShape('recordBookingEffect', input);
    throw reservedError('recordBookingEffect');
}

export default { recordSaleEffect, recordBookingEffect };
