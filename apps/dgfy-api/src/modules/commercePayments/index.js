// index.js — Dependency-injection wiring point for the commercePayments
// module (Phase 10 Plan 05, D-01, STF-04), mirroring
// ../shifts/index.js's buildXModule() composition-root pattern (per
// project convention this file is the ONLY place that composes concrete
// implementations for this module).
//
// This plan builds ONLY the QR Ph payment-SESSION layer:
//   - services/payMongoClient.js: native-fetch PayMongo HTTP client +
//     raw-body webhook signature verification
//   - repositories/commercePaymentRepository.js: landlord (dgfy_core)
//     persistence for commerce_payment_sessions
//   - usecases/createQrphSessionUseCases.js: createQrphSession
//
// Webhook PROCESSING (parsing PayMongo events, finalizing tenant
// Availments) is deliberately NOT wired here — 10-08 owns that
// usecase/controller/route layer. It reuses THIS module's
// `verifyWebhookSignature` and session-resolution helpers (exposed below)
// rather than constructing a second, divergent client/repository pair
// (Composition Root Wiring pattern, mirrors 09-07-PLAN.md's reuse
// discipline). Do NOT mount webhook routes from this file.

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

import { buildPayMongoClient } from './services/payMongoClient.js';
import { CommercePaymentRepository } from './repositories/commercePaymentRepository.js';
import { buildCreateQrphSessionUseCase } from './usecases/createQrphSessionUseCases.js';

/**
 * Builds the fully wired commercePayments module: one PayMongo client
 * instance (native fetch, config-driven unless overridden) + one
 * CommercePaymentRepository over the injected CommercePaymentSession
 * Sequelize model, plus `useCases.createQrphSession` closed over both.
 *
 * Also exposes `verifyWebhookSignature` and the repository's
 * session-resolution methods at the top level so 10-08's webhook usecase
 * can reuse the SAME instances directly, never a second, divergent set.
 *
 * @param {{commercePaymentSessionModel, sequelize?, payMongoClient?}} deps
 *   `payMongoClient` is optional — pass a pre-built client (e.g. a test
 *   double) to override the default `buildPayMongoClient()` (config-driven
 *   from apps/dgfy-api/src/config/env.js).
 * @returns {{repository: CommercePaymentRepository, payMongoClient, useCases: {createQrphSession: Function}, verifyWebhookSignature: Function, findSessionByPublicReference: Function, findSessionByProviderPaymentIntent: Function, findSessionByProviderPayment: Function}}
 */
export function buildCommercePaymentsModule({
    commercePaymentSessionModel,
    sequelize,
    payMongoClient
} = {}) {
    const client = payMongoClient || buildPayMongoClient();
    const repository = new CommercePaymentRepository({ commercePaymentSessionModel, sequelize });

    return {
        repository,
        payMongoClient: client,
        useCases: {
            createQrphSession: buildCreateQrphSessionUseCase({ payMongoClient: client, repository })
        },
        verifyWebhookSignature: client.verifyWebhookSignature,
        findSessionByPublicReference: repository.findSessionByPublicReference.bind(repository),
        findSessionByProviderPaymentIntent: repository.findSessionByProviderPaymentIntent.bind(repository),
        findSessionByProviderPayment: repository.findSessionByProviderPayment.bind(repository)
    };
}

export default buildCommercePaymentsModule;
