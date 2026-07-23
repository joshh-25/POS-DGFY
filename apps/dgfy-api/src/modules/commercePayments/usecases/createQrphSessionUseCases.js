import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { requireCommerceQrphConfig } from '../../../config/env.js';

// createQrphSessionUseCases.js — Phase 10 Plan 05 Task 2 (STF-04, D-01,
// D-02). Clean Architecture Application layer, mirroring
// ../../shifts/usecases/shiftUseCases.js's DomainError/ApplicationResult
// convention: every use case returns an ApplicationResult, no HTTP
// concerns, no direct model imports (repository/client are injected via
// closure by index.js's buildCommercePaymentsModule()).
//
// This file builds ONLY createQrphSession — session creation at order
// placement. Webhook-driven confirmation/finalization into the tenant
// Availment is 10-08's scope, not this file's.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const serviceUnavailableError = (message, details = null) => new DomainError(
    DomainErrorCode.SERVICE_UNAVAILABLE,
    message,
    { statusCode: 503, details }
);

/** @param {Error} error */
const isPayMongoServiceUnavailableError = (error) => Boolean(error) && error.name === 'PayMongoServiceUnavailableError';

/** @param {Error} error */
const isPayMongoError = (error) => Boolean(error) && error.name === 'PayMongoError';

/**
 * Builds the createQrphSession use case (STF-04). Creates a real PayMongo
 * QR Ph Payment Intent (3-call dance, NO `split_payment` arg — D-02
 * excision) and persists a landlord `commerce_payment_sessions` row with
 * the intent's shared `expires_at` (D-08 — one clock, stamped on both the
 * session here and the reservation by the placement flow, 10-06).
 *
 * The `order` input is the durable landlord `storefront_orders` row (or an
 * equivalent plain object shaped `{ id, public_reference, tenant_id,
 * total_centavos, billing? }`) already created by the placement flow
 * (STF-05: order exists BEFORE any payment session). `order.public_reference`
 * becomes the PayMongo `metadata.commerce_payment_session` value the
 * webhook (10-08) resolves sessions by first (Pattern 1's resolution
 * order: metadata reference -> payment_intent id -> payment id).
 *
 * When PayMongo is unconfigured (feature flags off or no secret key), this
 * fails closed with a 503 SERVICE_UNAVAILABLE DomainError BEFORE any
 * PayMongo call or session write — never a broken/partial session
 * (must_haves truth #4).
 *
 * `checkQrphConfig` defaults to config/env.js's `requireCommerceQrphConfig`
 * but is injectable so tests can exercise the disabled-config branch
 * without process.env/module-reset gymnastics (config/env.js's exports are
 * resolved once at module-load time, like every other env-driven constant
 * in this codebase, e.g. NODE_ENV).
 *
 * @param {{payMongoClient, repository, checkQrphConfig?: Function}} deps
 * @returns {Function} async (input: {order}) => ApplicationResult
 */
export function buildCreateQrphSessionUseCase({ payMongoClient, repository, checkQrphConfig = requireCommerceQrphConfig }) {
    return async (input = {}) => {
        const { order } = input;

        if (!order || !order.public_reference) {
            return ApplicationResult.failure(validationError('order.public_reference is required.'));
        }
        if (!order.tenant_id) {
            return ApplicationResult.failure(validationError('order.tenant_id is required.'));
        }
        if (!order.id) {
            return ApplicationResult.failure(validationError('order.id (storefront_order_id) is required.'));
        }
        if (!Number.isInteger(order.total_centavos) || order.total_centavos <= 0) {
            return ApplicationResult.failure(validationError('order.total_centavos must be a positive integer.'));
        }

        const { configured, missing } = checkQrphConfig();
        if (!configured) {
            return ApplicationResult.failure(serviceUnavailableError(
                'PayMongo QR Ph payments are not configured.',
                { error_code: 'COMMERCE_QRPH_NOT_CONFIGURED', missing }
            ));
        }

        let intent;
        try {
            intent = await payMongoClient.createQrphPaymentIntent({
                amount: order.total_centavos,
                currency: 'PHP',
                description: `DGFY Storefront order ${order.public_reference}`,
                billing: order.billing || {},
                metadata: {
                    // Never integer-coerced (Pitfall 7) — order.tenant_id is
                    // carried through exactly as received.
                    commerce_payment_session: order.public_reference,
                    tenant_id: order.tenant_id
                }
                // NO split_payment arg — D-02 excision (the entire
                // difference vs. the legacy full-split pattern).
            });
        } catch (error) {
            if (isPayMongoServiceUnavailableError(error)) {
                return ApplicationResult.failure(serviceUnavailableError(
                    error.message,
                    { error_code: 'PAYMONGO_UNAVAILABLE', missing: error.missing || [] }
                ));
            }
            if (isPayMongoError(error)) {
                return ApplicationResult.failure(serviceUnavailableError(
                    'PayMongo rejected the QR Ph payment intent request.',
                    { error_code: 'PAYMONGO_REQUEST_FAILED', provider_error: error.providerError }
                ));
            }
            throw error;
        }

        const session = await repository.createSession({
            storefront_order_id: order.id,
            tenant_id: order.tenant_id,
            amount_centavos: order.total_centavos,
            provider_payment_intent_id: intent.paymentIntentId,
            qr_code_image_url: intent.qrCodeImageUrl,
            expires_at: intent.expiresAt
        });

        return ApplicationResult.success({
            session_public_reference: session.public_reference,
            qr_code_image_url: session.qr_code_image_url,
            expires_at: session.expires_at,
            amount_centavos: session.amount_centavos
        });
    };
}

export default buildCreateQrphSessionUseCase;
