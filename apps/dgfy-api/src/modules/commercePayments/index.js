// index.js — Dependency-injection wiring point for the commercePayments
// module (Phase 10 Plan 05, D-01, STF-04; extended Plan 08, STF-05),
// mirroring ../shifts/index.js's buildXModule() composition-root pattern
// (per project convention this file is the ONLY place that composes
// concrete implementations for this module).
//
// 10-05 built the QR Ph payment-SESSION layer (client, session repository,
// createQrphSession). 10-08 adds webhook PROCESSING (parsing PayMongo
// events, finalizing tenant Availments) on top: handleWebhook,
// finalizePaidOrder, retryFinalization, and expireDueSessions (the D-09
// auto-release sweep, wired to a recurring interval below). All four reuse
// THIS module's own `client`/`repository` instances — never a second,
// divergent pair.
//
// `finalizeStorefrontOrder` (10-07's availments usecase) and
// `releaseReservation` (10-02's inventory reservationPorts) are injected
// PORTS, not imported directly — this module never depends on the
// availments/inventory modules' internals (Dependency Inversion), and the
// composition root (routes/index.js) passes the SAME instances every other
// consumer of those ports already uses.

export {
    buildPayMongoClient,
    PayMongoError,
    PayMongoServiceUnavailableError
} from './services/payMongoClient.js';
export {
    CommercePaymentRepository,
    buildCommercePaymentRepository,
    generateSessionPublicReference
} from './repositories/commercePaymentRepository.js';
export { buildCreateQrphSessionUseCase } from './usecases/createQrphSessionUseCases.js';
export { buildHandleWebhookUseCase } from './usecases/handleWebhookUseCases.js';
export { buildFinalizePaidOrderUseCase, buildExpireDueSessionsUseCase } from './usecases/finalizePaidOrderUseCases.js';
export { buildRetryFinalizationUseCase } from './usecases/retryFinalizationUseCases.js';
export { buildWebhookController } from './controllers/webhookController.js';
export { createCommercePaymentRoutes } from './routes.js';

import { buildPayMongoClient } from './services/payMongoClient.js';
import { CommercePaymentRepository } from './repositories/commercePaymentRepository.js';
import { buildCreateQrphSessionUseCase } from './usecases/createQrphSessionUseCases.js';
import { buildHandleWebhookUseCase } from './usecases/handleWebhookUseCases.js';
import { buildFinalizePaidOrderUseCase, buildExpireDueSessionsUseCase } from './usecases/finalizePaidOrderUseCases.js';
import { buildRetryFinalizationUseCase } from './usecases/retryFinalizationUseCases.js';
import { StorefrontOrderRepository } from '../storefront/repositories/storefrontOrderRepository.js';
import { COMMERCE_PAYMENTS_ENABLED, STOREFRONT_EXPIRY_SWEEP_INTERVAL_SECONDS } from '../../config/env.js';

/**
 * Builds the fully wired commercePayments module: one PayMongo client
 * instance (native fetch, config-driven unless overridden), one
 * CommercePaymentRepository over the injected CommercePaymentSession
 * Sequelize model, one StorefrontOrderRepository over the injected
 * StorefrontOrder Sequelize model (10-08 needs order READS to build the
 * finalize payload — a lightweight, stateless persistence adapter, safe to
 * construct a second instance of alongside 10-06's own, since neither
 * carries any cache/state beyond the shared underlying Sequelize model),
 * plus every use case closed over them and the injected
 * `finalizeStorefrontOrder`/`releaseReservation` ports.
 *
 * `finalizeStorefrontOrder`/`releaseReservation`/`businessRepository`/
 * `storefrontOrderModel` are OPTIONAL at construction time (mirrors this
 * phase's established optionality convention — 10-07's `commitReservation`,
 * 10-06's five order-placement ports): omitting any of them simply omits
 * the webhook/retry/sweep use cases that need them from this module's
 * return value, so `createQrphSession` alone (10-05's original scope)
 * still works standalone for isolated testing.
 *
 * @param {{
 *   commercePaymentSessionModel,
 *   storefrontOrderModel?,
 *   sequelize?,
 *   payMongoClient?,
 *   finalizeStorefrontOrder?: Function,
 *   releaseReservation?: Function,
 *   businessRepository?: Object,
 *   startSweepInterval?: boolean
 * }} deps
 *   `startSweepInterval` defaults to `COMMERCE_PAYMENTS_ENABLED` (config/
 *   env.js) — set explicitly `false` in tests to avoid leaking a live
 *   `setInterval` timer.
 * @returns {{repository: CommercePaymentRepository, orderRepository?: StorefrontOrderRepository, payMongoClient, useCases: Object, verifyWebhookSignature: Function, findSessionByPublicReference: Function, findSessionByProviderPaymentIntent: Function, findSessionByProviderPayment: Function}}
 */
export function buildCommercePaymentsModule({
    commercePaymentSessionModel,
    storefrontOrderModel,
    sequelize,
    payMongoClient,
    finalizeStorefrontOrder,
    releaseReservation,
    businessRepository,
    startSweepInterval = COMMERCE_PAYMENTS_ENABLED
} = {}) {
    const client = payMongoClient || buildPayMongoClient();
    const repository = new CommercePaymentRepository({ commercePaymentSessionModel, sequelize });

    const useCases = {
        createQrphSession: buildCreateQrphSessionUseCase({ payMongoClient: client, repository })
    };

    let orderRepository = null;
    let expireDueSessions = null;

    // 10-08's webhook/retry/sweep surface — OPTIONAL, see file header.
    if (storefrontOrderModel && typeof finalizeStorefrontOrder === 'function' && typeof releaseReservation === 'function') {
        orderRepository = new StorefrontOrderRepository({ storefrontOrderModel });

        const finalizePaidOrder = buildFinalizePaidOrderUseCase({
            orderRepository,
            updateSessionStatus: repository.updateSessionStatus.bind(repository),
            finalizeStorefrontOrder
        });

        useCases.finalizePaidOrder = finalizePaidOrder;
        useCases.handleWebhook = buildHandleWebhookUseCase({
            verifyWebhookSignature: client.verifyWebhookSignature,
            findSessionByPublicReference: repository.findSessionByPublicReference.bind(repository),
            findSessionByProviderPaymentIntent: repository.findSessionByProviderPaymentIntent.bind(repository),
            findSessionByProviderPayment: repository.findSessionByProviderPayment.bind(repository),
            updateSessionStatus: repository.updateSessionStatus.bind(repository),
            orderRepository,
            releaseReservation,
            finalizePaidOrder
        });
        useCases.retryFinalization = buildRetryFinalizationUseCase({
            findSessionByPublicReference: repository.findSessionByPublicReference.bind(repository),
            finalizePaidOrder,
            businessRepository
        });

        expireDueSessions = buildExpireDueSessionsUseCase({
            orderRepository,
            commercePaymentRepository: repository,
            releaseReservation
        });
        useCases.expireDueSessions = expireDueSessions;

        // T-10-08-07 mechanism 1/2: a lightweight recurring interval so the
        // D-09 sweep runs even with zero consumer traffic (documented as
        // swappable for a real scheduler/cron later — same use case, only
        // the trigger changes). Guarded so it never starts when commerce
        // payments are disabled or the caller explicitly opts out (tests).
        if (startSweepInterval) {
            const intervalMs = Math.max(1, STOREFRONT_EXPIRY_SWEEP_INTERVAL_SECONDS) * 1000;
            const timer = setInterval(() => {
                expireDueSessions().catch((sweepError) => {
                    // eslint-disable-next-line no-console
                    console.warn('[commercePayments] scheduled expireDueSessions sweep failed.', sweepError);
                });
            }, intervalMs);
            // Never keep the Node process alive solely for this timer
            // (matches infra/deviceBridgeClient.js's own unref() convention
            // for best-effort background timers).
            timer.unref?.();
        }
    }

    return {
        repository,
        ...(orderRepository ? { orderRepository } : {}),
        payMongoClient: client,
        useCases,
        // T-10-08-07 mechanism 2/2: exposed at the top level so 10-06's
        // getOrderStatusUseCases.js can be wired with
        // `onReadExpiryCheck: expireDueSessionsForOrder`-style opportunistic
        // invocation from the composition root (routes/index.js).
        ...(expireDueSessions ? { expireDueSessions } : {}),
        verifyWebhookSignature: client.verifyWebhookSignature,
        findSessionByPublicReference: repository.findSessionByPublicReference.bind(repository),
        findSessionByProviderPaymentIntent: repository.findSessionByProviderPaymentIntent.bind(repository),
        findSessionByProviderPayment: repository.findSessionByProviderPayment.bind(repository)
    };
}

export default buildCommercePaymentsModule;
