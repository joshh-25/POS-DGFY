import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { computeAvailmentTotals } from './money.js';

// storefrontFinalizeUseCases.js — 10-07-PLAN.md Task 2: the genuinely-new
// finalize seam for the availments module. Creates a tenant Availment from a
// paid (or cash/COD) STOREFRONT order — no shift/terminal/cashier, a
// cross-DB customer_account_id reference, and a reservation->sale
// conversion — all inside one idempotent tenant transaction
// (finalizeStorefrontOrder on the repository, see availmentRepository.js).
//
// Phase 9's finalizeAvailment/finalizePersist CANNOT be reused here
// (RESEARCH structural gap #1): it hard-requires an open shift + terminal +
// cashier and invokes the pos.checkout compliance gate — none of which a
// storefront order has. [ASSUMED A5]: the online storefront checkout uses a
// compliance operation distinct from pos.checkout, or the gate is relaxed
// for the online path — this usecase does NOT call assertComplianceGate at
// all (confirm with the compliance-policy owner before this path goes live;
// surfaced in the SUMMARY, not silently assumed away).
//
// Deferred (NOT this plan's scope): the folded compliance-transaction todo
// (".planning/todos/pending/2026-07-13-wrap-compliance-verification-and-
// state-writes-in-one-transac.md") is Phase 8/9 compliance-state-write debt,
// unrelated to storefront finalize atomicity — re-deferred here, not solved.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

// Phase 11 (11-03-PLAN.md, D-06/L2): online Availments are only ever
// 'pickup' or 'delivery' (never 'dine_in', which is POS-only, A1).
// Validated here (CR-01 fix, 11-REVIEW.md) before fulfillmentMode reaches
// repository.finalizeStorefrontOrder, which writes it into a NOT NULL
// availment_stage_events.fulfillment_mode column via recordStageEvents — a
// missing/invalid value used to hard-fail the ENTIRE finalize transaction
// (including the already-succeeded reservation->sale commit) instead of
// returning a clean 400 up front.
const STOREFRONT_FULFILLMENT_MODES = Object.freeze(['pickup', 'delivery']);

/**
 * Duck-types on `error.name === 'TenantDatabaseUnavailableError'` rather
 * than importing availmentRepository.js's class directly (mirrors
 * availmentUseCases.js's self-contained convention).
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/**
 * Maps a thrown TenantDatabaseUnavailableError to a stable
 * ApplicationResult-ready DomainError (mirrors availmentUseCases.js's
 * mapTenantDatabaseError exactly).
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
 * Normalizes a caller-supplied payment_method into the tenant payments ENUM
 * ('cash'|'gcash'|'credit_card') — [ASSUMED A4]: the QR Ph rail (PayMongo)
 * maps onto 'gcash' so no tenant ENUM migration is required. A duplicated
 * local copy of availmentUseCases.js's normalizePaymentMethod (that module
 * does not export it, and this file's own <files> scope does not include
 * editing availmentUseCases.js) — same shape, plus the qrph/qr_ph aliases
 * A4 requires.
 * @param {string} value
 * @returns {'cash'|'gcash'|'credit_card'|null}
 */
export function normalizeStorefrontPaymentMethod(value) {
    if (!value) return null;
    const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (normalized === 'cash') return 'cash';
    if (normalized === 'gcash' || normalized === 'qrph' || normalized === 'qr_ph') return 'gcash';
    if (normalized === 'credit_card' || normalized === 'creditcard' || normalized === 'card') return 'credit_card';
    return null;
}

const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

/**
 * Orchestrates the storefront-order -> tenant-Availment finalize (STF-05,
 * T-10-07-01..04). In order:
 *   1. Validate businessId/sourceReference/lines/paymentMethod.
 *   2. Recompute money server-side from `lines` via money.js
 *      (computeAvailmentTotals) — a caller-supplied totalCentavos is
 *      validated against this recompute, never trusted outright (mirrors
 *      CHK-02/D-09's "server always recomputes" convention).
 *   3. repository.finalizeStorefrontOrder(...) — ONE tenant transaction:
 *      row-locked idempotent lookup by (business_id, source_reference) ->
 *      Availment (no shift/terminal/cashier) -> AvailmentItem lines ->
 *      injected commitReservation (10-02, ADR 0029 single-writer) -> Payment
 *      (payment_reference stored separately from the ENUM, T-10-07-04). A
 *      non-success commitReservation result (or a thrown error from it)
 *      rolls back the ENTIRE transaction — nothing partial is ever
 *      persisted (mirrors Phase 9 P04/P06 atomicity discipline).
 * @param {{repository, commitReservation, recordStageEvents?}} deps
 *   - repository: AvailmentRepository (exposes finalizeStorefrontOrder)
 *   - commitReservation: the injected 10-02 reservationPorts.commitReservation
 *     port — `(input: {businessId, referenceId, transaction}) => Promise<ApplicationResult>`
 *   - recordStageEvents: OPTIONAL Phase 11 (11-03-PLAN.md, D-06) fulfillment
 *     stage-event auto-write port — threaded straight through to
 *     repository.finalizeStorefrontOrder(...), which writes ONE 'placed'
 *     stage event inside the same finalize transaction when supplied.
 */
export function buildFinalizeStorefrontOrderUseCase({ repository, commitReservation, recordStageEvents }) {
    if (typeof commitReservation !== 'function') {
        throw new Error('buildFinalizeStorefrontOrderUseCase requires a commitReservation port function.');
    }

    return async (input = {}) => {
        const {
            businessId,
            sourceReference,
            customerAccountId = null,
            lines = [],
            totalCentavos = null,
            paymentMethod,
            paymentReference = null,
            // 10-06/10-08 callers already carry these on the landlord
            // storefront_orders row (the durable source of truth for
            // fulfillment data). Phase 11 (11-03-PLAN.md, D-06/L2):
            // fulfillmentMode is now PERSISTED onto the tenant Availment
            // (previously dropped here) plus one 'placed' stage event;
            // requestedFor remains accepted for interface completeness only
            // — no column exists for it and this plan does not add one.
            fulfillmentMode = null,
            requestedFor = null
        } = input;

        if (!businessId || !sourceReference) {
            return ApplicationResult.failure(validationError('businessId and sourceReference are required.'));
        }
        if (!Array.isArray(lines) || lines.length === 0) {
            return ApplicationResult.failure(validationError('At least one line item is required to finalize a storefront order.'));
        }
        for (const line of lines) {
            if (!line || !line.productId || !isPositiveNumber(line.quantity)) {
                return ApplicationResult.failure(validationError('Each line must have a positive productId and quantity.'));
            }
        }

        const normalizedPaymentMethod = normalizeStorefrontPaymentMethod(paymentMethod);
        if (!normalizedPaymentMethod) {
            return ApplicationResult.failure(validationError('paymentMethod must be one of: cash, gcash, credit_card (or the qrph alias).'));
        }
        if (!STOREFRONT_FULFILLMENT_MODES.includes(fulfillmentMode)) {
            return ApplicationResult.failure(validationError(
                `fulfillmentMode is required and must be one of: ${STOREFRONT_FULFILLMENT_MODES.join(', ')}.`
            ));
        }

        // ---- Recompute money server-side (never trust the caller) ---------
        const moneyLines = lines.map((line) => ({ quantity: line.quantity, unit_price: line.unitPrice }));
        const totals = computeAvailmentTotals(moneyLines, {});

        if (totalCentavos !== null && totalCentavos !== undefined && Number(totalCentavos) !== totals.total_amount) {
            return ApplicationResult.failure(validationError(
                'totalCentavos does not match the recomputed line total.',
                { error_code: 'TOTAL_MISMATCH', expected_centavos: totals.total_amount, received_centavos: Number(totalCentavos) }
            ));
        }

        let persistResult;
        try {
            persistResult = await repository.finalizeStorefrontOrder(businessId, {
                sourceReference,
                customerAccountId,
                lines,
                header: {
                    subtotal_amount: totals.subtotal_amount_formatted,
                    discount_amount: totals.discount_amount_formatted,
                    vat_amount: totals.vat_amount_formatted,
                    vat_exempt_amount: totals.vat_exempt_amount_formatted,
                    total_amount: totals.total_amount_formatted
                },
                payment: {
                    payment_method: normalizedPaymentMethod,
                    amount_received: totals.total_amount_formatted,
                    change_due: null,
                    payment_handoff_mode: normalizedPaymentMethod === 'cash' ? null : 'external',
                    payment_reference: paymentReference || null
                },
                // Bound to this call's businessId/sourceReference so the
                // repository only ever needs to thread `transaction` through.
                commitReservation: (transaction) => commitReservation({
                    businessId,
                    referenceId: sourceReference,
                    transaction
                }),
                // D-06/L2: persist the mode + auto-write the 'placed' stage
                // event inside the same finalize transaction.
                fulfillmentMode,
                recordStageEvents
            });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            // A commitReservation failure (or any other persistence error)
            // rolled back the whole transaction — nothing was persisted.
            // Propagate as-is, no downgrade, no partial-success shape
            // (mirrors availmentUseCases.js's finalizePersist error handling).
            throw repoError;
        }

        return ApplicationResult.success({
            availment: persistResult.availment,
            payment: persistResult.payment,
            idempotent: Boolean(persistResult.idempotent),
            ...(fulfillmentMode || requestedFor ? { fulfillment_context: { fulfillmentMode, requestedFor } } : {})
        });
    };
}

export default buildFinalizeStorefrontOrderUseCase;
