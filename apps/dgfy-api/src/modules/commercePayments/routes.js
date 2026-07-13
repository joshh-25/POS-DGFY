import express from 'express';
import { buildWebhookController } from './controllers/webhookController.js';

// Wires Express routing for the commercePayments module's webhook +
// operator retry surface (STF-05, 10-08-PLAN.md). Mirrors ../storefront/
// routes.js's createStorefrontRoutes() shape.
//
// The webhook route is intentionally UNAUTHENTICATED at the Express layer
// (PayMongo cannot present a DGFY bearer token) — its trust boundary is the
// HMAC signature verified inside handleWebhookUseCases.js's
// buildHandleWebhookUseCase, over the RAW body app.js's express.json()
// `verify` callback stashed onto req.rawBody (T-10-08-04). No rate limiter
// is applied here deliberately: PayMongo's own delivery/retry cadence is
// out of this service's control, and the signature gate is already the
// real defense (T-10-08-01).
//
// The retry-finalization route IS behind the existing account auth
// middleware (T-10-08-05); the usecase layer additionally checks
// staff-or-owner membership on the session's tenant (see
// retryFinalizationUseCases.js).
//
// @param {Object} useCases - commercePayments module use cases (buildCommercePaymentsModule().useCases)
// @param {{authenticateAccount?: Function}} [deps]
export function createCommercePaymentRoutes(useCases = {}, { authenticateAccount } = {}) {
    const router = express.Router();
    const webhookController = buildWebhookController(useCases);

    router.post('/paymongo/webhook', (req, res, next) => webhookController.handleWebhook(req, res).catch(next));

    if (typeof authenticateAccount === 'function') {
        router.post(
            '/sessions/:reference/retry-finalization',
            authenticateAccount,
            (req, res, next) => webhookController.retryFinalization(req, res).catch(next)
        );
    }

    return router;
}

export default createCommercePaymentRoutes;
