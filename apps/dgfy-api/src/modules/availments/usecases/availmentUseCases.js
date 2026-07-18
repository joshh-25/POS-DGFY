import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { COMPLIANCE_OPERATION, DOCUMENT_CONTEXTS } from '../../compliance/policy/constants.js';
import { assembleEvidenceBundle } from './complianceEvidenceUseCases.js';
import {
    parseAmountToCentavos,
    formatCentavos,
    roundHalfUp,
    decomposeVatInclusiveLine,
    computeScPwdDiscount,
    sumLineSubtotals,
    computeManualAndCodeDiscounts,
    computeAvailmentTotals,
    computeChange
} from './money.js';

// availmentUseCases.js — Clean Architecture Application layer for the
// availment line-editing and discount application workflow (CHK-01, CHK-03),
// mirroring ../../inventory/usecases/inventoryMovementUseCases.js. Each builder
// receives its dependencies via closure (repository = AvailmentRepository,
// businessRepository = the businesses module's BusinessRepository for membership
// access control, productRepository for product snapshots, etc.) and every use
// case always returns an ApplicationResult. No HTTP concerns, no direct model
// imports.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const notFoundError = (message = 'Availment not found.') => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    message,
    { statusCode: 404 }
);

const forbiddenError = (message) => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403 }
);

const conflictError = (message, details = null) => new DomainError(
    DomainErrorCode.CONFLICT,
    message,
    { statusCode: 409, details }
);

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

// Phase 11 (11-01-PLAN.md): the fixed ENUM('pickup','delivery','dine_in')
// availments.fulfillment_mode column set — mirrors
// modules/fulfillment/usecases/fulfillmentUseCases.js's STAGE_SEQUENCES
// keys. Validated here (CR-01 fix, 11-REVIEW.md) before
// buildFinalizeAvailmentUseCase threads a value into
// repository.finalizePersist.
const FULFILLMENT_MODES = Object.freeze(['pickup', 'dine_in', 'delivery']);

// CR-01 fix (09-REVIEW.md): the sibling ENUM-backed inputs introduced in
// this same phase, generalizing the FULFILLMENT_MODES allowlist pattern
// above so every client-controlled ENUM column is validated to a clean 400
// BEFORE it ever reaches Sequelize.create()/.update() — an out-of-set value
// used to throw a SequelizeValidationError that AvailmentRepository.
// withModel's catch-all silently re-wraps into a misleading 503 "tenant
// database unreachable" instead.
const DISCOUNT_TYPES = Object.freeze(['promo_code', 'manual', 'sc_pwd']);
const STOCK_EFFECT_TYPES = Object.freeze(['inventory_issue', 'stock_exempt']);
const DOCUMENT_CONTEXT_VALUES = Object.freeze([DOCUMENT_CONTEXTS.FISCAL, DOCUMENT_CONTEXTS.NON_FISCAL]);

/**
 * Duck-types on `error.name === 'TenantDatabaseUnavailableError'` rather
 * than importing availmentRepository.js's class directly.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/** @param {Error} error */
const isAvailmentNotFoundError = (error) => Boolean(error) && error.name === 'AvailmentNotFoundError';

/** @param {Error} error */
const isAvailmentFinalizedError = (error) => Boolean(error) && error.name === 'AvailmentFinalizedError';

/** @param {Error} error */
const isAvailmentLineNotFoundError = (error) => Boolean(error) && error.name === 'AvailmentLineNotFoundError';

/**
 * WR-05 fix (09-REVIEW.md): duck-types on repository.recordDiscount's
 * DuplicateScPwdDiscountError (a second sc_pwd row attempted on an
 * availment that already has one).
 * @param {Error} error
 */
const isDuplicateScPwdDiscountError = (error) => Boolean(error) && error.name === 'DuplicateScPwdDiscountError';

/**
 * Maps a thrown TenantDatabaseUnavailableError to a stable
 * ApplicationResult-ready DomainError. `missing`/`not_configured` surface as
 * 404; every other reason surfaces as 503 SERVICE_UNAVAILABLE.
 * @param {Error} error
 */
const mapTenantDatabaseError = (error) => {
    if (error.reason === 'missing' || error.reason === 'not_configured') {
        return noTenantDatabaseError();
    }
    return new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        error.message,
        { statusCode: 503, details: { error_code: 'TENANT_DATABASE_UNAVAILABLE', reason: error.reason } }
    );
};

/**
 * Shared access-control helper (mirrors inventoryMovementUseCases.js's
 * requireMembership()). Availment operations require active membership.
 * @returns {Promise<{membership?: Object, error?: DomainError}>}
 */
async function requireMembership(businessRepository, businessId, accountId) {
    const membership = await businessRepository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return { error: forbiddenError('You must be an active member of this business.') };
    }
    return { membership };
}

/**
 * Verifies the business exists and, when requestingAccountId is supplied,
 * that the requester is an active member of it.
 * @returns {Promise<{error?: DomainError}>}
 */
async function guardBusinessAccess(businessRepository, businessId, requestingAccountId) {
    const business = await businessRepository.findById(businessId);
    if (!business) {
        return { error: notFoundError('Business not found.') };
    }
    if (requestingAccountId) {
        const { error } = await requireMembership(businessRepository, businessId, requestingAccountId);
        if (error) return { error };
    }
    return {};
}

/**
 * Checks if the member has a manual-discount permission (CHK-03).
 * For now, we check if the membership role is 'owner' or if a permission
 * system is in place. This is extensible when role-based permissions
 * are added to the membership model.
 * @returns {boolean}
 */
function hasManualDiscountPermission(membership) {
    // Currently allow owners only; extend this when role-based permissions are added
    return membership && (membership.role === 'owner' || membership.permission === 'manual_discount');
}

/**
 * Creates a new draft availment for the business (CHK-01). Active member
 * required.
 * @param {{repository, businessRepository}} deps
 */
export function buildCreateAvailmentUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, branchId = null } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const result = await repository.createAvailment(businessId, {
                branchId,
                customerAccountId: null,
                cashierAccountId: null,
                cashierDgfyAccountId: requestingAccountId,
                terminalId: null
            });
            return ApplicationResult.success(result);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            throw repoError;
        }
    };
}

/**
 * Adds a line item to an availment (CHK-01). Reads the product via
 * productRepository.findById to snapshot product_name + unit_price +
 * derive default stock_effect_type per D-03. Staff may override.
 * Missing product -> 404; finalized availment -> 409.
 * @param {{repository, businessRepository, productRepository}} deps
 */
export function buildAddLineUseCase({ repository, businessRepository, productRepository }) {
    return async (input = {}) => {
        const {
            businessId,
            requestingAccountId,
            availmentId,
            productId,
            quantity,
            stockEffectType = null
        } = input;

        if (!businessId || !availmentId) {
            return ApplicationResult.failure(validationError('businessId and availmentId are required.'));
        }
        if (!productId) {
            return ApplicationResult.failure(validationError('productId is required.'));
        }
        if (quantity === undefined || quantity === null || Number(quantity) <= 0) {
            return ApplicationResult.failure(validationError('quantity must be a positive number.'));
        }
        // CR-01 fix (09-REVIEW.md): validate the caller-supplied override
        // against the DB's ENUM('inventory_issue', 'stock_exempt') before it
        // ever reaches repository.addLine.
        if (stockEffectType && !STOCK_EFFECT_TYPES.includes(stockEffectType)) {
            return ApplicationResult.failure(validationError(
                `stockEffectType must be one of: ${STOCK_EFFECT_TYPES.join(', ')}.`
            ));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            // Snapshot the product to get name, unit_price, and default stock_effect_type (D-03)
            const product = await productRepository.findById(businessId, productId);
            if (!product) {
                return ApplicationResult.failure(notFoundError('Product not found.'));
            }

            // Derive default stock_effect_type from product.inventory_mode per D-03
            let effectiveStockEffectType = stockEffectType;
            if (!effectiveStockEffectType) {
                effectiveStockEffectType = product.inventory_mode === 'basic_inventory' ? 'inventory_issue' : 'stock_exempt';
            }

            const result = await repository.addLine(businessId, availmentId, {
                productId,
                productName: product.name,
                quantity: Number(quantity),
                unitPrice: product.base_price,
                stockEffectType: effectiveStockEffectType,
                taxTreatment: 'vatable', // Default; can be overridden per line in future
                taxRate: 0.12 // Default 12% VAT; can be overridden per line in future
            });

            return ApplicationResult.success(result);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isAvailmentFinalizedError(repoError)) {
                return ApplicationResult.failure(conflictError('Cannot add lines to a finalized availment.'));
            }
            if (isAvailmentNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError('Availment not found.'));
            }
            throw repoError;
        }
    };
}

/**
 * Updates a line item in an availment (CHK-01). Adjusts quantity and/or
 * stock_effect_type on an active line; unknown line -> 404.
 * @param {{repository, businessRepository}} deps
 */
export function buildUpdateLineUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, availmentId, lineId, quantity = null, stockEffectType = null } = input;

        if (!businessId || !availmentId || !lineId) {
            return ApplicationResult.failure(validationError('businessId, availmentId, and lineId are required.'));
        }
        if (quantity === null && stockEffectType === null) {
            return ApplicationResult.failure(validationError('At least one of quantity or stockEffectType must be provided.'));
        }
        if (quantity !== null && Number(quantity) <= 0) {
            return ApplicationResult.failure(validationError('quantity must be a positive number.'));
        }
        // CR-01 fix (09-REVIEW.md): validate the caller-supplied override
        // against the DB's ENUM('inventory_issue', 'stock_exempt') before it
        // ever reaches repository.updateLine.
        if (stockEffectType && !STOCK_EFFECT_TYPES.includes(stockEffectType)) {
            return ApplicationResult.failure(validationError(
                `stockEffectType must be one of: ${STOCK_EFFECT_TYPES.join(', ')}.`
            ));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const result = await repository.updateLine(businessId, availmentId, lineId, {
                quantity: quantity ? Number(quantity) : undefined,
                stockEffectType
            });
            return ApplicationResult.success(result);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isAvailmentFinalizedError(repoError)) {
                return ApplicationResult.failure(conflictError('Cannot modify lines in a finalized availment.'));
            }
            if (isAvailmentLineNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError('Availment line not found.'));
            }
            throw repoError;
        }
    };
}

/**
 * Soft-deletes a line from an availment (CHK-01). Maps the usecase verb
 * "removeLine" to the repository's soft-delete method "cancelLine"
 * per WARNING-3 in the plan. Idempotent-safe.
 * @param {{repository, businessRepository}} deps
 */
export function buildRemoveLineUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, availmentId, lineId } = input;

        if (!businessId || !availmentId || !lineId) {
            return ApplicationResult.failure(validationError('businessId, availmentId, and lineId are required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            // Repository method is named cancelLine (soft-delete); usecase verb is removeLine
            const result = await repository.cancelLine(businessId, availmentId, lineId);
            return ApplicationResult.success(result);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isAvailmentFinalizedError(repoError)) {
                return ApplicationResult.failure(conflictError('Cannot remove lines from a finalized availment.'));
            }
            if (isAvailmentLineNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError('Availment line not found.'));
            }
            throw repoError;
        }
    };
}

/**
 * Restores a previously removed line in an availment (CHK-01). Clears
 * cancelled_at; idempotent-safe.
 * @param {{repository, businessRepository}} deps
 */
export function buildRestoreLineUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, availmentId, lineId } = input;

        if (!businessId || !availmentId || !lineId) {
            return ApplicationResult.failure(validationError('businessId, availmentId, and lineId are required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const result = await repository.restoreLine(businessId, availmentId, lineId);
            return ApplicationResult.success(result);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isAvailmentFinalizedError(repoError)) {
                return ApplicationResult.failure(conflictError('Cannot restore lines in a finalized availment.'));
            }
            if (isAvailmentLineNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError('Availment line not found.'));
            }
            throw repoError;
        }
    };
}

/**
 * Applies a discount to an availment (CHK-01, CHK-03). Manual discounts require
 * permission and a non-empty reason; the discount is recorded with the applying
 * staff account id and reason (CHK-03). Missing reason -> 400; unauthorized ->
 * 403. Per D-04, all discount types (promo code, manual, SC/PWD) stack
 * independently on one availment.
 * @param {{repository, businessRepository}} deps
 */
export function buildApplyDiscountUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const {
            businessId,
            requestingAccountId,
            availmentId,
            discountType = null,
            code = null,
            amount = null,
            percent = null,
            reason = null,
            scPwdIdNumber = null,
            scPwdCustomerName = null
        } = input;

        if (!businessId || !availmentId) {
            return ApplicationResult.failure(validationError('businessId and availmentId are required.'));
        }
        if (!discountType) {
            return ApplicationResult.failure(validationError('discountType is required (promo_code, manual, or sc_pwd).'));
        }
        // CR-01 fix (09-REVIEW.md): validate against the DB's
        // ENUM('promo_code', 'manual', 'sc_pwd') before it ever reaches
        // repository.recordDiscount.
        if (!DISCOUNT_TYPES.includes(discountType)) {
            return ApplicationResult.failure(validationError(
                `discountType must be one of: ${DISCOUNT_TYPES.join(', ')}.`
            ));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        // CHK-03: Manual discount permission and reason check
        if (discountType === 'manual') {
            if (!reason || reason.trim() === '') {
                return ApplicationResult.failure(validationError('A reason is required for a manual discount.'));
            }

            const membership = await businessRepository.getMembership(requestingAccountId, businessId);
            if (!hasManualDiscountPermission(membership)) {
                return ApplicationResult.failure(forbiddenError('You do not have permission to apply manual discounts.'));
            }
        }

        // CR-02 fix (09-REVIEW.md): a negative amount/percent is never
        // floored by computeAvailmentTotals's Math.min() cap (which only
        // bounds the UPPER end), so an unvalidated negative value can
        // inflate a customer's total beyond the subtotal — reachable via
        // discountType 'promo_code'/'sc_pwd' with no permission check at
        // all. Validate sign/range here, before repository.recordDiscount.
        if (amount !== null && amount !== undefined) {
            const amountNum = Number(amount);
            if (!Number.isFinite(amountNum) || amountNum < 0) {
                return ApplicationResult.failure(validationError('amount must be a non-negative number.'));
            }
        }
        if (percent !== null && percent !== undefined) {
            const percentNum = Number(percent);
            if (!Number.isFinite(percentNum) || percentNum < 0 || percentNum > 100) {
                return ApplicationResult.failure(validationError('percent must be between 0 and 100.'));
            }
        }
        // WR-05 fix (09-REVIEW.md): statutory SC/PWD discounts require ID
        // verification — reject an sc_pwd discount with no ID number rather
        // than silently persisting an unverifiable statutory discount.
        if (discountType === 'sc_pwd' && (!scPwdIdNumber || scPwdIdNumber.trim() === '')) {
            return ApplicationResult.failure(validationError('scPwdIdNumber is required for an SC/PWD discount.'));
        }

        try {
            const result = await repository.recordDiscount(businessId, availmentId, {
                discountType,
                code,
                amount,
                percent,
                appliedByStaffAccountId: requestingAccountId,
                reason,
                scPwdIdNumber,
                scPwdCustomerName
            });
            return ApplicationResult.success(result);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isAvailmentFinalizedError(repoError)) {
                return ApplicationResult.failure(conflictError('Cannot apply discounts to a finalized availment.'));
            }
            if (isAvailmentNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError('Availment not found.'));
            }
            // WR-05 fix (09-REVIEW.md): a second sc_pwd discount on the same
            // availment is a client input conflict, not a 503.
            if (isDuplicateScPwdDiscountError(repoError)) {
                return ApplicationResult.failure(conflictError('This availment already has an SC/PWD discount applied.'));
            }
            throw repoError;
        }
    };
}

/**
 * Reads a single availment by id, including its non-cancelled/cancelled
 * lines, discounts, and payments (CHK-01). Active member required.
 *
 * (Deviation, Rule 1: this builder and its wiring into buildAvailmentsModule
 * were missing even though 09-05's controller/routes already called
 * useCases.getById — GET /v1/availments/:id would have thrown
 * "useCases.getById is not a function" at runtime. Added here alongside
 * finalize since both this file and index.js are already in scope for this
 * plan's file list.)
 * @param {{repository, businessRepository}} deps
 */
export function buildGetByIdUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, availmentId } = input;

        if (!businessId || !availmentId) {
            return ApplicationResult.failure(validationError('businessId and availmentId are required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const result = await repository.findById(businessId, availmentId);
            return ApplicationResult.success(result);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isAvailmentNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError('Availment not found.'));
            }
            throw repoError;
        }
    };
}

// ============================================================================
// finalizeAvailment — the one usecase with no exact analog (09-06).
// ============================================================================

/**
 * Normalizes a client-supplied payment_method into the payments.payment_method
 * ENUM('cash','gcash','credit_card'). Returns null for anything unrecognized
 * so the caller can reject with a validation error.
 * @param {string} value
 * @returns {'cash'|'gcash'|'credit_card'|null}
 */
function normalizePaymentMethod(value) {
    if (!value) return null;
    const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (normalized === 'cash') return 'cash';
    if (normalized === 'gcash') return 'gcash';
    if (normalized === 'credit_card' || normalized === 'creditcard' || normalized === 'card') return 'credit_card';
    return null;
}

/**
 * Sums the VAT-exclusive (net) portion of every line — mirrors money.js's
 * internal SC/PWD totalVatExempt computation exactly (same
 * decomposeVatInclusiveLine per-line math), so a precomputed SC/PWD discount
 * amount (computed against this net base) always agrees with
 * computeAvailmentTotals()'s own internal net-base computation for the same
 * lines (D-20).
 * @param {Array<{quantity, unit_price}>} lines
 * @returns {number} integer centavos
 */
function computeNetSubtotalCentavos(lines) {
    return lines.reduce((sum, line) => {
        const qty = Number(line.quantity);
        const unitPriceCentavos = parseAmountToCentavos(line.unit_price);
        const lineTotalCentavos = roundHalfUp(qty * unitPriceCentavos, 1);
        const { net } = decomposeVatInclusiveLine(lineTotalCentavos);
        return sum + net;
    }, 0);
}

/**
 * Maps one availment_discounts row into a money.js discount term
 * ({amount} or {percent}, 0-100 scale). The DB stores `percent` as a
 * fraction (e.g. 0.2000 for 20%, per AvailmentDiscount.js's column
 * comment); money.js's computeManualAndCodeDiscounts expects percent on a
 * 0-100 scale, so it is rescaled here (`* 100`). Returns null when the row
 * carries neither amount nor percent (SC/PWD rows commonly carry neither —
 * the statutory 20% is implied, not client-supplied).
 * @param {Object} row - a plain availment_discounts row
 * @returns {{amount: string|number}|{percent: number}|null}
 */
function discountRowToTerm(row) {
    if (row.amount !== null && row.amount !== undefined) {
        return { amount: row.amount };
    }
    if (row.percent !== null && row.percent !== undefined) {
        return { percent: Number(row.percent) * 100 };
    }
    return null;
}

/**
 * Computes ONE discount row's own peso amount (D-14: each discount must be
 * its own distinct receipt line, not folded into an aggregate). A
 * discount_type='sc_pwd' row is always resolved against the VAT-exclusive
 * net base (D-07/D-20) — either the row's own amount/percent term
 * (re-based against net, never the gross subtotal), or, when the row
 * carries neither, the statutory default computeScPwdDiscount(net) (20%
 * off net). Every other discount_type resolves against the gross
 * (VAT-inclusive) subtotal, independently (D-05) — never cascaded off a
 * prior discount.
 * @param {Object} row
 * @param {{subtotalCentavos: number, netSubtotalCentavos: number}} bases
 * @returns {number} integer centavos
 */
function computeDiscountRowAmountCentavos(row, { subtotalCentavos, netSubtotalCentavos }) {
    const term = discountRowToTerm(row);
    if (row.discount_type === 'sc_pwd') {
        if (term) return computeManualAndCodeDiscounts(netSubtotalCentavos, [term]);
        return computeScPwdDiscount(netSubtotalCentavos);
    }
    if (!term) return 0;
    return computeManualAndCodeDiscounts(subtotalCentavos, [term]);
}

/** @param {Error} error */
const isNumericStatusCodeError = (error) => Boolean(error) && Number.isInteger(error.statusCode);

/**
 * Orchestrates checkout finalization (CHK-02, CHK-04, CHK-05, CHK-06,
 * FSC-03, D-08/D-09/D-14/D-15/D-16/D-17/D-21/D-22/D-24). In order:
 *   1. Validate input + active-member access.
 *   2. Load the draft availment + non-cancelled lines + recorded
 *      availment_discounts rows; reject empty/already-finalized.
 *   3. Recompute subtotal/VAT/SC-PWD/discounts/total/change entirely via
 *      money.js from the stored line data + discount rows — a client total/
 *      change/discount_amount is never read (CHK-02/D-09); Cash with
 *      cash_received < total is rejected here.
 *   4. Read the interim compliance-evidence attestation (D-23) and assemble
 *      the {artifacts, peripherals, settings, evidence} bundle (empty
 *      defaults when unattested — correct for non_compliant_active, and a
 *      safe fail-closed default for an unattested compliant_active
 *      business). Non-cash payment sets context.payment_handoff_mode
 *      'external' (avoids a spurious BSP DENY, D-10 record-only payments).
 *   5. Call assertComplianceGate with operation 'pos.checkout'. The gate
 *      throws a DomainError (403 DENY / 409 REQUIRES_SETUP) carrying
 *      details.decision.checklist/activation_blockers — forwarded verbatim
 *      as a failure so staff see exactly which signal is missing; a fiscal
 *      request is NEVER silently downgraded to non_fiscal (D-24).
 *   6. Bind the open shift via shiftRepository.findOpenShift(businessId,
 *      {terminalId, cashierAccountId}) or reject with a no-open-shift
 *      conflict (CHK-06).
 *   7. Build the receipt payload: D-14 fields, one distinct line per
 *      recorded discount row (its own server-computed amount — never
 *      folded into an aggregate), and decision.receipt_contract.document_type.
 *   8. repository.finalizePersist(...) — one transaction covering the
 *      availment/payment/receipt rows AND the per-line inventory sale
 *      effects (an insufficient-stock ApplicationResult failure makes
 *      finalizePersist throw so nothing commits, WARNING-1) — server-
 *      computed header amounts only, never a client value.
 *   9. AFTER the DB commit, best-effort deviceBridgeClient.printReceipt(...);
 *      a non-ok/timeout/thrown result becomes a `print_warning` on an
 *      otherwise-successful result — never a rollback (D-22).
 * @param {{repository, businessRepository, productRepository?, assertComplianceGate, recordSaleEffect, shiftRepository, complianceEvidenceRepository, deviceBridgeClient, recordStageEvents?, posFulfillmentModeDefault?}} deps
 */
export function buildFinalizeAvailmentUseCase({
    repository,
    businessRepository,
    // eslint-disable-next-line no-unused-vars -- accepted for interface symmetry with buildAvailmentsModule's other injected ports; line data is already snapshotted onto availment_items at addLine time, so finalize itself never re-reads the product catalog.
    productRepository,
    assertComplianceGate,
    recordSaleEffect,
    shiftRepository,
    complianceEvidenceRepository,
    deviceBridgeClient,
    // Phase 11 (11-03-PLAN.md, D-05/D-06): OPTIONAL fulfillment stage-event
    // auto-write port + POS fulfillment_mode default (A1) — mirrors
    // recordSaleEffect's injection style; absent in existing test
    // composition, both finalize seams simply skip the auto-write.
    recordStageEvents,
    posFulfillmentModeDefault = 'dine_in'
}) {
    return async (input = {}) => {
        const {
            businessId,
            requestingAccountId,
            availmentId,
            branchId = null,
            requestedDocumentContext = DOCUMENT_CONTEXTS.NON_FISCAL,
            paymentMethod,
            cashReceived = null,
            terminalId = null,
            cashierAccountId = null,
            // A1: optional controller-supplied override of the POS
            // fulfillment_mode default (dine_in/pickup); NOT client-trusted
            // for anything beyond this — finalizePersist still writes the
            // full sequence server-side regardless of the value chosen here.
            fulfillmentMode = null
        } = input;

        // ---- 1. Validate input + active-member access -----------------
        if (!businessId || !availmentId) {
            return ApplicationResult.failure(validationError('businessId and availmentId are required.'));
        }

        const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
        if (!normalizedPaymentMethod) {
            return ApplicationResult.failure(validationError('paymentMethod must be one of: cash, gcash, credit_card.'));
        }
        if (terminalId === null || terminalId === undefined) {
            return ApplicationResult.failure(validationError('terminalId is required.'));
        }
        if (cashierAccountId === null || cashierAccountId === undefined) {
            return ApplicationResult.failure(validationError('cashierAccountId is required.'));
        }
        // CR-01 fix (09-REVIEW.md): validate requestedDocumentContext against
        // the DB's ENUM('fiscal', 'non_fiscal') before it is written into
        // header.document_context and persisted (availmentRepository.js).
        if (!DOCUMENT_CONTEXT_VALUES.includes(requestedDocumentContext)) {
            return ApplicationResult.failure(validationError(
                `requestedDocumentContext must be one of: ${DOCUMENT_CONTEXT_VALUES.join(', ')}.`
            ));
        }

        // CR-01 fix (11-REVIEW.md): resolve + validate fulfillmentMode BEFORE
        // it ever reaches repository.finalizePersist, which writes it
        // straight into the ENUM('pickup','delivery','dine_in')
        // availments.fulfillment_mode column and (via recordStageEvents)
        // the same-ENUM availment_stage_events.fulfillment_mode column. An
        // out-of-set value used to surface as a misleading 503 "tenant
        // database unreachable" (AvailmentRepository.withModel's catch-all
        // re-wraps any non-whitelisted error) instead of a clean 400.
        const resolvedFulfillmentMode = fulfillmentMode || posFulfillmentModeDefault;
        if (!FULFILLMENT_MODES.includes(resolvedFulfillmentMode)) {
            return ApplicationResult.failure(validationError(
                `fulfillmentMode must be one of: ${FULFILLMENT_MODES.join(', ')}.`
            ));
        }

        const business = await businessRepository.findById(businessId);
        if (!business) {
            return ApplicationResult.failure(notFoundError('Business not found.'));
        }
        if (requestingAccountId) {
            const { error: membershipError } = await requireMembership(businessRepository, businessId, requestingAccountId);
            if (membershipError) return ApplicationResult.failure(membershipError);
        }

        // ---- 2. Load the draft availment + lines + discounts ----------
        let availment;
        try {
            availment = await repository.findById(businessId, availmentId);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isAvailmentNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError('Availment not found.'));
            }
            throw repoError;
        }

        if (availment.status !== 'draft') {
            return ApplicationResult.failure(conflictError('This availment is already finalized.'));
        }

        const activeLines = (availment.items || []).filter((line) => !line.cancelled_at);
        if (activeLines.length === 0) {
            return ApplicationResult.failure(validationError('Cannot finalize an availment with no active line items.'));
        }

        // ---- 3. Recompute money server-side (never trust the client) --
        const discountRows = availment.discounts || [];
        const scPwdRow = discountRows.find((row) => row.discount_type === 'sc_pwd');
        const scPwd = Boolean(scPwdRow);

        const grossSubtotalCentavos = sumLineSubtotals(activeLines);
        const netSubtotalCentavos = computeNetSubtotalCentavos(activeLines);

        const discountLines = discountRows.map((row) => {
            const amountCentavos = computeDiscountRowAmountCentavos(row, {
                subtotalCentavos: grossSubtotalCentavos,
                netSubtotalCentavos
            });
            return {
                discount_type: row.discount_type,
                code: row.code || null,
                reason: row.reason || null,
                applied_by_staff_account_id: row.applied_by_staff_account_id || null,
                sc_pwd_id_number: row.sc_pwd_id_number || null,
                sc_pwd_customer_name: row.sc_pwd_customer_name || null,
                amount_centavos: amountCentavos,
                amount_formatted: formatCentavos(amountCentavos)
            };
        });

        // Pre-resolved absolute amounts only (bypassing money.js's own
        // amount/percent term resolution a second time) — every term here
        // already carries the CORRECT base (net for sc_pwd, gross for
        // everything else), computed above.
        const codeDiscounts = discountLines
            .filter((line) => line.discount_type === 'promo_code')
            .map((line) => ({ amount: line.amount_centavos }));
        const manualDiscount = discountLines
            .filter((line) => line.discount_type === 'manual' || line.discount_type === 'sc_pwd')
            .map((line) => ({ amount: line.amount_centavos }));

        const totals = computeAvailmentTotals(activeLines, { scPwd, manualDiscount, codeDiscounts });

        if (normalizedPaymentMethod === 'cash' && (cashReceived === null || cashReceived === undefined)) {
            return ApplicationResult.failure(validationError('cashReceived is required for cash payment.'));
        }
        const cashReceivedCentavos = normalizedPaymentMethod === 'cash' ? parseAmountToCentavos(cashReceived) : null;
        const changeResult = computeChange(cashReceivedCentavos, totals.total_amount, normalizedPaymentMethod);
        if (changeResult.error === 'cash_insufficient') {
            return ApplicationResult.failure(validationError(
                'cashReceived is less than the total amount due.',
                { error_code: 'CASH_INSUFFICIENT' }
            ));
        }

        // ---- 4. Assemble the D-23 interim evidence bundle --------------
        let evidenceRow = null;
        if (complianceEvidenceRepository) {
            try {
                evidenceRow = await complianceEvidenceRepository.getForBusinessBranch(businessId, branchId);
            } catch (repoError) {
                if (isTenantDatabaseUnavailableError(repoError)) {
                    return ApplicationResult.failure(mapTenantDatabaseError(repoError));
                }
                throw repoError;
            }
        }
        const { artifacts, peripherals, settings, evidence } = assembleEvidenceBundle(evidenceRow);

        const gateContext = { terminal_id: terminalId, payment_type: normalizedPaymentMethod };
        if (normalizedPaymentMethod !== 'cash') {
            // D-10: no live gateway capture — avoid a spurious BSP DENY.
            gateContext.payment_handoff_mode = 'external';
        }

        // ---- 5. Compliance gate (D-15/D-21/D-24) -----------------------
        let decision;
        try {
            decision = await assertComplianceGate({
                businessId,
                branchId,
                operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
                requestedDocumentContext,
                artifacts,
                peripherals,
                settings,
                evidence,
                context: gateContext
            });
        } catch (gateError) {
            // The gate throws a DomainError (403 DENY / 409 REQUIRES_SETUP)
            // whose .details already carries decision/checklist/
            // activation_blockers — forward it verbatim (D-24: reject, no
            // silent fiscal->non_fiscal downgrade) rather than re-wrapping.
            if (isNumericStatusCodeError(gateError)) {
                return ApplicationResult.failure(gateError);
            }
            throw gateError;
        }

        // ---- 6. Open-shift binding (CHK-06/D-16) -----------------------
        let openShift;
        try {
            openShift = await shiftRepository.findOpenShift(businessId, { terminalId, cashierAccountId });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            throw repoError;
        }
        if (!openShift) {
            return ApplicationResult.failure(conflictError(
                'No open shift found for this cashier and terminal.',
                { error_code: 'NO_OPEN_SHIFT' }
            ));
        }

        // ---- 7. Build the receipt payload (D-14) -----------------------
        const documentType = decision?.receipt_contract?.document_type
            || (requestedDocumentContext === DOCUMENT_CONTEXTS.FISCAL ? 'fiscal_invoice' : 'non_fiscal_slip');
        const complianceMode = decision?.mode_state || decision?.compliance_mode_state || null;
        const receiptNumber = `RCPT-${String(availmentId)}-${Date.now()}`;
        const nowIso = new Date().toISOString();

        const receiptLines = activeLines.map((line) => ({
            product_id: line.product_id,
            product_name: line.product_name,
            quantity: line.quantity,
            unit_price: line.unit_price,
            stock_effect_type: line.stock_effect_type,
            line_subtotal: formatCentavos(roundHalfUp(Number(line.quantity) * parseAmountToCentavos(line.unit_price), 1))
        }));

        const amountReceivedFormatted = normalizedPaymentMethod === 'cash'
            ? formatCentavos(cashReceivedCentavos)
            : totals.total_amount_formatted;

        const receiptPayload = {
            business_id: businessId,
            branch_id: branchId,
            availment_id: availmentId,
            cashier_account_id: cashierAccountId,
            shift_id: openShift.id,
            terminal_id: terminalId,
            document_context: requestedDocumentContext,
            document_type: documentType,
            compliance_mode: complianceMode,
            created_at: nowIso,
            receipt_number: receiptNumber,
            lines: receiptLines,
            discounts: discountLines,
            subtotal_amount: totals.subtotal_amount_formatted,
            discount_amount: totals.discount_amount_formatted,
            vat_amount: totals.vat_amount_formatted,
            vat_exempt_amount: totals.vat_exempt_amount_formatted,
            total_amount: totals.total_amount_formatted,
            payment_method: normalizedPaymentMethod,
            amount_received: amountReceivedFormatted,
            change_due: changeResult.change_due_formatted
        };

        // ---- 8. Atomic persist (D-17: sale effects in the SAME txn) ----
        const saleEffectLines = activeLines.map((line) => ({
            productId: line.product_id,
            quantity: Number(line.quantity),
            stockEffectType: line.stock_effect_type,
            actorAccountId: requestingAccountId || null,
            actorStaffAccountId: cashierAccountId
        }));

        let persistResult;
        try {
            persistResult = await repository.finalizePersist(businessId, availmentId, {
                header: {
                    document_context: requestedDocumentContext,
                    subtotal_amount: totals.subtotal_amount_formatted,
                    discount_amount: totals.discount_amount_formatted,
                    vat_amount: totals.vat_amount_formatted,
                    vat_exempt_amount: totals.vat_exempt_amount_formatted,
                    total_amount: totals.total_amount_formatted,
                    shift_id: openShift.id,
                    sc_pwd_id_number: scPwdRow ? (scPwdRow.sc_pwd_id_number || null) : null,
                    sc_pwd_metadata: scPwdRow ? { customer_name: scPwdRow.sc_pwd_customer_name || null } : null
                },
                payment: {
                    payment_method: normalizedPaymentMethod,
                    amount_received: amountReceivedFormatted,
                    change_due: changeResult.change_due_formatted,
                    payment_handoff_mode: normalizedPaymentMethod === 'cash' ? null : 'external'
                },
                receipt: {
                    receipt_number: receiptNumber,
                    document_type: documentType,
                    compliance_mode: complianceMode,
                    payload: receiptPayload
                },
                saleEffectLines,
                recordSaleEffect,
                recordStageEvents,
                fulfillmentMode: resolvedFulfillmentMode,
                actorStaffAccountId: cashierAccountId,
                actorAccountId: requestingAccountId || null
            });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isAvailmentNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError('Availment not found.'));
            }
            if (isAvailmentFinalizedError(repoError)) {
                return ApplicationResult.failure(conflictError('This availment is already finalized.'));
            }
            // Includes WARNING-1: an insufficient-stock (or any other)
            // sale-effect failure makes finalizePersist's own transaction
            // throw, so the availment/payment/receipt rows never commit.
            // Propagate as-is (no downgrade, no partial-success shape) —
            // nothing was persisted.
            throw repoError;
        }

        // ---- 9. Best-effort print (D-11/D-22 record-then-warn) ---------
        let printWarning = null;
        if (deviceBridgeClient && typeof deviceBridgeClient.printReceipt === 'function') {
            try {
                const printResult = await deviceBridgeClient.printReceipt({
                    receipt: {
                        business: {
                            name: business.display_name || business.legal_name || '',
                            address: business.address || '',
                            tin_branch: business.tin_branch || '',
                            footer_message: business.footer_message || ''
                        },
                        transaction: {
                            invoice_number: receiptNumber,
                            created_at: nowIso,
                            lines: receiptLines.map((line) => ({
                                name: line.product_name,
                                detail: `${line.quantity} x ${line.unit_price}`,
                                line_subtotal: line.line_subtotal
                            })),
                            subtotal_amount: totals.subtotal_amount_formatted,
                            discount_amount: totals.discount_amount_formatted,
                            service_fee_amount: '0.0000',
                            restaurant_service_charge_amount: '0.0000',
                            vat_amount: totals.vat_amount_formatted,
                            total_amount: totals.total_amount_formatted
                        },
                        receipt_contract: {
                            document_type: documentType,
                            version: decision?.receipt_contract?.version || 1
                        }
                    },
                    copies: 1
                });
                if (!printResult || !printResult.ok) {
                    printWarning = (printResult && (printResult.warning || printResult.error)) || 'print_failed';
                }
            } catch {
                // Never let a print-client exception undo an already-
                // committed sale (D-22 fail-open).
                printWarning = 'print_error';
            }
        } else {
            printWarning = 'device_bridge_unconfigured';
        }

        return ApplicationResult.success({
            availment: persistResult.availment,
            payment: persistResult.payment,
            receipt: persistResult.receipt,
            ...(printWarning ? { print_warning: printWarning } : {})
        });
    };
}
